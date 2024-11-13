import { Module } from '@nestjs/common';
import { MatchMakingService } from './match-making.service';
import { TeamModule } from '../team/team.module';
import { UserModule } from '../user/user.module';
import { TournamentModule } from '../tournament/tournament.module';
import { MatchModule } from '../match/match.module';
import { DiscordModule } from '@discord-nestjs/core';
import { RedisModule } from 'src/redis/redis.module';
import { MatchMakingEvents } from './match-making.event';

@Module({
  imports: [
    DiscordModule.forFeature(),
    TeamModule,
    UserModule,
    TournamentModule,
    MatchModule,
    RedisModule,
  ],
  providers: [MatchMakingService, MatchMakingEvents],
  exports: [MatchMakingService],
})
export class MatchMakingModule {}
