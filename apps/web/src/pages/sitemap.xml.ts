import { listChannelSummaries, channelPath } from '@/lib/channels'
import { listGames, listMonths, listVods } from '@/lib/data'
import { getShows } from '@/lib/shows'
import type { APIRoute } from 'astro'

interface SitemapEntry {
  path: string
  lastmod?: Date
}

const STATIC_PATHS = ['/', '/vods', '/channels', '/shows', '/games', '/collection']

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

export const GET: APIRoute = async ({ site }) => {
  const [vods, channels, shows, games, months] = await Promise.all([
    listVods(),
    listChannelSummaries(),
    getShows(),
    listGames(),
    listMonths(),
  ])

  const entries: SitemapEntry[] = STATIC_PATHS.map((path) => ({ path }))

  for (const channel of channels) {
    const lastmod = channel.latestAt ?? undefined
    entries.push({ path: channelPath(channel.slug), lastmod })
    if (channel.showCount > 0) {
      entries.push({ path: `${channelPath(channel.slug)}/shows` })
    }
  }

  for (const vod of vods) {
    entries.push({ path: `/watch/${vod.slug}`, lastmod: vod.streamedAt })
  }

  for (const game of games) {
    entries.push({ path: `/games/${game.slug}`, lastmod: game.latestAt })
  }

  for (const month of months) {
    entries.push({ path: `/collection/${month.slug}` })
  }

  for (const show of shows) {
    entries.push({ path: `/shows/${show.id}` })
    for (const season of show.seasons) {
      for (const episode of season.episodes) {
        entries.push({
          path: `/shows/${show.id}/${season.id}/${episode.id}`,
          lastmod: episode.airDate,
        })
      }
    }
  }

  const urls = entries
    .map(({ path, lastmod }) => {
      const loc = `<loc>${escapeXml(new URL(path, site).href)}</loc>`
      const mod = lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''
      return `<url>${loc}${mod}</url>`
    })
    .join('')

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  )
}
