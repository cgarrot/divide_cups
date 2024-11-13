import {
  pgTable,
  serial,
  timestamp,
  text,
  integer,
  json,
  bigint,
  varchar,
} from 'drizzle-orm/pg-core';

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  tournamentId: integer('tournament_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  players: json('players').notNull(), // List of players with team in JSON string
  discordChannelId: text('discord_channel_id').notNull(),
  map: text('map').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  team1Name: text('team1_name').notNull(),
  team2Name: text('team2_name').notNull(),
  team1Score: integer('team1_score').notNull(),
  team2Score: integer('team2_score').notNull(),
  team1Id: bigint('team1_id', { mode: 'number' }).notNull(),
  team2Id: bigint('team2_id', { mode: 'number' }).notNull(),
  screenshots: text('screenshots').array(), // Array of screenshot URLs
  round: integer('round').notNull(),
});
