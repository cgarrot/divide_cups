import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { TournamentService } from '../discord/tournament/tournament.service';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Client } from 'discord.js';
import { RolesService } from '../discord/roles/roles.service';
import { QueueService } from '../queue/queue.service'; // Add this import
import { TournamentImageService } from 'src/discord/tournament-image/tournament-image.service';
import { BracketService } from 'src/discord/tournament/bracket/bracket.service';
import { CronJob } from 'cron';
import { RedisService } from '../redis/redis.service'; // Add this import
import { TeamService } from '../discord/team/team.service'; // Update this import

@Injectable()
export class ScheduleService implements OnModuleInit {
  private readonly logger = new Logger(ScheduleService.name);
  private tournamentCount = 0;

  constructor(
    private readonly tournamentService: TournamentService,
    @InjectDiscordClient() private readonly client: Client,
    private readonly rolesService: RolesService,
    private readonly bracketService: BracketService, // Add this service
    private readonly queueService: QueueService, // Add this service
    private readonly tournamentImageService: TournamentImageService, // Add this service,
    private readonly schedulerRegistry: SchedulerRegistry,
    private redisService: RedisService, // Add this service
    private readonly teamService: TeamService, // Update this import
  ) {}

  async onModuleInit() {
    await this.restoreScheduledTournaments();
  }

  private async restoreScheduledTournaments() {
    try {
      const scheduledTournaments =
        await this.redisService.getScheduledTournaments();
      this.logger.log(
        `Found ${scheduledTournaments.length} scheduled tournaments in Redis`,
      );

      let restoredCount = 0;
      let removedCount = 0;

      for (const tournament of scheduledTournaments) {
        const startTime = new Date(tournament.startTime);
        const closingTime = new Date(tournament.closingTime);
        const now = new Date();

        if (startTime > now) {
          if (closingTime > now) {
            this.scheduleTournamentStart(tournament.id, startTime);
            this.logger.log(
              `Restored tournament ${tournament.id} scheduled for ${startTime}`,
            );
          } else {
            console.log('Closing tournament', tournament.id);
            await this.closeTournament(tournament.id);
            this.logger.log(
              `Closed tournament ${tournament.id} as it was past closing time`,
            );
          }
          restoredCount++;
        } else {
          // Remove past tournaments from Redis
          await this.redisService.removeTournamentSchedule(tournament.id);
          this.logger.log(
            `Removed past tournament ${tournament.id} from Redis`,
          );
          removedCount++;
        }
      }

      this.logger.log(
        `Restoration complete. Restored ${restoredCount} tournaments, removed ${removedCount} past tournaments`,
      );
    } catch (error) {
      this.logger.error('Error restoring scheduled tournaments:', error);
    }
  }

  @Cron('0 21 * * 2', {
    name: 'weekly_tournament_na',
    timeZone: 'America/New_York',
  })
  async scheduleTournamentNA() {
    await this.scheduleTournament('NA');
  }

  @Cron('0 19 * * 2', {
    name: 'weekly_tournament_eu',
    timeZone: 'Europe/Paris',
  })
  async scheduleTournamentEU() {
    await this.scheduleTournament('EU');
  }

  @Cron('0 19 * * 2', {
    name: 'weekly_tournament_sa',
    timeZone: 'America/Sao_Paulo',
  })
  async scheduleTournamentSA() {
    await this.scheduleTournament('SA');
  }

  @Cron('0 18 * * 2', {
    name: 'weekly_tournament_asia',
    timeZone: 'Asia/Tokyo',
  })
  async scheduleTournamentASIA() {
    await this.scheduleTournament('ASIA');
  }

  @Cron('0 19 * * 2', {
    name: 'weekly_tournament_oce',
    timeZone: 'Australia/Sydney',
  })
  async scheduleTournamentOCEA() {
    await this.scheduleTournament('OCEA');
  }

