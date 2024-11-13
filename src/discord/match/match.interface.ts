import { Tournament } from '../tournament/tournament.interface';

export interface Match {
  id: number;
  tournamentId: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Score: number | null;
  team2Score: number | null;
  round: number;
  status: 'pending' | 'in_progress' | 'completed';
  discordChannelId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MatchWithTournament extends Match {
  tournament: Tournament;
}
