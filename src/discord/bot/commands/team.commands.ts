import { Injectable, UseInterceptors } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import {
  EmbedBuilder,
  Message,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  TextChannel,
} from 'discord.js';
import { TeamService } from '../../team/team.service';
import { UserService } from '../../user/user.service';
import { RolesService } from '../../roles/roles.service';

@Injectable()
export class TeamCommands {
  constructor(
    private readonly teamService: TeamService,
    private readonly userService: UserService,
    private readonly rolesService: RolesService,
  ) {}

  async onAddPlayers(message: Message): Promise<void> {
    const mentionedUsers = message.mentions.users;
    if (mentionedUsers.size === 0) {
      await message.reply(
        'Please mention the players you want to invite to your team.',
      );
      return;
    }

    try {
      const team = await this.teamService.getTeamByOwnerDiscordId(
        message.author.id,
      );
      if (!team) {
        await message.reply("You don't have a team. Create one first!");
        return;
      }

      let replyMessage = 'Invitations have been sent to:';
      for (const [, mentionedUser] of mentionedUsers) {
        if (mentionedUser.id !== message.author.id) {
          const user = await this.userService.getUserByDiscordId(
            mentionedUser.id,
          );
          if (user && user.teamId) {
            await this.handleInvitationForExistingTeamMember(
              user,
              team.id,
              message,
            );
          } else {
            const inviteResult = await this.teamService.sendTeamInvitation(
              team.id,
              mentionedUser.id,
              message.guild,
              message.author.id,
            );
            replyMessage += `\n- <@${mentionedUser.id}>: ${inviteResult.message}`;
          }
        }
      }

      await message.reply(replyMessage);
    } catch (error) {
      console.error('Error in onAddPlayers', error);
      await message.reply('An error occurred while sending team invitations.');
    }
  }

  async onCreateTeam(message: Message): Promise<void> {
    const args = message.content.match(/"([^"]+)"|(\S+)/g);

    if (!args || args.length < 2) {
      await message.reply(
        'Usage: !team create "team name" [@user1] [@user2] ...',
      );
      return;
    }

