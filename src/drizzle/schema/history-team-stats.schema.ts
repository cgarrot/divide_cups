import {
  pgTable,
  serial,
  integer,
  timestamp,
  text,
  bigint,
} from 'drizzle-orm/pg-core';
import { teams } from './team.schema';

export const historyTeamStats = pgTable('history_team_stats', {
  id: serial('id').primaryKey(),
  teamId: bigint('team_id', { mode: 'number' })
    .notNull()
    .references(() => teams.id),
  tournamentId: integer('tournament_id').notNull(),
  matchId: integer('match_id').notNull(),
  kill: integer('kills').notNull(),
  death: integer('deaths').notNull(),
  assist: integer('assists').notNull(),
  roundsWon: integer('rounds_won').notNull(),
  roundsLost: integer('rounds_lost').notNull(),
  score: integer('score').notNull(),
  result: text('result').notNull(), // 'win', 'loss', or 'draw'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
