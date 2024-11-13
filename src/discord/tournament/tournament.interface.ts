import { Match as MatchInterface } from '../match/match.interface';

export interface Match {
  id: number;
  tournamentId: number;
  team1Id: number | null;
  team2Id: number | null;
  team1: string;
  team2: string;
  team1Score: number;
  team2Score: number;
  score1: number;
  score2: number;
  discordChannelId: string | null;
  map: string;
  status: string;
  round: number;
  players: any[]; // You might want to define a more specific type for players
  createdAt: Date;
  updatedAt: Date;
}

export interface Round {
  round: number;
  matches?: Match[];
}

export interface Bracket {
  name: string;
  rounds: Round[];
}

export type TournamentStatus =
  | 'draft'
  | 'waiting'
  | 'start'
  | 'in_progress'
  | 'complete';

export interface TournamentMatch extends MatchInterface {
  tournamentId: number;
  team1Id: number | null;
  team2Id: null;
  team1: string;
  team2: string;
  discordChannelId: string | null;
  map: string;
  round: number;
  players: any[]; // You might want to define a more specific type for players
}

export interface Tournament {
  id: number;
  name: string;
  startTime: Date;
  maxTeamLimit: number;
  prize: string;
  teams: any[] | string; // Can be an array or a JSON string
  waitingList: string;
  matches: TournamentMatch[];
  bracket: any;
  status: string;
  region: string;
  createdAt: Date;
  updatedAt: Date;
}
