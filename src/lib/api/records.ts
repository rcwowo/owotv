import type { D1Database } from '@cloudflare/workers-types'
import { env } from 'cloudflare:workers'
import { isNonEmptyString, json, normalizeDate, toIntOrNull } from './http'

/** API scope shared with auth helpers. */
export type ApiScope = 'read' | 'admin'

type Database = D1Database

export function db(): Database {
  const binding = (env as unknown as { DB?: D1Database }).DB
  if (!binding) throw new Error('D1 binding "DB" not found.')
  return binding
}

// ---------- field validation ----------
//
// Admin-generated payloads get type-checked before they ever reach D1 so
// that `{"title": 5}` or a rank of `NaN` can never be stored. Every spec
// entry is a field name with a type predicate; `undefined` means the field
// is absent and skip-listed.

const isSafeInt = (value: unknown): boolean => {
  const parsed = toIntOrNull(value)
  return parsed !== null && Number.isSafeInteger(parsed)
}

const isFlag = (value: unknown): boolean =>
  value === 0 || value === 1 || typeof value === 'boolean'

const isNullableText = (value: unknown): boolean =>
  value === null || isNonEmptyString(value)

const convertFlag = (value: unknown): number =>
  value === true ? 1 : value === false ? 0 : (value as number)

function invalidFields(
  body: Record<string, unknown>,
  spec: Record<string, (value: unknown) => boolean>,
): string {
  return Object.entries(spec)
    .filter(([field, check]) => body[field] !== undefined && !check(body[field]))
    .map(([field]) => field)
    .join(', ')
}

const VOD_FIELD_SPEC: Record<string, (value: unknown) => boolean> = {
  title: isNonEmptyString,
  stream_date: (v) => normalizeDate(v) !== null,
  duration: isNonEmptyString,
  game: isNonEmptyString,
  game_cover_url: isNonEmptyString,
  vod_url: isNonEmptyString,
  thumbnail_url: isNonEmptyString,
  chat_replay_path: isNullableText,
  published: isFlag,
  rank: isSafeInt,
}

const SHOW_FIELD_SPEC: Record<string, (value: unknown) => boolean> = {
  name: isNonEmptyString,
  description: (v) => typeof v === 'string',
  cover_url: isNonEmptyString,
  logo_url: isNonEmptyString,
  rank: isSafeInt,
}

const EPISODE_FIELD_SPEC: Record<string, (value: unknown) => boolean> = {
  title: isNonEmptyString,
  duration: isNonEmptyString,
  air_date: (v) => normalizeDate(v) !== null,
  thumbnail_url: isNonEmptyString,
  video_url: isNonEmptyString,
  season: isNonEmptyString,
  rank: isSafeInt,
}

function validationError(body: Record<string, unknown>, spec: Record<string, (value: unknown) => boolean>): Response | null {
  const bad = invalidFields(body, spec)
  if (!bad) return null
  return json({ error: `Invalid fields: ${bad}` }, 400)
}



// ---------- tables ----------

export interface VodRecord {
  id: string
  title: string
  stream_date: string
  duration: string
  game: string
  game_cover_url: string
  vod_url: string
  thumbnail_url: string
  chat_replay_path: string | null
  published: number
  rank: number
}

export interface ShowRecord {
  slug: string
  name: string
  description: string
  cover_url: string
  logo_url: string
  rank: number
}

export interface EpisodeRecord {
  id: string
  title: string
  duration: string
  air_date: string
  thumbnail_url: string
  video_url: string
  season: string
  rank: number
}

// ---------- vods ----------

const VOD_COLUMNS =
  'id, title, stream_date, duration, game, game_cover_url, vod_url, thumbnail_url, chat_replay_path, published, rank'

export function listVods(scope: ApiScope): Promise<VodRecord[]> {
  const filter = scope === 'read' ? 'WHERE published = 1' : ''
  return db()
    .prepare(`SELECT ${VOD_COLUMNS} FROM vods ${filter} ORDER BY stream_date DESC, rank ASC`)
    .all<VodRecord>()
    .then((r) => r.results)
}

