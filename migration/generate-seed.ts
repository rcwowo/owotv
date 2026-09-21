#!/usr/bin/env bun

type BaserowLink = { id: number; value: string; order: string }

type BaserowVod = {
  id: number
  order: string
  Title: string
  'Stream Date': string
  Duration: string
  Game: string
  'Game Cover URL': string
  'VOD URL': string
  'Thumbnail URL': string
  'Chat Replay Path': string
  Published: boolean
  UUID: string
}

type BaserowShow = {
  id: number
  order: string
  Name: string
  Description: string
  'Cover URL': string
  'Logo URL': string
  Episodes?: BaserowLink[]
}

type BaserowEpisode = {
  id: number
  order: string
  Title: string
  Duration: string
  'Air Date': string
  'Thumbnail URL': string
  'Video URL': string
  Season: string
  Shows?: BaserowLink[]
}

const UUID_V5_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

// One legacy Baserow row has a mangled UUID; the site has always served the valid form.
const UUID_REPAIR: Record<string, string> = {
  'f148e38a-4870-a5d2-da170c768201': 'f148e38a-47f3-4870-a5d2-da170c768201',
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function vodId(vod: BaserowVod): string {
  const uuid = vod.UUID.toLowerCase()
  if (UUID_RE.test(uuid)) return uuid
  const repaired = UUID_REPAIR[uuid]
  if (repaired) return repaired
  throw new Error(`Unrecognized malformed VOD UUID: ${vod.UUID}`)
}

function sqlString(value: string | undefined | null): string {
  if (value === undefined || value === null || value === '') return 'NULL'
  return `'${value.replaceAll("'", "''")}'`
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

async function load<T>(file: string): Promise<T[]> {
  return JSON.parse(await Bun.file(`${EXPORT_DIR}${file}`).text())
}

const EXPORT_DIR = new URL('./baserow-export/', import.meta.url).pathname

const vods = await load<BaserowVod>('vods.json')
const shows = await load<BaserowShow>('shows.json')
const episodes = await load<BaserowEpisode>('episodes.json')

const showNameById = new Map<number, string>()
for (const show of shows) showNameById.set(show.id, show.Name)

const statements: string[] = ['BEGIN TRANSACTION;']

for (const vod of vods) {
  const chatPath =
    vod['Chat Replay Path'] === '' ? null : vod['Chat Replay Path']
  statements.push(
    `INSERT INTO vods (id, title, stream_date, duration, game, game_cover_url, vod_url, thumbnail_url, chat_replay_path, published, rank) VALUES (${sqlString(vodId(vod))}, ${sqlString(vod.Title)}, ${sqlString(vod['Stream Date'])}, ${sqlString(vod.Duration)}, ${sqlString(vod.Game)}, ${sqlString(vod['Game Cover URL'])}, ${sqlString(vod['VOD URL'])}, ${sqlString(vod['Thumbnail URL'])}, ${sqlString(chatPath)}, ${vod.Published ? 1 : 0}, ${vod.id});`,
  )
}

for (const show of shows) {
  statements.push(
    `INSERT INTO shows (slug, name, description, cover_url, logo_url, rank) VALUES (${sqlString(slug(show.Name))}, ${sqlString(show.Name)}, ${sqlString(show.Description)}, ${sqlString(show['Cover URL'])}, ${sqlString(show['Logo URL'])}, ${show.id});`,
  )
}

async function uuidV5String(name: string): Promise<string> {
  const ns = new TextEncoder().encode(UUID_V5_NS)
  const data = new TextEncoder().encode(name)
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-1', new Uint8Array([...ns.slice(0, 16), ...data])),
  )
  const hex = Array.from(digest.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

const promises = episodes.map(async (episode) => {
  const showLinks = episode.Shows ?? []
  const showName = showNameById.get(showLinks[0]?.id ?? -1) ?? 'unknown'
  const key = `${showName}|${episode.Season}|${episode.Title}`
  const id = await uuidV5String(key)
  return { episode, id }
})

const resolved = await Promise.all(promises)

for (const { episode, id } of resolved) {
  statements.push(
    `INSERT INTO episodes (id, title, duration, air_date, thumbnail_url, video_url, season, rank) VALUES (${sqlString(id)}, ${sqlString(episode.Title)}, ${sqlString(episode.Duration)}, ${sqlString(episode['Air Date'])}, ${sqlString(episode['Thumbnail URL'])}, ${sqlString(episode['Video URL'])}, ${sqlString(episode.Season)}, ${episode.id});`,
  )
}

for (const { episode, id } of resolved) {
  for (const link of episode.Shows ?? []) {
    const showSlug = slug(showNameById.get(link.id) ?? '')
    if (!showSlug) continue
    statements.push(
      `INSERT INTO show_episodes (show_slug, episode_id) VALUES (${sqlString(showSlug)}, ${sqlString(id)}) ON CONFLICT DO NOTHING;`,
    )
  }
}

statements.push('COMMIT;')

await Bun.write(
  new URL('./seed.sql', import.meta.url),
  statements.join('\n') + '\n',
)

console.log(
  `seed.sql written: ${vods.length} vods, ${shows.length} shows, ${episodes.length} episodes, ` +
    `${episodes.reduce((n, e) => n + (e.Shows?.length ?? 0), 0)} show-episode links`,
)
