import rss from '@astrojs/rss'
import { SITE } from '@/consts'
import type { APIContext } from 'astro'
import { getDb, getVods } from '@/lib/db'

export async function GET(context: APIContext) {
  try {
    const db = getDb()
    const vods = (await getVods(db)).splice(0, 50)

    const items = [...vods].sort(
      (a, b) => new Date(b.streamDate).valueOf() - new Date(a.streamDate).valueOf(),
    )

    return rss({
      title: SITE.TITLE,
      description: SITE.DESCRIPTION,
      site: context.site ?? SITE.SITEURL,
      stylesheet: '/pretty-feed-v3.xsl',
      items: items.map((item) => ({
        title: item.title,
        link: `/watch/${item.id}/`,
        pubDate: item.streamDate,
        description: `A stream that lasted ${item.duration} while playing ${item.game}.`,
        categories: [item.game],
        image: item.thumbnailUrl,
      })),
    })
  } catch (error) {
    console.error('Error generating RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
