import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { BotGateway } from './bot.gateway';
import { UserModule } from '../user/user.module';
import { TournamentModule } from '../tournament/tournament.module';
import { TeamModule } from '../team/team.module';
import { SetupModule } from '../setup/setup.module';
import { MatchModule } from '../match/match.module';
import { RolesModule } from '../roles/roles.module';
import { SteamCommands } from '../setup/steam.commands';
import { ActionCommands } from './commands/action.commands';
import { UserStatsModule } from '../user-stats/user-stats.module';
import { TeamStatsModule } from '../team-stats/team-stats.module';
import { HistoryUserStatsModule } from '../history-user-stats/history-user-stats.module';
import { HistoryTeamStatsModule } from '../history-team-stats/history-team-stats.module';
import { SteamModule } from 'src/steam/steam.module';
import { RateLimitMiddleware } from './rate-limit.middleware';
import { RedisModule } from 'src/redis/redis.module';
import { SetupCommands } from '../setup/setup.commands';
import { UserCommands } from '../setup/user.commands';
import { MatchCommands } from './commands/match.commands';
import { OpenAIModule } from 'src/openai/openai.module';
import { ImageModule } from '../image/image.module';
import { TeamCommands } from './commands/team.commands';
import { TournamentCommands } from './commands/tournament.commands';
import { BracketModule } from '../tournament/bracket/bracket.module';
import { QueueModule } from 'src/queue/queue.module';
import { MatchMakingModule } from '../match-making/match-making.module';

@Module({
  imports: [
    DiscordModule.forFeature(),
    UserModule,
    TournamentModule,
    TeamModule,
    SetupModule,
    MatchModule,
    RolesModule,
    UserStatsModule,
    TeamStatsModule,
    HistoryUserStatsModule,
    HistoryTeamStatsModule,
    UserStatsModule,
    SteamModule,
    RedisModule,
    OpenAIModule,
    ImageModule,
    BracketModule,
    QueueModule,
    MatchMakingModule,
  ],
  providers: [
    BotGateway,
    SteamCommands,
    ActionCommands,
    RateLimitMiddleware,
    SetupCommands,
    MatchCommands,
    TeamCommands,
    TournamentCommands,
  ],
})
export class BotModule {}
