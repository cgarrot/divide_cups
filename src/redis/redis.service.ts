import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redisClient: Redis;

  onModuleInit() {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379'),
    });
    this.logger.log('Redis client initialized');
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
      this.logger.log('Redis client disconnected');
    }
  }

  getClient(): Redis {
    return this.redisClient;
  }

  async set(key: string, value: string): Promise<void> {
    await this.redisClient.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return await this.redisClient.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  async incr(key: string): Promise<number> {
    return await this.redisClient.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.redisClient.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return await this.redisClient.ttl(key);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.redisClient.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.redisClient.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return await this.redisClient.hgetall(key);
  }

  async hincrby(
    key: string,
    field: string,
    increment: number,
  ): Promise<number> {
    return await this.redisClient.hincrby(key, field, increment);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return await this.redisClient.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return await this.redisClient.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return await this.redisClient.smembers(key);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return await this.redisClient.zadd(key, score, member);
  }

  async zrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<string[]> {
    return await this.redisClient.zrangebyscore(key, min, max);
  }

  async zrem(key: string, member: string): Promise<number> {
    return await this.redisClient.zrem(key, member);
  }

  async storeTournamentSchedule(
    tournamentId: number,
    startTime: Date,
    closingTime: Date,
  ): Promise<void> {
    await this.redisClient.hset(
      'scheduled_tournaments',
      tournamentId.toString(),
      JSON.stringify({
        id: tournamentId,
        startTime: startTime.toISOString(),
        closingTime: closingTime.toISOString(),
      }),
    );
    this.logger.log(
      `Stored tournament schedule in Redis - ID: ${tournamentId}, Start: ${startTime}, Closing: ${closingTime}`,
    );
  }

  async getScheduledTournaments(): Promise<
    Array<{ id: number; startTime: string; closingTime: string }>
  > {
    const tournaments = await this.redisClient.hgetall('scheduled_tournaments');
    return Object.values(tournaments).map((tournament) =>
      JSON.parse(tournament),
    );
  }

  async removeTournamentSchedule(tournamentId: number): Promise<void> {
    await this.redisClient.hdel(
      'scheduled_tournaments',
      tournamentId.toString(),
    );
    this.logger.log(
      `Removed tournament schedule from Redis - ID: ${tournamentId}`,
    );
  }

  async scard(key: string): Promise<number> {
    return await this.redisClient.scard(key);
  }

  async spop(key: string, count: number): Promise<string[]> {
    return await this.redisClient.spop(key, count);
  }
}
