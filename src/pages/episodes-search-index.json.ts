import { getShows } from '@/lib/shows'

export const prerender = true

// Build-time generated lightweight search index for client-side episode searching.
// Contains only the minimal fields needed for displaying search results.
export async function GET() {
  const shows = await getShows()

  const index = shows.flatMap((show) =>
    show.seasons.flatMap((season) =>
      season.episodes.map((episode) => {
        const title = episode.title
        const showTitle = show.title
        const seasonTitle = season.title
        const date = episode.airDate
        const dateISO = date.toISOString()
        const dateDisplay = date.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })

        // Tokenization helpers
        const norm = (s: string) =>
          s
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[^a-z0-9\s:.-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()

        const titleTokens = norm(title).split(' ').filter(Boolean)
        const showTokens = norm(showTitle).split(' ').filter(Boolean)
        const seasonTokens = norm(seasonTitle).split(' ').filter(Boolean)

        const year = date.getFullYear().toString()
        const monthNum = (date.getMonth() + 1).toString()
        const monthNumPadded = monthNum.padStart(2, '0')
        const day = date.getDate().toString()
        const dayPadded = day.padStart(2, '0')
        const monthName = date
          .toLocaleString('en-US', { month: 'long' })
          .toLowerCase()
        const monthShort = date
          .toLocaleString('en-US', { month: 'short' })
          .toLowerCase()

        const dateTokens = [
          year,
          monthNum,
          monthNumPadded,
          day,
          dayPadded,
          monthName,
          monthShort,
          `${year}-${monthNumPadded}-${dayPadded}`,
          `${monthName}-${year}`,
        ]

        const allTokens = Array.from(
          new Set([
            ...titleTokens,
            ...showTokens,
            ...seasonTokens,
            ...dateTokens,
          ]),
        )

        return {
          id: episode.id,
          title,
          showId: show.id,
          showTitle,
          seasonId: season.id,
          seasonTitle,
          date: dateISO,
          dateDisplay,
          duration: episode.duration,
          thumbnail: episode.thumbnailUrl,
          tokens: allTokens,
          _w: {
            title: titleTokens,
            show: showTokens,
            season: seasonTokens,
          },
        }
      }),
    ),
  )

  return new Response(
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      count: index.length,
      episodes: index,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    },
  )
}
