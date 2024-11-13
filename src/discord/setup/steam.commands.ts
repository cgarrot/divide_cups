import { Injectable } from '@nestjs/common';
import { Message, TextChannel, DMChannel } from 'discord.js';
import { UserService } from '../user/user.service';
import axios from 'axios';
import { SteamService } from '../../steam/steam.service';

@Injectable()
export class SteamCommands {
  constructor(
    private readonly userService: UserService,
    private readonly steamService: SteamService,
  ) {}

  async onSteamCommand(message: Message): Promise<void> {
    const steamUrl = message.content.replace('!steam', '').trim();
    if (!steamUrl) {
      await message.reply('Please provide your Steam profile URL.');
      return;
    }

    try {
      const steamId = await this.resolveSteamId(steamUrl);
      if (!steamId) {
        await message.reply('Invalid Steam URL or unable to resolve Steam ID.');
        return;
      }

      const steamUsername = await this.steamService.getSteamUsername(steamId);
      if (!steamUsername) {
        await message.reply('Unable to fetch Steam username.');
        return;
      }

      const updatedUser = await this.userService.updateSteamId(
        message.author.id,
        steamId,
      );

      if (updatedUser) {
        await this.userService.updateSteamUsername(
          message.author.id,
          steamUsername,
        );
        let replyMessage = `Steam ID and username updated successfully. Your Steam username is: ${steamUsername}`;

        if (!updatedUser.region) {
          replyMessage += ' Please set your region using the !region command.';
        }

        await message.reply(replyMessage);
      } else {
        await message.reply('Failed to update Steam ID. Please try again.');
      }
    } catch (error) {
      console.error('Error updating Steam ID:', error);
      await message.reply('An error occurred while updating your Steam ID.');
    }
  }

  async onSteamSyncCommand(message: Message): Promise<void> {
    try {
      const user = await this.userService.getUserByDiscordId(message.author.id);
      if (!user || !user.steamId) {
        await message.reply(
          'You need to set your Steam ID first. Use the !steam command to set your Steam ID.',
        );
        return;
      }

      const steamUsername = await this.steamService.getSteamUsername(
        user.steamId,
      );
      if (!steamUsername) {
        await message.reply(
          'Unable to fetch Steam username. Please try again later.',
        );
        return;
      }

      await this.userService.updateSteamUsername(
        message.author.id,
        steamUsername,
      );
      await message.reply(
        `Your Steam username has been updated to: ${steamUsername}`,
      );
    } catch (error) {
      console.error('Error syncing Steam username:', error);
      await message.reply(
        'An error occurred while syncing your Steam username. Please try again later.',
      );
    }
  }

  private async resolveSteamId(url: string): Promise<string | null> {
    const steamIdRegex = /^STEAM_[0-5]:[01]:\d+$/;
    const steam64IdRegex = /^[0-9]{17}$/;
    const vanityUrlRegex = /^https?:\/\/steamcommunity\.com\/id\/([^\/]+)\/?$/;
    const profileUrlRegex =
      /^https?:\/\/steamcommunity\.com\/profiles\/([0-9]{17})\/?$/;

    if (steamIdRegex.test(url) || steam64IdRegex.test(url)) {
      return url;
    }

    const vanityMatch = url.match(vanityUrlRegex);
    if (vanityMatch) {
      const vanityUrl = vanityMatch[1];
      return this.resolveSteamVanityUrl(vanityUrl);
    }

    const profileMatch = url.match(profileUrlRegex);
    if (profileMatch) {
      return profileMatch[1];
    }

    return null;
  }

  private async resolveSteamVanityUrl(
    vanityUrl: string,
  ): Promise<string | null> {
    try {
      const response = await axios.get(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${process.env.STEAM_API_KEY}&vanityurl=${vanityUrl}`,
      );

      if (response.data.response.success === 1) {
        return response.data.response.steamid;
      }
    } catch (error) {
      console.error('Error resolving Steam vanity URL:', error);
    }

    return null;
  }
}
