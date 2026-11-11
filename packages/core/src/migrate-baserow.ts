import {
  channels,
  episodes,
  games,
  newSlug,
  seasons,
  shows,
  slugify,
  vodChapters,
  vods,
} from '@owotv/db'
import {
  buildChatArchive,
  type EmoteSet,
  type TwitchDownloaderChat,
} from '@owotv/shared'
import { sql } from 'drizzle-orm'
import { writeChatArchive } from './chat'
import { fetchSevenTvEmotes, writeEmoteSet } from './emotes'
import { parseDuration, parseYouTubeId } from './parse'
import { deletePrefix, mapLimit, type Store } from './store'

export interface BaserowSource {
  baseUrl: string
  token: string
  chatBaseUrl: string
  vodsPath: string
  showsPath: string
  episodesPath: string
}

export interface MigrateOptions {
  reset?: boolean
  emotes?: boolean
  onEvent?: (event: MigrateEvent) => void
}

export type MigrateEvent =
  | { type: 'step'; message: string }
  | { type: 'warn'; message: string }
  | { type: 'progress'; label: string; done: number; total: number }

export interface MigrateResult {
  vods: number
  chatLogs: number
  chatMessages: number
  games: number
  shows: number
  seasons: number
  episodes: number
  warnings: string[]
}

interface BaserowLink {
  id: number
  value: string
}

interface BaserowVod {
  Title: string
  'Stream Date': string
  Duration: string
  Game: string
  'Game Cover URL': string
  'VOD URL': string
  'Thumbnail URL': string
  'Chat Replay Path': string
}

interface BaserowShow {
  id: number
  order: string
  Name: string
  Description: string
  'Cover URL': string
  'Logo URL': string
}

interface BaserowEpisode {
  id: number
  order: string
  Title: string
  Duration: string
  'Air Date': string
  'Thumbnail URL': string
  'Video URL': string
  Season: string
  Shows: BaserowLink[]
}

type ChatFile = TwitchDownloaderChat & {
  streamer?: { name: string; login?: string; id: number | string }
  video?: { id?: string; length?: number }
}

async function fetchRows<T>(src: BaserowSource, path: string): Promise<T[]> {
  const rows: T[] = []
  let next: string | null = new URL(path, src.baseUrl).toString()
  while (next) {
    const res = await fetch(next, {
      headers: { Authorization: `Token ${src.token}` },
    })
    if (!res.ok) throw new Error(`Baserow ${res.status} for ${next}`)
    const page = (await res.json()) as { next: string | null; results: T[] }
    rows.push(...page.results)
    next = page.next?.replace(/^http:/, 'https:') ?? null
  }
  return rows
}

const dateOnly = (text: string) => new Date(`${text}T00:00:00Z`)

function uniqueSlug(base: string, taken: Set<string>) {
  let slug = base || 'untitled'
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
  taken.add(slug)
  return slug
}

