import { Injectable } from '@nestjs/common';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Message, EmbedBuilder, GuildMember, Role, Client } from 'discord.js';
import { UserService } from '../../user/user.service';
import { TeamService } from '../../team/team.service';
import { RolesService } from '../../roles/roles.service';
import { UserStatsService } from '../../user-stats/user-stats.service';
import { SteamService } from 'src/steam/steam.service';
import { CommandProcessor } from '../command-processor';

@Injectable()
export class ActionCommands {
  private commandProcessor: CommandProcessor;

  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly userService: UserService,
    private readonly teamService: TeamService,
    private readonly rolesService: RolesService,
    private readonly userStatsService: UserStatsService,
    private readonly steamService: SteamService,
  ) {
    this.commandProcessor = new CommandProcessor(
      this.userService.isUserAdmin.bind(this.userService),
    );
  }

  async processMessage(message: Message): Promise<void> {
    await this.commandProcessor.processMessage(message);
  }

  async onProfileCommand(message: Message): Promise<void> {
    try {
      const user = await this.userService.getUserByDiscordId(message.author.id);
      if (!user) {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Profile Not Found')
          .setDescription(
            "You don't have a profile. Please set up your profile first.",
          )
          .setFooter({ text: 'Use !help to see available commands' });
        await message.reply({ embeds: [embed] });
        return;
      }

      const userStats = await this.userStatsService.getUserStats(user.id);
      if (!userStats) {
        await message.reply(
          "You don't have any stats yet. Play some matches to see your stats!",
        );
        return;
      }

      const steamUser = await this.steamService.getSteamUserSummary(
        user.steamId,
      );
      const steamAvatarUrl = steamUser?.avatarfull || null;

      const kda = (
        (userStats.avgKills + userStats.avgAssists) /
        userStats.avgDeaths
      ).toFixed(2);

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Profile: ${user.username}`)
        .setThumbnail(steamAvatarUrl)
        .addFields(
          { name: 'Steam ID', value: user.steamId, inline: true },
          { name: 'Region', value: user.region, inline: true },
          {
            name: 'KDA',
            value:
              userStats.avgKills !== -1 &&
              userStats.avgDeaths !== -1 &&
              userStats.avgAssists !== -1
                ? kda
                : 'Stats unavailable',
            inline: true,
          },
          {
            name: 'Average Kills',
            value:
              userStats.avgKills !== -1
                ? userStats.avgKills.toFixed(2)
                : 'Stats unavailable',
            inline: true,
          },
          {
            name: 'Average Deaths',
            value:
              userStats.avgDeaths !== -1
                ? userStats.avgDeaths.toFixed(2)
                : 'Stats unavailable',
            inline: true,
          },
          {
            name: 'Average Assists',
            value:
              userStats.avgAssists !== -1
                ? userStats.avgAssists.toFixed(2)
                : 'Stats unavailable',
            inline: true,
          },
          {
            name: 'Winrate',
            value:
              userStats.winRate !== -1
                ? `${userStats.winRate.toFixed(2)}%`
                : 'Stats unavailable',
            inline: true,
          },
          {
            name: 'Matches Played',
            value:
              userStats.matchesPlayed !== -1
                ? userStats.matchesPlayed.toString()
                : 'Stats unavailable',
            inline: true,
          },
        )
        .setTimestamp();

      if (user.teamId) {
        const team = await this.teamService.getTeamById(user.teamId);
        embed.addFields({ name: 'Team', value: team.name, inline: true });
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in onProfileCommand', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('An error occurred while fetching your profile.')
        .setFooter({ text: 'Please try again later' });
      await message.reply({ embeds: [errorEmbed] });
    }
  }

  async onRegionCommand(message: Message): Promise<void> {
    const args = message.content.split(' ');
    if (args.length !== 2) {
      const usageEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('Invalid Usage')
        .setDescription('Usage: !region <NA/EU/ASIA/OCEA/SA>')
        .setFooter({ text: 'Example: !region NA' });
      await message.reply({ embeds: [usageEmbed] });
      return;
    }

    const region = args[1].toUpperCase();
    const validRegions = ['NA', 'EU', 'ASIA', 'OCEA', 'SA'];

    if (!validRegions.includes(region)) {
      await message.reply(
        'Invalid region. Please use NA, EU, ASIA, OCEA, or SA.',
      );
      return;
    }

    try {
      // Update user's region in the database
      const updatedUser = await this.userService.updateUserRegion(
        message.author.id,
        region,
      );

      if (!updatedUser) {
        await message.reply('Failed to update region. Please try again.');
        return;
      }

      let replyMessage = `Your region has been set to ${region} in the database.`;

      // If the message is from a guild, update the role
      if (message.guild) {
        const member = message.member;
        if (!member) {
          await message.reply(
            'Failed to fetch member information. Your region has been updated in the database, but the role could not be assigned.',
          );
          return;
        }

        const regionRole = message.guild.roles.cache.find(
          (role) => role.name === region,
        );

        if (!regionRole) {
          await message.reply(
            `Role for region ${region} not found. Please contact an administrator. Your region has been updated in the database.`,
          );
          return;
        }

        // Remove other region roles
        const otherRegionRoles = validRegions
          .filter((r) => r !== region)
          .map((r) => message.guild.roles.cache.find((role) => role.name === r))
          .filter((role): role is Role => role !== undefined);
        await member.roles.remove(otherRegionRoles);

        // Add the new region role
        await member.roles.add(regionRole);

        replyMessage += ' The corresponding role has been assigned.';
      } else {
        // If it's a direct message, we need to find the guild and assign the role
        const guild = this.client.guilds.cache.get(process.env.GUILD_ID);
        if (guild) {
          try {
            const member = await guild.members.fetch(message.author.id);
            const regionRole = guild.roles.cache.find(
              (role) => role.name === region,
            );

            if (regionRole) {
              // Remove other region roles
              const otherRegionRoles = validRegions
                .filter((r) => r !== region)
                .map((r) => guild.roles.cache.find((role) => role.name === r))
                .filter((role): role is Role => role !== undefined);
              await member.roles.remove(otherRegionRoles);

              // Add the new region role
              await member.roles.add(regionRole);
              replyMessage +=
                ' The corresponding role has been assigned on the server.';
            } else {
              replyMessage +=
                ' The role could not be assigned. Please contact an administrator.';
            }
          } catch (error) {
            console.error('Error assigning role in DM:', error);
            replyMessage +=
              ' The role could not be assigned. Please use this command in a server channel.';
          }
        } else {
          replyMessage +=
            ' The role could not be assigned. Please use this command in a server channel.';
        }
      }

      const successEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Region Updated')
        .setDescription(replyMessage)
        .setFooter({ text: 'Your profile has been updated' });
      await message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('Error in onRegionCommand:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription(
          'An error occurred while setting your region. Please try again later.',
        )
        .setFooter({
          text: 'If the problem persists, contact an administrator',
        });
      await message.reply({ embeds: [errorEmbed] });
    }
  }

  async onHelpCommand(message: Message): Promise<void> {
    const isAdmin = await this.userService.isUserAdmin(message.author.id);

    const helpEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Available Commands')
      .setDescription('Here are all the available commands:')
      .addFields(
        {
          name: '!profile',
          value: 'Display your user profile\nExample: `!profile`',
        },
        { name: '!help', value: 'Show this help message\nExample: `!help`' },
        {
          name: '!team create',
          value:
            'Create a new team\nExample: `!team create "Team Name"` (don\'t forget "")',
        },
        {
          name: '!team add',
          value:
            'Invite players to your team\nExample: `!team add @PlayerName`',
        },
        {
          name: '!team leave',
          value: 'Leave your current team\nExample: `!team leave`',
        },
        {
          name: '!team disband',
          value: 'Disband your team (owner only)\nExample: `!team disband`',
        },
        {
          name: '!team profile',
          value: 'Display your team profile\nExample: `!team profile`',
        },
        {
          name: '!steam',
          value:
            'Set your Steam ID\nExample: `!steam https://steamcommunity.com/id/user`',
        },
        {
          name: '!region',
          value:
            'Set your region\nExample: `!region NA` (Options: NA, EU, ASIA, OCEA, SA)',
        },
      );

    if (isAdmin) {
      helpEmbed.addFields(
        {
          name: 'Admin Commands',
          value: 'The following commands are for admins only:',
        },
        { name: '!sync-users', value: 'Synchronize users with the database' },
        {
          name: '!force-cleanup',
          value: 'Force cleanup of roles and channels',
        },
        { name: '!init', value: 'Initialize server channels' },
        { name: '!reset-all', value: 'Reset all server data' },
        { name: '!admin init', value: 'Perform admin initialization' },
        // Add other admin commands here
      );
    }

    helpEmbed.setFooter({
      text: 'For more details on each command, use !help <command>',
    });

    await message.reply({ embeds: [helpEmbed] });
  }
}
