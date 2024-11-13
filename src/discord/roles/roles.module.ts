import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { RolesCommands } from '../bot/commands/roles.commands';
import { RolesGateway } from './roles.gateway';
import { DiscordModule } from '@discord-nestjs/core';

@Module({
  imports: [DiscordModule.forFeature(), DrizzleModule],
  providers: [RolesService, RolesCommands, RolesGateway],
  exports: [RolesService, RolesCommands],
})
export class RolesModule {}
