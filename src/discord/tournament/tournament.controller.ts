import {
  Controller,
  Post,
  Body,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Patch,
  Param,
} from '@nestjs/common';
import { TournamentService } from './tournament.service';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Client } from 'discord.js';
import { RolesService } from '../roles/roles.service';
import { BracketService } from './bracket/bracket.service';
import { MatchService } from '../match/match.service';
import { TeamService } from '../team/team.service';
import { TournamentImageService } from '../tournament-image/tournament-image.service';
import { ScheduleService } from '../../schedule/schedule.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { QueueService } from 'src/queue/queue.service';
import { parseISO } from 'date-fns';
import { RedisService } from 'src/redis/redis.service';
import { UpdateTournamentDto } from './dto/update-tournament.dto';

@Controller('tournaments')
export class TournamentController {
  private readonly logger = new Logger(TournamentController.name);
  private tournamentCount = 0;

  constructor(
    private readonly tournamentService: TournamentService,
    @InjectDiscordClient() private readonly client: Client,
    private readonly rolesService: RolesService,
    private readonly bracketService: BracketService,
    private readonly tournamentImageService: TournamentImageService,
    private readonly queueService: QueueService,
    private schedulerRegistry: SchedulerRegistry,
    private readonly redisService: RedisService,
  ) {}

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
        await this.executeScheduledTournamentStart(tournamentId);
        // Remove the tournament schedule from Redis after it starts
        await this.redisService.removeTournamentSchedule(tournamentId);
        this.logger.log(
          `Tournament ${tournamentId} started and removed from Redis`,
        );
      } catch (error) {
        this.logger.error(`Error starting tournament ${tournamentId}:`, error);
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

  private async executeScheduledTournamentStart(tournamentId: number) {
    try {
      const result = await this.startTournament({ tournamentId });
      this.logger.log(
        `Tournament ${tournamentId} started automatically: ${JSON.stringify(result)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to start tournament ${tournamentId} automatically:`,
        error,
      );
    }
  }

  @Post('schedule')
  async scheduleTournament(
    @Body() body: { region: string; startTime: string },
  ) {
    const { region, startTime } = body;
    this.logger.log(
      `Scheduling tournament for region: ${region} on date: ${startTime}`,
    );

    try {
      const regionalStartTime = parseISO(startTime);
      console.log(regionalStartTime);

      const tournamentName = `Weekly ${region} Tournament #${++this.tournamentCount}`;
      const maxTeamLimit = 32;
      const prize = '';

      const tournament = await this.tournamentService.createTournament(
        tournamentName,
        regionalStartTime,
        maxTeamLimit,
        prize,
        region as 'NA' | 'EU' | 'ASIA' | 'OCEA' | 'SA',
      );

      this.logger.log(`Tournament created: ${tournament.name}`);

      await this.scheduleTournamentStart(tournament.id, regionalStartTime);

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

      // Store the tournament schedule in Redis
      const closingTime = new Date(regionalStartTime.getTime() - 5 * 60 * 1000);
      await this.redisService.storeTournamentSchedule(
        tournament.id,
        regionalStartTime,
        closingTime,
      );
      this.logger.log(`Tournament ${tournament.id} schedule stored in Redis`);

      return {
        success: true,
        message: 'Tournament scheduled successfully',
        tournamentId: tournament.id,
        announcementMessageId: message.id,
        scheduledStartTime: regionalStartTime,
      };
    } catch (error) {
      this.logger.error(`Error scheduling tournament for ${region}:`, error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      return {
        success: false,
        message: 'Failed to schedule tournament',
        error: error.message,
      };
    }
  }

  private getRegionTimezone(region: string): string {
    switch (region) {
      case 'NA':
        return 'America/New_York';
      case 'EU':
        return 'Europe/Paris';
      case 'SA':
        return 'America/Sao_Paulo';
      case 'ASIA':
        return 'Asia/Tokyo';
      case 'OCEA':
        return 'Australia/Sydney';
      default:
        throw new Error('Invalid region');
    }
  }

  @Post('start')
  async startTournament(@Body() body: { tournamentId: number }) {
    const { tournamentId } = body;
    console.log(
      `[TournamentController] Starting tournament with ID: ${tournamentId}`,
    );

    try {
      const tournament =
        await this.tournamentService.getTournamentById(tournamentId);
      console.log(`[TournamentController] Tournament fetched:`, tournament);

      if (!tournament) {
        console.log(
          `[TournamentController] Tournament not found for ID: ${tournamentId}`,
        );
        throw new NotFoundException('Tournament not found');
      }

      if (tournament.status !== 'waiting') {
        console.log(
          `[TournamentController] Tournament cannot be started. Status: ${tournament.status}`,
        );
        throw new BadRequestException(
          'Tournament cannot be started. It may have already started or ended.',
        );
      }

      console.log(
        `[TournamentController] Generating bracket for tournament ${tournamentId}`,
      );
      const bracket = await this.bracketService.generateBracket(tournament);

      console.log(
        `[TournamentController] Updating tournament ${tournamentId} with generated bracket`,
      );
      await this.tournamentService.updateTournamentBracket(
        tournamentId,
        bracket,
      );

      console.log(
        `[TournamentController] Queueing match creation for tournament ${tournamentId}`,
      );
      for (const round of bracket.rounds) {
        for (const match of round.matches) {
          await this.queueService.addToQueue({
            type: 'create_match',
            data: { match, tournamentId },
          });
        }
      }

      console.log(
        `[TournamentController] Updating tournament ${tournamentId} status to 'in_progress'`,
      );
      await this.tournamentService.updateTournamentStatus(
        tournamentId,
        'in_progress',
      );

      console.log(
        `[TournamentController] Generating bracket image for tournament ${tournamentId}`,
      );
      const bracketImage =
        await this.tournamentImageService.generateBracketImage(bracket);

      console.log(
        `[TournamentController] Sending tournament start announcement for tournament ${tournamentId}`,
      );
      try {
        await this.tournamentService.sendTournamentStartAnnouncement(
          tournament,
          bracketImage,
        );
      } catch (announcementError) {
        console.error(
          `[TournamentController] Error sending tournament start announcement:`,
          announcementError,
        );
      }

      console.log(
        `[TournamentController] Tournament ${tournamentId} started successfully`,
      );
      return {
        success: true,
        message: 'Tournament started successfully',
        tournamentId: tournament.id,
      };
    } catch (error) {
      console.error(
        `[TournamentController] Error starting tournament ${tournamentId}:`,
        error,
      );
      console.error(`[TournamentController] Error stack:`, error.stack);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Failed to start tournament: ' + error.message,
      );
    }
  }

  @Patch(':id')
  async updateTournament(
    @Param('id') id: string,
    @Body() updateTournamentDto: UpdateTournamentDto,
  ) {
    const tournamentId = parseInt(id, 10);

    if (isNaN(tournamentId)) {
      throw new BadRequestException('Invalid tournament ID');
    }

    try {
      // If startTime is provided, parse it using parseISO
      if (updateTournamentDto.startTime) {
        const parsedStartTime = parseISO(
          updateTournamentDto.startTime as string,
        );
        if (isNaN(parsedStartTime.getTime())) {
          throw new BadRequestException('Invalid start time');
        }
        updateTournamentDto.startTime = parsedStartTime;
      }

      const updatedTournament =
        await this.tournamentService.updateTournamentRequest(
          tournamentId,
          updateTournamentDto,
        );

      // If the start time is updated, update the Redis schedule and reschedule the closing job
      if (updateTournamentDto.startTime) {
        const startTime = updateTournamentDto.startTime as Date;
        const closingTime = new Date(startTime.getTime() - 5 * 60 * 1000);

        // Update Redis schedule
        await this.redisService.storeTournamentSchedule(
          tournamentId,
          startTime,
          closingTime,
        );

        // Reschedule the closing job
        const closingJobName = `close-tournament-${tournamentId}`;
        this.schedulerRegistry.deleteCronJob(closingJobName);

        const newClosingJob = new CronJob(closingTime, async () => {
          try {
            await this.closeTournament(tournamentId);
          } catch (error) {
            this.logger.error(
              `Error closing tournament ${tournamentId}:`,
              error,
            );
          }
        });

        this.schedulerRegistry.addCronJob(closingJobName, newClosingJob);
        newClosingJob.start();
        this.logger.log(
          `Rescheduled closing job for tournament ${tournamentId} at ${closingTime}`,
        );
      }

      return {
        success: true,
        message: 'Tournament updated successfully',
        tournament: updatedTournament,
      };
    } catch (error) {
      this.logger.error(`Error updating tournament ${tournamentId}:`, error);
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update tournament');
    }
  }

  private async closeTournament(tournamentId: number): Promise<void> {
    try {
      const tournament =
        await this.tournamentService.getTournamentById(tournamentId);
      if (!tournament) {
        this.logger.warn(`Tournament ${tournamentId} not found, cannot close`);
        return;
      }

      // Update the tournament announcement message to add check-in button
      await this.tournamentService.updateTournamentAnnouncementMessageWithCheckIn(
        tournament,
      );

      // Initialize check-in for the tournament
      await this.tournamentService.initializeTournamentCheckIn(tournament);

      this.logger.log(`Tournament ${tournamentId} closed and check-in opened`);
    } catch (error) {
      this.logger.error(`Error closing tournament ${tournamentId}:`, error);
    }
  }
}
