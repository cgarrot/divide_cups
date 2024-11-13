import { Injectable } from '@nestjs/common';
import { MatchService } from '../discord/match/match.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TournamentService } from '../discord/tournament/tournament.service';
import { TournamentImageService } from '../discord/tournament-image/tournament-image.service';
import { RolesService } from '../discord/roles/roles.service';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { TeamService } from 'src/discord/team/team.service';
import {
  Bracket,
  Tournament,
} from 'src/discord/tournament/tournament.interface';

@Injectable()
@Processor('match', {
  concurrency: 8,
})
export class MatchProcessor extends WorkerHost {
  constructor(
    private readonly matchService: MatchService,
    private readonly tournamentService: TournamentService,
    private readonly tournamentImageService: TournamentImageService,
    private readonly rolesService: RolesService,
    @InjectDiscordClient()
    private readonly client: Client,
    private readonly teamService: TeamService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'create_match':
        return this.handleCreateMatch(job);
      case 'start_veto':
        return this.handleStartVeto(job);
      case 'update_bracket':
        return this.handleUpdateBracket(job);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async handleCreateMatch(
    job: Job<{ match: any; tournamentId: number }>,
  ) {
    const { match, tournamentId } = job.data;
    try {
      const createdMatch = await this.matchService.createMatchFromBracket(
        match,
        tournamentId,
      );
      if (createdMatch && createdMatch.discordChannelId) {
        await this.matchService.startVetoProcess(
          createdMatch.id,
          createdMatch.discordChannelId,
        );
      }
    } catch (error) {
      console.error('Error processing create_match job:', error);
      throw error;
    }
  }

  private async handleStartVeto(
    job: Job<{ matchId: number; channelId: string }>,
  ) {
    const { matchId, channelId } = job.data;
    try {
      await this.matchService.startVetoProcess(matchId, channelId);
    } catch (error) {
      console.error('Error processing start_veto job:', error);
      throw error;
    }
  }

  private async handleUpdateBracket(
    job: Job<{ matchId: number; tournamentId: number }>,
  ) {
    const { matchId, tournamentId } = job.data;
    try {
      // Update the bracket
      await this.tournamentService.updateBracketAfterMatch(
        matchId,
        tournamentId,
      );

      // Get the updated tournament data
      const tournament =
        await this.tournamentService.getTournamentById(tournamentId);

      console.log(tournament.bracket);
      console.log(JSON.stringify(tournament.bracket, null, 2));

      if (!tournament) {
        console.error(`Tournament not found for id: ${tournamentId}`);
        return;
      }

      // Generate new bracket image
      const bracketImage =
        await this.tournamentImageService.generateBracketImage(
          tournament.bracket,
        );

      // Find the announcement channel
      const channelName = `${tournament.region.toLowerCase()}-announcements`;
      const channel = await this.rolesService.getChannelByName(channelName);

      if (!channel) {
        throw new Error(
          `Announcement channel for region ${tournament.region} not found`,
        );
      }

      // Get the messages array from the channel data
      const messages = JSON.parse(channel.messages);

      // Find the latest tournament announcement message
      const bracketMessageData = messages
        .reverse()
        .find((msg) => msg.name.startsWith('tournament_announcement_'));

      if (!bracketMessageData) {
        throw new Error('Bracket message not found in channel data');
      }

      // Fetch the Discord channel and message
      const discordChannel = (await this.client.channels.fetch(
        channel.discordId,
      )) as TextChannel;
      const bracketMessage = await discordChannel.messages.fetch(
        bracketMessageData.id,
      );

      // Update the message with the new bracket image
      await bracketMessage.edit({
        files: [{ attachment: bracketImage, name: 'tournament_bracket.png' }],
      });

      console.log(`Updated bracket image for tournament ${tournamentId}`);

      // Check if this is the last match of the tournament
      const isLastMatch = this.isLastMatch(tournament.bracket);
      if (isLastMatch) {
        // Close the tournament
        await this.tournamentService.updateTournamentStatus(
          tournamentId,
          'complete',
        );

        const winner = await this.getWinner(
          tournament.bracket,
          job.data.matchId,
        );

        if (!winner) {
          console.error('Unable to determine the winner');
          // Handle the case when there's no clear winner (e.g., tie)
          await this.handleTieOrError(tournament, discordChannel);
          return;
        }

        // Get all members of the winning team
        const teamMembers = await this.teamService.getTeamMembers(
          winner.teamId,
        );

        // Fetch the winning team details
        const winningTeam = await this.teamService.getTeamById(winner.teamId);

        // Fetch the winning team's role
        const winningRole = await this.rolesService.getRoleById(
          winningTeam.roleId,
        );

        // Create a string with all team member mentions
        const memberMentions = teamMembers
          .map((member) => `<@${member.discordId}>`)
          .join(' ');

        const winnerEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🏆 Tournament Winner 🏆')
          .setDescription(
            `Congratulations! You've won the tournament!\n${memberMentions}`,
          )
          .addFields(
            { name: 'Winning Team', value: `<@&${winningRole.discordId}>` },
            // { name: 'Prize', value: tournament.prize },
          );

        // Send the winner announcement
        await discordChannel.send({
          embeds: [winnerEmbed],
        });

        console.log(
          `Tournament ${tournamentId} completed and winner announced`,
        );
      }
    } catch (error) {
      console.error('Error processing update_bracket job:', error);
      throw error;
    }
  }

  private async handleTieOrError(
    tournament: Tournament,
    discordChannel: TextChannel,
  ) {
    const tieEmbed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('🏆 Tournament Ended in a Tie 🏆')
      .setDescription(
        `The ${tournament.name} has ended, but we couldn't determine a clear winner.`,
      )
      .addFields(
        { name: 'Tournament Name', value: tournament.name },
        { name: 'Status', value: 'Ended (Tie/Error)' },
        {
          name: 'Next Steps',
          value:
            'An admin will review the results and announce the final outcome.',
        },
      );

    await discordChannel.send({ embeds: [tieEmbed] });
  }

  private isLastMatch(bracket: Bracket): boolean {
    if (bracket.rounds.length === 0) {
      return false;
    }
    const finalRound = bracket.rounds[bracket.rounds.length - 1];
    return (
      finalRound.matches.length > 0 &&
      finalRound.matches.every(
        (match) => match.team1Score !== 0 || match.team2Score !== 0,
      )
    );
  }

  private async getWinner(
    bracket: Bracket,
    matchId: number,
  ): Promise<{ teamId: number; score: number } | null> {
    if (bracket.rounds.length === 0) {
      console.error('Bracket has no rounds');
      return null;
    }

    const finalRound = bracket.rounds[bracket.rounds.length - 1];

    if (finalRound.matches.length === 0) {
      console.error('Final round has no matches');
      return null;
    }

    const finalMatch = await this.matchService.getMatchById(matchId);

    if (!finalMatch) {
      console.error(`Match with ID ${matchId} not found in the final round`);
      return null;
    }

    if (
      finalMatch.team1Score === undefined ||
      finalMatch.team2Score === undefined
    ) {
      console.error('Match scores are undefined');
      return null;
    }

    if (finalMatch.team1Score > finalMatch.team2Score) {
      return {
        teamId: finalMatch.team1Id,
        score: finalMatch.team1Score,
      };
    } else if (finalMatch.team2Score > finalMatch.team1Score) {
      return {
        teamId: finalMatch.team2Id,
        score: finalMatch.team2Score,
      };
    } else {
      console.error(
        `Tie in final match: ${finalMatch.team1Score} - ${finalMatch.team2Score}`,
      );
      return null;
    }
  }
}
