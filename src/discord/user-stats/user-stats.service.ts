import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '../../drizzle/drizzle.decorator';
import { DrizzleDB } from '../../drizzle/types/drizzle';
import { userStats } from '../../drizzle/schema/user-stats.schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class UserStatsService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async getUserStats(userId: number) {
    const [stats] = await this.db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, userId));
    return stats;
  }

  async updateUserStats(
    userId: number,
    statsUpdate: Partial<
      Omit<
        typeof userStats.$inferInsert,
        'userId' | 'id' | 'createdAt' | 'updatedAt'
      >
    >,
  ) {
    const [updatedStats] = await this.db
      .update(userStats)
      .set({ ...statsUpdate })
      .where(eq(userStats.userId, userId))
      .returning();
    return updatedStats;
  }

  async createUserStats(userId: number) {
    const newStats = await this.db
      .insert(userStats)
      .values({
        userId,
      })
      .returning();
    return newStats;
  }

  async incrementStats(
    userId: number,
    stats: {
      kills?: number;
      deaths?: number;
      assists?: number;
      damage?: number;
      rating?: number;
      ping?: number;
      matchesPlayed?: number;
      wins?: number;
      losses?: number;
    },
  ) {
    const currentStats = await this.getUserStats(userId);
    if (!currentStats) {
      throw new Error('User stats not found');
    }

    const updatedStats = {
      avgKills: this.calculateNewAverage(
        currentStats.avgKills,
        stats.kills,
        currentStats.matchesPlayed,
      ),
      avgDeaths: this.calculateNewAverage(
        currentStats.avgDeaths,
        stats.deaths,
        currentStats.matchesPlayed,
      ),
      avgAssists: this.calculateNewAverage(
        currentStats.avgAssists,
        stats.assists,
        currentStats.matchesPlayed,
      ),
      avgDamage: this.calculateNewAverage(
        currentStats.avgDamage,
        stats.damage,
        currentStats.matchesPlayed,
      ),
      avgRating: this.calculateNewAverage(
        currentStats.avgRating,
        stats.rating,
        currentStats.matchesPlayed,
      ),
      avgPing: this.calculateNewAverage(
        currentStats.avgPing,
        stats.ping,
        currentStats.matchesPlayed,
      ),
      matchesPlayed: currentStats.matchesPlayed + (stats.matchesPlayed || 0),
      wins: currentStats.wins + (stats.wins || 0),
      losses: currentStats.losses + (stats.losses || 0),
    };

    const winRate = this.calculateWinRate(
      updatedStats.wins,
      updatedStats.losses,
    );
    return { ...updatedStats, winRate };
  }

  private calculateNewAverage(
    currentAvg: number,
    newValue: number | undefined,
    totalMatches: number,
  ): number {
    if (newValue === undefined) return currentAvg;
    return Math.round(
      (currentAvg * totalMatches + newValue) / (totalMatches + 1),
    );
  }

  private calculateWinRate(wins: number, losses: number): number {
    const totalGames = wins + losses;
    return totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  }
}
