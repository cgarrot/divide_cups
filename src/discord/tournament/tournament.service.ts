import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '../../drizzle/drizzle.decorator';
import { DrizzleDB } from '../../drizzle/types/drizzle';
import { tournaments } from '../../drizzle/schema/tournament.schema';
import { desc, eq } from 'drizzle-orm';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  TextChannel,
  Message,
  MessageCreateOptions,
  ButtonInteraction,
} from 'discord.js';
import { Bracket, Tournament, TournamentMatch } from './tournament.interface';
import { TournamentImageService } from '../tournament-image/tournament-image.service';
import { Match } from '../match/match.interface';
import { InjectDiscordClient } from '@discord-nestjs/core';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { RolesService } from '../roles/roles.service';
import { MatchService } from '../match/match.service';
import { TeamService } from '../team/team.service';
import { QueueService } from 'src/queue/queue.service';
import { UserService } from '../user/user.service';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class TournamentService {
  private readonly validTeamCounts = [
    0, 2, 4, 7, 8, 14, 15, 16, 29, 30, 31, 32,
  ];

  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly tournamentImageService: TournamentImageService,
    @InjectDiscordClient()
    private readonly client: Client,
    private readonly rolesService: RolesService,
    private readonly teamService: TeamService,
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
    private readonly queueService: QueueService,
    private readonly userService: UserService,
    private readonly redisService: RedisService,
  ) {}

  async createTournament(
    name: string,
    startTime: Date,
    maxTeamLimit: number,
    prize: string,
    region: 'NA' | 'EU' | 'ASIA' | 'OCEA' | 'SA',
  ): Promise<any> {
    const [tournament] = await this.db
      .insert(tournaments)
      .values({
        name,
        startTime,
        maxTeamLimit,
        prize,
        teams: '[]',
        waitingList: '[]',
        matches: '[]',
        bracket: '{}',
        status: 'waiting',
        region,
      })
      .returning();

    return tournament;
  }

  // private createTournamentEmbed(tournament: Tournament): EmbedBuilder {
  //   return this.generateTournamentEmbed(tournament);
  // }

  private async generateTournamentEmbed(
    tournament: Tournament,
  ): Promise<EmbedBuilder> {
    const teams = this.parseJsonSafely(tournament.teams, []);
    const waitingList = this.parseJsonSafely(tournament.waitingList, []);
    const teamsRegistered = teams.length;
    const waitingListCount = waitingList.length;
    const checkInKey = `tournament:${tournament.id}:check_in`;

    const teamRoles = await Promise.all(
      teams.map((team) => this.rolesService.getRoleById(team.roleId)),
    );
    const waitingListRoles = await Promise.all(
      waitingList.map((team) => this.rolesService.getRoleById(team.roleId)),
    );

    let registeredTeamsValue = '';
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      const role = teamRoles[i];
      const teamMembers = await this.teamService.getTeamMembers(team.id);
      const checkedInCount = await this.getCheckedInCount(
        checkInKey,
        team.id,
        teamMembers,
      );
      const checkMark = checkedInCount === teamMembers.length ? '✅' : '❌';
      registeredTeamsValue += `${checkMark} <@&${role?.discordId || team.roleId}> (${checkedInCount}/${teamMembers.length})\n`;
    }

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`🏆 ${tournament.name}`)
      .setDescription(
        'Join us for an exciting tournament! Here are the details:',
      )
      .addFields(
        {
          name: '📅 When',
          value: `<t:${Math.floor(tournament.startTime.getTime() / 1000)}:F>`,
        },
        {
          name: '👥 Team Status',
          value: `${teamsRegistered}/${tournament.maxTeamLimit} teams`,
          inline: true,
        },
        {
          name: '🎮 Registered Teams',
          value:
            registeredTeamsValue ||
            'No teams registered yet. Be the first to join!',
        },
        {
          name: '⏳ Waiting List',
          value:
            waitingListCount > 0
              ? `${waitingListCount} team${waitingListCount > 1 ? 's' : ''} in waiting list:\n${waitingListRoles.map((role, index) => `<@&${role?.discordId || waitingList[index].roleId}>`).join('\n')}`
              : 'No teams in waiting list',
        },
      )
      .setFooter({
        text: 'Sign up now and may the best team win!',
      });

    if (tournament.prize && tournament.prize.trim() !== '') {
      embed.addFields({
        name: '🏅 Prize',
        value: tournament.prize,
        inline: true,
      });
    }

    return embed;
  }

  private async getCheckedInCount(
    checkInKey: string,
    teamId: number,
    teamMembers: any[],
  ): Promise<number> {
    let checkedInCount = 0;
    for (const member of teamMembers) {
      const isCheckedIn = await this.redisService.hget(
        checkInKey,
        `${teamId}:${member.id}`,
      );
      if (isCheckedIn === '1') {
        checkedInCount++;
      }
    }
    return checkedInCount;
  }

  async sendTournamentAnnouncementMessage(
    tournament: Tournament,
    channelId: string,
  ): Promise<Message> {
    const channel = (await this.client.channels.fetch(
      channelId,
    )) as TextChannel;
    if (!channel) {
      throw new Error('Channel not found');
    }

    const embed = await this.generateTournamentEmbed(tournament);

    const joinButton = new ButtonBuilder()
      .setCustomId(`join_tournament:${tournament.id}`)
      .setLabel('Join Tournament')
      .setStyle(ButtonStyle.Success);

    const leaveButton = new ButtonBuilder()
      .setCustomId(`leave_tournament:${tournament.id}`)
      .setLabel('Leave Tournament')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      joinButton,
      leaveButton,
    );

    const sentMessage = await channel.send({
      embeds: [embed],
      components: [row],
    });

    // Store the message in the database
    await this.storeAnnouncementMessage(channel.id, sentMessage.id, tournament);

    return sentMessage;
  }

  private async storeAnnouncementMessage(
    channelId: string,
    messageId: string,
    tournament: Tournament,
  ): Promise<void> {
    const channelData =
      await this.rolesService.getChannelByDiscordId(channelId);
    if (!channelData) {
      throw new Error('Channel not found in database');
    }

    const messages = JSON.parse(channelData.messages);
    messages.push({
      id: messageId,
      name: `tournament_announcement_${tournament.id}`,
      details: `Tournament announcement for ${tournament.name}`,
    });

    await this.rolesService.updateChannelMessages(channelId, messages);
  }

  async updateTournamentMessage(
    tournament: Tournament,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    const channel = (await this.client.channels.fetch(
      channelId,
    )) as TextChannel;
    if (!channel) {
      throw new Error('Channel not found');
    }

    const message = await channel.messages.fetch(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    const updatedEmbed = await this.generateTournamentEmbed(tournament);
    await message.edit({ embeds: [updatedEmbed] });
  }

  private getTargetTeamCount(currentTeamCount: number): number {
    return (
      this.validTeamCounts.find((count) => count >= currentTeamCount) ||
      this.validTeamCounts[this.validTeamCounts.length - 1]
    );
  }

  async addTeamToTournament(
    tournamentId: number,
    teamId: number,
    teamName: string,
    teamRoleId: string,
  ): Promise<Tournament> {
    const tournament = await this.getTournamentById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const teams = this.parseJsonSafely(tournament.teams, []);
    const waitingList = this.parseJsonSafely(tournament.waitingList, []);

    if (
      teams.some((t) => t.id === teamId) ||
      waitingList.some((t) => t.id === teamId)
    ) {
      throw new ConflictException(
        'Team is already registered for this tournament',
      );
    }

    const newTeam = { id: teamId, name: teamName, roleId: teamRoleId };
    const currentTeamCount = teams.length;
    const totalTeamCount = currentTeamCount + waitingList.length + 1;

    if (this.validTeamCounts.includes(totalTeamCount)) {
      teams.push(newTeam);
      teams.push(...waitingList);
      waitingList.length = 0;
    } else if (currentTeamCount < tournament.maxTeamLimit) {
      waitingList.push(newTeam);
    } else {
      throw new ConflictException('Tournament has reached maximum team limit');
    }

    const updatedTournament = await this.db
      .update(tournaments)
      .set({
        teams: JSON.stringify(teams),
        waitingList: JSON.stringify(waitingList),
      })
      .where(eq(tournaments.id, tournamentId))
      .returning();

    return this.mapTournamentToInterface(updatedTournament[0]);
  }

  async removeTeamFromTournament(
    tournamentId: number,
    teamId: number,
  ): Promise<Tournament> {
    const tournament = await this.getTournamentById(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    let teams = this.parseJsonSafely(tournament.teams, []);
    let waitingList = this.parseJsonSafely(tournament.waitingList, []);

    const teamIndex = teams.findIndex((team) => team.id === teamId);
    if (teamIndex !== -1) {
      // Remove the team from the registered teams
      teams.splice(teamIndex, 1);

      // Adjust teams and waiting list
      const result = this.adjustTeamsAndWaitingList(teams, waitingList);
      teams = result.teams;
      waitingList = result.waitingList;
    } else {
      // If the team is not in the registered teams, remove it from the waiting list
      const waitingIndex = waitingList.findIndex((team) => team.id === teamId);
      if (waitingIndex !== -1) {
        waitingList.splice(waitingIndex, 1);
      } else {
        throw new Error('Team not found in tournament');
      }
    }

    const updatedTournament = await this.db
      .update(tournaments)
      .set({
        teams: JSON.stringify(teams),
        waitingList: JSON.stringify(waitingList),
      })
      .where(eq(tournaments.id, tournamentId))
      .returning();

    return this.mapTournamentToInterface(updatedTournament[0]);
  }

  private adjustTeamsAndWaitingList(
    teams: any[],
    waitingList: any[],
  ): { teams: any[]; waitingList: any[] } {
    const validTeamCounts = [2, 4, 7, 8, 14, 15, 16, 29, 30, 31, 32];
    let totalTeams = teams.length;

    // If there are teams in the waiting list, move them to the registered teams
    while (waitingList.length > 0 && !validTeamCounts.includes(totalTeams)) {
      teams.push(waitingList.shift());
      totalTeams++;
    }

    // If still not a valid count, adjust by moving teams to waiting list
    if (!validTeamCounts.includes(totalTeams)) {
      const targetCount = this.getTargetTeamCount(totalTeams);
      if (targetCount < totalTeams) {
        // Move excess teams to waiting list
        while (teams.length > targetCount) {
          waitingList.unshift(teams.pop());
        }
      } else {
        // Move all teams to waiting list if below minimum valid count
        while (teams.length > 0) {
          waitingList.unshift(teams.pop());
        }
      }
    }

    return { teams, waitingList };
  }

  async updateTournamentMatches(
    tournamentId: number,
    createdMatches: Match[],
  ): Promise<void> {
    const tournament = await this.getTournamentById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    // Convert the createdMatches array to a JSON string
    const matchesJson = JSON.stringify(createdMatches);

    await this.db
      .update(tournaments)
      .set({ matches: matchesJson })
      .where(eq(tournaments.id, tournamentId))
      .execute();
  }

  async getTournamentById(tournamentId: number): Promise<Tournament | null> {
    const [tournament] = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);
    return tournament ? this.mapTournamentToInterface(tournament) : null;
  }

  async updateTournamentStatus(
    tournamentId: number,
    status: 'draft' | 'waiting' | 'start' | 'in_progress' | 'complete',
  ): Promise<void> {
    await this.db
      .update(tournaments)
      .set({ status })
      .where(eq(tournaments.id, tournamentId))
      .execute();
  }

  async generateBracketImage(tournamentId: number): Promise<Buffer> {
    const tournament = await this.getTournamentById(tournamentId);
    let matches: Match[] = [];
    try {
      matches =
        typeof tournament.matches === 'string'
          ? JSON.parse(tournament.matches)
          : tournament.matches;
    } catch (error) {
      console.error('Error parsing matches:', error);
      matches = [];
    }
    return this.tournamentImageService.generateBracketImage(tournament.bracket);
  }

  private mapTournamentToInterface(tournament: any): Tournament {
    const parseJsonSafely = (jsonString: string, defaultValue: any) => {
      if (typeof jsonString === 'string') {
        try {
          return JSON.parse(jsonString);
        } catch (error) {
          console.error(`Error parsing JSON: ${error.message}`);
          return defaultValue;
        }
      }
      return defaultValue;
    };

    return {
      ...tournament,
      teams: parseJsonSafely(tournament.teams, []),
      matches: parseJsonSafely(tournament.matches, []),
      bracket: parseJsonSafely(tournament.bracket, {}),
    };
  }

  private parseJsonSafely(
    jsonString: string | any[],
    defaultValue: any[],
  ): any[] {
    if (Array.isArray(jsonString)) {
      return jsonString;
    }
    if (typeof jsonString !== 'string') {
      console.error(
        'Invalid input: expected string or array, got',
        typeof jsonString,
      );
      return defaultValue;
    }
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('Error parsing JSON:', error);
      return defaultValue;
    }
  }

  async startTournament(tournamentId: number): Promise<void> {
    const tournament = await this.getTournamentById(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const teams = Array.isArray(tournament.teams)
      ? tournament.teams
      : JSON.parse(tournament.teams);
    if (teams.length < 2) {
      throw new Error('Not enough teams to start the tournament');
    }

    const bracket = this.createSingleEliminationBracket(teams);
    const createdMatches = await this.createMatchesFromBracket(
      bracket,
      tournamentId,
    );

    // Update tournament with created matches and bracket
    await this.updateTournament(tournamentId, {
      matches: createdMatches as TournamentMatch[],
      bracket: bracket,
      status: 'in_progress',
    });

    // Start veto process for each created match
    for (const match of createdMatches) {
      await this.matchService.startVetoProcess(
        match.id,
        match.discordChannelId,
      );
    }
  }

  private createSingleEliminationBracket(teams: any[]): Bracket {
    const rounds = Math.ceil(Math.log2(teams.length));
    const bracket: Bracket = {
      name: 'Single Elimination',
      rounds: [],
    };

    let matchCount = 1;
    for (let round = 1; round <= rounds; round++) {
      const matchesInRound = Math.pow(2, rounds - round);
      const roundMatches = [];

      for (let i = 0; i < matchesInRound; i++) {
        const match = {
          match: matchCount++,
          team1: round === 1 ? teams[i * 2]?.name || 'TBD' : 'TBD',
          team2: round === 1 ? teams[i * 2 + 1]?.name || 'TBD' : 'TBD',
          score1: 0,
          score2: 0,
        };
        roundMatches.push(match);
      }

      bracket.rounds.push({ round, matches: roundMatches });
    }

    return bracket;
  }

  private async createMatchesFromBracket(
    bracket: Bracket,
    tournamentId: number,
  ): Promise<Match[]> {
    const createdMatches: Match[] = [];

    for (const round of bracket.rounds) {
      for (const match of round.matches) {
        const team1 = await this.teamService.getTeamByName(match.team1);
        const team2 = await this.teamService.getTeamByName(match.team2);

        if (team1 && team2) {
          const team1Role = await this.client.guilds.cache
            .get(process.env.GUILD_ID)
            .roles.fetch(team1.roleId.toString());
          const team2Role = await this.client.guilds.cache
            .get(process.env.GUILD_ID)
            .roles.fetch(team2.roleId.toString());

          if (team1Role && team2Role) {
            const createdMatch = await this.matchService.createMatchFromRoles(
              team1Role,
              team2Role,
              await this.client.guilds.fetch(process.env.GUILD_ID),
              tournamentId,
            );

            if (createdMatch) {
              createdMatches.push(createdMatch);
            }
          }
        }
      }
    }

    return createdMatches;
  }

  async updateTournamentRequest(
    tournamentId: number,
    updateTournamentDto: UpdateTournamentDto,
  ): Promise<Tournament> {
    const tournament = await this.getTournamentById(tournamentId);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const updateData: any = { ...updateTournamentDto };

    if (updateTournamentDto.startTime) {
      updateData.startTime = new Date(updateTournamentDto.startTime);
      if (isNaN(updateData.startTime.getTime())) {
        throw new BadRequestException('Invalid start time');
      }
    }

    const updatedTournament = await this.db
      .update(tournaments)
      .set(updateData)
      .where(eq(tournaments.id, tournamentId))
      .returning();

    const mappedTournament = this.mapTournamentToInterface(
      updatedTournament[0],
    );

    // Update the Discord message
    await this.updateTournamentDiscordMessage(mappedTournament);

    return mappedTournament;
  }

  async updateTournament(
    tournamentId: number,
    updateData: Partial<Tournament>,
  ): Promise<Tournament> {
    const dataToUpdate: any = { ...updateData };
    if (updateData.matches) {
      dataToUpdate.matches = JSON.stringify(updateData.matches);
    }
    if (updateData.bracket) {
      dataToUpdate.bracket = JSON.stringify(updateData.bracket);
    }

    const [updatedTournament] = await this.db
      .update(tournaments)
      .set(dataToUpdate)
      .where(eq(tournaments.id, tournamentId))
      .returning();

    return this.mapTournamentToInterface(updatedTournament);
  }

  async sendTournamentStartAnnouncement(
    tournament: Tournament,
    bracketImage: Buffer | null,
  ): Promise<Message> {
    console.log(
      `Starting sendTournamentStartAnnouncement for tournament: ${tournament.name}`,
    );

    const channelName = `${tournament.region.toLowerCase()}-announcements`;
    console.log(`Looking for channel: ${channelName}`);

    const announcementChannel =
      await this.rolesService.getChannelByName(channelName);
    if (!announcementChannel) {
      console.error(`Channel '${channelName}' not found in the database`);
      throw new Error(
        `Tournament announcement channel '${channelName}' not found in the database`,
      );
    }
    console.log(`Found channel in database: ${announcementChannel.discordId}`);

    const channel = (await this.client.channels.fetch(
      announcementChannel.discordId,
    )) as TextChannel;
    if (!channel || !(channel instanceof TextChannel)) {
      console.error(
        `Channel '${channelName}' not found in Discord or is not a TextChannel`,
      );
      throw new Error(
        `Tournament announcement channel '${channelName}' not found in Discord`,
      );
    }
    console.log(`Successfully fetched Discord channel: ${channel.name}`);

    const messageOptions: MessageCreateOptions = {};

    if (bracketImage) {
      messageOptions.files = [
        { attachment: bracketImage, name: 'tournament_bracket.png' },
      ];
    } else {
      console.log(
        'No bracket image available, sending announcement without it.',
      );
    }

    // Create a new embed for the tournament start announcement
    const startEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`🏆 ${tournament.name} Has Started!`)
      .setDescription(
        'The tournament has officially begun. Good luck to all participants!',
      )
      .addFields(
        {
          name: '📅 Start Time',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
        },
        {
          name: '👥 Participating Teams',
          value: await this.getParticipatingTeamsString(tournament),
        },
      );

    messageOptions.embeds = [startEmbed];

    const message = await channel.send(messageOptions);

    // Update the channel messages in the database
    await this.storeAnnouncementMessage(channel.id, message.id, tournament);

    // Update the original tournament announcement message to remove buttons
    await this.updateOriginalAnnouncementMessage(channel, tournament);

    console.log(`Tournament start announcement sent: ${message.id}`);
    return message;
  }

  private async getParticipatingTeamsString(
    tournament: Tournament,
  ): Promise<string> {
    const teams = this.parseJsonSafely(tournament.teams, []);
    if (teams.length === 0) {
      return 'No teams participating';
    }

    const teamMentions = await Promise.all(
      teams.map(async (team) => {
        const role = await this.rolesService.getRoleById(team.roleId);
        return `<@&${role.discordId}>`;
      }),
    );

    return teamMentions.join('\n');
  }

  private async updateOriginalAnnouncementMessage(
    channel: TextChannel,
    tournament: Tournament,
  ): Promise<void> {
    const channelData = await this.rolesService.getChannelByDiscordId(
      channel.id,
    );
    if (!channelData) {
      console.error('Channel not found in database');
      return;
    }

    const messages = JSON.parse(channelData.messages);
    const originalAnnouncement = messages.find(
      (msg) => msg.name === `tournament_announcement_${tournament.id}`,
    );

    if (originalAnnouncement) {
      try {
        const originalMessage = await channel.messages.fetch(
          originalAnnouncement.id,
        );
        const updatedEmbed = await this.generateTournamentEmbed(tournament);
        await originalMessage.edit({ embeds: [updatedEmbed], components: [] });
        console.log(
          `Original tournament announcement updated: ${originalMessage.id}`,
        );
      } catch (error) {
        console.error(
          'Error updating original tournament announcement:',
          error,
        );
      }
    }
  }

  async updateTournamentBracket(
    tournamentId: number,
    bracket: any,
  ): Promise<void> {
    const bracketString = JSON.stringify(bracket);
    await this.db
      .update(tournaments)
      .set({ bracket: bracketString })
      .where(eq(tournaments.id, tournamentId))
      .execute();
  }

  async updateBracketAfterMatch(
    matchId: number,
    tournamentId: number,
  ): Promise<void> {
    const match = await this.matchService.getMatchById(matchId);
    const tournament = await this.getTournamentById(tournamentId);
    let bracket;

    if (typeof tournament.bracket === 'string') {
      try {
        bracket = JSON.parse(tournament.bracket);
      } catch (error) {
        console.error('Error parsing tournament bracket:', error);
        throw new Error('Invalid tournament bracket data');
      }
    } else if (typeof tournament.bracket === 'object') {
      bracket = tournament.bracket;
    } else {
      throw new Error('Invalid tournament bracket data type');
    }

    // Find the match in the bracket and update its score
    for (const round of bracket.rounds) {
      const bracketMatch = round.matches.find((m) => m.match === match.round);
      if (bracketMatch) {
        bracketMatch.score1 = match.team1Score;
        bracketMatch.score2 = match.team2Score;
        break;
      }
    }

    // Check if we need to create a new match for the next round
    const nextRound = match.round + 1;
    const nextRoundMatches = bracket.rounds.find(
      (r) => r.round === nextRound,
    )?.matches;
    if (nextRoundMatches) {
      const winnerTeam =
        match.team1Score > match.team2Score ? match.team1Id : match.team2Id;
      const nextMatch = nextRoundMatches.find(
        (m) => m.team1 === 'TBD' || m.team2 === 'TBD',
      );
      if (nextMatch) {
        if (nextMatch.team1 === 'TBD') {
          nextMatch.team1 = winnerTeam;
        } else {
          nextMatch.team2 = winnerTeam;
        }

        // If both teams are set, create a new match
        if (nextMatch.team1 !== 'TBD' && nextMatch.team2 !== 'TBD') {
          const newMatch = await this.matchService.createMatchFromBracket(
            nextMatch,
            tournamentId,
          );
          await this.queueService.addToQueue({
            type: 'start_veto',
            data: {
              matchId: newMatch.id,
              channelId: newMatch.discordChannelId,
            },
          });
        }
      }
    }

    // Update the tournament bracket
    await this.updateTournamentBracket(tournamentId, bracket);
  }

  async cancelTournament(tournamentId: number): Promise<void> {
    const tournament = await this.getTournamentById(tournamentId);
    if (!tournament) {
      throw new NotFoundException(
        `Tournament with ID ${tournamentId} not found`,
      );
    }

    await this.db
      .update(tournaments)
      .set({ status: 'cancelled' })
      .where(eq(tournaments.id, tournamentId));

    console.log(
      `Tournament ${tournamentId} has been cancelled due to insufficient teams`,
    );

    // Notify registered teams about the cancellation
    const teams = this.parseJsonSafely(tournament.teams, []);
    for (const team of teams) {
      await this.notifyTeamAboutCancellation(team.id, tournamentId);
    }
  }

  private async notifyTeamAboutCancellation(
    teamId: number,
    tournamentId: number,
  ): Promise<void> {
    // Implement the logic to send a Discord message to the team about the tournament cancellation
    // You can use the Discord client to send a DM to the team owner or post in the team's channel
  }

  async updateTournamentDiscordMessage(tournament: Tournament): Promise<void> {
    const channelName = `${tournament.region.toLowerCase()}-announcements`;
    const channelData = await this.rolesService.getChannelByName(channelName);

    if (!channelData) {
      throw new NotFoundException(`Channel ${channelName} not found`);
    }

    const channel = (await this.client.channels.fetch(
      channelData.discordId,
    )) as TextChannel;
    if (!channel || !(channel instanceof TextChannel)) {
      throw new NotFoundException(`Discord channel ${channelName} not found`);
    }

    const messages = JSON.parse(channelData.messages);
    const tournamentMessage = messages.find(
      (msg) => msg.name === `tournament_announcement_${tournament.id}`,
    );

    if (!tournamentMessage) {
      throw new NotFoundException(`Tournament announcement message not found`);
    }

    const updatedEmbed = await this.generateTournamentEmbed(tournament);

    try {
      const message = await channel.messages.fetch(tournamentMessage.id);
      await message.edit({ embeds: [updatedEmbed] });
    } catch (error) {
      console.error('Error updating tournament Discord message:', error);
      throw new InternalServerErrorException(
        'Failed to update tournament Discord message',
      );
    }
  }

  async updateTournamentAnnouncementMessage(
    tournament: Tournament,
  ): Promise<void> {
    const channelName = `${tournament.region.toLowerCase()}-announcements`;
    const channel = await this.rolesService.getChannelByName(channelName);

    if (!channel) {
      throw new NotFoundException(`Channel ${channelName} not found`);
    }

    const discordChannel = (await this.client.channels.fetch(
      channel.discordId,
    )) as TextChannel;
    if (!discordChannel) {
      throw new NotFoundException(`Discord channel ${channelName} not found`);
    }

    const messages = JSON.parse(channel.messages);
    const tournamentMessage = messages.find(
      (msg) => msg.name === `tournament_announcement_${tournament.id}`,
    );

    if (!tournamentMessage) {
      throw new NotFoundException(`Tournament announcement message not found`);
    }

    try {
      const message = await discordChannel.messages.fetch(tournamentMessage.id);
      const updatedEmbed = await this.generateTournamentEmbed(tournament);

      // Remove the buttons by setting components to an empty array
      await message.edit({ embeds: [updatedEmbed], components: [] });
    } catch (error) {
      console.error('Error updating tournament announcement message:', error);
      throw new InternalServerErrorException(
        'Failed to update tournament announcement message',
      );
    }
  }

  async updateTournamentAnnouncementMessageWithCheckIn(
    tournament: Tournament,
  ): Promise<void> {
    const channelName = `${tournament.region.toLowerCase()}-announcements`;
    const channel = await this.rolesService.getChannelByName(channelName);

    if (!channel) {
      throw new NotFoundException(`Channel ${channelName} not found`);
    }

    const discordChannel = (await this.client.channels.fetch(
      channel.discordId,
    )) as TextChannel;
    if (!discordChannel) {
      throw new NotFoundException(`Discord channel ${channelName} not found`);
    }

    const messages = JSON.parse(channel.messages);
    const tournamentMessage = messages.find(
      (msg) => msg.name === `tournament_announcement_${tournament.id}`,
    );

    if (!tournamentMessage) {
      throw new NotFoundException(`Tournament announcement message not found`);
    }

    try {
      const message = await discordChannel.messages.fetch(tournamentMessage.id);
      const updatedEmbed = await this.generateTournamentEmbed(tournament);

      const checkInButton = new ButtonBuilder()
        .setCustomId(`check_in_tournament:${tournament.id}`)
        .setLabel('Check-In')
        .setStyle(ButtonStyle.Primary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        checkInButton,
      );

      await message.edit({ embeds: [updatedEmbed], components: [row] });
    } catch (error) {
      console.error('Error updating tournament announcement message:', error);
      throw new InternalServerErrorException(
        'Failed to update tournament announcement message',
      );
    }
  }

  async updateTournamentMessageWithCheckIns(
    tournamentId: number,
  ): Promise<void> {
    const tournament = await this.getTournamentById(tournamentId);
    const updatedEmbed = await this.generateTournamentEmbed(tournament);

    const channelName = `${tournament.region.toLowerCase()}-announcements`;
    const channel = await this.rolesService.getChannelByName(channelName);
    const discordChannel = (await this.client.channels.fetch(
      channel.discordId,
    )) as TextChannel;
    const messages = JSON.parse(channel.messages);
    const tournamentMessage = messages.find(
      (msg) => msg.name === `tournament_announcement_${tournament.id}`,
    );

    const message = await discordChannel.messages.fetch(tournamentMessage.id);
    await message.edit({ embeds: [updatedEmbed] });
  }

  async initializeTournamentCheckIn(tournament: Tournament): Promise<void> {
    const teams = this.parseJsonSafely(tournament.teams, []);
    const checkInKey = `tournament:${tournament.id}:check_in`;

    for (const team of teams) {
      const teamMembers = await this.teamService.getTeamMembers(team.id);
      for (const member of teamMembers) {
        await this.redisService.hset(
          checkInKey,
          `${team.id}:${member.id}`,
          '0',
        );
      }
    }
  }
}
