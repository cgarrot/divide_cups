import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  bigserial,
  bigint,
  varchar,
} from 'drizzle-orm/pg-core';
import { teams } from './team.schema';

export const users = pgTable(
  'users',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    username: text('username').notNull(),
    discordId: varchar('discord_id', { length: 20 }).notNull(),
    steamId: text('steam_id').notNull(),
    steamUsername: text('steam_username'),
    teamId: bigint('team_id', { mode: 'number' }).references(() => teams.id),
    region: text('region').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    roles: text('roles').notNull().default('[]'),
    roleDb: text('role_db').notNull(),
  },
  (t) => ({
    usersIdIndex: index('usersIdIndex').on(t.id),
  }),
);
