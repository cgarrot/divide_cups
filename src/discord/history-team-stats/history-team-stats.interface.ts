export interface HistoryTeamStats {
  id: number;
  teamId: number;
  tournamentId: number;
  matchId: number;
  kill: number;
  death: number;
  assist: number;
  roundsWon: number;
  roundsLost: number;
  score: number;
  result: 'win' | 'loss' | 'draw';
  createdAt: Date;
  updatedAt: Date;
}
