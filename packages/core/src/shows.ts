import {
  channels,
  episodes,
  newSlug,
  seasons,
  shows,
  slugify,
  type Db,
  type Episode,
  type Season,
  type Show,
} from '@owotv/db'
import {
  createEpisodeInput,
  createSeasonInput,
  createShowInput,
  updateEpisodeInput,
  updateSeasonInput,
  updateShowInput,
  type ApiEpisode,
  type ApiSeason,
  type ApiShow,
  type ApiShowSummary,
  type CreateEpisodeInput,
  type CreateSeasonInput,
  type CreateShowInput,
  type UpdateEpisodeInput,
  type UpdateSeasonInput,
  type UpdateShowInput,
} from '@owotv/shared'
import { and, asc, count, eq, inArray, max, ne } from 'drizzle-orm'
import { ConflictError, NotFoundError } from './errors'

const fromDateString = (d: string) => new Date(`${d}T00:00:00Z`)
const toDateString = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Picks a slug: the one asked for (409 if taken), or one made from `text`
 * with a number added until it is free.
 */
async function pickSlug(
  wanted: string | undefined,
  text: string,
  fallback: string,
  isTaken: (slug: string) => Promise<boolean>,
) {
  if (wanted) {
    if (await isTaken(wanted)) {
      throw new ConflictError(`"${wanted}" is already used`, wanted)
    }
    return wanted
  }
  const base = slugify(text).slice(0, 72).replace(/-$/, '') || fallback
  let slug = base
  for (let n = 2; await isTaken(slug); n++) slug = `${base}-${n}`
  return slug
}

const nextSort = (current: number | null | undefined) => (current ?? -1) + 1

// Shows

export async function findShow(db: Db, slug: string) {
  return db.query.shows.findFirst({ where: eq(shows.slug, slug) })
}

async function requireShow(db: Db, slug: string) {
  const show = await findShow(db, slug)
  if (!show) throw new NotFoundError(`No show "${slug}"`)
  return show
}

export async function listApiShows(
  db: Db,
  opts: { channelId?: number } = {},
): Promise<ApiShowSummary[]> {
  // The join selects two `slug` columns, which D1 batches can't tell apart,
  // so it runs on its own.
  const [rows, [seasonCounts, episodeCounts]] = await Promise.all([
    db
      .select({ show: shows, channel: channels.slug })
      .from(shows)
      .innerJoin(channels, eq(shows.channelId, channels.id))
      .where(opts.channelId ? eq(shows.channelId, opts.channelId) : undefined)
      .orderBy(asc(shows.sort), asc(shows.id)),
    db.batch([
      db
        .select({ showId: seasons.showId, n: count() })
        .from(seasons)
        .groupBy(seasons.showId),
      db
        .select({ showId: seasons.showId, n: count() })
        .from(episodes)
        .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
        .groupBy(seasons.showId),
    ]),
  ])
  const seasonsBy = new Map(seasonCounts.map((r) => [r.showId, r.n]))
  const episodesBy = new Map(episodeCounts.map((r) => [r.showId, r.n]))
  return rows.map(({ show, channel }) => ({
    slug: show.slug,
    channel,
    name: show.name,
    description: show.description,
    coverUrl: show.coverUrl,
    logoUrl: show.logoUrl,
    sort: show.sort,
    seasonCount: seasonsBy.get(show.id) ?? 0,
    episodeCount: episodesBy.get(show.id) ?? 0,
  }))
}

function toApiEpisode(show: Show, season: Season, e: Episode): ApiEpisode {
  return {
    slug: e.slug,
    show: show.slug,
    season: season.slug,
    title: e.title,
    youtubeId: e.videoRef,
    airDate: toDateString(e.airedAt),
    durationS: e.durationS,
    thumbnailUrl: e.thumbnailUrl,
    sort: e.sort,
  }
}

export async function getApiShow(
  db: Db,
  slug: string,
): Promise<ApiShow | undefined> {
  const [row] = await db
    .select({ show: shows, channel: channels.slug })
    .from(shows)
    .innerJoin(channels, eq(shows.channelId, channels.id))
    .where(eq(shows.slug, slug))
    .limit(1)
  if (!row) return undefined
  const { show, channel } = row
  const seasonRows = await db
    .select()
    .from(seasons)
    .where(eq(seasons.showId, show.id))
    .orderBy(asc(seasons.sort), asc(seasons.id))
  const episodeRows = seasonRows.length
    ? await db
        .select()
        .from(episodes)
        .where(
          inArray(
            episodes.seasonId,
            seasonRows.map((s) => s.id),
          ),
        )
        .orderBy(asc(episodes.sort), asc(episodes.id))
    : []
  const apiSeasons: ApiSeason[] = seasonRows.map((season) => ({
    slug: season.slug,
    title: season.title,
    sort: season.sort,
    episodes: episodeRows
      .filter((e) => e.seasonId === season.id)
      .map((e) => toApiEpisode(show, season, e)),
  }))
  return {
    slug: show.slug,
    channel,
    name: show.name,
    description: show.description,
    coverUrl: show.coverUrl,
    logoUrl: show.logoUrl,
    sort: show.sort,
    seasonCount: apiSeasons.length,
    episodeCount: episodeRows.length,
    seasons: apiSeasons,
  }
}