export function getVodRecord(
  db: Database,
  scope: ApiScope,
  id: string,
): Promise<VodRecord | null> {
  const filter = scope === 'read' ? 'AND published = 1' : ''
  return db
    .prepare(`SELECT ${VOD_COLUMNS} FROM vods WHERE id = ?1 ${filter}`)
    .bind(id)
    .first<VodRecord>()
}

export async function createVodRecord(
  db: Database,
  body: Record<string, unknown>,
): Promise<Response> {
  const required = [
    'title',
    'stream_date',
    'duration',
    'game',
    'game_cover_url',
    'vod_url',
    'thumbnail_url',
  ] as const
  const missing = required.filter((k) => !isNonEmptyString(body[k]))
  if (missing.length > 0) {
    return json({ error: `Missing or invalid fields: ${missing.join(', ')}` }, 400)
  }
  const invalid = validationError(body, VOD_FIELD_SPEC)
  if (invalid) return invalid

  const id = isNonEmptyString(body.id) ? body.id : crypto.randomUUID()
  const exists = await db.prepare('SELECT id FROM vods WHERE id = ?1').bind(id).first()
  if (exists) return json({ error: `VOD with id "${id}" already exists` }, 409)

  await db
    .prepare(
      `INSERT INTO vods (id, title, stream_date, duration, game, game_cover_url, vod_url, thumbnail_url, chat_replay_path, published, rank)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
    )
    .bind(
      id,
      body.title,
      body.stream_date,
      body.duration,
      body.game,
      body.game_cover_url,
      body.vod_url,
      body.thumbnail_url,
      body.chat_replay_path === undefined ? null : body.chat_replay_path,
      body.published === undefined ? 0 : convertFlag(body.published),
      toIntOrNull(body.rank) ?? 0,
    )
    .run()

  const created = await getVodRecord(db, 'admin', id)
  return json(created, 201)
}

export async function updateVodRecord(
  db: Database,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const invalid = validationError(body, VOD_FIELD_SPEC)
  if (invalid) return invalid

  const fieldMap: Record<string, unknown> = {
    title: body.title,
    stream_date: body.stream_date,
    duration: body.duration,
    game: body.game,
    game_cover_url: body.game_cover_url,
    vod_url: body.vod_url,
    thumbnail_url: body.thumbnail_url,
    chat_replay_path: body.chat_replay_path,
    published:
      body.published === undefined ? undefined : convertFlag(body.published),
    rank: body.rank === undefined ? undefined : toIntOrNull(body.rank),
  }

  const sets: string[] = []
  const values: unknown[] = []
  for (const [field, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      sets.push(`${field} = ?${values.length + 1}`)
      values.push(value)
    }
  }
  if (sets.length === 0) return json({ error: 'No valid fields to update' }, 400)

  return db
    .prepare(`UPDATE vods SET ${sets.join(', ')} WHERE id = ?${values.length + 1}`)
    .bind(...values, id)
    .run()
    .then(() => getVodRecord(db, 'admin', id))
    .then((updated) => {
      if (!updated) return json({ error: `VOD "${id}" not found or already deleted` }, 404)
      return json(updated)
    })
}

export function deleteVodRecord(
  db: Database,
  id: string,
): Promise<Response> {
  return db
    .prepare('DELETE FROM vods WHERE id = ?1')
    .bind(id)
    .run()
    .then(({ meta }) => {
      if (meta.changes === 0) return json({ error: `VOD "${id}" not found` }, 404)
      return json({ deleted: id })
    })
}

// ---------- shows ----------

const SHOW_COLUMNS = 'slug, name, description, cover_url, logo_url, rank'

export function listShows(): Promise<ShowRecord[]> {
  return db()
    .prepare(`SELECT ${SHOW_COLUMNS} FROM shows ORDER BY rank ASC, name ASC`)
    .all<ShowRecord>()
    .then((r) => r.results)
}

export function getShowRecord(
  db: Database,
  slug: string,
): Promise<ShowRecord | null> {
  return db.prepare(`SELECT ${SHOW_COLUMNS} FROM shows WHERE slug = ?1`).bind(slug).first()
}

export async function createShowRecord(
  db: Database,
  body: Record<string, unknown>,
): Promise<Response> {
  const required = ['slug', 'name', 'cover_url', 'logo_url'] as const
  const missing = required.filter((k) => !isNonEmptyString(body[k]))
  if (missing.length > 0) {
    return json({ error: `Missing or invalid fields: ${missing.join(', ')}` }, 400)
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(body.slug as string)) {
    return json({ error: 'Slug must be lowercase alphanumerics or hyphens' }, 400)
  }
  const invalid = validationError(body, SHOW_FIELD_SPEC)
  if (invalid) return invalid
  const slug = body.slug as string

  const exists = await db.prepare('SELECT slug FROM shows WHERE slug = ?1').bind(slug).first()
  if (exists) return json({ error: `Show "${slug}" already exists` }, 409)

  await db
    .prepare(
      `INSERT INTO shows (slug, name, description, cover_url, logo_url, rank)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(
      slug,
      body.name,
      body.description === undefined ? '' : body.description,
      body.cover_url,
      body.logo_url,
      toIntOrNull(body.rank) ?? 0,
    )
    .run()

  return json(await getShowRecord(db, slug), 201)
}

export async function updateShowRecord(
  db: Database,
  slug: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const existing = await getShowRecord(db, slug)
  if (!existing) return json({ error: `Show "${slug}" not found` }, 404)
  const invalid = validationError(body, SHOW_FIELD_SPEC)
  if (invalid) return invalid

  const fieldMap: Record<string, unknown> = {
    name: body.name,
    description: body.description,
    cover_url: body.cover_url,
    logo_url: body.logo_url,
    rank: body.rank === undefined ? undefined : toIntOrNull(body.rank),
  }

  const sets: string[] = []
  const values: unknown[] = []
  for (const [field, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      sets.push(`${field} = ?${values.length + 1}`)
      values.push(value)
    }
  }
  if (sets.length === 0) return json({ error: 'No valid fields to update' }, 400)

  await db
    .prepare(`UPDATE shows SET ${sets.join(', ')} WHERE slug = ?${values.length + 1}`)
    .bind(...values, slug)
    .run()

  return json(await getShowRecord(db, slug))
}

export function deleteShowRecord(
  db: Database,
  slug: string,
): Promise<Response> {
  return db
    .prepare('DELETE FROM shows WHERE slug = ?1')
    .bind(slug)
    .run()
    .then(({ meta }) => {
      if (meta.changes === 0) return json({ error: `Show "${slug}" not found` }, 404)
      return json({ deleted: slug })
    })
}

// ---------- episodes ----------

const EPISODE_COLUMNS = 'id, title, duration, air_date, thumbnail_url, video_url, season, rank'

export function listEpisodes(): Promise<EpisodeRecord[]> {
  return db()
    .prepare(`SELECT ${EPISODE_COLUMNS} FROM episodes ORDER BY air_date DESC, rank ASC`)
    .all<EpisodeRecord>()
    .then((r) => r.results)
}

export function getEpisodeRecord(
  db: Database,
  id: string,
): Promise<EpisodeRecord | null> {
  return db.prepare(`SELECT ${EPISODE_COLUMNS} FROM episodes WHERE id = ?1`).bind(id).first()
}

export async function createEpisodeRecord(
  db: Database,
  body: Record<string, unknown>,
): Promise<Response> {
  const required = [
    'id',
    'title',
    'duration',
    'air_date',
    'thumbnail_url',
    'video_url',
    'season',
  ] as const
  const missing = required.filter((k) => !isNonEmptyString(body[k]))
  if (missing.length > 0) {
    return json({ error: `Missing or invalid fields: ${missing.join(', ')}` }, 400)
  }
  const invalid = validationError(body, EPISODE_FIELD_SPEC)
  if (invalid) return invalid
  const id = body.id as string

  const exists = await db
    .prepare('SELECT id FROM episodes WHERE id = ?1')
    .bind(id)
    .first()
  if (exists) return json({ error: `Episode "${id}" already exists` }, 409)

  await db
    .prepare(
      `INSERT INTO episodes (id, title, duration, air_date, thumbnail_url, video_url, season, rank)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      id,
      body.title,
      body.duration,
      body.air_date,
      body.thumbnail_url,
      body.video_url,
      body.season,
      toIntOrNull(body.rank) ?? 0,
    )
    .run()

  return json(await getEpisodeRecord(db, id), 201)
}

export async function updateEpisodeRecord(
  db: Database,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const existing = await getEpisodeRecord(db, id)
  if (!existing) return json({ error: `Episode "${id}" not found` }, 404)
  const invalid = validationError(body, EPISODE_FIELD_SPEC)
  if (invalid) return invalid

  const fieldMap: Record<string, unknown> = {
    title: body.title,
    duration: body.duration,
    air_date: body.air_date,
    thumbnail_url: body.thumbnail_url,
    video_url: body.video_url,
    season: body.season,
    rank: body.rank === undefined ? undefined : toIntOrNull(body.rank),
  }

  const sets: string[] = []
  const values: unknown[] = []
  for (const [field, value] of Object.entries(fieldMap)) {
    if (value !== undefined) {
      sets.push(`${field} = ?${values.length + 1}`)
      values.push(value)
    }
  }
  if (sets.length === 0) return json(existing)

  await db
    .prepare(`UPDATE episodes SET ${sets.join(', ')} WHERE id = ?${values.length + 1}`)
    .bind(...values, id)
    .run()

  return json(await getEpisodeRecord(db, id))
}

export function deleteEpisodeRecord(
  db: Database,
  id: string,
): Promise<Response> {
  return db
    .prepare('DELETE FROM episodes WHERE id = ?1')
    .bind(id)
    .run()
    .then(({ meta }) => {
      if (meta.changes === 0) return json({ error: `Episode "${id}" not found` }, 404)
      return json({ deleted: id })
    })
}

// ---------- show/episode links ----------

export async function listEpisodeIdsForShow(
  db: Database,
  slug: string,
): Promise<string[] | null> {
  const show = await db.prepare('SELECT slug FROM shows WHERE slug = ?1').bind(slug).first()
  if (!show) return null
  const { results } = await db
    .prepare('SELECT episode_id FROM show_episodes WHERE show_slug = ?1')
    .bind(slug)
    .all<{ episode_id: string }>()
  return results.map((r) => r.episode_id)
}

export async function linkEpisodeToShow(
  db: Database,
  slug: string,
  episodeId: string,
): Promise<Response> {
  const show = await db.prepare('SELECT slug FROM shows WHERE slug = ?1').bind(slug).first()
  if (!show) return json({ error: `Show "${slug}" not found` }, 404)

  const episode = await db
    .prepare('SELECT id FROM episodes WHERE id = ?1')
    .bind(episodeId)
    .first()
  if (!episode) return json({ error: `Episode "${episodeId}" not found` }, 404)

  await db
    .prepare(
      'INSERT OR IGNORE INTO show_episodes (show_slug, episode_id) VALUES (?1, ?2)',
    )
    .bind(slug, episodeId)
    .run()

  return json({ show_slug: slug, episode_id: episodeId })
}

export async function unlinkEpisodeFromShow(
  db: Database,
  slug: string,
  episodeId: string,
): Promise<Response> {
  const { meta } = await db
    .prepare('DELETE FROM show_episodes WHERE show_slug = ?1 AND episode_id = ?2')
    .bind(slug, episodeId)
    .run()
  if (meta.changes === 0) {
    return json({ error: 'Link not found' }, 404)
  }
  return json({ unlinked: { show_slug: slug, episode_id: episodeId } })
}