  async scheduleTournament(region: string) {
    this.logger.log(`Scheduling tournament for region: ${region}`);

    const tournamentName = `Weekly ${region} Tournament #${++this.tournamentCount}`;
    const startTime = this.getNextTournamentStartTime(region);
    const maxTeamLimit = 32;
    const prize = 'N/A';

    try {
      const tournament = await this.tournamentService.createTournament(
        tournamentName,
        startTime,
        maxTeamLimit,
        prize,
        region as 'NA' | 'EU' | 'ASIA' | 'OCEA' | 'SA',
      );

      this.logger.log(`Tournament created: ${tournament.name}`);

      const channelName = `${region.toLowerCase()}-announcements`;
      const channel = await this.rolesService.getChannelByName(channelName);

      if (!channel) {
        throw new Error(`Announcement channel for region ${region} not found`);
      }

      const announcementChannelId = channel.discordId;

      const message =
        await this.tournamentService.sendTournamentAnnouncementMessage(
          tournament,
          announcementChannelId,
        );

      this.logger.log(`Tournament announcement sent: ${message.id}`);

      // Schedule the tournament start
      await this.scheduleTournamentStart(tournament.id, startTime);

      // Store the tournament schedule in Redis
      const closingTime = new Date(startTime.getTime() - 5 * 60 * 1000);
      await this.redisService.storeTournamentSchedule(
        tournament.id,
        startTime,
        closingTime,
      );
      this.logger.log(`Tournament ${tournament.id} schedule stored in Redis`);

      return {
        success: true,
        message: 'Tournament scheduled successfully',
        tournamentId: tournament.id,
        announcementMessageId: message.id,
      };
    } catch (error) {
      this.logger.error(`Error scheduling tournament for ${region}:`, error);
      throw error;
    }
  }

  private getNextTournamentStartTime(region: string): Date {
    const now = new Date();
    const nextTuesday = new Date(
      now.getTime() + ((7 - now.getDay() + 2) % 7) * 24 * 60 * 60 * 1000,
    );
    nextTuesday.setDate(nextTuesday.getDate() + 7); // Move to next week's Tuesday

    switch (region) {
      case 'NA':
        nextTuesday.setUTCHours(21, 0, 0, 0); // 9 PM ET
        break;
      case 'EU':
        nextTuesday.setUTCHours(17, 0, 0, 0); // 7 PM CET
        break;
      case 'SA':
        nextTuesday.setUTCHours(22, 0, 0, 0); // 7 PM BRT
        break;
      case 'ASIA':
        nextTuesday.setUTCHours(9, 0, 0, 0); // 6 PM JST (next day)
        break;
      case 'OCEA':
        nextTuesday.setUTCHours(8, 0, 0, 0); // 7 PM AEDT (next day)
        break;
      default:
        throw new Error(`Invalid region: ${region}`);
    }

    return nextTuesday;
  }

