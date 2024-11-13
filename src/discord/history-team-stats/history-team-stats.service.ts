import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '../../drizzle/drizzle.decorator';
import { DrizzleDB } from '../../drizzle/types/drizzle';
import { historyTeamStats } from '../../drizzle/schema/history-team-stats.schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { TeamStatsService } from '../team-stats/team-stats.service';

@Injectable()
export class HistoryTeamStatsService {
  private readonly logger = new Logger(HistoryTeamStatsService.name);

  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly teamStatsService: TeamStatsService,
  ) {}

  async createHistoryTeamStats(
    teamId: number,
    tournamentId: number,
    matchId: number,
    stats: {
      kills: number;
      deaths: number;
      assists: number;
      roundsWon: number;
      roundsLost: number;
      score: number;
      result: 'win' | 'loss' | 'draw';
    },
  ) {
    try {
      const [newStats] = await this.db
        .insert(historyTeamStats)
        .values({
          teamId,
          tournamentId,
          matchId,
          kill: stats.kills,
          death: stats.deaths,
          assist: stats.assists,
          roundsWon: stats.roundsWon,
          roundsLost: stats.roundsLost,
          score: stats.score,
          result: stats.result,
        })
        .returning();

      await this.updateTeamAverageStats(teamId);

      return newStats;
    } catch (error) {
      this.logger.error(
        `Failed to create history team stats: ${error.message}`,
      );
      throw error;
    }
  }

  async getTeamStats(teamId: number) {
    try {
      const stats = await this.db
        .select()
        .from(historyTeamStats)
        .where(eq(historyTeamStats.teamId, teamId))
        .orderBy(desc(historyTeamStats.createdAt));

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get team stats: ${error.message}`);
      throw error;
    }
  }

  async getTeamStatsByTournament(teamId: number, tournamentId: number) {
    try {
      const stats = await this.db
        .select()
        .from(historyTeamStats)
        .where(
          and(
            eq(historyTeamStats.teamId, teamId),
            eq(historyTeamStats.tournamentId, tournamentId),
          ),
        )
        .orderBy(desc(historyTeamStats.createdAt));

      return stats;
    } catch (error) {
      this.logger.error(
        `Failed to get team stats by tournament: ${error.message}`,
      );
      throw error;
    }
  }

  async getTeamStatsByMatch(teamId: number, matchId: number) {
    try {
      const [stats] = await this.db
        .select()
        .from(historyTeamStats)
        .where(
          and(
            eq(historyTeamStats.teamId, teamId),
            eq(historyTeamStats.matchId, matchId),
          ),
        )
        .limit(1);

      if (!stats) {
        throw new NotFoundException(
          `No stats found for team ${teamId} in match ${matchId}`,
        );
      }

      return stats;
    } catch (error) {
      this.logger.error(`Failed to get team stats by match: ${error.message}`);
      throw error;
    }
  }

  async updateTeamStats(
    teamId: number,
    matchId: number,
    stats: Partial<{
      kills: number;
      deaths: number;
      assists: number;
      roundsWon: number;
      roundsLost: number;
      score: number;
      result: 'win' | 'loss' | 'draw';
    }>,
  ) {
    try {
      const [updatedStats] = await this.db
        .update(historyTeamStats)
        .set({ ...stats })
        .where(
          and(
            eq(historyTeamStats.teamId, teamId),
            eq(historyTeamStats.matchId, matchId),
          ),
        )
        .returning();

      if (!updatedStats) {
        throw new NotFoundException(
          `No stats found for team ${teamId} in match ${matchId}`,
        );
      }

      return updatedStats;
    } catch (error) {
      this.logger.error(`Failed to update team stats: ${error.message}`);
      throw error;
    }
  }

  async deleteTeamStats(teamId: number, matchId: number) {
    try {
      const result = await this.db
        .delete(historyTeamStats)
        .where(
          and(
            eq(historyTeamStats.teamId, teamId),
            eq(historyTeamStats.matchId, matchId),
          ),
        )
        .returning();

      if (result.length === 0) {
        throw new NotFoundException(
          `No stats found for team ${teamId} in match ${matchId}`,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to delete team stats: ${error.message}`);
      throw error;
    }
  }

  private async updateTeamAverageStats(teamId: number) {
    const averageStats =
      await this.teamStatsService.getTeamAverageStats(teamId);
    if (averageStats) {
      const winLossRecord =
        await this.teamStatsService.getTeamWinLossRecord(teamId);
      const totalGames =
        winLossRecord.wins + winLossRecord.losses + winLossRecord.draws;
      await this.teamStatsService.updateTeamStats(teamId, {
        elo: await this.teamStatsService.calculateTeamElo(teamId),
        avgKill: averageStats.avgKills,
        avgAssist: averageStats.avgAssists,
        avgDeath: averageStats.avgDeaths,
        avgDamage: 0, // Not provided in current implementation
        avgRating: 0, // Not provided in current implementation
        avgPing: 0, // Not provided in current implementation
        winrate: totalGames > 0 ? (winLossRecord.wins / totalGames) * 100 : 0,
        gamePlayed: totalGames,
        historyIds: JSON.stringify(await this.getTeamHistoryIds(teamId)),
      });
    }
  }

  private async getTeamHistoryIds(teamId: number): Promise<number[]> {
    const result = await this.db
      .select({ id: historyTeamStats.id })
      .from(historyTeamStats)
      .where(eq(historyTeamStats.teamId, teamId));
    return result.map((r) => r.id);
  }
}
