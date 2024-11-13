import {
  pgTable,
  serial,
  bigint,
  integer,
  timestamp,
  real,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const userStats = pgTable('user_stats', {
  id: serial('id').primaryKey(),
  userId: bigint('user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id),
  avgKills: real('avg_kills').notNull().default(-1),
  avgDeaths: real('avg_deaths').notNull().default(-1),
  avgAssists: real('avg_assists').notNull().default(-1),
  avgDamage: real('avg_damage').notNull().default(-1),
  avgRating: real('avg_rating').notNull().default(-1),
  avgPing: real('avg_ping').notNull().default(-1),
  winRate: real('win_rate').notNull().default(-1),
  matchesPlayed: integer('matches_played').notNull().default(-1),
  wins: integer('wins').notNull().default(-1),
  losses: integer('losses').notNull().default(-1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
