import { Injectable, UseInterceptors } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import { InjectDiscordClient } from '@discord-nestjs/core';
import {
  Client,
  Message,
  Guild,
  TextChannel,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
} from 'discord.js';
import { PrefixCommandInterceptor } from '../../interceptors/prefix-command.interceptor';
import { TournamentService } from '../../tournament/tournament.service';
import { MatchService } from '../../match/match.service';
import { BracketService } from '../../tournament/bracket/bracket.service';
import { TeamService } from '../../team/team.service';
import { Match } from '../../match/match.interface';
import { Tournament } from '../../tournament/tournament.interface';
import { RolesService } from '../../roles/roles.service';
import { UserService } from '../../user/user.service';

@Injectable()
export class TournamentCommands {
  constructor(
    private readonly tournamentService: TournamentService,
    private readonly matchService: MatchService,
    private readonly bracketService: BracketService,
    private readonly teamService: TeamService,
    private readonly rolesService: RolesService,
    private readonly userService: UserService,
    @InjectDiscordClient() private readonly client: Client,
  ) {}

  async onTournamentCreate(message: Message): Promise<void> {
    if (!(await this.isAdmin(message.author.id))) {
      return;
    }

    const args = message.content.split(' ');
    if (args[1] === 'start' && args[2]) {
      await this.startTournament(message, parseInt(args[2], 10));
    }
  }

  private async startTournament(
    message: Message,
    tournamentId: number,
  ): Promise<void> {
    try {
      const tournament =
        await this.tournamentService.getTournamentById(tournamentId);
      if (!tournament) {
        await message.reply('Tournament not found.');
        return;
      }

      if (tournament.status !== 'waiting') {
        await message.reply(
          'This tournament cannot be started. It may have already started or ended.',
        );
        return;
      }

      // Create bracket
      const bracket = this.bracketService.generateBracket(
        tournament as unknown as Tournament,
      );

      // Create matches and channels
      const createdMatches = await this.matchService.createMatchesFromBracket(
        bracket,
        tournamentId,
      );

      // Update tournament with created matches
      await this.tournamentService.updateTournamentMatches(
        tournamentId,
        createdMatches,
      );

      for (const match of createdMatches) {
        const channel = await this.createMatchChannel(
          message.guild,
          match,
          tournament as unknown as Tournament,
        );
        await this.matchService.updateMatchDiscordChannel(match.id, channel.id);
        await this.matchService.startVetoProcess(match.id, channel.id);
      }

      // Update tournament status
      await this.tournamentService.updateTournamentStatus(
        tournamentId,
        'in_progress',
      );

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Tournament Update')
        .addFields(
          { name: 'Tournament Name', value: tournament.name },
          { name: 'Start Time', value: tournament.startTime.toLocaleString() },
          {
            name: 'Registered Teams',
            value: (Array.isArray(tournament.teams)
              ? tournament.teams.length
              : JSON.parse(tournament.teams).length
            ).toString(),
          },
          {
            name: 'Remaining Slots',
            value: (
              tournament.maxTeamLimit -
              (Array.isArray(tournament.teams)
                ? tournament.teams.length
                : JSON.parse(tournament.teams).length)
            ).toString(),
          },
          {
            name: 'Teams',
            value:
              (Array.isArray(tournament.teams)
                ? tournament.teams
                : JSON.parse(tournament.teams)
              )
                .map((team) => team.name)
                .join('\n') || 'No teams registered yet',
          },
        );

      // Generate and send bracket image
      const bracketImage =
        await this.tournamentService.generateBracketImage(tournamentId);
      await (message.channel as TextChannel).send({
        files: [{ attachment: bracketImage, name: 'tournament_bracket.png' }],
      });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error starting tournament:', error);
      await message.reply(
        'An error occurred while starting the tournament. Please try again later.',
      );
    }
  }

  private async createMatchChannel(
    guild: Guild,
    match: Match,
    tournament: Tournament,
  ): Promise<TextChannel> {
    const team1 = await this.teamService.getTeamById(match.team1Id);
    const team2 = await this.teamService.getTeamById(match.team2Id);
    const channelName = `match-${match.id}-${team1.name}-vs-${team2.name}`
      .toLowerCase()
      .replace(/\s+/g, '-');

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: (await this.rolesService.getRoleById(team1.roleId)).discordId,
          allow: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: (await this.rolesService.getRoleById(team2.roleId)).discordId,
          allow: [PermissionsBitField.Flags.ViewChannel],
        },
      ],
    });

    // Update the match with the new channel ID
    await this.matchService.updateMatchDiscordChannel(match.id, channel.id);

    return channel;
  }

  async onTournamentCommand(message: Message): Promise<void> {
    if (!(await this.isAdmin(message.author.id))) {
      return;
    }

    const args = message.content.split(' ');
    if (args[1] === 'create') {
      await this.createTournament(message);
    }
  }

  private async createTournament(message: Message): Promise<void> {
    const args = message.content.split(' ').slice(2);
    if (args.length < 4) {
      await message.reply(
        'Usage: !tournament create <name> <startTime> <maxTeamLimit> <region> [prize]',
      );
      return;
    }

    const name = args[0];
    const startTime = new Date(args[1]);
    const maxTeamLimit = parseInt(args[2], 10);
    const region = args[3].toUpperCase() as
      | 'NA'
      | 'EU'
      | 'ASIA'
      | 'OCEA'
      | 'SA';
    const prize = args[4] || 'No prize specified';

    if (isNaN(startTime.getTime())) {
      await message.reply(
        'Invalid start time. Please use a valid date format (e.g., YYYY-MM-DD HH:MM)',
      );
      return;
    }

    if (isNaN(maxTeamLimit) || maxTeamLimit <= 0) {
      await message.reply(
        'Invalid max team limit. Please provide a positive number.',
      );
      return;
    }

    if (!['NA', 'EU', 'ASIA', 'OCEA', 'SA'].includes(region)) {
      await message.reply(
        'Invalid region. Please use one of: NA, EU, ASIA, OCEA, SA',
      );
      return;
    }

    try {
      const tournament = await this.tournamentService.createTournament(
        name,
        startTime,
        maxTeamLimit,
        prize,
        region,
      );
      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Tournament Created')
        .addFields(
          { name: 'Name', value: tournament.name },
          { name: 'Start Time', value: tournament.startTime.toLocaleString() },
          { name: 'Max Team Limit', value: tournament.maxTeamLimit.toString() },
          { name: 'Region', value: tournament.region },
          { name: 'Prize', value: tournament.prize },
        );

      await message.reply({ embeds: [embed] });

      // Send tournament creation message to the current channel
      await this.tournamentService.sendTournamentAnnouncementMessage(
        tournament,
        message.channel.id,
      );
    } catch (error) {
      console.error('Error creating tournament:', error);
      await message.reply(
        'An error occurred while creating the tournament. Please try again later.',
      );
    }
  }

  private async isAdmin(userId: string): Promise<boolean> {
    return await this.userService.isUserAdmin(userId);
  }
}