    const teamName = args[2].replace(/"/g, '');
    const mentionedUsers = message.mentions.users;

    try {
      // Check if the user exists and has a valid steam_id and region
      let user = await this.userService.getUserByDiscordId(message.author.id);

      if (!user) {
        await message.reply(
          'You need to set up your profile first. Use the !steam command to set your Steam ID.',
        );
        return;
      }

      if (!user.steamId || !user.region) {
        await message.reply(
          'You need to set your Steam ID and region before creating a team. Use the !steam command to set your Steam ID and !region command to set your region.',
        );
        return;
      }

      // Check if the user already has a team
      if (user.teamId) {
        await message.reply(
          'You are already a member of a team. You cannot create a new team while being part of an existing team.',
        );
        return;
      }

      let guild;
      if (message.guild) {
        guild = message.guild;
      } else {
        // If the message is in DM, fetch the specific guild
        guild = await message.client.guilds.fetch(process.env.GUILD_ID);
        if (!guild) {
          await message.reply('Unable to find the specified server.');
          return;
        }
      }

      const {
        team: newTeam,
        role,
        voiceChannel,
      } = await this.teamService.createTeam(user.discordId, teamName, guild);

      // Assign the role to the team creator
      const member = await guild.members.fetch(user.discordId);
      try {
        await member.roles.add(role);
      } catch (roleError) {
        console.error('Error assigning role:', roleError);
        await message.reply(
          'An error occurred while assigning the team role. Please contact an administrator.',
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Team "${teamName}" Created`)
        .setDescription(
          `Congratulations! Your team has been successfully created.`,
        )
        .addFields(
          {
            name: 'Team Owner',
            value: `<@${message.author.id}>`,
            inline: true,
          },
          { name: 'Team Role', value: `<@&${role.id}>`, inline: true },
          {
            name: 'Voice Channel',
            value: `<#${voiceChannel.id}>`,
            inline: true,
          },
        );

      if (mentionedUsers.size > 0) {
        let invitedMembers = '';
        for (const [, mentionedUser] of mentionedUsers) {
          if (mentionedUser.id !== message.author.id) {
            try {
              const guildMember = await guild.members.fetch(mentionedUser.id);
              if (guildMember) {
                const inviteResult = await this.teamService.sendTeamInvitation(
                  newTeam.id,
                  mentionedUser.id,
                  guild,
                  message.author.id,
                );
                invitedMembers += `<@${mentionedUser.id}>: ${inviteResult.message}\n`;
              } else {
                invitedMembers += `<@${mentionedUser.id}>: User not found in the server\n`;
              }
            } catch (error) {
              console.error(`Error inviting user ${mentionedUser.id}:`, error);
              invitedMembers += `<@${mentionedUser.id}>: Failed to send invitation\n`;
            }
          }
        }
        embed.addFields({ name: 'Invited Members', value: invitedMembers });
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in onCreateTeam', error);
      await message.reply(
        'An error occurred while creating the team: ' + error.message,
      );
    }
  }

  async onLeaveTeam(message: Message): Promise<void> {
    try {
      const user = await this.userService.getUserByDiscordId(message.author.id);
      if (!user || !user.teamId) {
        await message.reply('You are not part of any team.');
        return;
      }

      const team = await this.teamService.getTeamById(user.teamId);
      if (!team) {
        await message.reply('Your team could not be found.');
        return;
      }

      const isOwner = team.ownerId === user.id;
      const confirmationMessage = isOwner
        ? "Are you sure you want to leave your team? As the owner, your ownership will be transferred to another member. Type 'yes' to confirm."
        : "Are you sure you want to leave your team? Type 'yes' to confirm.";

      await message.reply(confirmationMessage);

      const filter = (response: Message) =>
        response.author.id === message.author.id &&
        response.content.toLowerCase() === 'yes';

      const collected = await (message.channel as TextChannel)
        .awaitMessages({
          filter,
          max: 1,
          time: 30000,
          errors: ['time'],
        })
        .catch(() => null);

      if (!collected) {
        await message.reply(
          "You didn't confirm in time. The leave action has been cancelled.",
        );
        return;
      }

      if (isOwner) {
        const newOwner = await this.teamService.transferOwnership(
          team.id,
          user.id,
        );
        if (!newOwner) {
          await message.reply(
            "Couldn't transfer ownership. You are the only member of the team. Use !disband to remove the team.",
          );
          return;
        }
        await message.reply(
          `You have left the team. Ownership has been transferred to <@${newOwner.discordId}>.`,
        );
      } else {
        await this.teamService.removeMemberFromTeam(team.id, user.id);
        await message.reply('You have successfully left the team.');
      }

      // Remove the team role from the user
      const member = await message.guild.members.fetch(message.author.id);
      const teamRole = message.guild.roles.cache.find(
        (role) => role.name === team.name,
      );
      if (teamRole) {
        await member.roles.remove(teamRole);
      }
    } catch (error) {
      console.error('Error in onLeaveTeam', error);
      await message.reply('An error occurred while processing your request.');
    }
  }

  async onDisbandTeam(message: Message): Promise<void> {
    try {
      const user = await this.userService.getUserByDiscordId(message.author.id);
      if (!user || !user.teamId) {
        await message.reply('You are not part of any team.');
        return;
      }

      const team = await this.teamService.getTeamById(user.teamId);
      if (!team) {
        await message.reply('Your team could not be found.');
        return;
      }

      if (team.ownerId !== user.id) {
        await message.reply('Only the team owner can disband the team.');
        return;
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_disband')
          .setLabel('Disband Team')
          .setStyle(ButtonStyle.Danger),
      );

      const response = await message.reply({
        content:
          'Are you sure you want to disband your team? This action cannot be undone.',
        components: [row],
      });

      try {
        const confirmation = await response.awaitMessageComponent({
          filter: (i) =>
            i.user.id === message.author.id && i.customId === 'confirm_disband',
          time: 30000,
        });

        if (confirmation.customId === 'confirm_disband') {
          const modal = new ModalBuilder()
            .setCustomId('disband_confirmation_modal')
            .setTitle('Confirm Team Disbanding');

          const confirmInput = new TextInputBuilder()
            .setCustomId('confirm_input')
            .setLabel('Type "DISBAND" to confirm')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const actionRow =
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              confirmInput,
            );
          modal.addComponents(actionRow);

          await confirmation.showModal(modal);

          try {
            const modalSubmission = await confirmation.awaitModalSubmit({
              filter: (i) => i.user.id === message.author.id,
              time: 60000,
            });

            if (
              modalSubmission.fields
                .getTextInputValue('confirm_input')
                .toUpperCase() === 'DISBAND'
            ) {
              await this.teamService.disbandTeam(team.id, message.guild);
              await modalSubmission.reply(
                'Your team has been successfully disbanded.',
              );
            } else {
              await modalSubmission.reply(
                'Team disbanding cancelled. You did not type "DISBAND".',
              );
            }
          } catch (modalError) {
            console.error('Error in modal submission:', modalError);
            await (message.channel as TextChannel).send(
              'Team disbanding cancelled due to inactivity or error.',
            );
          }
        }
      } catch (interactionError) {
        console.error('Error in button interaction:', interactionError);
        await response.edit({
          content: 'Team disbanding cancelled due to inactivity.',
          components: [],
        });
      }
    } catch (error) {
      console.error('Error in onDisbandTeam', error);
      await message.reply('An error occurred while processing your request.');
    }
  }

