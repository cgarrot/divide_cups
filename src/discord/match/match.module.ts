import { forwardRef, Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { MatchService } from './match.service';
import { MatchCommands } from '../bot/commands/match.commands';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { TournamentModule } from '../tournament/tournament.module';
import { OpenAIModule } from '../../openai/openai.module';
import { ImageModule } from '../image/image.module';
import { UserModule } from '../user/user.module';
import { TeamModule } from '../team/team.module';
import { RolesModule } from '../roles/roles.module';
import { SteamModule } from 'src/steam/steam.module';
import { HistoryTeamStatsModule } from '../history-team-stats/history-team-stats.module';
import { HistoryUserStatsModule } from '../history-user-stats/history-user-stats.module';
import { TeamStatsModule } from '../team-stats/team-stats.module';
import { UserStatsModule } from '../user-stats/user-stats.module';
import { BracketModule } from '../tournament/bracket/bracket.module';
import { QueueModule } from 'src/queue/queue.module';

@Module({
  imports: [
    DiscordModule.forFeature(),
    DrizzleModule,
    OpenAIModule,
    ImageModule,
    forwardRef(() => UserModule),
    forwardRef(() => TeamModule),
    forwardRef(() => TournamentModule),
    RolesModule,
    SteamModule,
    HistoryTeamStatsModule,
    HistoryUserStatsModule,
    TeamStatsModule,
    UserStatsModule,
    BracketModule,
    forwardRef(() => QueueModule),
  ],
  providers: [MatchService, MatchCommands],
  exports: [MatchService],
})
export class MatchModule {}
