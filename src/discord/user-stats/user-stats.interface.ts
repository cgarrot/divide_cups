export interface UserStats {
  id: number;
  userId: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgDamage: number;
  avgRating: number;
  avgPing: number;
  winRate: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  createdAt: Date;
  updatedAt: Date;
}
