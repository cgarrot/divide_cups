// import { Injectable } from '@nestjs/common';
// import { On } from '@discord-nestjs/core';
// import { Guild, Message } from 'discord.js';
// import { TeamService } from '../team/team.service';
// import { UserService } from '../user/user.service';
// import { faker } from '@faker-js/faker';
// import { InjectDrizzle } from '../../drizzle/drizzle.decorator';
// import { DrizzleDB } from '../../drizzle/types/drizzle';
// import { teamStats } from '../../drizzle/schema/team-stats.schema';
// import { TournamentService } from '../tournament/tournament.service';
// import { MatchService } from '../match/match.service';
// import { HistoryTeamStatsService } from '../history-team-stats/history-team-stats.service';
// import { HistoryUserStatsService } from '../history-user-stats/history-user-stats.service';
// import { TeamStatsService } from '../team-stats/team-stats.service';
// import { RolesService } from '../roles/roles.service';
// import { User } from '../user/user.interface';
// import { UserStatsService } from '../user-stats/user-stats.service';

// @Injectable()
// export class FakeDataCommands {
//   constructor(
//     private readonly teamService: TeamService,
//     private readonly userService: UserService,
//     private readonly tournamentService: TournamentService,
//     private readonly matchService: MatchService,
//     private readonly historyTeamStatsService: HistoryTeamStatsService,
//     private readonly historyUserStatsService: HistoryUserStatsService,
//     private readonly teamStatsService: TeamStatsService,
//     private readonly userStatsService: UserStatsService,
//     private readonly rolesService: RolesService,
//     @InjectDrizzle() private readonly db: DrizzleDB,
//   ) {}

//   @On('messageCreate')
//   async onMessageCreate(message: Message): Promise<void> {
//     if (message.content.trim() === '!fake-data') {
//       await this.generateFakeData(message);
//     }
//   }

//   private async generateFakeData(message: Message): Promise<void> {
//     console.log('Starting fake data generation...');
//     await message.reply('Generating fake data. This may take a while...');

//     // 1. Create users
//     console.log('Creating 48 fake users...');
//     const fakeUsers = [];
//     for (let i = 0; i < 48; i++) {
//       const fakeUser = await this.createFakeUser();
//       fakeUsers.push(fakeUser);
//       console.log(`Created user ${i + 1}/48: ${fakeUser.username}`);
//     }

//     // 2. Create teams and assign users
//     console.log('Creating 16 teams with 3 users each...');
//     const createdTeams = [];
//     for (let i = 0; i < 16; i++) {
//       const teamName = faker.company.name();
//       const teamOwner = fakeUsers[i * 3];

//       const team = await this.teamService.createTeamWithoutDiscord(
//         teamOwner.id,
//         teamName,
//         [fakeUsers[i * 3 + 1].id, fakeUsers[i * 3 + 2].id],
//       );

//       await this.createFakeTeamStats(team.id);

//       createdTeams.push(team);
//       console.log(`Created team ${i + 1}/16: ${teamName}`);
//     }

//     // 3. Create tournament and register all teams
//     console.log('Creating fake tournament...');
//     const tournament = await this.createFakeTournament(createdTeams);
//     console.log(`Created tournament: ${tournament.name}`);

//     // 4. Create all matches with 2 teams per game
//     console.log('Creating fake matches...');
//     await this.matchService.createMatch(tournament.id);
//     console.log('Fake matches created');

//     // 5. Create the stats of the game in match and put a record in history users and teams
//     // 6. Update the global stats of team and user
//     console.log('Generating and updating stats...');
//     await this.generateFakeStats(tournament.id);
//     console.log('Fake stats generated and updated');

//     console.log('Fake data generation complete!');
//     await message.reply(
//       `Created 48 fake users, 16 teams with 3 players each, a tournament, matches, and stats.`,
//     );
//   }

