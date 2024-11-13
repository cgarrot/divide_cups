import { Injectable } from '@nestjs/common';
import { TeamService } from './team.service';
import { UserService } from '../user/user.service';
import { RolesService } from '../roles/roles.service';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Guild,
  GuildMember,
} from 'discord.js';

@Injectable()
export class TeamInvitationHandler {
  constructor(
    private readonly teamService: TeamService,
    private readonly userService: UserService,
    private readonly rolesService: RolesService,
  ) {}

  async handleInvitationResponse(
    interaction: any,
    teamId: number,
    action: 'accept' | 'decline',
  ) {
    const user = await this.userService.getUserByDiscordId(interaction.user.id);
    if (!user || !user.steamId || !user.region) {
      await interaction.reply({
        content:
          'You need to set your Steam ID and region before joining a team. Use the !steam command to set your Steam ID and !region command to set your region.',
        ephemeral: true,
      });
      return;
    }

    const team = await this.teamService.getTeamById(teamId);
    if (!team) {
      await interaction.reply({
        content: 'Team not found.',
        ephemeral: true,
      });
      return;
    }

    if (action === 'accept') {
      const guild = interaction.guild as Guild;
      const member = await guild.members.fetch(interaction.user.id);

      const initRole = guild.roles.cache.find((role) => role.name === 'INIT');
      if (initRole && member.roles.cache.has(initRole.id)) {
        const dbRole = await this.rolesService.getRoleByDiscordId(initRole.id);
        if (dbRole && dbRole.type === 1) {
          await interaction.reply({
            content: 'Users with the INIT role cannot join teams.',
            ephemeral: true,
          });
          return;
        }
      }

      const result = await this.teamService.addMemberToTeam(
        teamId,
        user.id.toString(),
        guild,
      );
      if (result.success) {
        await interaction.reply({
          content: `You have successfully joined the team "${team.name}"!`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `Failed to join the team: ${result.message}`,
          ephemeral: true,
        });
      }
    } else {
      await interaction.reply({
        content: `You have declined the invitation to join the team "${team.name}".`,
        ephemeral: true,
      });
    }
  }
}
