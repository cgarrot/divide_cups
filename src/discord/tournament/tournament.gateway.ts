import { Injectable } from '@nestjs/common';
import { InjectDiscordClient, On } from '@discord-nestjs/core';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ModalBuilder,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Tournament } from './tournament.interface';
import { TournamentService } from './tournament.service';
import { TeamService } from '../team/team.service';
import { UserService } from '../user/user.service';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class TournamentGateway {
  constructor(
    @InjectDiscordClient() private readonly client: Client,
    private readonly tournamentService: TournamentService,
    private readonly teamService: TeamService,
    private readonly userService: UserService,
    private readonly redisService: RedisService,
  ) {}

  @On('interactionCreate')
  async handleInteraction(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'start_tournament_creation') {
      const modal = new ModalBuilder()
        .setCustomId('create_tournament_modal')
        .setTitle('Create Tournament');

      const nameInput = new TextInputBuilder()
        .setCustomId('tournamentName')
        .setLabel('Tournament Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const startTimeInput = new TextInputBuilder()
        .setCustomId('startTime')
        .setLabel('Start Time (YYYY-MM-DD HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const maxTeamLimitInput = new TextInputBuilder()
        .setCustomId('maxTeamLimit')
        .setLabel('Max Team Limit')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const firstActionRow =
        new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
      const secondActionRow =
        new ActionRowBuilder<TextInputBuilder>().addComponents(startTimeInput);
      const thirdActionRow =
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          maxTeamLimitInput,
        );

      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

      await interaction.showModal(modal);
    }
  }

  @On('interactionCreate')
  async handleModalSubmit(interaction: any) {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId === 'create_tournament_modal') {
      const name = interaction.fields.getTextInputValue('tournamentName');
      const startTimeStr = interaction.fields.getTextInputValue('startTime');
      const maxTeamLimit = parseInt(
        interaction.fields.getTextInputValue('maxTeamLimit'),
        10,
      );

      const startTime = new Date(startTimeStr);

      if (isNaN(startTime.getTime())) {
        await interaction.reply({
          content: 'Invalid date format. Please use YYYY-MM-DD HH:MM',
          ephemeral: true,
        });
        return;
      }

      if (isNaN(maxTeamLimit) || maxTeamLimit <= 0) {
        await interaction.reply({
          content: 'Invalid max team limit. Please enter a positive number.',
          ephemeral: true,
        });
        return;
      }

      try {
        const tournament = await this.tournamentService.createTournament(
          name,
          startTime,
          maxTeamLimit,
          '99$',
          'NA',
        );
        await this.tournamentService.sendTournamentAnnouncementMessage(
          tournament,
          interaction.channelId,
        );
        await interaction.reply({
          content: 'Tournament created successfully!',
          ephemeral: true,
        });
      } catch (error) {
        console.error('Error creating tournament:', error);
        await interaction.reply({
          content: 'An error occurred while creating the tournament.',
          ephemeral: true,
        });
      }
    }
  }

  @On('interactionCreate')
  async handleTournamentActions(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;

    if (
      interaction.customId.startsWith('join_tournament:') ||
      interaction.customId.startsWith('leave_tournament:')
    ) {
      await interaction.deferUpdate();
      try {
        const [action, tournamentId] = interaction.customId.split(':');
        const user = await this.userService.getUserByDiscordId(
          interaction.user.id,
        );

        if (!user || !user.teamId) {
          await interaction.followUp({
            content:
              'You need to be part of a team to join or leave a tournament. Please create or join a team first.',
            ephemeral: true,
          });
          return;
        }

        const team = await this.teamService.getTeamById(user.teamId);

        if (!team) {
          await interaction.followUp({
            content:
              'Your team could not be found. Please contact an administrator.',
            ephemeral: true,
          });
          return;
        }

        if (team.ownerId !== user.id) {
          await interaction.followUp({
            content: 'Only team owners can join or leave tournaments.',
            ephemeral: true,
          });
          return;
        }

        // New check for minimum team size
        // if (action === 'join_tournament') {
        //   const teamMembers = await this.teamService.getTeamMembers(team.id);
        //   if (teamMembers.length < 3) {
        //     await interaction.followUp({
        //       content:
        //         'Your team needs at least 3 players to join a tournament.',
        //       ephemeral: true,
        //     });
        //     return;
        //   }
        // }

        await this.processTournamentAction(
          action,
          parseInt(tournamentId),
          interaction.user.id,
          interaction.channelId,
          interaction.message.id,
          interaction,
        );
      } catch (error) {
        console.error('Error handling tournament action:', error);
        await interaction.followUp({
          content: 'An error occurred while processing your request.',
          ephemeral: true,
        });
      }
    }
  }

  @On('interactionCreate')
  async handleCheckIn(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('check_in_tournament:')) {
      await interaction.deferUpdate();
      const [, tournamentId] = interaction.customId.split(':');
      const user = await this.userService.getUserByDiscordId(
        interaction.user.id,
      );

      if (!user) {
        await interaction.followUp({
          content: 'User not found.',
          ephemeral: true,
        });
        return;
      }

      const team = await this.teamService.getTeamById(user.teamId);
      if (!team) {
        await interaction.followUp({
          content: 'You are not part of a team in this tournament.',
          ephemeral: true,
        });
        return;
      }

      const checkInKey = `tournament:${tournamentId}:check_in`;
      const userCheckInKey = `${team.id}:${user.id}`;
      const isCheckedIn = await this.redisService.hget(
        checkInKey,
        userCheckInKey,
      );

      if (isCheckedIn === '1') {
        await interaction.followUp({
          content: 'You have already checked in.',
          ephemeral: true,
        });
        return;
      }

      await this.redisService.hset(checkInKey, userCheckInKey, '1');
      await this.tournamentService.updateTournamentMessageWithCheckIns(
        parseInt(tournamentId),
      );

      await interaction.followUp({
        content: 'You have successfully checked in.',
        ephemeral: true,
      });
    }
  }

  private async processTournamentAction(
    action: string,
    tournamentId: number,
    userDiscordId: string,
    channelId: string,
    messageId: string,
    interaction: ButtonInteraction,
  ): Promise<void> {
    const user = await this.userService.getUserByDiscordId(userDiscordId);
    const team = await this.teamService.getTeamById(user.teamId);

    let updatedTournament;
    try {
      if (action === 'join_tournament') {
        updatedTournament = await this.tournamentService.addTeamToTournament(
          tournamentId,
          team.id,
          team.name || `Team ${team.id}`,
          team.roleId.toString(),
        );

        const teams = this.parseJsonSafely(updatedTournament.teams, []);
        const waitingList = this.parseJsonSafely(
          updatedTournament.waitingList,
          [],
        );

        const teamAdded = teams.some((t) => t.id === team.id);
        const teamInWaitingList = waitingList.some((t) => t.id === team.id);

        if (teamAdded) {
          await interaction.followUp({
            content: 'Your team has joined the tournament!',
            ephemeral: true,
          });
        } else if (teamInWaitingList) {
          await interaction.followUp({
            content:
              'Your team has been added to the waiting list for this tournament.',
            ephemeral: true,
          });
        } else {
          await interaction.followUp({
            content: 'Your team is already registered for this tournament.',
            ephemeral: true,
          });
        }
      } else {
        updatedTournament =
          await this.tournamentService.removeTeamFromTournament(
            tournamentId,
            team.id,
          );
        await interaction.followUp({
          content: 'Your team has left the tournament.',
          ephemeral: true,
        });
      }
    } catch (error) {
      if (error.message === 'Team not found in tournament') {
        await interaction.followUp({
          content: 'Your team is not part of this tournament.',
          ephemeral: true,
        });
        return;
      }
      console.error('Error handling tournament action:', error);
      await interaction.followUp({
        content: 'An error occurred while processing your request.',
        ephemeral: true,
      });
      return;
    }

    // Update the tournament message with the new team information
    await this.tournamentService.updateTournamentMessage(
      updatedTournament,
      channelId,
      messageId,
    );
  }

  private async safeReply(interaction: ButtonInteraction, options: any) {
    try {
      if (interaction.deferred) {
        await interaction.editReply(options);
      } else {
        await interaction.reply(options);
      }
    } catch (error) {
      console.error('Error sending reply:', error);
    }
  }

  private parseJsonSafely(
    jsonString: string | any[],
    defaultValue: any[],
  ): any[] {
    if (Array.isArray(jsonString)) {
      return jsonString;
    }
    if (typeof jsonString === 'string') {
      try {
        return JSON.parse(jsonString);
      } catch (error) {
        console.error('Error parsing JSON:', error);
        return defaultValue;
      }
    }
    return defaultValue;
  }
}
