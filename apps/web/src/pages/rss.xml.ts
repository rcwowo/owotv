import rss from '@astrojs/rss'
import { SITE } from '@/consts'
import type { APIContext } from 'astro'
import { getCollection } from 'astro:content'

export async function GET(context: APIContext) {
  try {
    // Fetch the last 50 VODs from the collection
    const vods = (await getCollection('vods')).splice(0, 50)

    // Sort posts by date
    const items = [...vods].sort(
      (a, b) =>
        new Date(b.data['Stream Date']).valueOf() - new Date(a.data['Stream Date']).valueOf(),
    )

    // Return RSS feed
    return rss({
      title: SITE.TITLE,
      description: SITE.DESCRIPTION,
      site: context.site ?? SITE.SITEURL,
      stylesheet: '/pretty-feed-v3.xsl',
      items: items.map((item) => ({
        title: item.data.Title,
        link: `/watch/${item.id}/`,
        pubDate: item.data['Stream Date'],
        description: `A stream that lasted ${item.data.Duration} while playing ${item.data.Game}.`,
        categories: [item.data.Game],
        image: item.data['Thumbnail URL'],
      })),
    })
  } catch (error) {
    console.error('Error generating RSS feed:', error)
    return new Response('Error generating RSS feed', { status: 500 })
  }
}
