import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '../../drizzle/drizzle.decorator';
import { DrizzleDB } from '../../drizzle/types/drizzle';
import { matches as matchesTable } from '../../drizzle/schema/match.schema';
import { TournamentService } from '../tournament/tournament.service';
import { eq, sql } from 'drizzle-orm';
import { teams } from '../../drizzle/schema/team.schema';
import {
  TextChannel,
  DMChannel,
  NewsChannel,
  Message,
  EmbedBuilder,
  Role,
  Guild,
  ChannelType,
  PermissionsBitField,
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { TeamService } from '../team/team.service';
import { Match } from './match.interface';
import { RolesService } from '../roles/roles.service';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { UserService } from '../user/user.service';
import { OpenAIService } from '../../openai/openai.service';
import { SteamService } from 'src/steam/steam.service';
import {
  IAnalysisResultMatch,
  ITeam,
  IPlayer,
} from '../../openai/openai.interface';
import { HistoryTeamStatsService } from '../history-team-stats/history-team-stats.service';
import { HistoryUserStatsService } from '../history-user-stats/history-user-stats.service';
import { TeamStatsService } from '../team-stats/team-stats.service';
import { UserStatsService } from '../user-stats/user-stats.service';
import { BracketService } from '../tournament/bracket/bracket.service';
import { User } from '../user/user.interface';
import * as stringSimilarity from 'string-similarity';

@Injectable()
export class MatchService {
  constructor(
    @InjectDrizzle() private readonly db: DrizzleDB,
    private readonly tournamentService: TournamentService,
    private readonly teamService: TeamService,
    private readonly rolesService: RolesService,
    private readonly userService: UserService,
    @InjectDiscordClient() private readonly client: Client,
    private readonly openAIService: OpenAIService,
    private readonly steamService: SteamService,
    private readonly historyTeamStatsService: HistoryTeamStatsService,
    private readonly historyUserStatsService: HistoryUserStatsService,
    private readonly teamStatsService: TeamStatsService,
    private readonly userStatsService: UserStatsService,
    private readonly bracketService: BracketService,
  ) {}

  private maps = ['Mill', 'Skyway', 'Metro', 'Commons'];

  async startVetoProcess(matchId: number, channelId: string): Promise<void> {
    const match = await this.getMatchById(matchId);
    if (!match) {
      console.error(`Match not found for ID: ${matchId}`);
      throw new Error('Match not found');
    }

    const team1 = await this.teamService.getTeamById(match.team1Id);
    const team2 = await this.teamService.getTeamById(match.team2Id);

    if (!team1 || !team2) {
      console.error(
        `Teams not found for match ${matchId}. Team1ID: ${match.team1Id}, Team2ID: ${match.team2Id}`,
      );
      return;
    }

    const channel = await this.fetchTextChannel(match.discordChannelId);
    if (!channel) {
      console.error(`Channel not found for match ${matchId}`);
      return;
    }

    // Send initial instructions
    const instructionsEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Match Instructions')
      .setDescription(
        `<@&${(await this.rolesService.getRoleById(team1.roleId)).discordId}> vs <@&${(await this.rolesService.getRoleById(team2.roleId)).discordId}>\n\nThe veto process will begin shortly.`,
      )
      .addFields({
        name: '📸 How to Submit Match Results',
        value:
          'After the match, use the `!res` command followed by an image of the final scoreboard.\n' +
          'Example: `!res [attach image]`\n' +
          'The opposing team will need to verify the result.',
      })
      .setFooter({ text: 'May the best team win!' });

    await channel.send({ embeds: [instructionsEmbed] });

    // Continue with the veto process
    const remainingMaps = [...this.maps];
    let currentTeam = team1;
    let otherTeam = team2;

    // Ban phase
    for (let i = 0; i < 2; i++) {
      await this.handleBanPhase(channel, currentTeam, otherTeam, remainingMaps);
      [currentTeam, otherTeam] = [otherTeam, currentTeam];
    }

    // Pick phase
    while (remainingMaps.length > 1) {
      if (remainingMaps.length > 2) {
        await this.handlePickPhase(
          channel,
          currentTeam,
          otherTeam,
          remainingMaps,
        );
      } else {
        await this.handleFinalPickPhase(channel, currentTeam, remainingMaps);
        break;
      }
      [currentTeam, otherTeam] = [otherTeam, currentTeam];
    }

    const finalMap = this.maps[0];
    const chosenSide = await this.handleFinalMapSelection(
      channel,
      currentTeam,
      otherTeam,
      finalMap,
    );

    // Update the match with the chosen map and sides
    await this.updateMatch(matchId, {
      map: finalMap,
      team1Side:
        currentTeam === team1
          ? chosenSide === 'DEF'
            ? 'ATK'
            : 'DEF'
          : chosenSide,
      team2Side:
        currentTeam === team2
          ? chosenSide === 'DEF'
            ? 'ATK'
            : 'DEF'
          : chosenSide,
      team1Score: 0,
      team2Score: 0,
    });

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🗺️ Map Veto Process')
      .setDescription(
        `Match setup complete!\n\n🗺️ **Map**: ${finalMap}\n\n${team1.name}: ${
          currentTeam === team1
            ? chosenSide === 'DEF'
              ? 'ATK'
              : 'DEF'
            : chosenSide
        }\n${team2.name}: ${
          currentTeam === team2
            ? chosenSide === 'DEF'
              ? 'ATK'
              : 'DEF'
            : chosenSide
        }`,
      );
    await channel.send({ embeds: [embed] });
  }

  private async handleBanPhase(
    channel: TextChannel,
    currentTeam: any,
    otherTeam: any,
    remainingMaps: string[],
  ): Promise<void> {
    console.log('Starting ban phase for team:', currentTeam.name);

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🗺️ Map Veto Process')
      .setDescription(
        `<@${(await this.userService.getUserById(currentTeam.ownerId)).discordId}>'s turn to ban a map.\n\nRemaining maps: ${remainingMaps.join(', ')}`,
      );
    const message = await channel.send({ embeds: [embed] });

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < remainingMaps.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      remainingMaps.slice(i, i + 5).forEach((map) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`ban_${map}`)
            .setLabel(map)
            .setStyle(ButtonStyle.Danger),
        );
      });
      rows.push(row);
    }

    await message.edit({ components: rows });

    const filter = async (i: ButtonInteraction<'cached'>) => {
      console.log('Interaction received from user:', i.user.id);
      console.log('Expected user:', currentTeam.ownerId);
      console.log('Interaction customId:', i.customId);
      return (
        i.user.id ===
          (await this.userService.getUserById(currentTeam.ownerId)).discordId &&
        i.customId.startsWith('ban_')
      );
    };

    try {
      console.log('Waiting for button interaction...');
      const collected = await message.awaitMessageComponent({
        filter,
        time: 30000,
      });
      console.log('Button interaction received');

      const bannedMap = collected.customId.replace('ban_', '');
      console.log('Banned map:', bannedMap);
      remainingMaps.splice(remainingMaps.indexOf(bannedMap), 1);
      embed.setDescription(
        `${currentTeam.name} banned ${bannedMap}.\n\nRemaining maps: ${remainingMaps.join(', ')}`,
      );
      await message.edit({ embeds: [embed], components: [] });
      console.log('Message updated with banned map');
    } catch (error) {
      console.error('Error in ban phase:', error);
      const randomMap =
        remainingMaps[Math.floor(Math.random() * remainingMaps.length)];
      remainingMaps.splice(remainingMaps.indexOf(randomMap), 1);
      embed.setDescription(
        `${currentTeam.name} didn't respond in time or an error occurred. ${randomMap} was randomly banned.\n\nRemaining maps: ${remainingMaps.join(', ')}`,
      );
      await message.edit({ embeds: [embed], components: [] });
      console.log('Random map banned due to timeout or error:', randomMap);
    }
  }

  private async handlePickPhase(
    channel: TextChannel,
    currentTeam: any,
    otherTeam: any,
    remainingMaps: string[],
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🗺️ Map Veto Process')
      .setDescription(
        `<@${(await this.userService.getUserById(currentTeam.ownerId)).discordId}>'s turn to pick a map.\n\nRemaining maps: ${remainingMaps.join(', ')}`,
      );
    const message = await channel.send({ embeds: [embed] });

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < remainingMaps.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      remainingMaps.slice(i, i + 5).forEach((map) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`pick_${map}`)
            .setLabel(map)
            .setStyle(ButtonStyle.Primary),
        );
      });
      rows.push(row);
    }

    await message.edit({ components: rows });

    const filter = (i: ButtonInteraction<'cached'>) =>
      i.user.id === currentTeam.ownerId.toString() &&
      i.customId.startsWith('pick_');

    try {
      const collected = await message.awaitMessageComponent({
        filter,
        time: 30000,
      });
      const pickedMap = collected.customId.replace('pick_', '');
      remainingMaps.splice(remainingMaps.indexOf(pickedMap), 1);
      embed.setDescription(
        `${currentTeam.name} picked ${pickedMap}.\n\nRemaining maps: ${remainingMaps.join(', ')}`,
      );
      await message.edit({ embeds: [embed], components: [] });
    } catch (error) {
      const randomMap =
        remainingMaps[Math.floor(Math.random() * remainingMaps.length)];
      remainingMaps.splice(remainingMaps.indexOf(randomMap), 1);
      embed.setDescription(
        `${currentTeam.name} didn't respond in time. ${randomMap} was randomly picked.\n\nRemaining maps: ${remainingMaps.join(', ')}`,
      );
      await message.edit({ embeds: [embed], components: [] });
    }
  }

  private async handleFinalPickPhase(
    channel: TextChannel,
    currentTeam: any,
    remainingMaps: string[],
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🗺️ Map Veto Process')
      .setDescription(
        `<@${(await this.userService.getUserById(currentTeam.ownerId)).discordId}>'s turn to pick the final map.\n\nRemaining maps: ${remainingMaps.join(', ')}`,
      );
    const message = await channel.send({ embeds: [embed] });

    const row = new ActionRowBuilder<ButtonBuilder>();
    remainingMaps.forEach((map) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`pick_${map}`)
          .setLabel(map)
          .setStyle(ButtonStyle.Primary),
      );
    });

    await message.edit({ components: [row] });

    const filter = async (i: ButtonInteraction<'cached'>) => {
      return (
        i.user.id ===
          (await this.userService.getUserById(currentTeam.ownerId)).discordId &&
        i.customId.startsWith('pick_')
      );
    };

    try {
      const collected = await message.awaitMessageComponent({
        filter,
        time: 30000,
      });
      const pickedMap = collected.customId.replace('pick_', '');
      remainingMaps.splice(remainingMaps.indexOf(pickedMap), 1);
      embed.setDescription(
        `${currentTeam.name} picked **${pickedMap}** as the final map.`,
      );
      await message.edit({ embeds: [embed], components: [] });

      // Add this line to update the remaining maps array
      this.maps = [pickedMap];
    } catch (error) {
      const randomMap =
        remainingMaps[Math.floor(Math.random() * remainingMaps.length)];
      remainingMaps.splice(remainingMaps.indexOf(randomMap), 1);
      embed.setDescription(
        `${currentTeam.name} didn't respond in time. **${randomMap}** was randomly picked as the final map.`,
      );
      await message.edit({ embeds: [embed], components: [] });

      // Add this line to update the remaining maps array
      this.maps = [randomMap];
    }
  }

  private async handleFinalMapSelection(
    channel: TextChannel,
    mapChooser: any,
    otherTeam: any,
    finalMap: string,
  ): Promise<'DEF' | 'ATK'> {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🗺️ Map Veto Process')
      .setDescription(
        `The final map is **${finalMap}**. <@${(await this.userService.getUserById(otherTeam.ownerId)).discordId}>, please choose your starting side.`,
      );
    const message = await channel.send({ embeds: [embed] });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('side_DEF')
        .setLabel('DEF')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('side_ATK')
        .setLabel('ATK')
        .setStyle(ButtonStyle.Danger),
    );

    await message.edit({ components: [row] });

    const filter = async (i: ButtonInteraction<'cached'>) => {
      return (
        i.user.id ===
          (await this.userService.getUserById(otherTeam.ownerId)).discordId &&
        i.customId.startsWith('side_')
      );
    };

    try {
      const collected = await message.awaitMessageComponent({
        filter,
        time: 30000,
      });
      const chosenSide = collected.customId.replace('side_', '') as
        | 'DEF'
        | 'ATK';
      embed.setDescription(
        `**${otherTeam.name}** chose to start as **${chosenSide}**. **${mapChooser.name}** will start as **${chosenSide === 'DEF' ? 'ATK' : 'DEF'}**.`,
      );
      await message.edit({ embeds: [embed], components: [] });
      return chosenSide;
    } catch (error) {
      const chosenSide = Math.random() < 0.5 ? 'DEF' : 'ATK';
      embed.setDescription(
        `**${otherTeam.name}** didn't respond in time. Their side was randomly chosen as **${chosenSide}**. **${mapChooser.name}** will start as **${chosenSide === 'DEF' ? 'ATK' : 'DEF'}**.`,
      );
      await message.edit({ embeds: [embed], components: [] });
      return chosenSide;
    }
  }

  private async fetchTextChannel(channelId: string): Promise<TextChannel> {
    const fetchedChannel = await this.client.channels.fetch(channelId);
    if (!fetchedChannel || !(fetchedChannel instanceof TextChannel)) {
      throw new Error('Invalid channel or channel type');
    }
    return fetchedChannel;
  }

  async getMatchById(matchId: number): Promise<Match> {
    const [match] = await this.db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.id, matchId))
      .limit(1);
    return match as Match;
  }

  private async updateMatch(
    matchId: number,
    updateData: {
      map: string;
      team1Side: 'DEF' | 'ATK';
      team2Side: 'DEF' | 'ATK';
      team1Score: number;
      team2Score: number;
    },
  ): Promise<void> {
    await this.db
      .update(matchesTable)
      .set({
        map: updateData.map,
        team1Score: updateData.team1Score,
        team2Score: updateData.team2Score,
      })
      .where(eq(matchesTable.id, matchId));
  }

  async updateMatchScore(
    matchId: number,
    team1Score: number,
    team2Score: number,
  ): Promise<void> {
    await this.db
      .update(matchesTable)
      .set({
        team1Score: team1Score,
        team2Score: team2Score,
        status: 'completed',
      })
      .where(eq(matchesTable.id, matchId));
  }

  async updateMatchStats(
    matchId: number,
    imageUrl: string,
  ): Promise<IAnalysisResultMatch> {
    const match = await this.getMatchById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    const team1 = await this.teamService.getTeamById(match.team1Id);
    const team2 = await this.teamService.getTeamById(match.team2Id);

    const team1Members = JSON.parse(team1.memberIds);
    const team2Members = JSON.parse(team2.memberIds);

    const allMembers = [...team1Members, ...team2Members];
    const steamIds = await this.userService.getSteamIdsByUserIds(allMembers);

    // Sync Steam usernames
    for (const userId of allMembers) {
      const user = await this.userService.getUserById(userId);
      if (user && user.steamId) {
        const steamUser = await this.steamService.getSteamUserSummary(
          user.steamId,
        );
        if (steamUser && steamUser.personaname) {
          await this.userService.updateSteamUsername(
            user.discordId,
            steamUser.personaname,
          );
        }
      }
    }

    const steamNames = await this.steamService.getSteamUsernames(steamIds);

    // Send a notification message before starting the image analysis
    const channel = await this.fetchTextChannel(match.discordChannelId);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('Match Result Processing')
          .setDescription(
            'Starting to analyze the match result image. This may take a moment...',
          ),
      ],
    });

    const analysisResult = await this.openAIService.analyzeImage(
      imageUrl,
      steamNames,
    );

    if ('error' in analysisResult) {
      throw new Error(analysisResult.message);
    }

    try {
      const orderedTeams = await this.orderTeamsToMatchDatabase(
        analysisResult,
        match,
      );
      // Update the match with the ordered teams
      analysisResult.team1 = orderedTeams.team1;
      analysisResult.team2 = orderedTeams.team2;
    } catch (error) {
      console.warn(
        'Unable to match teams with database records:',
        error.message,
      );
      // Continue with the original analysis result
    }

    // Ensure the order of teams matches the database
    const orderedTeams = await this.orderTeamsToMatchDatabase(
      analysisResult,
      match,
    );

    console.log(orderedTeams);

    // Update match stats
    await this.updateMatchScore(
      matchId,
      orderedTeams.team1.score.total || 0,
      orderedTeams.team2.score.total || 0,
    );

    // Process team stats
    await this.processTeamStats(
      team1.id,
      match.tournamentId,
      matchId,
      orderedTeams.team1,
    );
    await this.processTeamStats(
      team2.id,
      match.tournamentId,
      matchId,
      orderedTeams.team2,
    );

    // Process user stats
    await this.processUserStats(orderedTeams.team1.players, matchId, team1.id);
    await this.processUserStats(orderedTeams.team2.players, matchId, team2.id);

    return {
      ...analysisResult,
      team1: orderedTeams.team1,
      team2: orderedTeams.team2,
    };
  }

  private matchTeamsWithParsedData(
    dbTeams: any[],
    parsedTeams: ITeam[],
    steamNames: string[],
  ): [ITeam, ITeam] {
    const matchedTeams: ITeam[] = [];

    for (const parsedTeam of parsedTeams) {
      const matchedPlayers = parsedTeam.players.map((player) => {
        const matchedSteamName = this.findBestMatch(
          player.username,
          steamNames,
        );
        return { ...player, username: matchedSteamName };
      });

      matchedTeams.push({ ...parsedTeam, players: matchedPlayers });
    }

    // Determine which matched team corresponds to which database team
    const team1PlayerCount = this.countMatchingPlayers(
      dbTeams[0],
      matchedTeams[0],
    );
    const team2PlayerCount = this.countMatchingPlayers(
      dbTeams[1],
      matchedTeams[1],
    );

    if (team1PlayerCount > team2PlayerCount) {
      return [matchedTeams[0], matchedTeams[1]];
    } else {
      return [matchedTeams[1], matchedTeams[0]];
    }
  }

  private findBestMatch(username: string, steamNames: string[]): string {
    let bestMatch = '';
    let highestSimilarity = 0;

    for (const steamName of steamNames) {
      const similarity = stringSimilarity.compareTwoStrings(
        username.toLowerCase(),
        steamName.toLowerCase(),
      );
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = steamName;
      }
    }

    return highestSimilarity > 0.7 ? bestMatch : username;
  }

  private countMatchingPlayers(dbTeam: any, parsedTeam: ITeam): number {
    const dbPlayerIds = JSON.parse(dbTeam.memberIds);
    let count = 0;

    for (const parsedPlayer of parsedTeam.players) {
      if (dbPlayerIds.includes(parsedPlayer.username)) {
        count++;
      }
    }

    return count;
  }

  private async processTeamStats(
    teamId: number,
    tournamentId: number,
    matchId: number,
    teamData: ITeam,
  ): Promise<void> {
    const totalKills = teamData.players.reduce(
      (sum, player) => sum + (player.kda.kills || 0),
      0,
    );
    const totalDeaths = teamData.players.reduce(
      (sum, player) => sum + (player.kda.deaths || 0),
      0,
    );
    const totalAssists = teamData.players.reduce(
      (sum, player) => sum + (player.kda.assists || 0),
      0,
    );
    const totalDamage = teamData.players.reduce(
      (sum, player) => sum + (player.damage || 0),
      0,
    );

    const roundsWon = teamData.score.total || 0;
    const roundsLost = Math.max(30 - roundsWon, 0); // Ensure non-negative value

    const historyTeamStats = {
      kills: totalKills,
      deaths: totalDeaths,
      assists: totalAssists,
      roundsWon: roundsWon,
      roundsLost: roundsLost,
      score: teamData.score.total || 0,
      result:
        roundsWon > 15
          ? 'win'
          : roundsWon < 15
            ? 'loss'
            : ('draw' as 'win' | 'loss' | 'draw'),
    };

    try {
      await this.historyTeamStatsService.createHistoryTeamStats(
        teamId,
        tournamentId,
        matchId,
        historyTeamStats,
      );

      const currentStats = await this.teamStatsService.getTeamStats(teamId);
      const gamesPlayed = currentStats ? currentStats.length : 0;

      await this.teamStatsService.updateTeamStats(teamId, {
        avgKill: totalKills / teamData.players.length || 0,
        avgDeath: totalDeaths / teamData.players.length || 0,
        avgAssist: totalAssists / teamData.players.length || 0,
        avgDamage: totalDamage / teamData.players.length || 0,
        gamePlayed: gamesPlayed + 1,
      });
    } catch (error) {
      console.error('Error processing team stats:', error);
      throw error;
    }
  }

  private async processUserStats(
    players: IPlayer[],
    matchId: number,
    teamId: number,
  ): Promise<void> {
    for (const playerData of players) {
      const user = await this.userService.getUserBySteamUsername(
        playerData.username,
      );
      if (user) {
        const match = await this.getMatchById(matchId);
        const isTeam1 = match.team1Id === teamId;
        const win = isTeam1
          ? match.team1Score > match.team2Score
          : match.team2Score > match.team1Score;

        await this.historyUserStatsService.createHistoryUserStats(
          user.id,
          matchId,
          {
            kill: playerData.kda.kills,
            death: playerData.kda.deaths,
            assist: playerData.kda.assists,
            damage: playerData.damage,
            rating: 0, // Adjust as needed
            ping: playerData.ping || 0,
            win: win,
            sponsor: playerData.sponsor,
          },
        );
      }
    }
  }

  private async orderTeamsToMatchDatabase(
    analysisResult: IAnalysisResultMatch,
    match: Match,
  ): Promise<{ team1: ITeam; team2: ITeam }> {
    const team1 = await this.teamService.getTeamById(match.team1Id);
    const team2 = await this.teamService.getTeamById(match.team2Id);

    const team1Members = JSON.parse(team1.memberIds);
    const team2Members = JSON.parse(team2.memberIds);

    const team1Users = await Promise.all(
      team1Members.map((id) => this.userService.getUserById(id)),
    );
    const team2Users = await Promise.all(
      team2Members.map((id) => this.userService.getUserById(id)),
    );

    const matchTeam1 = this.findMatchingTeam(analysisResult.team1, team1Users);
    const matchTeam2 = this.findMatchingTeam(analysisResult.team2, team2Users);

    if (matchTeam1 && matchTeam2) {
      return { team1: matchTeam1, team2: matchTeam2 };
    } else if (
      this.findMatchingTeam(analysisResult.team1, team2Users) &&
      this.findMatchingTeam(analysisResult.team2, team1Users)
    ) {
      return { team1: analysisResult.team2, team2: analysisResult.team1 };
    }

    // If we can't match teams, return the original analysis result
    return { team1: analysisResult.team1, team2: analysisResult.team2 };
  }

  private findMatchingTeam(
    analysisTeam: ITeam,
    databaseUsers: User[],
  ): ITeam | null {
    const matchCount = analysisTeam.players.reduce((count, player) => {
      if (
        databaseUsers.some((user) => user.steamUsername === player.username)
      ) {
        return count + 1;
      }
      return count;
    }, 0);

    // Consider it a match if at least one player matches
    return matchCount > 0 ? analysisTeam : null;
  }

  async createMatch(tournamentId: number): Promise<any> {
    const [createdMatch] = await this.db
      .insert(matchesTable)
      .values({
        players: JSON.stringify([]),
        tournamentId,
        map: 'TBD',
        team1Score: 0,
        team2Score: 0,
        round: 0,
        status: 'pending' as const,
        discordChannelId: '',
        team1Name: '',
        team2Name: '',
        team1Id: 0,
        team2Id: 0,
      })
      .returning();
    return createdMatch;
  }

  async createMatchFromRoles(
    team1RoleInput: Role,
    team2RoleInput: Role,
    guild: Guild,
    tournamentId: number,
  ): Promise<Match | null> {
    const team1 = await this.teamService.getTeamByRoleId(
      (await this.rolesService.getRoleByDiscordId(team1RoleInput.id)).id,
    );
    const team2 = await this.teamService.getTeamByRoleId(
      (await this.rolesService.getRoleByDiscordId(team2RoleInput.id)).id,
    );

    if (!team1 || !team2) {
      return null;
    }

    console.log('ok');

    const match = await this.createMatch(tournamentId);

    const team1Role = await this.client.guilds.cache
      .get(process.env.GUILD_ID)
      .roles.fetch(team1.roleId);
    const team2Role = await this.client.guilds.cache
      .get(process.env.GUILD_ID)
      .roles.fetch(team2.roleId);

    const channel = await this.createPrivateMatchChannel(
      await this.client.guilds.fetch(process.env.GUILD_ID),
      team1Role,
      team2Role,
      match.id,
    );

    await this.db
      .update(matchesTable)
      .set({ discordChannelId: channel.id })
      .where(eq(matchesTable.id, match.id));

    return match;
  }

  private async createPrivateMatchChannel(
    guild: Guild,
    team1Role: Role,
    team2Role: Role,
    matchId: number,
  ): Promise<TextChannel> {
    const channel = await guild.channels.create({
      name: `match-${matchId}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: team1Role.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: team2Role.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: this.client.user.id, // Add permissions for the bot
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.EmbedLinks,
            PermissionsBitField.Flags.AttachFiles,
            PermissionsBitField.Flags.AddReactions,
          ],
        },
      ],
    });

    return channel;
  }

  async getMatchByChannelId(channelId: string): Promise<any> {
    const [match] = await this.db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.discordChannelId, channelId))
      .limit(1);
    return match;
  }

  async deleteMatchChannel(client: Client, channelId: string): Promise<void> {
    try {
      const channel = (await client.channels.fetch(channelId)) as TextChannel;
      if (channel) {
        await channel.delete();
      }
    } catch (error) {
      console.error('Error deleting match channel:', error);
    }
  }

  async createMatchesFromBracket(
    bracket: any,
    tournamentId: number,
  ): Promise<Match[]> {
    const createdMatches: Match[] = [];

    for (const round of bracket.rounds) {
      for (const match of round.matches) {
        const createdMatch = await this.db
          .insert(matchesTable)
          .values({
            tournamentId,
            team1Id: match.team1?.id || 0,
            team2Id: match.team2?.id || 0,
            team1Score: match.score1 || 0,
            team2Score: match.score2 || 0,
            round: round.round,
            status: 'pending' as const,
            discordChannelId: '',
            map: '',
            players: JSON.stringify([]),
            team1Name: match.team1?.name || '',
            team2Name: match.team2?.name || '',
          })
          .returning()
          .execute();

        createdMatches.push(createdMatch[0] as Match);
      }
    }

    return createdMatches;
  }

  async updateMatchDiscordChannel(
    matchId: number,
    discordChannelId: string,
  ): Promise<void> {
    await this.db
      .update(matchesTable)
      .set({ discordChannelId })
      .where(eq(matchesTable.id, matchId))
      .execute();
  }

  async updateMatchResult(
    matchId: number,
    team1Score: number,
    team2Score: number,
  ): Promise<Match> {
    const [updatedMatch] = await this.db
      .update(matchesTable)
      .set({
        team1Score,
        team2Score,
      })
      .where(eq(matchesTable.id, matchId))
      .returning();

    const tournament = await this.tournamentService.getTournamentById(
      updatedMatch.tournamentId,
    );
    let matches = Array.isArray(tournament.matches)
      ? tournament.matches
      : JSON.parse(tournament.matches);
    matches = await this.bracketService.updateBracket(matches, matchId);

    await this.tournamentService.updateTournamentMatches(
      tournament.id,
      matches,
    );

    const nextMatch = matches.find(
      (m) =>
        m.round === updatedMatch.round + 1 &&
        (m.team1Id === null || m.team2Id === null),
    );
    if (nextMatch) {
      await this.startVetoProcess(nextMatch.id, nextMatch.discordChannelId);
    } else if (updatedMatch.round === Math.ceil(Math.log2(matches.length))) {
      await this.announceTournamentWinner(tournament.id);
    }

    return updatedMatch as unknown as Match;
  }

  private isLastMatch(matches: Match[]): boolean {
    return matches.every(
      (match) => match.team1Score !== 0 || match.team2Score !== 0,
    );
  }

  private async announceTournamentWinner(tournamentId: number) {
    const tournament =
      await this.tournamentService.getTournamentById(tournamentId);
    const matches = Array.isArray(tournament.matches)
      ? tournament.matches
      : JSON.parse(tournament.matches);

    const finalMatch = matches.find(
      (m) => m.round === Math.max(...matches.map((match) => match.round)),
    );
    const winningTeamId =
      finalMatch.team1Score > finalMatch.team2Score
        ? finalMatch.team1Id
        : finalMatch.team2Id;
    const winningTeam = await this.teamService.getTeamById(winningTeamId);

    const channelName = `${tournament.region.toLowerCase()}-announcements`;
    const channelData = await this.rolesService.getChannelByName(channelName);

    if (!channelData) {
      console.error(
        `Announcement channel for region ${tournament.region} not found`,
      );
      return;
    }

    const channel = (await this.client.channels.fetch(
      channelData.discordId,
    )) as TextChannel;
    if (!channel || !(channel instanceof TextChannel)) {
      console.error('Invalid announcement channel');
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏆 Tournament Winner Announcement 🏆')
      .setDescription(
        `Congratulations to ${winningTeam.name} for winning the ${tournament.name} tournament!`,
      )
      .addFields({
        name: 'Prize',
        value: tournament.prize || 'No prize specified',
      });

    await channel.send({ embeds: [embed] });

    await this.tournamentService.updateTournamentStatus(
      tournamentId,
      'complete',
    );
  }

  async getWinner(matchId: number): Promise<string> {
    const match = await this.getMatchById(matchId);
    return match.team1Score > match.team2Score ? 'team1' : 'team2';
  }

  async createMatchFromBracket(
    matchData: any,
    tournamentId: number,
  ): Promise<Match | null> {
    const team1 = await this.teamService.getTeamByName(matchData.team1);
    const team2 = await this.teamService.getTeamByName(matchData.team2);

    if (!team1 || !team2) {
      console.log(
        `[DEBUG] One or both teams not found: ${matchData.team1}, ${matchData.team2}`,
      );
      return null;
    }

    const [createdMatch] = await this.db
      .insert(matchesTable)
      .values({
        tournamentId,
        team1Id: team1.id,
        team2Id: team2.id,
        team1Name: team1.name,
        team2Name: team2.name,
        team1Score: 0,
        team2Score: 0,
        round: matchData.round || 1,
        status: 'pending' as const,
        discordChannelId: '',
        map: '',
        players: JSON.stringify([]),
      })
      .returning();

    if (createdMatch) {
      const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
      const team1Role = await guild.roles.fetch(
        (await this.rolesService.getRoleById(team1.roleId)).discordId,
      );
      const team2Role = await guild.roles.fetch(
        (await this.rolesService.getRoleById(team2.roleId)).discordId,
      );

      const channel = await this.createPrivateMatchChannel(
        guild,
        team1Role,
        team2Role,
        createdMatch.id,
      );

      if (channel) {
        await this.db
          .update(matchesTable)
          .set({ discordChannelId: channel.id })
          .where(eq(matchesTable.id, createdMatch.id));

        createdMatch.discordChannelId = channel.id;
      } else {
        console.error(
          `Failed to create Discord channel for match ${createdMatch.id}`,
        );
      }

      return createdMatch as unknown as Match;
    }

    return null;
  }

  private async parseAndProcessResult(
    matchId: number,
    imageUrl: string,
  ): Promise<void> {
    try {
      const analysisResult = await this.updateMatchStats(matchId, imageUrl);
      // Process the analysis result
      // Update match status, team scores, etc.
      console.log('Match result processed:', analysisResult);
    } catch (error) {
      console.error('Error processing match result:', error);
      // Handle the error (e.g., notify admins, log it, etc.)
    }
  }

  async createMatchFromTeams(team1: any, team2: any): Promise<Match | null> {
    const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
    const team1Role = await guild.roles.fetch(team1.roleId);
    const team2Role = await guild.roles.fetch(team2.roleId);

    if (team1Role && team2Role) {
      return this.createMatchFromRoles(
        team1Role,
        team2Role,
        guild,
        null, // We're not associating this match with a tournament
      );
    }

    return null;
  }
}
