import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DrizzleModule } from './drizzle/drizzle.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscordModule } from '@discord-nestjs/core';
import { GatewayIntentBits, Partials } from 'discord.js';
import { BotModule } from './discord/bot/bot.module';
import { ScheduleModule } from './schedule/schedule.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    DrizzleModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          GUILD_ID: process.env.GUILD_ID,
        }),
      ],
    }),
    DiscordModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        token: process.env.DISCORD_TOKEN,
        discordClientOptions: {
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.DirectMessageReactions,
            GatewayIntentBits.DirectMessageTyping,
          ],
          partials: [Partials.Message, Partials.Channel, Partials.Reaction],
        },
        registerCommandOptions: [
          {
            forGuild: process.env.GUILD_ID,
            removeCommandsBefore: true,
          },
        ],
      }),
      inject: [ConfigService],
    }),
    BotModule,
    ScheduleModule,
    RedisModule,
    QueueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