//   private async createFakeUser(): Promise<User> {
//     const username = faker.internet.userName();
//     const discordId = faker.number
//       .int({ min: 100000000000000000, max: 999999999999999999 })
//       .toString();
//     const steamId = faker.string.numeric(17);
//     const region = faker.helpers.arrayElement(['NA', 'EU', 'ASIA', 'OCEA']);

//     const user = await this.userService.createUser(
//       username,
//       discordId,
//       steamId,
//       region,
//     );

//     await this.userStatsService.createUserStats(user.id);

//     return user;
//   }

//   private async createFakeUserStats(userId: number) {
//     const fakeStats = {
//       kills: faker.number.int({ min: 0, max: 1000 }),
//       deaths: faker.number.int({ min: 0, max: 1000 }),
//       assists: faker.number.int({ min: 0, max: 500 }),
//       headshots: faker.number.int({ min: 0, max: 500 }),
//       accuracy: faker.number.int({ min: 0, max: 100 }),
//       winRate: faker.number.int({ min: 0, max: 100 }),
//       matchesPlayed: faker.number.int({ min: 1, max: 100 }),
//     };

//     await this.userService.updateUserStats(userId, fakeStats);
//   }

//   private async createFakeTeamStats(teamId: number) {
//     const fakeStats = {
//       elo: faker.number.int({ min: 800, max: 2000 }),
//       avgKill: faker.number.float({ min: 10, max: 30 }),
//       avgAssist: faker.number.float({ min: 5, max: 15 }),
//       avgDeath: faker.number.float({ min: 10, max: 25 }),
//       avgDamage: faker.number.float({ min: 50, max: 150 }),
//       avgRating: faker.number.float({ min: 0.5, max: 1.5 }),
//       avgPing: faker.number.int({ min: 20, max: 100 }),
//       winrate: faker.number.int({ min: 0, max: 100 }),
//       gamePlayed: faker.number.int({ min: 1, max: 100 }),
//     };

//     await this.db.insert(teamStats).values({
//       teamId,
//       ...fakeStats,
//       historyIds: JSON.stringify(
//         this.generateFakeMatchHistory(fakeStats.gamePlayed),
//       ),
//     });
//   }

//   private generateFakeMatchHistory(gamesPlayed: number): number[] {
//     const historyIds = [];
//     for (let i = 0; i < gamesPlayed; i++) {
//       historyIds.push(faker.number.int({ min: 1, max: 1000 }));
//     }
//     return historyIds;
//   }

//   private async createFakeTournament(teams: any[]): Promise<any> {
//     const tournamentName = faker.company.catchPhrase();
//     const startTime = faker.date.future();
//     const maxTeamLimit = teams.length;

//     const tournament = await this.tournamentService.createTournament(
//       tournamentName,
//       startTime,
//       maxTeamLimit,
//     );

//     for (const team of teams) {
//       await this.tournamentService.addTeamToTournament(
//         tournament.id,
//         team.id,
//         team.name,
//       );
//     }

//     console.log(`Created tournament: ${tournamentName}`);
//     console.log(`Registering ${teams.length} teams for the tournament...`);
//     return tournament;
//   }

//   private async createFakeMatches(tournamentId: number): Promise<void> {
//     console.log(`Creating fake matches for tournament ${tournamentId}...`);
//     await this.matchService.createMatches(tournamentId);
//     console.log('Fake matches created');
//   }

//   private async generateFakeStats(tournamentId: number): Promise<void> {
//     const tournament =
//       await this.tournamentService.getTournamentById(tournamentId);
//     const teams = JSON.parse(tournament.teams);

//     for (const team of teams) {
//       // Create a fake match for this team
//       const opponent = teams.find((t) => t.id !== team.id);
//       const fakeMatch = await this.matchService.createMatch(
//         {
//           tournamentId: tournament.id,
//           team1Id: team.id,
//           team2Id: opponent.id,
//           discordChannelId: 'fake-channel-id',
//           map: 'de_dust2',
//           team1Name: team.name,
//           team2Name: opponent.name,
//           team1Score: Math.floor(Math.random() * 16),
//           team2Score: Math.floor(Math.random() * 16),
//           round: 1,
//           players: this.generateFakePlayers(team, opponent),
//         },
//         tournament.id,
//       );

