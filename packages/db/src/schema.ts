import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)

const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
    .$onUpdate(() => new Date())

export const videoProviders = ['youtube'] as const
export type VideoProvider = (typeof videoProviders)[number]

export const chatStatuses = ['none', 'processing', 'ready', 'failed'] as const
export type ChatStatus = (typeof chatStatuses)[number]

/** Validated against `channelLink` in `@owotv/shared` before it is written. */
export interface StoredChannelLink {
  platform: string
  url: string
}

export const channels = sqliteTable('channels', {
  id: integer('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  twitchId: text('twitch_id').unique(),
  avatarUrl: text('avatar_url'),
  bannerUrl: text('banner_url'),
  description: text('description').notNull().default(''),
  links: text('links', { mode: 'json' })
    .$type<StoredChannelLink[]>()
    .notNull()
    .default(sql`'[]'`),
  createdAt: createdAt(),
})

/** Slugs a channel used before it was renamed, so old links keep working. */
export const channelSlugAliases = sqliteTable('channel_slug_aliases', {
  slug: text('slug').primaryKey(),
  channelId: integer('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
})

export const games = sqliteTable('games', {
  id: integer('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  twitchGameId: text('twitch_game_id').unique(),
  coverUrl: text('cover_url'),
})

export const vods = sqliteTable(
  'vods',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    channelId: integer('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    streamedAt: integer('streamed_at', { mode: 'timestamp' }).notNull(),
    durationS: integer('duration_s').notNull(),
    primaryGameId: integer('primary_game_id').references(() => games.id, {
      onDelete: 'set null',
    }),
    videoProvider: text('video_provider', { enum: videoProviders })
      .notNull()
      .default('youtube'),
    videoRef: text('video_ref').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    sourceTwitchVodId: text('source_twitch_vod_id').unique(),
    chatStatus: text('chat_status', { enum: chatStatuses })
      .notNull()
      .default('none'),
    chatMessageCount: integer('chat_message_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('vods_streamed_at_idx').on(t.streamedAt),
    index('vods_channel_streamed_at_idx').on(t.channelId, t.streamedAt),
    index('vods_game_streamed_at_idx').on(t.primaryGameId, t.streamedAt),
  ],
)

export const vodChapters = sqliteTable(
  'vod_chapters',
  {
    vodId: integer('vod_id')
      .notNull()
      .references(() => vods.id, { onDelete: 'cascade' }),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'restrict' }),
    startS: integer('start_s').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.vodId, t.startS] }),
    index('vod_chapters_game_idx').on(t.gameId, t.vodId),
  ],
)

export const shows = sqliteTable(
  'shows',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    channelId: integer('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    coverUrl: text('cover_url'),
    logoUrl: text('logo_url'),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('shows_channel_sort_idx').on(t.channelId, t.sort)],
)

export const seasons = sqliteTable(
  'seasons',
  {
    id: integer('id').primaryKey(),
    showId: integer('show_id')
      .notNull()
      .references(() => shows.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [uniqueIndex('seasons_show_slug_idx').on(t.showId, t.slug)],
)

export const episodes = sqliteTable(
  'episodes',
  {
    id: integer('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    airedAt: integer('aired_at', { mode: 'timestamp' }).notNull(),
    durationS: integer('duration_s').notNull(),
    videoProvider: text('video_provider', { enum: videoProviders })
      .notNull()
      .default('youtube'),
    videoRef: text('video_ref').notNull(),
    thumbnailUrl: text('thumbnail_url'),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('episodes_season_sort_idx').on(t.seasonId, t.sort)],
)

export const tokenRoles = ['read', 'write', 'admin'] as const
export type TokenRole = (typeof tokenRoles)[number]

export const apiTokens = sqliteTable('api_tokens', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  channelId: integer('channel_id').references(() => channels.id, {
    onDelete: 'cascade',
  }),
  role: text('role', { enum: tokenRoles }).notNull(),
  createdAt: createdAt(),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
})

export type Channel = typeof channels.$inferSelect
export type ChannelSlugAlias = typeof channelSlugAliases.$inferSelect
export type Game = typeof games.$inferSelect
export type Vod = typeof vods.$inferSelect
export type NewVod = typeof vods.$inferInsert
export type VodChapter = typeof vodChapters.$inferSelect
export type Show = typeof shows.$inferSelect
export type Season = typeof seasons.$inferSelect
export type Episode = typeof episodes.$inferSelect
export type ApiToken = typeof apiTokens.$inferSelect
