export interface HistoryUserStats {
  id: number;
  userId: number;
  matchId: number;
  kill: number;
  assist: number;
  death: number;
  damage: number;
  rating: number;
  ping: number;
  win: boolean;
  sponsor: string;
  createdAt: Date;
}
