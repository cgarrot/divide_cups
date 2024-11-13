import { Injectable } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import {
  Message,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType,
  CategoryChannel,
  Guild,
  OverwriteResolvable,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ButtonInteraction,
} from 'discord.js';
import { UserCommands } from './user.commands';
import { SteamCommands } from './steam.commands';
import { RolesService } from '../roles/roles.service';
import { RolesCommands } from '../bot/commands/roles.commands';
import { UserService } from '../user/user.service';
import { CommandProcessor } from '../bot/command-processor';
import { TeamService } from '../team/team.service';
import { MatchMakingService } from '../match-making/match-making.service';

@Injectable()
export class SetupCommands {
  private commandProcessor: CommandProcessor;

  constructor(
    private readonly userCommands: UserCommands,
    private readonly steamCommands: SteamCommands,
    private readonly rolesService: RolesService,
    private readonly rolesCommands: RolesCommands,
    private readonly userService: UserService,
    private readonly teamService: TeamService,
    private readonly matchMakingService: MatchMakingService,
  ) {
    this.commandProcessor = new CommandProcessor(
      this.userService.isUserAdmin.bind(this.userService),
    );
  }

  @On('messageCreate')
  async onMessageCreate(message: Message): Promise<void> {
    await this.commandProcessor.processMessage(message);
  }

  public async forceCleanup(message: Message): Promise<void> {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return;
    }

    await message.reply('Starting force cleanup. This may take a while...');

    const guild = message.guild;

    // Delete all roles except @everyone
    const roles = guild.roles.cache.filter((role) => role.name !== '@everyone');
    for (const [, role] of roles) {
      try {
        await role.delete();
      } catch (error) {
        console.error(`Failed to delete role ${role.name}:`, error);
      }
    }

    // Delete all categories, private voice channels, and text channels
    const channelsToDelete = guild.channels.cache.filter(
      (channel) =>
        channel.type === ChannelType.GuildCategory ||
        channel.type === ChannelType.GuildVoice ||
        channel.type === ChannelType.GuildText,
    );
    for (const [, channel] of channelsToDelete) {
      try {
        await channel.delete();
      } catch (error) {
        console.error(`Failed to delete channel ${channel.name}:`, error);
      }
    }

