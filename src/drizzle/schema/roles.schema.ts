import {
  pgTable,
  bigserial,
  text,
  timestamp,
  integer,
} from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  name: text('name').notNull().unique(),
  type: integer('type').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
