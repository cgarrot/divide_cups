import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueService } from './queue.service';
import { MatchProcessor } from './match.processor';
import { MatchModule } from '../discord/match/match.module';
import { TournamentModule } from 'src/discord/tournament/tournament.module';
import { TournamentImageModule } from 'src/discord/tournament-image/tournament-image.module';
import { RolesModule } from 'src/discord/roles/roles.module';
import { DiscordModule } from '@discord-nestjs/core';
import { TeamModule } from 'src/discord/team/team.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    BullModule.registerQueue({
      name: 'match',
    }),
    forwardRef(() => MatchModule),
    forwardRef(() => TournamentModule),
    TournamentImageModule,
    RolesModule,
    DiscordModule.forFeature(),
    TeamModule,
  ],
  providers: [QueueService, MatchProcessor],
  exports: [QueueService],
})
export class QueueModule {}
