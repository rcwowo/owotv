import { findChannel, toApiChannel } from '@owotv/core'
import { channels, shows, vods } from '@owotv/db'
import type { ApiChannel } from '@owotv/shared'
import { asc, count, max } from 'drizzle-orm'
import { db } from './data'

export interface ChannelSummary extends ApiChannel {
  id: number
  vodCount: number
  showCount: number
  latestAt: Date | null
}

/** Every channel, most recently active first. Empty channels come last. */
export async function listChannelSummaries(): Promise<ChannelSummary[]> {
  const d = db()
  const [channelRows, vodStats, showStats] = await d.batch([
    d.select().from(channels).orderBy(asc(channels.id)),
    d
      .select({
        channelId: vods.channelId,
        n: count(),
        latestAt: max(vods.streamedAt),
      })
      .from(vods)
      .groupBy(vods.channelId),
    d
      .select({ channelId: shows.channelId, n: count() })
      .from(shows)
      .groupBy(shows.channelId),
  ])
  const vodsBy = new Map(vodStats.map((r) => [r.channelId, r]))
  const showsBy = new Map(showStats.map((r) => [r.channelId, r.n]))

  return channelRows
    .map((row) => ({
      ...toApiChannel(row),
      id: row.id,
      vodCount: vodsBy.get(row.id)?.n ?? 0,
      showCount: showsBy.get(row.id) ?? 0,
      latestAt: vodsBy.get(row.id)?.latestAt ?? null,
    }))
    .sort(
      (a, b) =>
        (b.latestAt?.getTime() ?? 0) - (a.latestAt?.getTime() ?? 0) ||
        a.displayName.localeCompare(b.displayName),
    )
}

/** More than one channel exists, so pages say whose content it is. */
export async function isMultiChannel() {
  const [row] = await db().select({ n: count() }).from(channels)
  return (row?.n ?? 0) > 1
}

/**
 * Looks a channel up for its page. `redirect` is set when the slug is one
 * the channel used before a rename.
 */
export async function getChannelForPage(slug: string) {
  const row = await findChannel(db(), slug)
  if (!row) return undefined
  return {
    channel: { ...toApiChannel(row), id: row.id },
    redirect: row.slug !== slug ? row.slug : undefined,
  }
}

export const channelPath = (slug: string) => `/channels/${slug}`
