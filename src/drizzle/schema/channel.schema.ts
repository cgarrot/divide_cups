import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  json,
} from 'drizzle-orm/pg-core';
import { ChannelMessage } from 'src/discord/roles/channel-message.interface';

export const channels = pgTable('channels', {
  id: serial('id').primaryKey(),
  discordId: text('discord_id').notNull().unique(),
  name: text('name').notNull(),
  type: integer('type').notNull(),
  noTalk: boolean('no_talk').notNull(),
  messages: text('messages').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
