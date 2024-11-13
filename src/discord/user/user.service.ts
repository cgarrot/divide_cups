import { Injectable } from '@nestjs/common';
import { DrizzleDB } from '../../drizzle/types/drizzle';
import { users } from '../../drizzle/schema/users.schema';
import { InjectDrizzle } from 'src/drizzle/drizzle.decorator';
import { eq, inArray } from 'drizzle-orm';
import { User } from './user.interface';
import { UserStats } from '../user-stats/user-stats.interface';
import { UserStatsService } from '../user-stats/user-stats.service';

@Injectable()
export class UserService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly userStatsService: UserStatsService,
  ) {}

  async createUser(
    username: string,
    discordId: string,
    steamId?: string,
    region?: string,
  ): Promise<User | null> {
    const result = await this.db
      .insert(users)
      .values({
        username,
        discordId,
        steamId: steamId || '',
        region: region || '',
        roleDb: 'user', // Add this line to set a default role
      })
      .returning();

    const newUser = result[0] as User;

    if (newUser) {
      await this.userStatsService.createUserStats(newUser.id);
    }

    return newUser || null;
  }

  async updateSteamId(
    discordId: string,
    steamId: string,
  ): Promise<User | null> {
    const result = await this.db
      .update(users)
      .set({ steamId })
      .where(eq(users.discordId, discordId))
      .returning();

    return (result[0] as User) || null;
  }

  async updateTeamId(discordId: string, teamId: number): Promise<User | null> {
    const result = await this.db
      .update(users)
      .set({ teamId })
      .where(eq(users.discordId, discordId))
      .returning();

    return (result[0] as User) || null;
  }

  async getUserByDiscordId(discordId: string): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.discordId, discordId))
      .limit(1);

    return (result[0] as User) || null;
  }

  async updateUserSteamId(userId: number, steamId: string) {
    await this.db.update(users).set({ steamId }).where(eq(users.id, userId));
  }

  async getUserByTeamId(teamId: number): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.teamId, teamId));

    return (result[0] as User) || null;
  }

  async getUserById(userId: number): Promise<User | null> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    return (result[0] as User) || null;
  }

  async updateUserDate(discordId: string): Promise<User | null> {
    const result = await this.db
      .update(users)
      .set({ updatedAt: new Date() })
      .where(eq(users.discordId, discordId))
      .returning();

    return (result[0] as User) || null;
  }

  async updateUserRegion(
    discordId: string,
    region: string,
  ): Promise<User | null> {
    const result = await this.db
      .update(users)
      .set({ region })
      .where(eq(users.discordId, discordId))
      .returning();

    return (result[0] as User) || null;
  }

  async updateUserRoles(
    discordId: string,
    roleIds: string[],
  ): Promise<User | null> {
    const user = await this.getUserByDiscordId(discordId);
    if (!user) return null;

    const currentRoles = JSON.parse(user.roles || '[]');
    const updatedRoles = Array.from(new Set([...currentRoles, ...roleIds]));

    const result = await this.db
      .update(users)
      .set({ roles: JSON.stringify(updatedRoles) })
      .where(eq(users.discordId, discordId))
      .returning();

    return (result[0] as User) || null;
  }

  async removeUserRole(
    discordId: string,
    roleId: string,
  ): Promise<User | null> {
    const user = await this.getUserByDiscordId(discordId);
    if (!user) return null;

    const currentRoles = JSON.parse(user.roles || '[]');
    const updatedRoles = currentRoles.filter((id: string) => id !== roleId);

    const result = await this.db
      .update(users)
      .set({ roles: JSON.stringify(updatedRoles) })
      .where(eq(users.discordId, discordId))
      .returning();

    return (result[0] as User) || null;
  }

  async updateUserStats(
    userId: number,
    stats: Partial<UserStats>,
  ): Promise<User> {
    const result = await this.db
      .update(users)
      .set({
        ...stats,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    const updatedUser = result[0] as User;
    return updatedUser;
  }

  async getUserBySteamId(steamId: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.steamId, steamId))
      .limit(1);
    return user ? (user as User) : null;
  }

  async getUsersBySteamId(steamId: string): Promise<User[]> {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.steamId, steamId));
    return result as User[];
  }

  async getUsersBySteamIds(steamIds: string[]): Promise<User[]> {
    const result = await this.db
      .select()
      .from(users)
      .where(inArray(users.steamId, steamIds));
    return result as User[];
  }

  async getUsersBySteamUsernames(steamUsernames: string[]): Promise<User[]> {
    const result = await this.db
      .select()
      .from(users)
      .where(inArray(users.steamUsername, steamUsernames));
    return result as User[];
  }

  async updateSteamUsername(
    discordId: string,
    steamUsername: string,
  ): Promise<User | null> {
    const result = await this.db
      .update(users)
      .set({ steamUsername, updatedAt: new Date() })
      .where(eq(users.discordId, discordId))
      .returning();

    return (result[0] as User) || null;
  }

  async getSteamIdsByUserIds(userIds: number[]): Promise<string[]> {
    const result = await this.db
      .select({ steamId: users.steamId })
      .from(users)
      .where(inArray(users.id, userIds));

    return result.map((user) => user.steamId);
  }

  async getUsersByIds(userIds: number[]): Promise<User[]> {
    const result = await this.db
      .select()
      .from(users)
      .where(inArray(users.id, userIds));
    return result as User[];
  }

  async getUserBySteamUsername(steamUsername: string): Promise<User | null> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.steamUsername, steamUsername))
      .limit(1);

    return (user as User) || null;
  }

  async isUserAdmin(discordId: string): Promise<boolean> {
    const user = await this.getUserByDiscordId(discordId);
    return user?.roleDb === 'admin' || discordId === '96667501416431616';
  }
}
