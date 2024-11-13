import { Injectable, Logger } from '@nestjs/common';
import { Once, On, InjectDiscordClient } from '@discord-nestjs/core';
import {
  ChannelType,
  Client,
  EmbedBuilder,
  GuildMember,
  Message,
} from 'discord.js';
import { UserService } from '../user/user.service';
import { RolesService } from '../roles/roles.service';
import { SteamCommands } from '../setup/steam.commands';
import { RedisService } from '../../redis/redis.service';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { CommandProcessor } from './command-processor';
import { ActionCommands } from './commands/action.commands';
import { SetupCommands } from '../setup/setup.commands';
import { UserCommands } from '../setup/user.commands';
import { MatchCommands } from './commands/match.commands';
import { RolesCommands } from './commands/roles.commands';
import { TeamCommands } from './commands/team.commands';
import { TournamentCommands } from './commands/tournament.commands';

@Injectable()
export class BotGateway {
  private readonly logger = new Logger(BotGateway.name);
  private commandProcessor: CommandProcessor;

  constructor(
    private readonly userService: UserService,
    private readonly rolesService: RolesService,
    private readonly steamCommands: SteamCommands,
    private readonly redisService: RedisService,
    @InjectDiscordClient() private readonly client: Client,
    private readonly actionCommands: ActionCommands,
    private readonly setupCommands: SetupCommands,
    private readonly userCommands: UserCommands,
    private readonly matchCommands: MatchCommands,
    private readonly rolesCommands: RolesCommands,
    private readonly teamCommands: TeamCommands,
    private readonly tournamentCommands: TournamentCommands,
  ) {
    this.commandProcessor = new CommandProcessor(
      this.userService.isUserAdmin.bind(this.userService),
    );
    this.registerCommands();
  }