    await message.reply(
      'Force cleanup completed. All custom roles, categories, private voice channels, and text channels have been deleted.',
    );
  }

  public async resetAll(message: Message): Promise<void> {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return;
    }

    await message.reply('Starting reset process. This may take a while...');

    const guild = message.guild;

    // Delete all roles except @everyone
    const roles = guild.roles.cache.filter(
      (role) => role.name !== '@everyone' && !role.managed,
    );
    for (const [, role] of roles) {
      try {
        await role.delete();
      } catch (error) {
        console.error(`Failed to delete role ${role.name}:`, error);
      }
    }

    // Delete all private channels
    const privateChannels = guild.channels.cache.filter(
      (channel) =>
        channel.type === ChannelType.GuildVoice ||
        channel.type === ChannelType.GuildText,
    );
    for (const [, channel] of privateChannels) {
      try {
        await channel.delete();
      } catch (error) {
        console.error(`Failed to delete channel ${channel.name}:`, error);
      }
    }

    await message.reply(
      'Reset complete. All custom roles and private channels have been deleted.',
    );
  }

  public async adminInit(message: Message): Promise<void> {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return;
    }

    const guild = message.guild;
    const createdChannels: string[] = [];
    const createdRoles: string[] = [];

    await message.reply(
      'Starting admin initialization. This may take a while...',
    );

    await this.initializeRolesAndUsers(message);
    await this.createOrUpdateMainCategory(guild, createdChannels);
    await this.createOrUpdateRegionalCategories(
      guild,
      createdChannels,
      createdRoles,
    );
    await this.initRules(message);
    await this.createMatchMakingChannel(guild, createdChannels);

    await this.sendAdminInitSummary(message, createdChannels, createdRoles);
  }

  private async initializeRolesAndUsers(message: Message): Promise<void> {
    await this.rolesCommands.onInitRole(message);
    await this.userCommands.onSyncUsers(message);
  }

  private async createOrUpdateMainCategory(
    guild: Guild,
    createdChannels: string[],
  ): Promise<void> {
    let mainCategory = guild.channels.cache.find(
      (channel) =>
        channel.name === 'Main' && channel.type === ChannelType.GuildCategory,
    ) as CategoryChannel;

    if (!mainCategory) {
      mainCategory = await this.createCategory(guild, 'Main');
      createdChannels.push(mainCategory.name);
    }

    const channelsToCreate = [
      {
        name: 'general',
        permissions: this.getEveryoneViewPermissions(guild.id),
      },
      {
        name: 'random',
        permissions: this.getEveryoneViewPermissions(guild.id),
      },
      {
        name: 'rules',
        permissions: this.getEveryoneViewNoSendPermissions(guild.id),
        noTalk: true,
      },
      {
        name: 'command',
        permissions: this.getEveryoneViewPermissions(guild.id),
      },
      {
        name: 'leaderboard',
        permissions: this.getEveryoneViewNoSendPermissions(guild.id),
        noTalk: true,
      },
      {
        name: 'feedback',
        permissions: this.getEveryoneViewPermissions(guild.id),
      },
      {
        name: 'support',
        permissions: this.getEveryoneViewPermissions(guild.id),
      },
      {
        name: 'result',
        permissions: this.getEveryoneViewNoSendPermissions(guild.id),
        noTalk: true,
      },
    ];

    for (const channelInfo of channelsToCreate) {
      let channel = guild.channels.cache.find(
        (ch) =>
          ch.name === channelInfo.name && ch.parent?.id === mainCategory.id,
      ) as TextChannel;

      if (!channel) {
        channel = await this.createChannel(
          guild,
          channelInfo.name,
          mainCategory.id,
          channelInfo.permissions,
        );
        createdChannels.push(channel.name);
      }

      await this.rolesService.upsertChannel(
        channel.id,
        channel.name,
        channel.type,
        channelInfo.noTalk,
      );

      if (channelInfo.name === 'rules') {
        await this.updateRulesEmbed(channel);
      }

      if (channelInfo.name === 'leaderboard') {
        await this.updateLeaderboardMessage(channel);
      }
    }
  }

  private async updateRulesEmbed(channel: TextChannel): Promise<void> {
    const rulesEmbed = this.createRulesEmbed();
    const channelData = await this.rolesService.getChannelByDiscordId(
      channel.id,
    );

    if (channelData) {
      const messages = JSON.parse(channelData.messages);
      const rulesMessage = messages.find((msg) => msg.name === 'rules');

      if (rulesMessage) {
        try {
          const existingMessage = await channel.messages.fetch(rulesMessage.id);
          await existingMessage.edit({ embeds: [rulesEmbed] });
          console.log('Rules message updated');
          return;
        } catch (error) {
          console.error('Error updating rules message:', error);
        }
      }
    }

    // If no existing message or update failed, send a new message
    const sentMessage = await channel.send({ embeds: [rulesEmbed] });
    await this.rolesService.updateChannelMessages(channel.id, [
      {
        id: sentMessage.id,
        name: 'rules',
        details: 'Tournament rules message',
      },
    ]);
  }

  private async updateLeaderboardMessage(channel: TextChannel): Promise<void> {
    const leaderboardEmbed = await this.createLeaderboardEmbed();

    const refreshButton = new ButtonBuilder()
      .setCustomId('refresh_leaderboard')
      .setLabel('Refresh Leaderboard')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      refreshButton,
    );

    let channelData = await this.rolesService.getChannelByDiscordId(channel.id);
    let message: Message;

    if (channelData) {
      const messages = JSON.parse(channelData.messages);
      const leaderboardMessage = messages.find(
        (msg) => msg.name === 'leaderboard',
      );

      if (leaderboardMessage) {
        try {
          const existingMessage = await channel.messages.fetch(
            leaderboardMessage.id,
          );
          await existingMessage.edit({
            embeds: [leaderboardEmbed],
            components: [row],
          });
          console.log('Leaderboard message updated');
          message = existingMessage;
        } catch (error) {
          console.error('Error updating leaderboard message:', error);
        }
      }
    }

    if (!message) {
      // If no existing message or update failed, send a new message
      message = await channel.send({
        embeds: [leaderboardEmbed],
        components: [row],
      });
    }

    // Set up a collector for the button
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 24 * 60 * 60 * 1000, // 24 hours
    });

    collector.on('collect', async (interaction) => {
      if (interaction.customId === 'refresh_leaderboard') {
        await this.handleRefreshLeaderboard(interaction);
      }
    });

    // Save or update the leaderboard message information
    if (!channelData) {
      // If the channel doesn't exist in the database, create it
      await this.rolesService.createChannel(
        channel.id,
        channel.name,
        channel.type,
      );
      channelData = await this.rolesService.getChannelByDiscordId(channel.id);
    }

    if (channelData) {
      const messages = JSON.parse(channelData.messages);
      const existingIndex = messages.findIndex(
        (msg) => msg.name === 'leaderboard',
      );
      const newMessage = {
        id: message.id,
        name: 'leaderboard',
        details: 'Tournament leaderboard message',
      };

      if (existingIndex !== -1) {
        messages[existingIndex] = newMessage;
      } else {
        messages.push(newMessage);
      }

      await this.rolesService.updateChannelMessages(channel.id, messages);
    } else {
      console.error(
        `Failed to create or retrieve channel data for ${channel.id}`,
      );
    }
  }

  private async createOrUpdateRegionalCategories(
    guild: Guild,
    createdChannels: string[],
    createdRoles: string[],
  ): Promise<void> {
    const regions = ['NA', 'EU', 'ASIA', 'OCEA', 'SA'];
    for (const region of regions) {
      let category = guild.channels.cache.find(
        (channel) =>
          channel.name === region && channel.type === ChannelType.GuildCategory,
      ) as CategoryChannel;

      if (!category) {
        category = await this.createCategory(guild, region);
        createdChannels.push(category.name);
      }

      let regionRole = await this.rolesService.getRoleByName(region);
      if (!regionRole) {
        regionRole = await this.rolesService.createRole(region, 1);
        createdRoles.push(region);
      }

      const channelsToCreate = ['general', 'announcements'];
      for (const channelName of channelsToCreate) {
        const fullChannelName = `${region.toLowerCase()}-${channelName}`;
        let channel = guild.channels.cache.find(
          (ch) => ch.name === fullChannelName && ch.parent?.id === category.id,
        ) as TextChannel;

        if (!channel) {
          channel = await this.createChannel(
            guild,
            fullChannelName,
            category.id,
            this.getRegionRolePermissions(guild.id, regionRole.discordId),
          );
          createdChannels.push(channel.name);
        }

        await this.rolesService.upsertChannel(
          channel.id,
          channel.name,
          channel.type,
        );
      }
    }
  }

  private async createCategory(
    guild: Guild,
    name: string,
  ): Promise<CategoryChannel> {
    const category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
    });
    await this.rolesService.createChannel(
      category.id,
      category.name,
      category.type,
    );
    return category;
  }

  private async createChannel(
    guild: Guild,
    name: string,
    parentId: string,
    permissionOverwrites: OverwriteResolvable[],
  ): Promise<TextChannel> {
    return await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parentId,
      permissionOverwrites,
    });
  }

  private getEveryoneViewPermissions(guildId: string): OverwriteResolvable[] {
    return [
      {
        id: guildId,
        allow: [PermissionsBitField.Flags.ViewChannel],
      },
    ];
  }

  private getEveryoneViewNoSendPermissions(
    guildId: string,
  ): OverwriteResolvable[] {
    return [
      {
        id: guildId,
        allow: [PermissionsBitField.Flags.ViewChannel],
        deny: [PermissionsBitField.Flags.SendMessages],
      },
    ];
  }

  private getRegionRolePermissions(
    guildId: string,
    roleId: string,
  ): OverwriteResolvable[] {
    return [
      {
        id: guildId,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: roleId,
        allow: [PermissionsBitField.Flags.ViewChannel],
      },
    ];
  }

  private createRulesEmbed(): EmbedBuilder {
    return new EmbedBuilder()
      .setTitle('The Divide Cups: Esports Tournament Rules')
      .setDescription(
        'Welcome, competitors! Get ready for intense matches and epic plays. To ensure a fair and exciting tournament for all, please adhere to these rules:',
      )
      .addFields(
        {
          name: '1. Sportsmanship',
          value:
            'Respect opponents, teammates, and admins. Toxic behavior, hate speech, or harassment will result in immediate disqualification.',
        },
        {
          name: '2. Fair Play',
          value:
            'Cheating, exploiting, or using unauthorized software/mods is strictly prohibited. Any suspicion of foul play will be thoroughly investigated and may lead to disqualification.',
        },
        {
          name: '3. Match Schedule',
          value:
            'Be punctual for all matches. Teams must be ready to play 15 minutes before the scheduled time. Repeated tardiness may result in forfeiture.',
        },
        {
          name: '4. Technical Issues',
          value:
            'Report any technical problems immediately to tournament admins. Matches may be paused or rescheduled at admin discretion.',
        },
        {
          name: '5. Communication',
          value:
            'Use designated voice channels for team communication during matches. Keep all tournament-related discussions in appropriate text channels.',
        },
        {
          name: '6. Streaming and Recording',
          value:
            'Streaming is allowed with a 2-minute delay. Official tournament streams take precedence. Respect confidentiality of private lobbies and passwords.',
        },
        {
          name: '7. Disputes and Rulings',
          value:
            'Tournament admins have the final say in all disputes. Their decisions are binding and must be respected by all participants.',
        },
      )
      .setFooter({
        text: "Violation of these rules may result in warnings, point deductions, or disqualification. Let's showcase our skills and make this an unforgettable tournament!",
      });
  }

  private async createLeaderboardEmbed(): Promise<EmbedBuilder> {
    const leaderboard = await this.teamService.getTeamLeaderboard();

    const leaderboardEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Team Leaderboard')
      .setDescription('Top teams based on ELO rating:')
      .setTimestamp();

    leaderboard.forEach((team, index) => {
      leaderboardEmbed.addFields({
        name: `${index + 1}. ${team.name}`,
        value: `ELO: ${team.elo}`,
        inline: true,
      });
    });

    return leaderboardEmbed;
  }

  private async handleRefreshLeaderboard(
    interaction: ButtonInteraction,
  ): Promise<void> {
    await interaction.deferUpdate();

    const updatedEmbed = await this.createLeaderboardEmbed();

    await interaction.editReply({
      embeds: [updatedEmbed],
      components: [interaction.message.components[0]],
    });

    // Update the leaderboard message information in the database
    const channelData = await this.rolesService.getChannelByDiscordId(
      interaction.channel.id,
    );
    if (channelData) {
      const messages = JSON.parse(channelData.messages);
      const leaderboardMessageIndex = messages.findIndex(
        (msg) => msg.name === 'leaderboard',
      );
      if (leaderboardMessageIndex !== -1) {
        messages[leaderboardMessageIndex].details =
          'Updated tournament leaderboard message';
        await this.rolesService.updateChannelMessages(
          interaction.channel.id,
          messages,
        );
      }
    }
  }

  private async sendAdminInitSummary(
    message: Message,
    createdChannels: string[],
    createdRoles: string[],
  ): Promise<void> {
    await message.reply(
      `Admin initialization complete.\n` +
        `All required channels have been created: ${createdChannels.join(', ')}\n` +
        `Roles created and assigned: ${createdRoles.join(', ')}\n` +
        `Users have been synchronized.\n` +
        `Rules channel has been created with tournament rules in the Main category.\n` +
        `Command channel has been created for bot commands.\n` +
        `Leaderboard channel has been created (view-only).\n` +
        `Random and feedback channels have been created under the Main category.`,
    );
  }

  public async initRules(message: Message): Promise<void> {
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return;
    }

    const guild = message.guild;
    const rulesChannel = guild.channels.cache.find(
      (channel) =>
        channel.name === 'rules' && channel.type === ChannelType.GuildText,
    ) as TextChannel;

    if (!rulesChannel) {
      await message.reply(
        'Rules channel not found. Please run !admin init first.',
      );
      return;
    }

    const channelData = await this.rolesService.getChannelByDiscordId(
      rulesChannel.id,
    );
    if (!channelData) {
      await message.reply('Channel data not found in the database.');
      return;
    }

    const messages = JSON.parse(channelData.messages);
    if (messages.length === 0) {
      await message.reply('No messages found in the channel data.');
      return;
    }

    const firstMessageId = messages[0].id;
    await this.updateRulesMessage(rulesChannel, firstMessageId);
    await message.reply(
      'Rules message has been updated in the rules channel and database.',
    );
  }

  private async updateRulesMessage(
    channel: TextChannel,
    messageId: string,
  ): Promise<void> {
    const rulesEmbed = this.createRulesEmbed();
    const message = await channel.messages.fetch(messageId);
    await message.edit({ embeds: [rulesEmbed] });

    await this.rolesService.updateChannelMessage(channel.id, messageId, {
      details: 'Updated tournament rules message',
    });
  }

  private async createMatchMakingChannel(
    guild: Guild,
    createdChannels: string[],
  ): Promise<void> {
    const mainCategory = guild.channels.cache.find(
      (channel) =>
        channel.name === 'Main' && channel.type === ChannelType.GuildCategory,
    ) as CategoryChannel;

    if (!mainCategory) {
      throw new Error('Main category not found');
    }

    let matchMakingChannel = guild.channels.cache.find(
      (channel) =>
        channel.name === 'match-making' &&
        channel.type === ChannelType.GuildText &&
        channel.parent?.id === mainCategory.id,
    ) as TextChannel;

    if (!matchMakingChannel) {
      matchMakingChannel = await this.createChannel(
        guild,
        'match-making',
        mainCategory.id,
        this.getEveryoneViewPermissions(guild.id),
      );
      createdChannels.push(matchMakingChannel.name);
    }

    await this.rolesService.upsertChannel(
      matchMakingChannel.id,
      matchMakingChannel.name,
      matchMakingChannel.type,
    );

    // Update the matchMakingChannelId in the MatchMakingService
    this.matchMakingService.setMatchMakingChannelId(matchMakingChannel.id);

    // Initialize the match-making functionality
    await this.matchMakingService.initializeMatchMaking();
  }
}
