export interface TeamStats {
  teamId: number;
  elo: number;
  avgKill: number;
  avgAssist: number;
  avgDeath: number;
  avgDamage: number;
  avgRating: number;
  avgPing: number;
  winrate: number;
  gamePlayed: number;
  historyIds: string;
}
