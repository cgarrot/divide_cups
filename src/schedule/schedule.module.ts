import { forwardRef, Module } from '@nestjs/common';
import { ScheduleModule as NestScheduleModule } from '@nestjs/schedule';
import { ScheduleService } from './schedule.service';
import { TournamentModule } from '../discord/tournament/tournament.module';
import { DiscordModule } from '@discord-nestjs/core';
import { RolesModule } from 'src/discord/roles/roles.module';
import { TournamentImageModule } from 'src/discord/tournament-image/tournament-image.module';
import { BracketModule } from 'src/discord/tournament/bracket/bracket.module';
import { QueueModule } from 'src/queue/queue.module';
import { RedisModule } from 'src/redis/redis.module';
import { TeamModule } from 'src/discord/team/team.module';

@Module({
  imports: [
    DiscordModule.forFeature(),
    NestScheduleModule.forRoot(),
    forwardRef(() => TournamentModule),
    RolesModule,
    TournamentImageModule,
    BracketModule,
    QueueModule,
    RedisModule,
    TeamModule,
  ],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
