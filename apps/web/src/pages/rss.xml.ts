import rss from '@astrojs/rss'
import { SITE } from '@/consts'
import { listVods } from '@/lib/data'
import type { APIContext } from 'astro'

export async function GET(context: APIContext) {
  const vods = await listVods({}, { limit: 50 })

  return rss({
    title: SITE.TITLE,
    description: SITE.DESCRIPTION,
    site: context.site ?? SITE.SITEURL,
    stylesheet: '/pretty-feed-v3.xsl',
    items: vods.map((vod) => {
      const game = vod.game?.name ?? 'Other'
      return {
        title: vod.title,
        link: `/watch/${vod.slug}/`,
        pubDate: vod.streamedAt,
        description: `A stream that lasted ${vod.duration} while playing ${game}.`,
        categories: [game],
        image: vod.thumbnailUrl,
      }
    }),
  })
}
