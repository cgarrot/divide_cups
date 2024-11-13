import { Injectable } from '@nestjs/common';
import { Message, PermissionsBitField } from 'discord.js';
import { DrizzleService } from 'src/drizzle/drizzle.service';

@Injectable()
export class DbCommands {
  constructor(private readonly drizzleService: DrizzleService) {}

  async onDbReset(message: Message): Promise<void> {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      await message.reply(
        'You need administrator permissions to use this command.',
      );
      return;
    }

    try {
      await message.reply('Starting database reset. This may take a moment...');

      // Reset the database
      await this.drizzleService.resetDatabase();

      await message.reply('Database has been successfully reset.');
    } catch (error) {
      console.error('Error resetting database:', error);
      await message.reply(
        'An error occurred while resetting the database. Please check the logs for more information.',
      );
    }
  }
}
