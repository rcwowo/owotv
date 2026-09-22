import { env } from 'cloudflare:workers'
import type { D1Database } from '@cloudflare/workers-types'

export interface Vod {
  id: string
  title: string
  streamDate: Date
  duration: string
  game: string
  gameCoverUrl: string
  vodUrl: string
  thumbnailUrl: string
  chatReplayPath?: string
}

export type D1DatabaseBinding = D1Database

export function getDb(): D1DatabaseBinding {
  const db = env.DB
  if (!db) {
    throw new Error(
      'D1 binding "DB" not found. Ensure it is defined in wrangler.jsonc.',
    )
  }
  return db
}

interface VodRow {
  id: string
  title: string
  stream_date: string
  duration: string
  game: string
  game_cover_url: string
  vod_url: string
  thumbnail_url: string
  chat_replay_path: string | null
}

function toVod(row: VodRow): Vod {
  return {
    id: row.id,
    title: row.title,
    streamDate: new Date(`${row.stream_date}T00:00:00Z`),
    duration: row.duration,
    game: row.game,
    gameCoverUrl: row.game_cover_url,
    vodUrl: row.vod_url,
    thumbnailUrl: row.thumbnail_url,
    ...(row.chat_replay_path ? { chatReplayPath: row.chat_replay_path } : {}),
  }
}

export async function getVods(db: D1DatabaseBinding): Promise<Vod[]> {
  const { results } = await db
    .prepare(
      `SELECT id, title, stream_date, duration, game, game_cover_url, vod_url, thumbnail_url, chat_replay_path
       FROM vods WHERE published = 1
       ORDER BY stream_date DESC, rank ASC`,
    )
    .all<VodRow>()
  return results.map(toVod)
}

export async function getVod(
  db: D1DatabaseBinding,
  id: string,
): Promise<Vod | null> {
  const row = await db
    .prepare(
      `SELECT id, title, stream_date, duration, game, game_cover_url, vod_url, thumbnail_url, chat_replay_path
       FROM vods WHERE id = ?1 AND published = 1`,
    )
    .bind(id)
    .first<VodRow>()
  return row ? toVod(row) : null
}
