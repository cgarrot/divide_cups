import { Injectable, NestMiddleware } from '@nestjs/common';
import { Message } from 'discord.js';
import { RedisService } from '../../redis/redis.service';
import { UserService } from '../../discord/user/user.service';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(
    private readonly redisService: RedisService,
    private readonly userService: UserService,
  ) {}

  async use(message: Message, next: () => void) {
    const userId = message.author.id;
    const command = message.content.split(' ')[0].toLowerCase();
    const key = `ratelimit:${userId}:${command}`;

    const isAdmin = await this.userService.isUserAdmin(userId);
    if (isAdmin) {
      return next();
    }

    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, 86400); // 24 hours in seconds
    }

    if (count > 200) {
      const ttl = await this.redisService.ttl(key);
      const hours = Math.floor(ttl / 3600);
      const minutes = Math.floor((ttl % 3600) / 60);
      await message.author.send(
        `You have reached your daily limit for the ${command} command. Please try again in ${hours} hours and ${minutes} minutes.`,
      );
      return;
    }

    next();
  }
}