//       const team1Stats = this.generateRandomTeamStats();
//       const team2Stats = this.generateRandomTeamStats();

//       // Create history team stats with valid match_id
//       const historyTeamStats =
//         await this.historyTeamStatsService.createHistoryTeamStats(
//           team.id,
//           tournamentId,
//           fakeMatch.id,
//           team1Stats,
//         );

//       // Update team stats
//       await this.teamStatsService.updateTeamStats(team.id, {
//         elo: await this.teamStatsService.calculateTeamElo(team.id),
//         avgKill: team1Stats.kills,
//         avgAssist: team1Stats.assists,
//         avgDeath: team1Stats.deaths,
//         avgDamage: 0, // Not provided in team1Stats, you may want to add this
//         avgRating: 0, // Not provided in team1Stats, you may want to add this
//         avgPing: 0, // Not provided in team1Stats, you may want to add this
//         winrate: team1Stats.result === 'win' ? 100 : 0,
//         gamePlayed: 1,
//         historyIds: JSON.stringify([historyTeamStats.id]),
//       });

//       // Create history user stats for each player in the team
//       const teamMembers = JSON.parse(
//         (await this.teamService.getTeamById(team.id)).memberIds,
//       );
//       for (const memberId of teamMembers) {
//         const userStats = this.generateRandomUserStats();
//         const historyUserStats =
//           await this.historyUserStatsService.createHistoryUserStats(
//             memberId,
//             fakeMatch.id,
//             userStats,
//           );

//         // Update user stats
//         await this.userStatsService.updateUserStats(memberId, {
//           avgKills: userStats.kill,
//           avgDeaths: userStats.death,
//           avgAssists: userStats.assist,
//           avgDamage: userStats.damage,
//           avgRating: userStats.rating,
//           avgPing: userStats.ping,
//           winRate: userStats.win ? 100 : 0,
//           matchesPlayed: 1,
//           wins: userStats.win ? 1 : 0,
//           losses: userStats.win ? 0 : 1,
//         });
//       }
//     }
//   }

//   private generateRandomTeamStats() {
//     return {
//       kills: faker.number.int({ min: 30, max: 100 }),
//       deaths: faker.number.int({ min: 30, max: 100 }),
//       assists: faker.number.int({ min: 10, max: 50 }),
//       roundsWon: faker.number.int({ min: 0, max: 16 }),
//       roundsLost: faker.number.int({ min: 0, max: 16 }),
//       score: faker.number.int({ min: 0, max: 16 }),
//       result: faker.helpers.arrayElement(['win', 'loss', 'draw'] as const),
//     };
//   }

//   private generateRandomUserStats() {
//     return {
//       kill: faker.number.int({ min: 0, max: 30 }),
//       assist: faker.number.int({ min: 0, max: 20 }),
//       death: faker.number.int({ min: 0, max: 30 }),
//       damage: faker.number.int({ min: 0, max: 3000 }),
//       rating: faker.number.float({ min: 0.5, max: 2.0 }),
//       ping: faker.number.int({ min: 5, max: 100 }),
//       win: faker.datatype.boolean(),
//     };
//   }

//   private generateFakePlayers(team1: any, team2: any): any[] {
//     const players = [];
//     for (const team of [team1, team2]) {
//       const memberIds = Array.isArray(team.memberIds)
//         ? team.memberIds
//         : JSON.parse(team.memberIds || '[]');
//       for (const memberId of memberIds) {
//         players.push({
//           userId: memberId,
//           teamId: team.id,
//           stats: {
//             kills: Math.floor(Math.random() * 30),
//             deaths: Math.floor(Math.random() * 20),
//             assists: Math.floor(Math.random() * 15),
//           },
//         });
//       }
//     }
//     return players;
//   }
// }
