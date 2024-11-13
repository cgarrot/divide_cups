import { Injectable } from '@nestjs/common';
import { InjectDiscordClient } from '@discord-nestjs/core';
import {
  Client,
  TextChannel,
  ButtonBuilder,
  Message,
  ButtonStyle,
  ActionRowBuilder,
  ButtonInteraction,
} from 'discord.js';
import { RedisService } from '../../redis/redis.service';
import { MatchService } from '../match/match.service';
import { TeamService } from '../team/team.service';

@Injectable()
export class MatchMakingService {
  private matchMakingChannelId: string = '';
  private readonly queueKey = 'match_making_queue';

  constructor(
    @InjectDiscordClient()
    private readonly client: Client,
    private readonly redisService: RedisService,
    private readonly matchService: MatchService,
    private readonly teamService: TeamService,
  ) {}

  setMatchMakingChannelId(channelId: string) {
    this.matchMakingChannelId = channelId;
  }

  async initializeMatchMaking() {
    if (!this.matchMakingChannelId) {
      throw new Error('Match-making channel ID is not set');
    }
    const channel = await this.getMatchMakingChannel();
    await this.sendMatchMakingMessage(channel);
  }

  private async getMatchMakingChannel(): Promise<TextChannel> {
    const channel = await this.client.channels.fetch(this.matchMakingChannelId);
    if (!(channel instanceof TextChannel)) {
      throw new Error('Invalid channel type');
    }
    return channel;
  }

  private async sendMatchMakingMessage(channel: TextChannel) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('join_queue')
        .setLabel('Join Queue')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('leave_queue')
        .setLabel('Leave Queue')
        .setStyle(ButtonStyle.Secondary),
    );

    const queueSize = await this.redisService.scard(this.queueKey);
    const queueEmbed = this.createQueueEmbed(queueSize);

    await channel.send({
      content:
        'Click the buttons below to join or leave the match-making queue!',
      embeds: queueEmbed.embeds,
      components: [row.toJSON()],
    });
  }

  async handleJoinQueue(userId: string): Promise<string> {
    try {
      const isAdded = await this.redisService.sadd(this.queueKey, userId);
      if (isAdded) {
        await this.updateQueueMessage();
        await this.checkForMatch();
        return 'You have joined the queue!';
      } else {
        return 'You are already in the queue.';
      }
    } catch (error) {
      console.error('Error joining queue:', error);
      return 'An error occurred while joining the queue. Please try again later.';
    }
  }

  async handleLeaveQueue(userId: string): Promise<string> {
    try {
      const isRemoved = await this.redisService.srem(this.queueKey, userId);
      if (isRemoved) {
        await this.updateQueueMessage();
        return 'You have left the queue.';
      } else {
        return 'You were not in the queue.';
      }
    } catch (error) {
      console.error('Error leaving queue:', error);
      return 'An error occurred while leaving the queue. Please try again later.';
    }
  }

  private async updateQueueMessage() {
    const channel = await this.getMatchMakingChannel();
    const queueMessage = await this.getQueueMessage(channel);
    const queueSize = await this.redisService.scard(this.queueKey);

    const queueEmbed = this.createQueueEmbed(queueSize);

    if (queueMessage) {
      await queueMessage.edit({
        embeds: queueEmbed.embeds,
      });
    } else {
      await this.sendMatchMakingMessage(channel);
    }
  }

  private createQueueEmbed(queueSize: number) {
    return {
      embeds: [
        {
          title: '🎮 Match-Making Queue',
          description: `There ${queueSize === 1 ? 'is' : 'are'} currently **${queueSize}** player${queueSize === 1 ? '' : 's'} in the queue.`,
          color: 0x3498db, // A nice blue color
          fields: [
            {
              name: 'Queue Status',
              value: queueSize > 0 ? '🟢 Active' : '🔴 Empty',
              inline: true,
            },
            {
              name: 'Players Needed',
              value: Math.max(0, 6 - queueSize).toString(),
              inline: true,
            },
          ],
          footer: {
            text: 'Join the queue to find a match!',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  private async getQueueMessage(channel: TextChannel): Promise<Message | null> {
    const messages = await channel.messages.fetch({ limit: 10 });
    return (
      messages.find(
        (msg) =>
          msg.author.id === this.client.user?.id &&
          msg.embeds.length > 0 &&
          msg.embeds[0].title === '🎮 Match-Making Queue',
      ) || null
    );
  }

  private async checkForMatch() {
    const queueSize = await this.redisService.scard(this.queueKey);
    if (queueSize >= 6) {
      const players = await this.redisService.spop(this.queueKey, 6);
      if (players.length === 6) {
        await this.createMatchWithFakeTeams(players);
      }
    }
  }

  private async createMatchWithFakeTeams(players: string[]) {
    // Create two fake teams
    const team1 = await this.createFakeTeam(players.slice(0, 3), 'Team A');
    const team2 = await this.createFakeTeam(players.slice(3), 'Team B');

    // Create a match
    const match = await this.matchService.createMatchFromTeams(team1, team2);

    if (match) {
      // Start the veto process
      await this.matchService.startVetoProcess(
        match.id,
        match.discordChannelId,
      );

      // Notify players
      const channel = await this.getMatchMakingChannel();
      const playerMentions = players
        .map((playerId) => `<@${playerId}>`)
        .join(', ');
      await channel.send(
        `Match found! Players: ${playerMentions}\nPlease check the match channel: <#${match.discordChannelId}>`,
      );

      // Remove players from the queue
      await this.redisService.srem(this.queueKey, players.join(','));
      await this.updateQueueMessage();
    }
  }

  private async createFakeTeam(
    playerIds: string[],
    teamName: string,
  ): Promise<any> {
    // Create a temporary role for the team
    const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
    const role = await guild.roles.create({ name: teamName });

    // Create a fake team
    const team = await this.teamService.createTeamWithoutDiscord(
      parseInt(playerIds[0]), // Use the first player as the team owner
      teamName,
      playerIds.slice(1).map((id) => parseInt(id)), // The rest of the players as team members
    );

    // Assign the temporary role to the team
    await this.teamService.updateTeam(team.id, { roleId: role.id });

    // Assign the role to all players
    for (const playerId of playerIds) {
      const member = await guild.members.fetch(playerId);
      await member.roles.add(role);
    }

    return team;
  }

  async handleButtonInteraction(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;

    const { customId, user } = interaction;

    try {
      let response: string;

      if (customId === 'join_queue') {
        response = await this.handleJoinQueue(user.id);
      } else if (customId === 'leave_queue') {
        response = await this.handleLeaveQueue(user.id);
      } else {
        response = 'Invalid button interaction.';
      }

      await interaction.reply({ content: response, ephemeral: true });
    } catch (error) {
      console.error('Error handling button interaction:', error);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        ephemeral: true,
      });
    }
  }
}
