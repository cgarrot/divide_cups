import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const tournamentStatusEnum = pgEnum('tournament_status', [
  'draft',
  'waiting',
  'start',
  'in_progress',
  'complete',
]);

export const tournamentRegionEnum = pgEnum('tournament_region', [
  'NA',
  'EU',
  'ASIA',
  'OCEA',
  'SA',
]);

export const tournaments = pgTable('tournaments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startTime: timestamp('start_time').notNull(),
  maxTeamLimit: integer('max_team_limit').notNull(),
  prize: text('prize').notNull(),
  teams: text('teams').notNull(),
  waitingList: text('waiting_list').notNull(),
  matches: jsonb('matches').notNull(),
  bracket: text('bracket').notNull(),
  status: text('status').notNull(),
  region: tournamentRegionEnum('region').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
