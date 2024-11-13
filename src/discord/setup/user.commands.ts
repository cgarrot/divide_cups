import { Injectable } from '@nestjs/common';
import { Message, Guild, PermissionsBitField } from 'discord.js';
import { UserService } from '../user/user.service';

@Injectable()
export class UserCommands {
  constructor(private readonly userService: UserService) {}

  async onSyncUsers(message: Message): Promise<void> {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      await message.reply(
        'You need administrator permissions to use this command.',
      );
      return;
    }

    try {
      const guild: Guild = message.guild;
      const members = await guild.members.fetch();
      let createdCount = 0;
      let existingCount = 0;

      await message.reply('Starting user synchronization...');

      for (const [, member] of members) {
        if (member.user.bot) continue;

        const existingUser = await this.userService.getUserByDiscordId(
          member.id,
        );
        if (!existingUser) {
          await this.userService.createUser(member.user.username, member.id);
          createdCount++;
        } else {
          existingCount++;
        }
      }

      await message.reply(
        `User synchronization complete.\nCreated: ${createdCount} new users\nExisting: ${existingCount} users`,
      );
    } catch (error) {
      console.error('Error syncing users:', error);
      await message.reply('An error occurred while synchronizing users.');
    }
  }
}
