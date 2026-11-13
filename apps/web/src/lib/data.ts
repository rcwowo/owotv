import { channels, createDb, games, vods } from '@owotv/db'
import { env } from 'cloudflare:workers'
import { and, count, desc, eq, gte, lt, max, sql, type SQL } from 'drizzle-orm'

export const db = () => createDb(env.DB)

export interface GameRef {
  slug: string
  name: string
  coverUrl: string | null
}

export interface ChannelRef {
  slug: string
  displayName: string
  avatarUrl: string | null
}

export interface VodSummary {
  slug: string
  title: string
  streamedAt: Date
  durationS: number
  duration: string
  thumbnailUrl: string
  youtubeId: string
  hasChat: boolean
  game: GameRef | null
  channel: ChannelRef
}

export interface GameSummary extends GameRef {
  vodCount: number
  latestAt: Date
}

export interface MonthSummary {
  slug: string
  label: string
  year: number
  month: number
  vodCount: number
}

export function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export const youtubeThumbnail = (id: string) =>
  `https://img.youtube.com/vi/${id}/maxresdefault.jpg`

const vodColumns = {
  slug: vods.slug,
  title: vods.title,
  streamedAt: vods.streamedAt,
  durationS: vods.durationS,
  videoRef: vods.videoRef,
  thumbnailUrl: vods.thumbnailUrl,
  chatStatus: vods.chatStatus,
  gameSlug: games.slug,
  gameName: games.name,
  gameCoverUrl: games.coverUrl,
  channelSlug: channels.slug,
  channelName: channels.displayName,
  channelAvatarUrl: channels.avatarUrl,
}

const selectVods = () =>
  db()
    .select(vodColumns)
    .from(vods)
    .innerJoin(channels, eq(vods.channelId, channels.id))
    .leftJoin(games, eq(vods.primaryGameId, games.id))

type VodRow = Awaited<ReturnType<typeof selectVods>>[number]

function toSummary(row: VodRow): VodSummary {
  return {
    slug: row.slug,
    title: row.title,
    streamedAt: row.streamedAt,
    durationS: row.durationS,
    duration: formatDuration(row.durationS),
    thumbnailUrl: row.thumbnailUrl ?? youtubeThumbnail(row.videoRef),
    youtubeId: row.videoRef,
    hasChat: row.chatStatus === 'ready',
    game:
      row.gameSlug && row.gameName
        ? { slug: row.gameSlug, name: row.gameName, coverUrl: row.gameCoverUrl }
        : null,
    channel: {
      slug: row.channelSlug,
      displayName: row.channelName,
      avatarUrl: row.channelAvatarUrl,
    },
  }
}

export interface VodFilter {
  channelId?: number
  gameSlug?: string
  from?: Date
  to?: Date
}

function vodWhere(filter: VodFilter): SQL | undefined {
  return and(
    filter.channelId ? eq(vods.channelId, filter.channelId) : undefined,
    filter.gameSlug ? eq(games.slug, filter.gameSlug) : undefined,
    filter.from ? gte(vods.streamedAt, filter.from) : undefined,
    filter.to ? lt(vods.streamedAt, filter.to) : undefined,
  )
}

export async function listVods(
  filter: VodFilter = {},
  page?: { limit: number; offset?: number },
): Promise<VodSummary[]> {
  const query = selectVods()
    .where(vodWhere(filter))
    .orderBy(desc(vods.streamedAt), desc(vods.id))
  const rows = page
    ? await query.limit(page.limit).offset(page.offset ?? 0)
    : await query
  return rows.map(toSummary)
}

export async function countVods(filter: VodFilter = {}): Promise<number> {
  const [row] = await db()
    .select({ n: count() })
    .from(vods)
    .leftJoin(games, eq(vods.primaryGameId, games.id))
    .where(vodWhere(filter))
  return row?.n ?? 0
}

export async function getVod(slug: string) {
  const [row] = await selectVods().where(eq(vods.slug, slug)).limit(1)
  return row ? toSummary(row) : undefined
}

export async function listGames(): Promise<GameSummary[]> {
  const rows = await db()
    .select({
      slug: games.slug,
      name: games.name,
      coverUrl: games.coverUrl,
      vodCount: count(vods.id),
      latestAt: max(vods.streamedAt),
    })
    .from(games)
    .innerJoin(vods, eq(vods.primaryGameId, games.id))
    .groupBy(games.id)
    .orderBy(desc(max(vods.streamedAt)))
  return rows.map((r) => ({ ...r, latestAt: r.latestAt ?? new Date(0) }))
}

export async function getGame(slug: string): Promise<GameRef | undefined> {
  const [row] = await db()
    .select({ slug: games.slug, name: games.name, coverUrl: games.coverUrl })
    .from(games)
    .where(eq(games.slug, slug))
    .limit(1)
  return row
}

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function monthLabel(year: number, month: number) {
  return `${monthNames[month - 1]} ${year}`
}

export function monthSlug(year: number, month: number) {
  return `${monthNames[month - 1]!.toLowerCase()}-${year}`
}

export function parseMonthSlug(slug: string) {
  const match = slug.match(/^([a-z]+)-(\d{4})$/)
  const month = match
    ? monthNames.findIndex((m) => m.toLowerCase() === match[1]) + 1
    : 0
  if (!match || month === 0) return undefined
  const year = Number(match[2])
  return {
    year,
    month,
    label: monthLabel(year, month),
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 1)),
  }
}

export async function listMonths(): Promise<MonthSummary[]> {
  const ym = sql<string>`strftime('%Y-%m', ${vods.streamedAt}, 'unixepoch')`
  const rows = await db()
    .select({ ym, vodCount: count() })
    .from(vods)
    .groupBy(ym)
    .orderBy(desc(ym))
  return rows.map(({ ym, vodCount }) => {
    const [year, month] = ym.split('-').map(Number) as [number, number]
    return {
      year,
      month,
      vodCount,
      slug: monthSlug(year, month),
      label: monthLabel(year, month),
    }
  })
}
