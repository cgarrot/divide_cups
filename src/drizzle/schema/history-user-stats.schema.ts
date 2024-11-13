import {
  integer,
  pgTable,
  boolean,
  bigserial,
  bigint,
  timestamp,
  text,
} from 'drizzle-orm/pg-core';

export const historyUserStats = pgTable('history_user_stats', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  matchId: bigint('match_id', { mode: 'number' }).notNull(),
  kill: integer('kill').notNull(),
  assist: integer('assist').notNull(),
  death: integer('death').notNull(),
  damage: integer('damage').notNull(),
  rating: integer('rating').notNull(),
  ping: integer('ping').notNull(),
  win: boolean('win').notNull(),
  sponsor: text('sponsor'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