const showSlugTaken = (db: Db, exceptId?: number) => async (slug: string) =>
  Boolean(
    await db.query.shows.findFirst({
      where: exceptId
        ? and(eq(shows.slug, slug), ne(shows.id, exceptId))
        : eq(shows.slug, slug),
      columns: { id: true },
    }),
  )

export async function createShow(
  db: Db,
  channelId: number,
  raw: CreateShowInput,
): Promise<ApiShow> {
  const input = createShowInput.parse(raw)
  const slug = await pickSlug(input.slug, input.name, 'show', showSlugTaken(db))
  const [last] = await db
    .select({ sort: max(shows.sort) })
    .from(shows)
    .where(eq(shows.channelId, channelId))
  await db.insert(shows).values({
    slug,
    channelId,
    name: input.name,
    description: input.description ?? '',
    coverUrl: input.coverUrl ?? null,
    logoUrl: input.logoUrl ?? null,
    sort: input.sort ?? nextSort(last?.sort),
  })
  return (await getApiShow(db, slug))!
}

/** `channelId` is the channel to move the show to, already access-checked. */
export async function updateShow(
  db: Db,
  slug: string,
  raw: UpdateShowInput,
  channelId?: number,
): Promise<ApiShow> {
  const input = updateShowInput.parse(raw)
  const show = await requireShow(db, slug)
  const patch: Partial<typeof shows.$inferInsert> = {}
  if (channelId !== undefined && channelId !== show.channelId) {
    patch.channelId = channelId
    const [last] = await db
      .select({ sort: max(shows.sort) })
      .from(shows)
      .where(eq(shows.channelId, channelId))
    patch.sort = nextSort(last?.sort)
  }
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.coverUrl !== undefined) patch.coverUrl = input.coverUrl
  if (input.logoUrl !== undefined) patch.logoUrl = input.logoUrl
  if (input.slug !== undefined && input.slug !== show.slug) {
    patch.slug = await pickSlug(input.slug, '', '', showSlugTaken(db, show.id))
  }
  if (Object.keys(patch).length) {
    await db.update(shows).set(patch).where(eq(shows.id, show.id))
  }
  if (input.position !== undefined) {
    const siblings = await db
      .select({ id: shows.id })
      .from(shows)
      .where(eq(shows.channelId, patch.channelId ?? show.channelId))
      .orderBy(asc(shows.sort), asc(shows.id))
    await reposition(db, shows, siblings, show.id, input.position)
  }
  return (await getApiShow(db, patch.slug ?? show.slug))!
}

/** Deletes a show with its seasons and episodes. */
export async function deleteShow(db: Db, slug: string) {
  const show = await requireShow(db, slug)
  const seasonIds = (
    await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.showId, show.id))
  ).map((s) => s.id)
  await db.batch([
    db
      .delete(episodes)
      .where(inArray(episodes.seasonId, seasonIds.length ? seasonIds : [-1])),
    db.delete(seasons).where(eq(seasons.showId, show.id)),
    db.delete(shows).where(eq(shows.id, show.id)),
  ])
}

// Seasons

async function requireSeason(db: Db, show: Show, slug: string) {
  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.showId, show.id), eq(seasons.slug, slug)),
  })
  if (!season) {
    throw new NotFoundError(`No season "${slug}" in show "${show.slug}"`)
  }
  return season
}

const seasonSlugTaken =
  (db: Db, showId: number, exceptId?: number) => async (slug: string) =>
    Boolean(
      await db.query.seasons.findFirst({
        where: and(
          eq(seasons.showId, showId),
          eq(seasons.slug, slug),
          exceptId ? ne(seasons.id, exceptId) : undefined,
        ),
        columns: { id: true },
      }),
    )

export async function createSeason(
  db: Db,
  showSlug: string,
  raw: CreateSeasonInput,
): Promise<ApiShow> {
  const input = createSeasonInput.parse(raw)
  const show = await requireShow(db, showSlug)
  const slug = await pickSlug(
    input.slug,
    input.title,
    'season',
    seasonSlugTaken(db, show.id),
  )
  const [last] = await db
    .select({ sort: max(seasons.sort) })
    .from(seasons)
    .where(eq(seasons.showId, show.id))
  await db.insert(seasons).values({
    showId: show.id,
    slug,
    title: input.title,
    sort: input.sort ?? nextSort(last?.sort),
  })
  return (await getApiShow(db, show.slug))!
}

export async function updateSeason(
  db: Db,
  showSlug: string,
  seasonSlug: string,
  raw: UpdateSeasonInput,
): Promise<ApiShow> {
  const input = updateSeasonInput.parse(raw)
  const show = await requireShow(db, showSlug)
  const season = await requireSeason(db, show, seasonSlug)
  const patch: Partial<typeof seasons.$inferInsert> = {}
  if (input.title !== undefined) patch.title = input.title
  if (input.slug !== undefined && input.slug !== season.slug) {
    patch.slug = await pickSlug(
      input.slug,
      '',
      '',
      seasonSlugTaken(db, show.id, season.id),
    )
  }
  if (Object.keys(patch).length) {
    await db.update(seasons).set(patch).where(eq(seasons.id, season.id))
  }
  if (input.position !== undefined) {
    const siblings = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(eq(seasons.showId, show.id))
      .orderBy(asc(seasons.sort), asc(seasons.id))
    await reposition(db, seasons, siblings, season.id, input.position)
  }
  return (await getApiShow(db, show.slug))!
}

