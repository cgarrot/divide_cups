import { Injectable, UseInterceptors } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import { Message } from 'discord.js';
import { PrefixCommandInterceptor } from '@discord-nestjs/common';
import { RolesCommands } from '../bot/commands/roles.commands';

@Injectable()
export class RolesGateway {
  constructor(private readonly rolesCommands: RolesCommands) {}

  @On('messageCreate')
  async onMessageCreate(message: Message): Promise<void> {
    const content = message.content.trim();
    if (content.startsWith('!roles init')) {
      await this.rolesCommands.onInitRole(message);
    } else if (content.startsWith('!roles remove')) {
      await this.rolesCommands.onRoleRemove(message);
    } else if (content.startsWith('!roles delete')) {
      await this.rolesCommands.onRoleDelete(message);
    }
  }
}
