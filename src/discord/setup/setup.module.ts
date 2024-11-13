import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { SendWelcomeRulesCommand } from './rule.commands';
import { SteamCommands } from './steam.commands';
import { UserModule } from '../user/user.module';
import { UserCommands } from './user.commands';
import { DbCommands } from './db.commands';
import { RolesModule } from '../roles/roles.module';
import { SetupCommands } from './setup.commands';
import { HttpModule } from '@nestjs/axios';
import { RegionCommands } from './region.commands';
// import { FakeDataCommands } from './fake-data.commands';
import { TeamModule } from '../team/team.module';
import { HistoryUserStatsModule } from '../history-user-stats/history-user-stats.module';
import { HistoryTeamStatsModule } from '../history-team-stats/history-team-stats.module';
import { TeamStatsModule } from '../team-stats/team-stats.module';
import { MatchModule } from '../match/match.module';
import { TournamentModule } from '../tournament/tournament.module';
import { UserStatsModule } from '../user-stats/user-stats.module';
import { SteamModule } from 'src/steam/steam.module';
import { MatchMakingModule } from '../match-making/match-making.module';

@Module({
  imports: [
    DiscordModule.forFeature(),
    DrizzleModule,
    UserModule,
    RolesModule,
    HttpModule,
    TeamModule,
    HistoryTeamStatsModule,
    HistoryUserStatsModule,
    TeamStatsModule,
    UserStatsModule,
    MatchModule,
    TournamentModule,
    RolesModule,
    SteamModule,
    MatchMakingModule,
  ],
  providers: [
    SendWelcomeRulesCommand,
    SteamCommands,
    UserCommands,
    DbCommands,
    SetupCommands,
    RegionCommands,
    // FakeDataCommands,
  ],
  exports: [SetupCommands, UserCommands],
})
export class SetupModule {}
