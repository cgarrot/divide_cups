import {
  index,
  pgTable,
  serial,
  timestamp,
  integer,
  text,
  bigserial,
  bigint,
  boolean,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { relations } from 'drizzle-orm';
import { roles } from './roles.schema';

export const teams = pgTable(
  'teams',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    roleId: bigint('role_id', { mode: 'number' })
      .notNull()
      .references(() => roles.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    voiceChannelId: text('voice_channel_id').notNull(),
    ownerId: bigint('owner_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    memberIds: text('member_ids').notNull(),
    historyMemberIds: text('history_member_ids').notNull(),
    isDisabled: boolean('is_disabled').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
  },
  (t) => ({
    idIndex: index('idIndex').on(t.id),
    ownerIdIndex: index('ownerIdIndex').on(t.ownerId),
  }),
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(users, {
    fields: [teams.ownerId],
    references: [users.id],
  }),
  members: many(users),
}));
