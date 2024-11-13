import { Injectable } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { TeamService } from './team.service';
import { UserService } from '../user/user.service';

@Injectable()
export class TeamGateway {
  constructor(
    private readonly teamService: TeamService,
    private readonly userService: UserService,
  ) {}

  @On('interactionCreate')
  async handleTeamCreationModalSubmit(interaction: any) {
    if (!interaction.isModalSubmit()) return;

    if (interaction.customId === 'create_team_modal') {
      const teamName = interaction.fields.getTextInputValue('teamName');
      const teamMembersInput =
        interaction.fields.getTextInputValue('teamMembers');

      const teamMembers = teamMembersInput
        .match(/<@!?(\d+)>/g)
        ?.map((mention) => mention.replace(/<@!?(\d+)>/, '$1'));

      try {
        const { team: newTeam, role } = await this.teamService.createTeam(
          interaction.user.id,
          teamName,
          interaction.guild,
        );

        let replyMessage = `Team "${teamName}" created successfully! A new role "${role.name}" has been created and assigned to you.`;

        if (teamMembers && teamMembers.length > 0) {
          replyMessage +=
            '\n\nInvitations have been sent to the following players:';
          for (const memberId of teamMembers) {
            const member = await interaction.guild.members.fetch(memberId);
            if (member) {
              const inviteEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('Team Invitation')
                .setDescription(
                  `You've been invited to join the team "${teamName}"\n\nTo accept the invitation, please click the "Accept" button below. Once accepted, you'll be able to participate in tournaments with this team.`,
                );

              const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`accept_team_invite:${newTeam.id}`)
                  .setLabel('Accept')
                  .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                  .setCustomId(`reject_team_invite:${newTeam.id}`)
                  .setLabel('Reject')
                  .setStyle(ButtonStyle.Danger),
              );

              await member.send({ embeds: [inviteEmbed], components: [row] });
              replyMessage += `\n- <@${memberId}>`;
            }
          }
          replyMessage +=
            '\n\nPlease wait for team members to accept their invitations.';
        }
        await interaction.reply({
          content: replyMessage,
          ephemeral: true,
        });
      } catch (error) {
        console.error(error);
        await interaction.reply({
          content: 'An error occurred while creating the team.',
          ephemeral: true,
        });
      }
    }
  }

  @On('interactionCreate')
  async handleTeamInviteResponse(interaction: ButtonInteraction) {
    if (!interaction.isButton()) return;

    const [action, teamId] = interaction.customId.split(':');

    if (action === 'join_team' || action === 'deny_team') {
      try {
        // Acknowledge the interaction immediately
        await interaction.deferUpdate();

        if (action === 'join_team') {
          // Fetch the guild from the client
          const guild = await interaction.client.guilds.fetch(
            process.env.GUILD_ID,
          );
          if (!guild) {
            await interaction.editReply({
              content: 'Unable to process your request. Guild not found.',
            });
            return;
          }

          const result = await this.teamService.addMemberToTeam(
            parseInt(teamId),
            interaction.user.id,
            guild,
          );

          if (result.success) {
            await interaction.editReply({
              content: 'You have joined the team!',
              components: [], // Remove the buttons
            });
          } else {
            await interaction.editReply({
              content: `Failed to join the team: ${result.message}`,
              components: [], // Remove the buttons
            });
          }
        } else {
          await interaction.editReply({
            content: 'You have declined the team invitation.',
            components: [], // Remove the buttons
          });
        }
      } catch (error) {
        console.error('Error handling team invite response:', error);
        await interaction.editReply({
          content:
            'An error occurred while processing your response. Please try again later.',
          components: [], // Remove the buttons
        });
      }
    }
  }
}
