import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDrizzle } from '../../drizzle/drizzle.decorator';
import { DrizzleDB } from '../../drizzle/types/drizzle';
import { teams } from '../../drizzle/schema/team.schema';
import { users } from '../../drizzle/schema/users.schema';
import { roles } from '../../drizzle/schema/roles.schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { UserService } from '../user/user.service';
import {
  ChannelType,
  Guild,
  PermissionsBitField,
  Role,
  VoiceChannel,
} from 'discord.js';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { User } from '../user/user.interface';
import { Team } from './team.interface';
import { TeamStatsService } from '../team-stats/team-stats.service';
import { teamStats } from '../../drizzle/schema/team-stats.schema';
import { desc } from 'drizzle-orm';

@Injectable()
export class TeamService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly userService: UserService,
    private readonly teamStatsService: TeamStatsService,
  ) {}

  async createTeam(
    ownerDiscordId: string,
    teamName: string,
    guild: Guild,
  ): Promise<{ team: any; role: Role; voiceChannel: VoiceChannel }> {
    if (!guild) {
      throw new Error(
        'Guild not found. Make sure you are using this command in a server.',
      );
    }

    let owner;
    try {
      owner = await guild.members.fetch(ownerDiscordId);
      if (!owner) {
        throw new Error('User not found in the guild');
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      throw new Error('Invalid user ID or user not found in the guild');
    }

    const role = await guild.roles.create({
      name: teamName,
      color: '#0099ff',
    });

    const voiceChannel = await guild.channels.create({
      name: `${teamName} Voice`,
      type: ChannelType.GuildVoice,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
      ],
    });

    // Create the role in the roles table
    const createdRole = await this.db
      .insert(roles)
      .values({
        discordId: role.id,
        name: role.name,
        type: 1, // Assuming 1 is for team roles, adjust if needed
      })
      .returning();

    const result = await this.db
      .insert(teams)
      .values({
        name: teamName,
        ownerId: (await this.userService.getUserByDiscordId(ownerDiscordId)).id,
        memberIds: JSON.stringify([
          (await this.userService.getUserByDiscordId(ownerDiscordId)).id,
        ]),
        historyMemberIds: JSON.stringify([
          (await this.userService.getUserByDiscordId(ownerDiscordId)).id,
        ]),
        voiceChannelId: voiceChannel.id,
        roleId: createdRole[0].id, // Use the ID from the newly created role
      })
      .returning();

    // Create initial team stats
    await this.teamStatsService.createTeamStats(result[0].id);

    await voiceChannel.permissionOverwrites.create(role, {
      ViewChannel: true,
      Connect: true,
    });

    await owner.roles.add(role);

    await this.db
      .update(users)
      .set({ teamId: result[0].id })
      .where(
        eq(
          users.id,
          (await this.userService.getUserByDiscordId(ownerDiscordId)).id,
        ),
      )
      .execute();

    return { team: result[0], role, voiceChannel };
  }

  async addMembersToTeam(teamId: number, memberIds: string[]) {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    const currentMembers = JSON.parse(team.memberIds);
    const updatedMembers = [
      ...new Set([...currentMembers, ...memberIds.map((id) => parseInt(id))]),
    ];

    await this.db
      .update(teams)
      .set({ memberIds: JSON.stringify(updatedMembers) })
      .where(eq(teams.id, teamId))
      .execute();

    return this.getTeamById(teamId);
  }

  async getTeamById(teamId: number) {
    const [team] = await this.db
      .select()
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    return team;
  }

  async getTeamByOwnerId(ownerId: number) {
    const [team] = await this.db
      .select()
      .from(teams)
      .where(eq(teams.ownerId, ownerId))
      .limit(1);
    return team;
  }

  async getTeamByOwnerDiscordId(discordId: string) {
    const user = await this.userService.getUserByDiscordId(discordId);
    if (!user) return null;

    return this.getTeamByOwnerId(user.id);
  }

  async addMemberToTeam(teamId: number, discordId: string, guild: Guild) {
    const user = await this.userService.getUserByDiscordId(discordId);
    const member = await guild.members.fetch(discordId).catch((error) => {
      console.error('Error fetching guild member:', error);
      return null;
    });

    if (!user || !member) {
      return {
        success: false,
        message: 'User not found or not a member of the server.',
      };
    }

    const initRole = guild.roles.cache.find((role) => role.name === 'INIT');
    if (initRole && member.roles.cache.has(initRole.id)) {
      return {
        success: false,
        message: 'Users with the INIT role cannot join teams.',
      };
    }

    const team = await this.getTeamById(teamId);
    if (!team) {
      return { success: false, message: 'Team not found' };
    }

    const memberIds = JSON.parse(team.memberIds);
    if (memberIds.length >= 3) {
      return {
        success: false,
        message: 'Team is already full (3 players maximum)',
      };
    }

    if (!memberIds.includes(user.id)) {
      memberIds.push(user.id);
      const historyMemberIds = JSON.parse(team.historyMemberIds);
      if (!historyMemberIds.includes(user.id)) {
        historyMemberIds.push(user.id);
      }
      await this.db
        .update(teams)
        .set({
          memberIds: JSON.stringify(memberIds),
          historyMemberIds: JSON.stringify(historyMemberIds),
        })
        .where(eq(teams.id, teamId))
        .execute();
    }

    // Assign the team role to the new member
    const teamRole = guild.roles.cache.find((role) => role.name === team.name);
    if (teamRole) {
      await member.roles.add(teamRole);
    }

    await this.userService.updateTeamId(discordId, teamId);
    return { success: true, user };
  }

  async sendTeamInvitation(
    teamId: number,
    discordId: string,
    guild: Guild,
    inviterDiscordId: string,
  ) {
    const user = await this.userService.getUserByDiscordId(discordId);
    const member = await guild.members.fetch(discordId).catch(() => null);
    const inviter = await this.userService.getUserByDiscordId(inviterDiscordId);
    const team = await this.getTeamById(teamId);

    if (!user || !member || !inviter || !team) {
      return {
        success: false,
        message: 'User not found or not a member of the server.',
      };
    }

    const initRole = guild.roles.cache.find((role) => role.name === 'INIT');
    if (initRole && member.roles.cache.has(initRole.id)) {
      return {
        success: false,
        message: 'Users with the INIT role cannot join teams.',
      };
    }

    const inviteEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🎮 Team Invitation')
      .setDescription(`You've been invited to join a team!`)
      .addFields(
        { name: '👥 Team', value: team.name, inline: true },
        { name: '🧑‍💼 Invited by', value: inviter.username, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        {
          name: '📝 Instructions',
          value: 'Click the buttons below to accept or deny the invitation.',
        },
      )
      .setFooter({ text: 'The Divide Cups - Team Up and Conquer!' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`join_team:${teamId}`)
        .setLabel('Join')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_team:${teamId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger),
    );

    try {
      await member.send({ embeds: [inviteEmbed], components: [row] });
      return { success: true, message: 'Invitation sent successfully.' };
    } catch (error) {
      console.error('Error sending invitation:', error);
      return { success: false, message: 'Failed to send invitation.' };
    }
  }

  async transferOwnership(
    teamId: number,
    currentOwnerId: number,
  ): Promise<User | null> {
    const team = await this.getTeamById(teamId);
    if (!team) throw new Error('Team not found');

    const memberIds = JSON.parse(team.memberIds);
    const newOwnerId = memberIds.find((id) => id !== currentOwnerId);

    if (!newOwnerId) return null;

    await this.db.transaction(async (tx) => {
      await tx
        .update(teams)
        .set({ ownerId: newOwnerId })
        .where(eq(teams.id, teamId));

      await tx
        .update(users)
        .set({ teamId: null })
        .where(eq(users.id, currentOwnerId));
    });

    return this.userService.getUserById(newOwnerId);
  }

  async removeMemberFromTeam(teamId: number, userId: number): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) throw new Error('Team not found');

    const memberIds = JSON.parse(team.memberIds);
    const updatedMemberIds = memberIds.filter((id) => id !== userId);

    await this.db.transaction(async (tx) => {
      await tx
        .update(teams)
        .set({ memberIds: JSON.stringify(updatedMemberIds) })
        .where(eq(teams.id, teamId));

      await tx.update(users).set({ teamId: null }).where(eq(users.id, userId));
    });
  }

  async disbandTeam(teamId: number, guild: Guild): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) throw new Error('Team not found');

    const memberIds = JSON.parse(team.memberIds);

    await this.db.transaction(async (tx) => {
      // Archive the team
      await tx
        .update(teams)
        .set({ isArchived: true })
        .where(eq(teams.id, teamId));

      // Remove team role from all members and delete the role
      const teamRole = guild.roles.cache.find(
        (role) => role.name === team.name,
      );
      if (teamRole) {
        for (const memberId of memberIds) {
          const member = await guild.members.fetch(memberId).catch(() => null);
          if (member && member.roles) {
            await member.roles.remove(teamRole).catch((error) => {
              console.error(
                `Failed to remove role from member ${memberId}:`,
                error,
              );
            });
          }
        }
        // Delete the team role
        await teamRole.delete().catch((error) => {
          console.error(`Failed to delete team role:`, error);
        });
      }

      // Delete the team's voice channel
      if (team.voiceChannelId) {
        const voiceChannel = await guild.channels
          .fetch(team.voiceChannelId)
          .catch(() => null);
        if (voiceChannel) {
          await voiceChannel.delete().catch((error) => {
            console.error(`Failed to delete voice channel:`, error);
          });
        }
      }

      // Update all team members to remove their teamId and clear team-related data
      await tx
        .update(users)
        .set({
          teamId: null,
          roles: sql`CASE 
            WHEN ${users.roles}::jsonb ? ${team.roleId}::text 
            THEN (${users.roles}::jsonb - ${team.roleId}::text)::text 
            ELSE ${users.roles} 
          END`,
        })
        .where(inArray(users.id, memberIds));
    });
  }

  async getTeamByName(name: string) {
    const [team] = await this.db
      .select()
      .from(teams)
      .where(eq(teams.name, name))
      .limit(1);
    return team;
  }

  async getTeamMembers(teamId: number) {
    const team = await this.getTeamById(teamId);
    if (!team) return [];

    const memberIds = JSON.parse(team.memberIds);
    const members = await this.db
      .select()
      .from(users)
      .where(inArray(users.id, memberIds));

    return members;
  }

  async updateTeam(teamId: number, updateData: Partial<Team>): Promise<Team> {
    const updatedTeams = await this.db
      .update(teams)
      .set(updateData)
      .where(eq(teams.id, teamId))
      .returning();

    const updatedTeam = updatedTeams[0];

    if (!updatedTeam) {
      throw new NotFoundException(`Team with ID ${teamId} not found`);
    }

    return updatedTeam;
  }

  async createTeamWithoutDiscord(
    ownerId: number,
    name: string,
    memberIds: number[],
  ) {
    const memberIdsArray = Array.isArray(memberIds) ? memberIds : [];
    const team = await this.db.transaction(async (tx) => {
      const newTeam = await tx
        .insert(teams)
        .values({
          name,
          ownerId,
          memberIds: JSON.stringify(memberIdsArray),
          voiceChannelId: 'fake-channel-id',
        })
        .returning()
        .then((result) => result[0]);

      if (!newTeam) {
        throw new Error('Failed to create team');
      }

      // Update the teamId for all team members
      await tx
        .update(users)
        .set({ teamId: newTeam.id })
        .where(inArray(users.id, [ownerId, ...memberIdsArray]));

      return newTeam;
    });

    return team;
  }

  async getTeamByRoleId(roleId: number): Promise<Team | null> {
    const [teamData] = await this.db
      .select()
      .from(teams)
      .where(eq(teams.roleId, roleId))
      .limit(1);

    if (!teamData) {
      return null;
    }

    // Convert the raw database result to a Team object
    const team: Team = {
      id: teamData.id,
      name: teamData.name,
      createdAt: teamData.createdAt,
      updatedAt: teamData.updatedAt,
      voiceChannelId: teamData.voiceChannelId,
      ownerId: teamData.ownerId,
      memberIds: teamData.memberIds,
      isDisabled: teamData.isDisabled,
      roleId: teamData.roleId.toString(),
    };

    return team;
  }

  async getTeamLeaderboard(limit: number = 10): Promise<any[]> {
    const leaderboard = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        elo: teamStats.elo,
      })
      .from(teams)
      .innerJoin(teamStats, eq(teams.id, teamStats.teamId))
      .orderBy(desc(teamStats.elo))
      .limit(limit);

    return leaderboard;
  }
}
