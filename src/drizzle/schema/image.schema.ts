import { pgTable, serial, text, timestamp, bigint } from 'drizzle-orm/pg-core';

export const images = pgTable('images', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  name: text('name').notNull(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  analysis: text('analysis').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
