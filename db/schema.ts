import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', { id:text('id').primaryKey(), data:text('data').notNull(), lat:real('lat'), lng:real('lng'), visibleUntil:integer('visible_until').notNull().default(0), updatedAt:integer('updated_at').notNull() });
export const chatRequests = sqliteTable('chat_requests', { id:text('id').primaryKey(), sender:text('sender').notNull(), recipient:text('recipient').notNull(), message:text('message').notNull(), status:text('status').notNull().default('pending'), sample:integer('sample').notNull().default(0), createdAt:integer('created_at').notNull() });
export const savedItems = sqliteTable('saved_items',{id:text('id').primaryKey(), userId:text('user_id').notNull(), itemId:text('item_id').notNull(), kind:text('kind').notNull()});
export const blocks = sqliteTable('blocks',{id:text('id').primaryKey(), userId:text('user_id').notNull(), personId:text('person_id').notNull()});
export const meetups = sqliteTable('meetups',{id:text('id').primaryKey(), owner:text('owner').notNull(), data:text('data').notNull(), createdAt:integer('created_at').notNull()});
export const aiUsage = sqliteTable('ai_usage',{id:text('id').primaryKey(), count:integer('count').notNull().default(0)});

// ---------------------------------------------------------------------------
// Mobile app (Expo, /mobile) backend: email-code accounts and bearer sessions.
// Separate from the web app's ChatGPT-identity tables above so neither breaks the other.

/** One row per person. `id` is 'u_' + UUID; email is stored lowercased. */
export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [uniqueIndex('accounts_email').on(t.email)]);

/** Latest one-time sign-in code per email. Only a salted hash is stored. */
export const loginCodes = sqliteTable('login_codes', {
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: integer('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  sentAt: integer('sent_at').notNull(),
});

/** Bearer sessions. Only the SHA-256 of the token is stored. */
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
}, (t) => [index('sessions_account').on(t.accountId)]);

/**
 * Profile + preferences. `publicData` is the server-computed projection others may see; `privateData` holds
 * answers only the owner sees (challenges, wanted traits, travel distance...). lat/lng are a neighborhood
 * center, never a device position, and are cleared when discovery expires.
 */
export const memberProfiles = sqliteTable('member_profiles', {
  accountId: text('account_id').primaryKey(),
  publicData: text('public_data').notNull(),
  privateData: text('private_data').notNull(),
  areaName: text('area_name'),
  lat: real('lat'),
  lng: real('lng'),
  visibleUntil: integer('visible_until').notNull().default(0),
  photoId: text('photo_id'),
  onboarded: integer('onboarded').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [index('member_profiles_visible').on(t.visibleUntil)]);

/** Connection requests: requested -> accepted | declined | cancelled. */
export const connections = sqliteTable('connections', {
  id: text('id').primaryKey(),
  senderId: text('sender_id').notNull(),
  recipientId: text('recipient_id').notNull(),
  message: text('message').notNull(),
  status: text('status').notNull(),
  doorId: text('door_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [index('connections_sender').on(t.senderId), index('connections_recipient').on(t.recipientId)]);

/** Chat messages inside an accepted connection. */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  connectionId: text('connection_id').notNull(),
  senderId: text('sender_id').notNull(),
  text: text('text').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('messages_connection').on(t.connectionId, t.createdAt)]);

/** Blocks between mobile accounts (enforced in both directions). id = `${accountId}:${blockedId}`. */
export const memberBlocks = sqliteTable('member_blocks', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  blockedId: text('blocked_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('member_blocks_account').on(t.accountId), index('member_blocks_blocked').on(t.blockedId)]);

/** Safety reports for human review. Reporting also blocks. */
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  reporterId: text('reporter_id').notNull(),
  targetId: text('target_id').notNull(),
  reason: text('reason').notNull(),
  details: text('details').notNull().default(''),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('reports_target').on(t.targetId)]);

/** Open Door offers: a short conversation at a listed public venue within a time window. */
export const openDoors = sqliteTable('open_doors', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  venueId: text('venue_id').notNull(),
  startAt: integer('start_at').notNull(),
  endAt: integer('end_at').notNull(),
  lengthMin: integer('length_min').notNull(),
  topics: text('topics').notNull(),
  audience: text('audience').notNull(),
  endedAt: integer('ended_at'),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('open_doors_account').on(t.accountId), index('open_doors_end').on(t.endAt)]);

/** Events a member saved. id = `${accountId}:${eventId}`. */
export const savedEvents = sqliteTable('saved_events', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  eventId: text('event_id').notNull(),
}, (t) => [index('saved_events_account').on(t.accountId)]);

/** Expo push tokens per device. */
export const pushTokens = sqliteTable('push_tokens', {
  token: text('token').primaryKey(),
  accountId: text('account_id').notNull(),
  platform: text('platform').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [index('push_tokens_account').on(t.accountId)]);

/** Fixed-window rate limits. key = `${action}:${subject}`. */
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
});

/** Profile photos (JPEG/PNG/WebP, base64, at most ~300 KB). Served only to signed-in members. */
export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  mime: text('mime').notNull(),
  data: text('data').notNull(),
  createdAt: integer('created_at').notNull(),
}, (t) => [index('photos_account').on(t.accountId)]);
