import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '../../drizzle/drizzle.decorator';
import { DrizzleDB } from '../../drizzle/types/drizzle';
import { historyUserStats } from '../../drizzle/schema/history-user-stats.schema';
import { eq, and, sql } from 'drizzle-orm';
import { UserStatsService } from '../user-stats/user-stats.service';

@Injectable()
export class HistoryUserStatsService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly userStatsService: UserStatsService,
  ) {}

  async createHistoryUserStats(
    userId: number,
    matchId: number,
    stats: {
      kill: number;
      assist: number;
      death: number;
      damage: number;
      rating: number;
      ping: number;
      win: boolean;
      sponsor: string;
    },
  ) {
    const roundedStats = {
      ...stats,
      kill: Math.round(stats.kill),
      assist: Math.round(stats.assist),
      death: Math.round(stats.death),
      damage: Math.round(stats.damage),
      rating: Math.round(stats.rating),
      ping: Math.round(stats.ping),
      sponsor: stats.sponsor,
    };

    const [newStats] = await this.db
      .insert(historyUserStats)
      .values({
        userId,
        matchId,
        ...roundedStats,
      })
      .returning();

    await this.updateUserAverageStats(userId);

    return newStats;
  }

  async getHistoryUserStatsByUserId(userId: number) {
    const stats = await this.db
      .select()
      .from(historyUserStats)
      .where(eq(historyUserStats.userId, userId));

    return stats;
  }

  async getHistoryUserStatsByMatchId(matchId: number) {
    const stats = await this.db
      .select()
      .from(historyUserStats)
      .where(eq(historyUserStats.matchId, matchId));

    return stats;
  }

  async getHistoryUserStatsByUserIdAndMatchId(userId: number, matchId: number) {
    const [stats] = await this.db
      .select()
      .from(historyUserStats)
      .where(
        and(
          eq(historyUserStats.userId, userId),
          eq(historyUserStats.matchId, matchId),
        ),
      )
      .limit(1);

    return stats;
  }

  async updateHistoryUserStats(
    id: number,
    stats: Partial<{
      kill: number;
      assist: number;
      death: number;
      damage: number;
      rating: number;
      ping: number;
      win: boolean;
    }>,
  ) {
    const [updatedStats] = await this.db
      .update(historyUserStats)
      .set(stats)
      .where(eq(historyUserStats.id, id))
      .returning();

    return updatedStats;
  }

  async deleteHistoryUserStats(id: number) {
    const [deletedStats] = await this.db
      .delete(historyUserStats)
      .where(eq(historyUserStats.id, id))
      .returning();

    return deletedStats;
  }

  async getAverageStatsByUserId(userId: number) {
    const result = await this.db
      .select({
        avgKill: sql<number>`AVG(${historyUserStats.kill})`,
        avgAssist: sql<number>`AVG(${historyUserStats.assist})`,
        avgDeath: sql<number>`AVG(${historyUserStats.death})`,
        avgDamage: sql<number>`AVG(${historyUserStats.damage})`,
        avgRating: sql<number>`AVG(${historyUserStats.rating})`,
        avgPing: sql<number>`AVG(${historyUserStats.ping})`,
        winRate: sql<number>`SUM(CASE WHEN ${historyUserStats.win} = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*)`,
      })
      .from(historyUserStats)
      .where(eq(historyUserStats.userId, userId));

    return result[0];
  }

  async updateUserAverageStats(userId: number) {
    const averageStats = await this.getAverageStatsByUserId(userId);
    if (averageStats) {
      await this.userStatsService.updateUserStats(userId, {
        avgKills: averageStats.avgKill,
        avgDeaths: averageStats.avgDeath,
        avgAssists: averageStats.avgAssist,
        avgDamage: averageStats.avgDamage,
        avgRating: averageStats.avgRating,
        avgPing: averageStats.avgPing,
        winRate: averageStats.winRate,
        matchesPlayed: await this.getMatchesPlayedCount(userId),
      });
    }
  }

  private async getMatchesPlayedCount(userId: number): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(historyUserStats)
      .where(eq(historyUserStats.userId, userId));
    return result[0].count;
  }
}
