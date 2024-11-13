import { forwardRef, Module } from '@nestjs/common';
import { TournamentService } from './tournament.service';
import { TournamentGateway } from './tournament.gateway';
import { TournamentCommands } from '../bot/commands/tournament.commands';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { DiscordModule } from '@discord-nestjs/core';
import { TeamModule } from '../team/team.module';
import { UserModule } from '../user/user.module';
import { MatchModule } from '../match/match.module';
import { BracketModule } from './bracket/bracket.module';
import { RolesModule } from '../roles/roles.module';
import { TournamentImageModule } from '../tournament-image/tournament-image.module';
import { TournamentController } from './tournament.controller';
import { QueueModule } from 'src/queue/queue.module';
import { ScheduleModule } from 'src/schedule/schedule.module';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  imports: [
    DrizzleModule,
    DiscordModule.forFeature(),
    TeamModule,
    UserModule,
    forwardRef(() => MatchModule),
    BracketModule,
    RolesModule,
    TournamentImageModule,
    forwardRef(() => QueueModule),
    forwardRef(() => ScheduleModule),
    RedisModule,
  ],
  controllers: [TournamentController],
  providers: [TournamentService, TournamentGateway, TournamentCommands],
  exports: [TournamentService],
})
export class TournamentModule {}
