import {
  channels,
  games,
  newSlug,
  slugify,
  vodChapters,
  vods,
  type Db,
} from '@owotv/db'
import {
  chatManifestKey,
  chatSegmentKey,
  createVodInput,
  type ApiVod,
  type ChatManifest,
  type CreateVodInput,
  type GameChapterInput,
  type UpdateVodInput,
} from '@owotv/shared'
import { desc, eq } from 'drizzle-orm'
import { ConflictError, NotFoundError } from './errors'
import { deletePrefix, type Store } from './store'

const fromDateString = (d: string) => new Date(`${d}T00:00:00Z`)
const toDateString = (d: Date) => d.toISOString().slice(0, 10)

export async function upsertGame(db: Db, game: GameChapterInput) {
  const byTwitch = game.twitchGameId
    ? await db.query.games.findFirst({
        where: eq(games.twitchGameId, game.twitchGameId),
      })
    : undefined
  let slug = slugify(game.name) || `game-${game.twitchGameId ?? newSlug()}`
  const bySlug = byTwitch
    ? undefined
    : await db.query.games.findFirst({ where: eq(games.slug, slug) })
  const sameGame =
    bySlug && (!bySlug.twitchGameId || !game.twitchGameId) ? bySlug : undefined
  if (bySlug && !sameGame) slug = `${slug}-${game.twitchGameId}`
  const existing = byTwitch ?? sameGame

  if (existing) {
    const patch: Partial<typeof games.$inferInsert> = {}
    if (!existing.twitchGameId && game.twitchGameId) {
      patch.twitchGameId = game.twitchGameId
    }
    if (!existing.coverUrl && game.coverUrl) patch.coverUrl = game.coverUrl
    if (Object.keys(patch).length) {
      await db.update(games).set(patch).where(eq(games.id, existing.id))
    }
    return existing.id
  }

  const [row] = await db
    .insert(games)
    .values({
      slug,
      name: game.name,
      twitchGameId: game.twitchGameId ?? null,
      coverUrl: game.coverUrl ?? null,
    })
    .returning({ id: games.id })
  return row!.id
}

export function primaryChapter(
  chapters: GameChapterInput[],
  durationS: number,
  keyOf: (ch: GameChapterInput) => unknown = (ch) =>
    ch.twitchGameId ?? slugify(ch.name),
): GameChapterInput | undefined {
  const sorted = [...chapters].sort((a, b) => a.startS - b.startS)
  const totals = new Map<
    unknown,
    { chapter: GameChapterInput; seconds: number }
  >()
  for (const [i, ch] of sorted.entries()) {
    const end = sorted[i + 1]?.startS ?? durationS
    const key = keyOf(ch)
    const entry = totals.get(key) ?? { chapter: ch, seconds: 0 }
    entry.seconds += Math.max(0, end - ch.startS)
    totals.set(key, entry)
  }
  let best: { chapter: GameChapterInput; seconds: number } | undefined
  for (const entry of totals.values()) {
    if (!best || entry.seconds > best.seconds) best = entry
  }
  return best?.chapter
}

const apiVodColumns = {
  slug: vods.slug,
  channel: channels.slug,
  title: vods.title,
  streamedAt: vods.streamedAt,
  durationS: vods.durationS,
  youtubeId: vods.videoRef,
  thumbnailUrl: vods.thumbnailUrl,
  game: games.name,
  sourceTwitchVodId: vods.sourceTwitchVodId,
  chatStatus: vods.chatStatus,
  chatMessageCount: vods.chatMessageCount,
}

const selectApiVods = (db: Db) =>
  db
    .select(apiVodColumns)
    .from(vods)
    .innerJoin(channels, eq(vods.channelId, channels.id))
    .leftJoin(games, eq(vods.primaryGameId, games.id))

function toApiVod({
  streamedAt,
  ...row
}: Awaited<ReturnType<typeof selectApiVods>>[number]): ApiVod {
  return { ...row, streamDate: toDateString(streamedAt) }
}

export async function getApiVod(db: Db, slug: string) {
  const [row] = await selectApiVods(db).where(eq(vods.slug, slug)).limit(1)
  return row ? toApiVod(row) : undefined
}

export async function listApiVods(
  db: Db,
  opts: { channelId?: number; limit: number; offset: number },
) {
  const rows = await selectApiVods(db)
    .where(opts.channelId ? eq(vods.channelId, opts.channelId) : undefined)
    .orderBy(desc(vods.streamedAt), desc(vods.id))
    .limit(opts.limit)
    .offset(opts.offset)
  return rows.map(toApiVod)
}