  private registerCommands() {
    this.commandProcessor.registerCommand(
      'profile',
      this.actionCommands.onProfileCommand.bind(this.actionCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'help',
      this.actionCommands.onHelpCommand.bind(this.actionCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'region',
      this.actionCommands.onRegionCommand.bind(this.actionCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'sync-users',
      this.userCommands.onSyncUsers.bind(this.userCommands),
      true,
    );
    this.commandProcessor.registerCommand(
      'steam sync',
      this.steamCommands.onSteamSyncCommand.bind(this.steamCommands),
      true,
    );
    this.commandProcessor.registerCommand(
      'steam',
      this.steamCommands.onSteamCommand.bind(this.steamCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'force-cleanup',
      this.setupCommands.forceCleanup.bind(this.setupCommands),
      true,
    );
    this.commandProcessor.registerCommand(
      'reset-all',
      this.setupCommands.resetAll.bind(this.setupCommands),
      true,
    );
    this.commandProcessor.registerCommand(
      'admin init',
      this.setupCommands.adminInit.bind(this.setupCommands),
      true,
    );
    this.commandProcessor.registerCommand(
      'veto',
      this.matchCommands.onVeto.bind(this.matchCommands),
      false,
      false,
    );
    this.commandProcessor.registerCommand(
      'res',
      this.matchCommands.onResCommand.bind(this.matchCommands),
      false,
      false,
    );
    this.commandProcessor.registerCommand(
      'match',
      this.matchCommands.onMatchCommand.bind(this.matchCommands),
      true,
      false,
    );
    this.commandProcessor.registerCommand(
      'roles init',
      this.rolesCommands.onInitRole.bind(this.rolesCommands),
      true,
    );
    this.commandProcessor.registerCommand(
      'team add',
      this.teamCommands.onAddPlayers.bind(this.teamCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'team create',
      this.teamCommands.onCreateTeam.bind(this.teamCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'team leave',
      this.teamCommands.onLeaveTeam.bind(this.teamCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'team disband',
      this.teamCommands.onDisbandTeam.bind(this.teamCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'team profile',
      this.teamCommands.onTeamProfile.bind(this.teamCommands),
      false,
      true,
    );
    this.commandProcessor.registerCommand(
      'tournament start',
      this.tournamentCommands.onTournamentCreate.bind(this.tournamentCommands),
      true,
    );
    this.commandProcessor.registerCommand(
      'tournament create',
      this.tournamentCommands.onTournamentCommand.bind(this.tournamentCommands),
      true,
    );
    this.commandProcessor.registerCommand(
      'rules init',
      this.setupCommands.initRules.bind(this.setupCommands),
      true,
    );
  }

  @Once('ready')
  onReady() {
    this.logger.log('Bot was started!');
  }

  @On('guildMemberAdd')
  async onGuildMemberAdd(member: GuildMember) {
    try {
      // Check if the user already exists
      let user = await this.userService.getUserByDiscordId(member.id);

      if (user) {
        // User exists, update the date
        user = await this.userService.updateUserDate(member.id);
        this.logger.log(`Existing user updated: ${user.username}`);
      } else {
        // User doesn't exist, create a new one
        user = await this.userService.createUser(
          member.user.username,
          member.id,
        );
        this.logger.log(`New user added to database: ${user.username}`);
      }

      // Assign INIT role to the member
      const initRole = member.guild.roles.cache.find(
        (role) => role.name === 'INIT',
      );
      if (initRole) {
        await member.roles.add(initRole);
      }

      // Create an embed for the welcome message
      const welcomeEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Welcome to The Divide Cups!')
        .setDescription(
          'Two teams, three players each, and one epic battle for glory. Unite your squad and dominate the competition!',
        )
        .addFields(
          {
            name: '1. Where to use commands and get help',
            value:
              'All commands can be run in private messages with the bot or in the command channel in Divide Cups Discord server. Use the `!help` command to get answers to your questions and find shortcuts.',
          },
          {
            name: '2. Read the rules',
            value:
              'Make sure to read the rules in the dedicated `rules` channel. Understanding and following these rules is crucial for a fair and enjoyable experience for everyone.',
          },
          {
            name: '3. Choose Your Location',
            value:
              'Set your location either by answering the early questions when joining the Discord server, or by using the `!region` command. For example: `!region NA` for North America, `!region EU` for Europe, etc.',
          },
          {
            name: '4. Provide Your Steam Profile',
            value:
              'Type `!steam url` in the designated channel to share your Steam profile URL.',
          },
          {
            name: '5. Check your profile',
            value:
              'After completing the steps above, you can check your profile using the `!profile` command.',
          },
          {
            name: '6. Create a team or join one',
            value:
              'Create your team using `!team create "Team Name"` (don\'t forget the quotes if you want put space in the name ""). Remember, teams are limited to 3 players. Invite friends using `!team add @friend1 @friend2`.',
          },
          {
            name: '7. Beta Project and Feedback',
            value:
              "This project is in beta, so it's normal if you encounter bugs. Please report any issues in the `support` channel. If you have ideas or suggestions, feel free to share them in the `feedback` channel.",
          },
        )
        .setFooter({ text: 'Good luck and may the best team win!' });

      // Send the embed as a private message to the user
      await member.send({ embeds: [welcomeEmbed] });
    } catch (error) {
      this.logger.error(`Error in onGuildMemberAdd: ${error.message}`);
    }
  }

  @On('guildMemberUpdate')
  async onGuildMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    if (
      oldRoles.size !== newRoles.size ||
      !oldRoles.every((role) => newRoles.has(role.id))
    ) {
      const addedRoles = newRoles.filter((role) => !oldRoles.has(role.id));
      const removedRoles = oldRoles.filter((role) => !newRoles.has(role.id));

      // Handle added roles
      for (const [, role] of addedRoles) {
        const dbRole = await this.rolesService.getRoleByDiscordId(role.id);
        if (dbRole) {
          await this.userService.updateUserRoles(newMember.id, [
            dbRole.id.toString(),
          ]);
          this.logger.log(
            `Added role ${role.name} (DB ID: ${dbRole.id}) to user ${newMember.user.username}`,
          );

          if (dbRole.type === 1) {
            const regionRoles = ['NA', 'EU', 'ASIA', 'OCEA', 'SA'];
            if (regionRoles.includes(role.name)) {
              await this.userService.updateUserRegion(newMember.id, role.name);
              this.logger.log(
                `Updated user ${newMember.user.username} region to ${role.name}`,
              );
            }
          }
        }
      }

      // Handle removed roles
      for (const [, role] of removedRoles) {
        const dbRole = await this.rolesService.getRoleByDiscordId(role.id);
        if (dbRole) {
          await this.userService.removeUserRole(
            newMember.id,
            dbRole.id.toString(),
          );
          this.logger.log(
            `Removed role ${role.name} (DB ID: ${dbRole.id}) from user ${newMember.user.username}`,
          );

          if (dbRole.type === 1) {
            const regionRoles = ['NA', 'EU', 'ASIA', 'OCEA', 'SA'];
            if (regionRoles.includes(role.name)) {
              await this.userService.updateUserRegion(newMember.id, '');
              this.logger.log(
                `Removed region ${role.name} from user ${newMember.user.username}`,
              );
            }
          }
        }
      }
    }
  }

  @On('messageCreate')
  async onMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    const rateLimitMiddleware = new RateLimitMiddleware(
      this.redisService,
      this.userService,
    );

    await new Promise<void>((resolve) => {
      rateLimitMiddleware.use(message, () => {
        resolve();
      });
    });

    if (message.content.startsWith('!')) {
      const commandChannel = await this.rolesService.getCommandChannel();
      const isAdmin = await this.userService.isUserAdmin(message.author.id);

      if (isAdmin) {
        await this.commandProcessor.processMessage(message);
        return;
      }

      if (
        message.channel.id !== commandChannel.discordId &&
        message.channel.type !== ChannelType.DM &&
        !message.content.startsWith('!res')
      ) {
        return;
      }
      await this.commandProcessor.processMessage(message);
    }
  }
}