export async function migrateFromBaserow(
  store: Store,
  src: BaserowSource,
  opts: MigrateOptions = {},
): Promise<MigrateResult> {
  const { db, bucket } = store
  const warnings: string[] = []
  const emit = opts.onEvent ?? (() => {})
  const warn = (message: string) => {
    warnings.push(message)
    emit({ type: 'warn', message })
  }

  const [existing] = await db
    .select({ n: sql<number>`count(*)` })
    .from(channels)
  const hasData = existing!.n > 0
  if (hasData && !opts.reset) {
    throw new Error('Database already has data. Pass --reset to replace it.')
  }

  emit({ type: 'step', message: 'Reading Baserow' })
  const [vodRows, showRows, episodeRows] = await Promise.all([
    fetchRows<BaserowVod>(src, src.vodsPath),
    fetchRows<BaserowShow>(src, src.showsPath),
    fetchRows<BaserowEpisode>(src, src.episodesPath),
  ])
  vodRows.sort((a, b) => a['Stream Date'].localeCompare(b['Stream Date']))

  const problems: string[] = []
  const check = <T>(label: string, fn: () => T): T | undefined => {
    try {
      return fn()
    } catch (err) {
      problems.push(`${label}: ${(err as Error).message}`)
    }
  }
  const parsedVods = new Map(
    vodRows.map((v) => [
      v,
      {
        durationS:
          check(`VOD "${v.Title}"`, () => parseDuration(v.Duration)) ?? 0,
        videoRef:
          check(`VOD "${v.Title}"`, () => parseYouTubeId(v['VOD URL'])) ?? '',
      },
    ]),
  )
  const parsedEpisodes = new Map(
    episodeRows.map((e) => [
      e,
      {
        durationS:
          check(`Episode "${e.Title}"`, () => parseDuration(e.Duration)) ?? 0,
        videoRef:
          check(`Episode "${e.Title}"`, () => parseYouTubeId(e['Video URL'])) ??
          '',
      },
    ]),
  )
  if (problems.length) {
    throw new Error(
      `Fix these rows in Baserow first:\n  ${problems.join('\n  ')}`,
    )
  }

  const withChat = vodRows.filter((v) => v['Chat Replay Path'])
  const chatBase = src.chatBaseUrl.replace(/\/?$/, '/')
  let fetched = 0
  const chatFiles = new Map<BaserowVod, ChatFile>()
  await mapLimit(withChat, 6, async (v) => {
    const url = new URL(v['Chat Replay Path'], chatBase)
    const res = await fetch(url)
    if (!res.ok) {
      warn(`Chat log ${res.status} for "${v.Title}" (${url.pathname})`)
    } else {
      const file = (await res.json()) as ChatFile
      if (Array.isArray(file.comments)) chatFiles.set(v, file)
      else warn(`Chat log for "${v.Title}" has no comments array`)
    }
    emit({
      type: 'progress',
      label: 'Downloading chat logs',
      done: ++fetched,
      total: withChat.length,
    })
  })

  const streamer = vodRows
    .map((v) => chatFiles.get(v)?.streamer)
    .findLast((s) => s?.login)
  if (!streamer?.login) {
    throw new Error('No chat log names a streamer, so the channel is unknown.')
  }
  const twitchId = String(streamer.id)
  for (const [v, f] of chatFiles) {
    if (f.streamer && String(f.streamer.id) !== twitchId) {
      warn(
        `"${v.Title}" belongs to ${f.streamer.name}, importing under ${streamer.name}`,
      )
    }
  }

  let emotes: EmoteSet = {}
  if (opts.emotes !== false) {
    emit({ type: 'step', message: 'Snapshotting 7TV emotes' })
    try {
      emotes = await fetchSevenTvEmotes(twitchId)
    } catch (err) {
      warn(`7TV emotes skipped: ${(err as Error).message}`)
    }
  }

  if (hasData) {
    emit({ type: 'step', message: 'Clearing existing data' })
    await db.delete(vodChapters)
    await db.delete(vods)
    await db.delete(episodes)
    await db.delete(seasons)
    await db.delete(shows)
    await db.delete(games)
    await db.delete(channels)
    await deletePrefix(bucket, 'chat/')
    await deletePrefix(bucket, 'emotes/')
  }

  emit({ type: 'step', message: 'Writing channel, games and VODs' })
  const [channel] = await db
    .insert(channels)
    .values({ slug: streamer.login, displayName: streamer.name, twitchId })
    .returning()

  const gameIds = new Map<string, number>()
  const gameSlugs = new Set<string>()
  for (const v of vodRows) {
    const key = slugify(v.Game)
    if (!v.Game || gameIds.has(key)) continue
    const [g] = await db
      .insert(games)
      .values({
        slug: uniqueSlug(key, gameSlugs),
        name: v.Game,
        coverUrl: v['Game Cover URL'] || null,
      })
      .returning({ id: games.id })
    gameIds.set(key, g!.id)
  }

  const seenTwitchIds = new Set<string>()
  const inserted: Array<{
    id: number
    slug: string
    row: BaserowVod
    durationS: number
  }> = []
  for (const v of vodRows) {
    const chat = chatFiles.get(v)
    let sourceTwitchVodId = chat?.video?.id ?? null
    if (sourceTwitchVodId && seenTwitchIds.has(sourceTwitchVodId)) {
      warn(
        `"${v.Title}" reuses Twitch VOD ${sourceTwitchVodId}, leaving it unlinked`,
      )
      sourceTwitchVodId = null
    }
    if (sourceTwitchVodId) seenTwitchIds.add(sourceTwitchVodId)

    const { durationS, videoRef } = parsedVods.get(v)!
    const [row] = await db
      .insert(vods)
      .values({
        slug: newSlug(),
        channelId: channel!.id,
        title: v.Title,
        streamedAt: dateOnly(v['Stream Date']),
        durationS,
        primaryGameId: gameIds.get(slugify(v.Game)) ?? null,
        videoRef,
        thumbnailUrl: v['Thumbnail URL'] || null,
        sourceTwitchVodId,
      })
      .returning({ id: vods.id, slug: vods.slug })
    inserted.push({ ...row!, row: v, durationS })
  }

  const emoteSet = await writeEmoteSet(bucket, emotes)

  let written = 0
  let chatMessages = 0
  const chatVods = inserted.filter((v) => chatFiles.has(v.row))
  await mapLimit(chatVods, 4, async (v) => {
    const archive = buildChatArchive(chatFiles.get(v.row)!, {
      durationS: v.durationS,
      emoteSet,
    })
    await writeChatArchive(store, v, archive)
    chatMessages += archive.manifest.messageCount
    emit({
      type: 'progress',
      label: 'Uploading chat',
      done: ++written,
      total: chatVods.length,
    })
  })

  emit({ type: 'step', message: 'Writing shows' })
  const showSlugs = new Set<string>()
  const episodeCounts = { seasons: 0, episodes: 0 }
  const showIds = new Map<number, number>()
  const sortedShows = [...showRows].sort(
    (a, b) => Number(a.order) - Number(b.order),
  )
  for (const [i, s] of sortedShows.entries()) {
    const [row] = await db
      .insert(shows)
      .values({
        slug: uniqueSlug(slugify(s.Name), showSlugs),
        channelId: channel!.id,
        name: s.Name,
        description: s.Description ?? '',
        coverUrl: s['Cover URL'] || null,
        logoUrl: s['Logo URL'] || null,
        sort: i,
      })
      .returning({ id: shows.id })
    showIds.set(s.id, row!.id)
  }

  const bySeason = new Map<string, BaserowEpisode[]>()
  for (const e of episodeRows) {
    const link = e.Shows[0]
    if (!link || !showIds.has(link.id)) {
      warn(`Episode "${e.Title}" has no show, skipped`)
      continue
    }
    if (e.Shows.length > 1) {
      warn(
        `Episode "${e.Title}" is in ${e.Shows.length} shows, keeping "${link.value}"`,
      )
    }
    const key = `${link.id}\u0000${e.Season}`
    bySeason.set(key, [...(bySeason.get(key) ?? []), e])
  }

  const byAirThenOrder = (a: BaserowEpisode, b: BaserowEpisode) =>
    a['Air Date'].localeCompare(b['Air Date']) ||
    Number(a.order) - Number(b.order)
  const seasonGroups = [...bySeason.entries()]
    .map(([key, eps]) => ({ key, eps: eps.sort(byAirThenOrder) }))
    .sort((a, b) => byAirThenOrder(a.eps[0]!, b.eps[0]!))

  const seasonSlugs = new Map<number, Set<string>>()
  const seasonSort = new Map<number, number>()
  for (const { key, eps } of seasonGroups) {
    const [showKey, title] = key.split('\u0000') as [string, string]
    const showId = showIds.get(Number(showKey))!
    const taken = seasonSlugs.get(showId) ?? new Set<string>()
    seasonSlugs.set(showId, taken)
    const sort = seasonSort.get(showId) ?? 0
    seasonSort.set(showId, sort + 1)

    const [season] = await db
      .insert(seasons)
      .values({ showId, slug: uniqueSlug(slugify(title), taken), title, sort })
      .returning({ id: seasons.id })
    episodeCounts.seasons++

    for (const [i, e] of eps.entries()) {
      await db.insert(episodes).values({
        slug: newSlug(),
        seasonId: season!.id,
        title: e.Title,
        airedAt: dateOnly(e['Air Date']),
        ...parsedEpisodes.get(e)!,
        thumbnailUrl: e['Thumbnail URL'] || null,
        sort: i,
      })
      episodeCounts.episodes++
    }
  }

  return {
    vods: inserted.length,
    chatLogs: chatVods.length,
    chatMessages,
    games: gameIds.size,
    shows: showIds.size,
    ...episodeCounts,
    warnings,
  }
}