  async onTeamProfile(message: Message): Promise<void> {
    try {
      const mentionedRoles = message.mentions.roles;
      let team;

      if (mentionedRoles.size > 0) {
        // If a role is mentioned, find the team by role name
        const roleName = mentionedRoles.first().name;
        team = await this.teamService.getTeamByName(roleName);
      } else {
        // If no role is mentioned, find the team of the message author
        const user = await this.userService.getUserByDiscordId(
          message.author.id,
        );
        if (user && user.teamId) {
          team = await this.teamService.getTeamById(user.teamId);
        }
      }

      if (!team) {
        await message.reply(
          "No team found. Make sure you're in a team or mention a valid team role.",
        );
        return;
      }

      const teamMembers = await this.teamService.getTeamMembers(team.id);
      const owner = await this.userService.getUserById(team.ownerId);

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`Team Profile: ${team.name}`)
        .addFields(
          { name: 'Owner', value: `<@${owner.discordId}>`, inline: true },
          { name: 'ELO', value: team.elo.toString(), inline: true },
          {
            name: 'Members',
            value: teamMembers
              .map((member) => `<@${member.discordId}>`)
              .join('\n'),
          },
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in onTeamProfile', error);
      await message.reply('An error occurred while fetching the team profile.');
    }
  }

  async handleInvitationForExistingTeamMember(
    user: any,
    invitingTeamId: number,
    message: Message,
  ): Promise<void> {
    const currentTeam = await this.teamService.getTeamById(user.teamId);
    const invitingTeam = await this.teamService.getTeamById(invitingTeamId);

    const embed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle('Team Invitation')
      .setDescription(
        `You've been invited to join team "${invitingTeam.name}", but you're already a member of team "${currentTeam.name}".`,
      )
      .addFields(
        { name: 'Current Team', value: currentTeam.name, inline: true },
        { name: 'Inviting Team', value: invitingTeam.name, inline: true },
      )
      .setFooter({ text: 'Choose an option below' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('accept_new_team')
        .setLabel('Leave current team and join new team')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('decline_new_team')
        .setLabel('Stay in current team')
        .setStyle(ButtonStyle.Secondary),
    );

    try {
      const dmChannel = await message.client.users
        .fetch(user.discordId)
        .then((u) => u.createDM());
      const response = await dmChannel.send({
        embeds: [embed],
        components: [row],
      });

      const confirmation = await response.awaitMessageComponent({
        filter: (i) => i.user.id === user.discordId,
        time: 60000,
      });

      if (confirmation.customId === 'accept_new_team') {
        await this.teamService.removeMemberFromTeam(currentTeam.id, user.id);
        await this.teamService.addMemberToTeam(
          invitingTeamId,
          user.id,
          message.guild,
        );

        // Remove old team role and add new team role
        const member = await message.guild.members.fetch(user.discordId);
        const oldTeamRole = message.guild.roles.cache.find(
          (role) => role.name === currentTeam.name,
        );
        const newTeamRole = message.guild.roles.cache.find(
          (role) => role.name === invitingTeam.name,
        );

        if (oldTeamRole) await member.roles.remove(oldTeamRole);
        if (newTeamRole) {
          await member.roles.add(newTeamRole);
        } else {
          console.error(
            `New team role not found for team: ${invitingTeam.name}`,
          );
        }

        await confirmation.update({
          content: `You have left team "${currentTeam.name}" and joined team "${invitingTeam.name}".`,
          embeds: [],
          components: [],
        });
      } else {
        await confirmation.update({
          content: `You have chosen to stay in your current team "${currentTeam.name}".`,
          embeds: [],
          components: [],
        });
      }
    } catch (error) {
      console.error('Error in team switch confirmation:', error);
      // If there's an error, we don't need to edit any message as it was sent in DM
    }
  }
}
