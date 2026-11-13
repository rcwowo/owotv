import { channels, episodes, seasons, shows } from '@owotv/db'
import { asc } from 'drizzle-orm'
import { db, formatDuration, youtubeThumbnail, type ChannelRef } from './data'

export interface Episode {
  id: string
  title: string
  thumbnailUrl: string
  videoUrl: string
  duration: string
  airDate: Date
}

export interface Season {
  id: string
  title: string
  episodes: Episode[]
}

export interface Show {
  id: string
  title: string
  description: string
  coverUrl: string
  logoUrl: string
  channel: ChannelRef
  seasons: Season[]
}

export async function getShows(
  filter: { channelId?: number } = {},
): Promise<Show[]> {
  const d = db()
  const [showRows, seasonRows, episodeRows, channelRows] = await d.batch([
    d.select().from(shows).orderBy(asc(shows.sort), asc(shows.id)),
    d.select().from(seasons).orderBy(asc(seasons.sort), asc(seasons.id)),
    d.select().from(episodes).orderBy(asc(episodes.sort), asc(episodes.id)),
    d
      .select({
        id: channels.id,
        slug: channels.slug,
        displayName: channels.displayName,
        avatarUrl: channels.avatarUrl,
      })
      .from(channels),
  ])
  const channelsById = new Map(channelRows.map(({ id, ...c }) => [id, c]))

  return showRows
    .filter((show) => !filter.channelId || show.channelId === filter.channelId)
    .map((show) => ({
      id: show.slug,
      title: show.name,
      description: show.description,
      coverUrl: show.coverUrl ?? '',
      logoUrl: show.logoUrl ?? '',
      channel: channelsById.get(show.channelId)!,
      seasons: seasonRows
        .filter((s) => s.showId === show.id)
        .map((season) => ({
          id: season.slug,
          title: season.title,
          episodes: episodeRows
            .filter((e) => e.seasonId === season.id)
            .map((e) => ({
              id: e.slug,
              title: e.title,
              thumbnailUrl: e.thumbnailUrl ?? youtubeThumbnail(e.videoRef),
              videoUrl: `https://youtu.be/${e.videoRef}`,
              duration: formatDuration(e.durationS),
              airDate: e.airedAt,
            })),
        })),
    }))
}

export async function getShow(slug: string) {
  return (await getShows()).find((s) => s.id === slug)
}