export async function createVod(
  db: Db,
  channelId: number,
  raw: CreateVodInput,
): Promise<ApiVod> {
  const input = createVodInput.parse(raw)

  if (input.sourceTwitchVodId) {
    const dupe = await db.query.vods.findFirst({
      where: eq(vods.sourceTwitchVodId, input.sourceTwitchVodId),
      columns: { slug: true },
    })
    if (dupe) {
      throw new ConflictError(
        `Twitch VOD ${input.sourceTwitchVodId} is already archived`,
        dupe.slug,
      )
    }
  }

  const gameIds = new Map<GameChapterInput, number>()
  for (const ch of input.chapters) gameIds.set(ch, await upsertGame(db, ch))
  const primary = primaryChapter(input.chapters, input.durationS, (ch) =>
    gameIds.get(ch),
  )

  const [row] = await db
    .insert(vods)
    .values({
      slug: newSlug(),
      channelId,
      title: input.title,
      streamedAt: fromDateString(input.streamDate),
      durationS: input.durationS,
      primaryGameId: primary ? gameIds.get(primary)! : null,
      videoRef: input.youtubeId,
      thumbnailUrl: input.thumbnailUrl ?? null,
      sourceTwitchVodId: input.sourceTwitchVodId ?? null,
    })
    .returning({ id: vods.id, slug: vods.slug })
    .catch(async (err) => {
      if (!input.sourceTwitchVodId) throw err
      const dupe = await db.query.vods.findFirst({
        where: eq(vods.sourceTwitchVodId, input.sourceTwitchVodId),
        columns: { slug: true },
      })
      if (!dupe) throw err
      throw new ConflictError(
        `Twitch VOD ${input.sourceTwitchVodId} is already archived`,
        dupe.slug,
      )
    })

  const distinctStarts = new Map<number, number>()
  for (const ch of input.chapters)
    distinctStarts.set(ch.startS, gameIds.get(ch)!)
  if (distinctStarts.size > 1) {
    const rows = [...distinctStarts].map(([startS, gameId]) => ({
      vodId: row!.id,
      gameId,
      startS,
    }))
    try {
      for (let i = 0; i < rows.length; i += 30) {
        await db.insert(vodChapters).values(rows.slice(i, i + 30))
      }
    } catch (err) {
      await db.delete(vods).where(eq(vods.id, row!.id))
      throw err
    }
  }

  return (await getApiVod(db, row!.slug))!
}

/** `channelId` is the channel to move the VOD to, already access-checked. */
export async function updateVod(
  db: Db,
  slug: string,
  input: UpdateVodInput,
  channelId?: number,
) {
  const patch: Partial<typeof vods.$inferInsert> = {}
  if (channelId !== undefined) patch.channelId = channelId
  if (input.title !== undefined) patch.title = input.title
  if (input.streamDate !== undefined) {
    patch.streamedAt = fromDateString(input.streamDate)
  }
  if (input.durationS !== undefined) patch.durationS = input.durationS
  if (input.youtubeId !== undefined) patch.videoRef = input.youtubeId
  if (input.thumbnailUrl !== undefined) patch.thumbnailUrl = input.thumbnailUrl

  if (Object.keys(patch).length) {
    const updated = await db
      .update(vods)
      .set(patch)
      .where(eq(vods.slug, slug))
      .returning({ id: vods.id })
    if (!updated.length) throw new NotFoundError(`No VOD "${slug}"`)
  }
  const vod = await getApiVod(db, slug)
  if (!vod) throw new NotFoundError(`No VOD "${slug}"`)
  return vod
}

export async function deleteVod(store: Store, slug: string) {
  const deleted = await store.db
    .delete(vods)
    .where(eq(vods.slug, slug))
    .returning({ id: vods.id })
  if (!deleted.length) throw new NotFoundError(`No VOD "${slug}"`)
  await deletePrefix(store.bucket, `chat/${slug}/`)
}

export async function finalizeChat(
  store: Store,
  slug: string,
  manifest: ChatManifest,
) {
  const vod = await store.db.query.vods.findFirst({
    where: eq(vods.slug, slug),
    columns: { id: true },
  })
  if (!vod) throw new NotFoundError(`No VOD "${slug}"`)

  const expected = new Set(
    manifest.segments.flatMap((count, n) =>
      count > 0 ? [chatSegmentKey(slug, n)] : [],
    ),
  )
  const present = new Set<string>()
  const stale: string[] = []
  let cursor: string | undefined
  do {
    const page = await store.bucket.list({ prefix: `chat/${slug}/`, cursor })
    for (const { key } of page.objects) {
      if (expected.has(key)) present.add(key)
      else if (key !== chatManifestKey(slug)) stale.push(key)
    }
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  const missing = [...expected].filter((k) => !present.has(k))
  if (missing.length) {
    throw new ConflictError(`Chat segments not uploaded: ${missing.join(', ')}`)
  }

  await store.bucket.put(chatManifestKey(slug), JSON.stringify(manifest), {
    httpMetadata: { contentType: 'application/json' },
  })
  if (stale.length) await store.bucket.delete(stale)
  await store.db
    .update(vods)
    .set({ chatStatus: 'ready', chatMessageCount: manifest.messageCount })
    .where(eq(vods.id, vod.id))
}

export async function deleteChat(store: Store, slug: string) {
  const updated = await store.db
    .update(vods)
    .set({ chatStatus: 'none', chatMessageCount: 0 })
    .where(eq(vods.slug, slug))
    .returning({ id: vods.id })
  if (!updated.length) throw new NotFoundError(`No VOD "${slug}"`)
  await deletePrefix(store.bucket, `chat/${slug}/`)
}
