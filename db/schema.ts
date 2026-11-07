import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', { id:text('id').primaryKey(), data:text('data').notNull(), lat:real('lat'), lng:real('lng'), visibleUntil:integer('visible_until').notNull().default(0), updatedAt:integer('updated_at').notNull() });
export const chatRequests = sqliteTable('chat_requests', { id:text('id').primaryKey(), sender:text('sender').notNull(), recipient:text('recipient').notNull(), message:text('message').notNull(), status:text('status').notNull().default('pending'), sample:integer('sample').notNull().default(0), createdAt:integer('created_at').notNull() });
export const savedItems = sqliteTable('saved_items',{id:text('id').primaryKey(), userId:text('user_id').notNull(), itemId:text('item_id').notNull(), kind:text('kind').notNull()});
export const blocks = sqliteTable('blocks',{id:text('id').primaryKey(), userId:text('user_id').notNull(), personId:text('person_id').notNull()});
export const meetups = sqliteTable('meetups',{id:text('id').primaryKey(), owner:text('owner').notNull(), data:text('data').notNull(), createdAt:integer('created_at').notNull()});
export const aiUsage = sqliteTable('ai_usage',{id:text('id').primaryKey(), count:integer('count').notNull().default(0)});
