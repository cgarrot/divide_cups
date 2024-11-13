import { bigserial, integer, pgTable, real, text } from 'drizzle-orm/pg-core';

export const teamStats = pgTable('team_stats', {
  teamId: bigserial('id', { mode: 'number' }).primaryKey(),
  elo: integer('elo').notNull().default(1000),
  avgKill: real('avg_kill').notNull().default(-1),
  avgAssist: real('avg_assist').notNull().default(-1),
  avgDeath: real('avg_death').notNull().default(-1),
  avgDamage: real('avg_damage').notNull().default(-1),
  avgRating: real('avg_rating').notNull().default(-1),
  avgPing: real('avg_ping').notNull().default(-1),
  winrate: integer('winrate').notNull().default(-1),
  gamePlayed: integer('game_played').notNull().default(-1),
  historyIds: text('history_ids').notNull().default('[]'),
});