  private async scheduleTournamentStart(tournamentId: number, startTime: Date) {
    const jobName = `start-tournament-${tournamentId}`;
    const closingTime = new Date(startTime.getTime() - 5 * 60 * 1000); // 5 minutes before start time

    // Schedule tournament closing
    const closingJobName = `close-tournament-${tournamentId}`;
    const closingJob = new CronJob(closingTime, async () => {
      try {
        await this.closeTournament(tournamentId);
      } catch (error) {
        this.logger.error(`Error closing tournament ${tournamentId}:`, error);
      }
    });

    this.schedulerRegistry.addCronJob(closingJobName, closingJob);
    closingJob.start();
    this.logger.log(
      `Scheduled closing job for tournament ${tournamentId} at ${closingTime}`,
    );

    // Save tournament schedule to Redis before creating the cron job
    await this.redisService.storeTournamentSchedule(
      tournamentId,
      startTime,
      closingTime,
    );

    const job = new CronJob(startTime, async () => {
      try {
        const tournament =
          await this.tournamentService.getTournamentById(tournamentId);
        if (!tournament) {
          this.logger.warn(
            `Tournament ${tournamentId} not found, removing from schedule`,
          );
          await this.redisService.removeTournamentSchedule(tournamentId);
          return;
        }

        const teams = this.parseJsonSafely(tournament.teams, []);
        if (teams.length < 2) {
          this.logger.warn(
            `Not enough teams for tournament ${tournamentId}, cancelling`,
          );
          await this.tournamentService.cancelTournament(tournamentId);
          await this.redisService.removeTournamentSchedule(tournamentId);
          return;
        }

        await this.tournamentService.startTournament(tournamentId);
        this.logger.log(`Tournament ${tournamentId} started successfully`);
      } catch (error) {
        this.logger.error(`Error starting tournament ${tournamentId}:`, error);
      } finally {
        // Always remove the tournament schedule from Redis after attempting to start
        await this.redisService.removeTournamentSchedule(tournamentId);
        this.logger.log(
          `Tournament ${tournamentId} removed from Redis schedule`,
        );
      }
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();

    this.logger.log(
      `Scheduled tournament ${tournamentId} to start at ${startTime}`,
    );
    this.logger.log(
      `Scheduled tournament ${tournamentId} to close at ${closingTime}`,
    );
  }

  private parseJsonSafely(
    jsonString: string | any[],
    defaultValue: any[],
  ): any[] {
    if (Array.isArray(jsonString)) {
      return jsonString;
    }
    if (typeof jsonString === 'string') {
      try {
        return JSON.parse(jsonString);
      } catch (error) {
        this.logger.error('Error parsing JSON:', error);
        return defaultValue;
      }
    }
    return defaultValue;
  }

  async startTournament(tournamentId: number) {
    try {
      const tournament =
        await this.tournamentService.getTournamentById(tournamentId);
      if (!tournament) {
        this.logger.warn(
          `Tournament ${tournamentId} not found, removing from schedule`,
        );
        await this.redisService.removeTournamentSchedule(tournamentId);
        return;
      }

      const teams = this.parseJsonSafely(tournament.teams, []);
      const waitingList = this.parseJsonSafely(tournament.waitingList, []);
      const checkInKey = `tournament:${tournamentId}:check_in`;

      // Verify check-ins and update teams
      const verifiedTeams = [];
      const removedTeams = [];

      for (const team of teams) {
        const teamMembers = await this.teamService.getTeamMembers(team.id);
        const allCheckedIn = await this.verifyTeamCheckIn(
          checkInKey,
          team.id,
          teamMembers,
        );

        if (allCheckedIn) {
          verifiedTeams.push(team);
        } else {
          removedTeams.push(team);
        }
      }

      // Process waiting list
      for (const waitingTeam of waitingList) {
        if (verifiedTeams.length >= tournament.maxTeamLimit) break;

        const teamMembers = await this.teamService.getTeamMembers(
          waitingTeam.id,
        );
        const allCheckedIn = await this.verifyTeamCheckIn(
          checkInKey,
          waitingTeam.id,
          teamMembers,
        );

        if (allCheckedIn) {
          verifiedTeams.push(waitingTeam);
        }
      }

      // Update tournament with verified teams
      await this.tournamentService.updateTournament(tournamentId, {
        teams: JSON.stringify(verifiedTeams),
        waitingList: JSON.stringify([]), // Clear the waiting list
      });

      if (verifiedTeams.length < 2) {
        this.logger.warn(
          `Not enough teams for tournament ${tournamentId}, cancelling`,
        );
        await this.tournamentService.cancelTournament(tournamentId);
        await this.redisService.removeTournamentSchedule(tournamentId);
        return;
      }

      // Start the tournament with verified teams
      await this.tournamentService.startTournament(tournamentId);
      this.logger.log(
        `Tournament ${tournamentId} started successfully with ${verifiedTeams.length} teams`,
      );

      // Notify removed teams
      for (const removedTeam of removedTeams) {
        await this.notifyRemovedTeam(removedTeam, tournamentId);
      }
    } catch (error) {
      this.logger.error(`Error starting tournament ${tournamentId}:`, error);
    } finally {
      await this.redisService.removeTournamentSchedule(tournamentId);
      this.logger.log(`Tournament ${tournamentId} removed from Redis schedule`);
    }
  }

  private async verifyTeamCheckIn(
    checkInKey: string,
    teamId: number,
    teamMembers: any[],
  ): Promise<boolean> {
    for (const member of teamMembers) {
      const isCheckedIn = await this.redisService.hget(
        checkInKey,
        `${teamId}:${member.id}`,
      );
      if (isCheckedIn !== '1') {
        return false;
      }
    }
    return true;
  }

  private async notifyRemovedTeam(
    team: any,
    tournamentId: number,
  ): Promise<void> {
    // Implement logic to notify the team that they've been removed due to incomplete check-in
    // This could involve sending a Discord message or any other notification method
    this.logger.log(
      `Team ${team.name} removed from tournament ${tournamentId} due to incomplete check-in`,
    );
  }

  private async closeTournament(tournamentId: number): Promise<void> {
    try {
      const tournament =
        await this.tournamentService.getTournamentById(tournamentId);
      if (!tournament) {
        this.logger.warn(`Tournament ${tournamentId} not found, cannot close`);
        return;
      }

      // Update the tournament announcement message to remove buttons
      await this.tournamentService.updateTournamentAnnouncementMessage(
        tournament,
      );

      this.logger.log(`Tournament ${tournamentId} closed successfully`);
    } catch (error) {
      this.logger.error(`Error closing tournament ${tournamentId}:`, error);
    }
  }
}
