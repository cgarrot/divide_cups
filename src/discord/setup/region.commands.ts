import { Injectable } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import { Message, PermissionsBitField, ChannelType } from 'discord.js';
import { RolesService } from '../roles/roles.service';

@Injectable()
export class RegionCommands {
  constructor(private readonly rolesService: RolesService) {}

  private readonly regions = ['NA', 'EU', 'ASIA', 'OCEA', 'SA'];

  @On('messageCreate')
  async onMessageCreate(message: Message): Promise<void> {
    if (message.content.trim() === '!region setup') {
      await this.setupRegionChannels(message);
    }
  }

  private async setupRegionChannels(message: Message): Promise<void> {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)
    ) {
      await message.reply(
        'You do not have permission to set up region channels.',
      );
      return;
    }

    const guild = message.guild;
    const createdChannels = [];

    for (const region of this.regions) {
      const roleId = await this.getRoleIdByName(region);
      if (!roleId) {
        await message.reply(
          `Role for region ${region} not found. Please make sure it exists.`,
        );
        continue;
      }

      const categoryOptions = {
        name: region,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id: roleId,
            allow: [PermissionsBitField.Flags.ViewChannel],
          },
        ],
      } as const;

      const category = await guild.channels.create(categoryOptions);

      const generalChannel = await guild.channels.create({
        name: `${region.toLowerCase()}-general`,
        type: ChannelType.GuildText,
        parent: category.id,
      });

      const annonceChannel = await guild.channels.create({
        name: `${region.toLowerCase()}-annonce`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: [PermissionsBitField.Flags.ViewChannel],
            deny: [PermissionsBitField.Flags.SendMessages],
          },
        ],
      });

      createdChannels.push(generalChannel.name, annonceChannel.name);
    }

    await message.reply(
      `Region channels have been set up: ${createdChannels.join(', ')}`,
    );
  }

  private async getRoleIdByName(roleName: string): Promise<string | null> {
    const role = await this.rolesService.getRoleByName(roleName);
    return role ? role.discordId : null;
  }
}