/** Deletes a season with its episodes. */
export async function deleteSeason(
  db: Db,
  showSlug: string,
  seasonSlug: string,
) {
  const show = await requireShow(db, showSlug)
  const season = await requireSeason(db, show, seasonSlug)
  await db.batch([
    db.delete(episodes).where(eq(episodes.seasonId, season.id)),
    db.delete(seasons).where(eq(seasons.id, season.id)),
  ])
}

// Episodes

/** An episode with the show it belongs to, for access checks. */
export async function findEpisode(db: Db, slug: string) {
  const [row] = await db
    .select({ episode: episodes, season: seasons, show: shows })
    .from(episodes)
    .innerJoin(seasons, eq(episodes.seasonId, seasons.id))
    .innerJoin(shows, eq(seasons.showId, shows.id))
    .where(eq(episodes.slug, slug))
    .limit(1)
  return row
}

export async function getApiEpisode(db: Db, slug: string) {
  const row = await findEpisode(db, slug)
  return row ? toApiEpisode(row.show, row.season, row.episode) : undefined
}

export async function createEpisode(
  db: Db,
  showSlug: string,
  seasonSlug: string,
  raw: CreateEpisodeInput,
): Promise<ApiEpisode> {
  const input = createEpisodeInput.parse(raw)
  const show = await requireShow(db, showSlug)
  const season = await requireSeason(db, show, seasonSlug)
  const [last] = await db
    .select({ sort: max(episodes.sort) })
    .from(episodes)
    .where(eq(episodes.seasonId, season.id))
  const [row] = await db
    .insert(episodes)
    .values({
      slug: newSlug(),
      seasonId: season.id,
      title: input.title,
      airedAt: fromDateString(input.airDate),
      durationS: input.durationS,
      videoRef: input.youtubeId,
      thumbnailUrl: input.thumbnailUrl ?? null,
      sort: input.sort ?? nextSort(last?.sort),
    })
    .returning()
  return toApiEpisode(show, season, row!)
}

export async function updateEpisode(
  db: Db,
  slug: string,
  raw: UpdateEpisodeInput,
): Promise<ApiEpisode> {
  const input = updateEpisodeInput.parse(raw)
  const found = await findEpisode(db, slug)
  if (!found) throw new NotFoundError(`No episode "${slug}"`)
  const patch: Partial<typeof episodes.$inferInsert> = {}
  if (input.season !== undefined && input.season !== found.season.slug) {
    const target = await requireSeason(db, found.show, input.season)
    patch.seasonId = target.id
    const [last] = await db
      .select({ sort: max(episodes.sort) })
      .from(episodes)
      .where(eq(episodes.seasonId, target.id))
    patch.sort = nextSort(last?.sort)
  }
  if (input.title !== undefined) patch.title = input.title
  if (input.youtubeId !== undefined) patch.videoRef = input.youtubeId
  if (input.airDate !== undefined) {
    patch.airedAt = fromDateString(input.airDate)
  }
  if (input.durationS !== undefined) patch.durationS = input.durationS
  if (input.thumbnailUrl !== undefined) patch.thumbnailUrl = input.thumbnailUrl
  if (Object.keys(patch).length) {
    await db
      .update(episodes)
      .set(patch)
      .where(eq(episodes.id, found.episode.id))
  }
  if (input.position !== undefined) {
    const seasonId = patch.seasonId ?? found.season.id
    const siblings = await db
      .select({ id: episodes.id })
      .from(episodes)
      .where(eq(episodes.seasonId, seasonId))
      .orderBy(asc(episodes.sort), asc(episodes.id))
    await reposition(db, episodes, siblings, found.episode.id, input.position)
  }
  return (await getApiEpisode(db, slug))!
}

export async function deleteEpisode(db: Db, slug: string) {
  const deleted = await db
    .delete(episodes)
    .where(eq(episodes.slug, slug))
    .returning({ id: episodes.id })
  if (!deleted.length) throw new NotFoundError(`No episode "${slug}"`)
}

/**
 * Moves one item to `position` (0-based) among its siblings and renumbers
 * them all, so items imported with equal sort values can still be reordered.
 */
async function reposition(
  db: Db,
  table: typeof shows | typeof seasons | typeof episodes,
  siblings: { id: number }[],
  id: number,
  position: number,
) {
  const order = siblings.filter((s) => s.id !== id)
  order.splice(Math.min(position, order.length), 0, { id })
  const updates = order.map((s, sort) =>
    db.update(table).set({ sort }).where(eq(table.id, s.id)),
  )
  if (updates.length) await db.batch(updates as [(typeof updates)[0]])
}
