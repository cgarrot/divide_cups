import { Module } from '@nestjs/common';
import { DiscordModule } from '@discord-nestjs/core';
import { TeamService } from './team.service';
import { TeamCommands } from '../bot/commands/team.commands';
import { TeamGateway } from './team.gateway';
import { TeamInvitationHandler } from './team.invitation';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { UserModule } from '../user/user.module';
import { RolesModule } from '../roles/roles.module';
import { TeamStatsModule } from '../team-stats/team-stats.module';

@Module({
  imports: [
    DiscordModule.forFeature(),
    DrizzleModule,
    UserModule,
    RolesModule,
    TeamStatsModule,
  ],
  providers: [TeamService, TeamCommands, TeamGateway, TeamInvitationHandler],
  exports: [TeamService],
})
export class TeamModule {}
