import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectDrizzle } from '../../drizzle/drizzle.decorator';
import { DrizzleDB } from '../../drizzle/types/drizzle';
import { historyTeamStats } from '../../drizzle/schema/history-team-stats.schema';
import { eq, and, sql } from 'drizzle-orm';
import { TeamService } from '../team/team.service';
import { teamStats } from 'src/drizzle/schema/team-stats.schema';

@Injectable()
export class TeamStatsService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    @Inject(forwardRef(() => TeamService))
    private readonly teamService: TeamService,
  ) {}

  async createTeamStats(teamId: number) {
    const [newStats] = await this.db
      .insert(teamStats)
      .values({
        teamId,
        elo: 1000, // Default ELO
        avgKill: 0,
        avgAssist: 0,
        avgDeath: 0,
        avgDamage: 0,
        avgRating: 0,
        avgPing: 0,
        winrate: 0,
        gamePlayed: 0,
        historyIds: '[]',
      })
      .returning();

    return newStats;
  }

  async getTeamStats(teamId: number) {
    const stats = await this.db
      .select()
      .from(historyTeamStats)
      .where(eq(historyTeamStats.teamId, teamId));

    return stats;
  }

  async getTeamStatsByTournament(teamId: number, tournamentId: number) {
    const stats = await this.db
      .select()
      .from(historyTeamStats)
      .where(
        and(
          eq(historyTeamStats.teamId, teamId),
          eq(historyTeamStats.tournamentId, tournamentId),
        ),
      );

    return stats;
  }

  async calculateTeamElo(teamId: number) {
    const team = await this.teamService.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    const stats = await this.getTeamStats(teamId);
    let elo = 1000; // Starting ELO

    for (const match of stats) {
      const eloChange = this.calculateEloChange(elo, match.result);
      elo += eloChange;
    }

    return elo;
  }

  private calculateEloChange(currentElo: number, result: string): number {
    const K = 32; // K-factor
    let expectedScore: number;
    let actualScore: number;

    switch (result) {
      case 'win':
        expectedScore = 1 / (1 + Math.pow(10, (1500 - currentElo) / 400));
        actualScore = 1;
        break;
      case 'loss':
        expectedScore = 1 / (1 + Math.pow(10, (1500 - currentElo) / 400));
        actualScore = 0;
        break;
      case 'draw':
        expectedScore = 1 / (1 + Math.pow(10, (1500 - currentElo) / 400));
        actualScore = 0.5;
        break;
      default:
        throw new Error('Invalid result');
    }

    return Math.round(K * (actualScore - expectedScore));
  }

  async updateTeamStats(teamId: number, stats: any) {
    const [updatedTeam] = await this.db
      .update(teamStats)
      .set(stats)
      .where(eq(teamStats.teamId, teamId))
      .returning();

    return updatedTeam;
  }

  private async updateTeamAverageStats(teamId: number) {
    const averageStats = await this.getTeamAverageStats(teamId);
    if (averageStats) {
      const winLossRecord = await this.getTeamWinLossRecord(teamId);
      const totalGames =
        winLossRecord.wins + winLossRecord.losses + winLossRecord.draws;
      await this.updateTeamStats(teamId, {
        elo: await this.calculateTeamElo(teamId),
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

  async getTeamAverageStats(teamId: number) {
    const [averageStats] = await this.db
      .select({
        avgKills: sql<number>`AVG(${historyTeamStats.kill})`,
        avgDeaths: sql<number>`AVG(${historyTeamStats.death})`,
        avgAssists: sql<number>`AVG(${historyTeamStats.assist})`,
        avgScore: sql<number>`AVG(${historyTeamStats.score})`,
        totalMatches: sql<number>`COUNT(*)`,
        winRate: sql<number>`SUM(CASE WHEN ${historyTeamStats.result} = 'win' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)`,
      })
      .from(historyTeamStats)
      .where(eq(historyTeamStats.teamId, teamId))
      .groupBy(historyTeamStats.teamId);

    return averageStats;
  }

  async getTeamWinLossRecord(teamId: number) {
    const [record] = await this.db
      .select({
        wins: sql<number>`SUM(CASE WHEN ${historyTeamStats.result} = 'win' THEN 1 ELSE 0 END)`,
        losses: sql<number>`SUM(CASE WHEN ${historyTeamStats.result} = 'loss' THEN 1 ELSE 0 END)`,
        draws: sql<number>`SUM(CASE WHEN ${historyTeamStats.result} = 'draw' THEN 1 ELSE 0 END)`,
      })
      .from(historyTeamStats)
      .where(eq(historyTeamStats.teamId, teamId))
      .groupBy(historyTeamStats.teamId);

    return record;
  }
}
