import { getCollection } from 'astro:content'
import { getShows } from '@/lib/shows'
import {
  buildDateTokens,
  buildSearchBlob,
  gameSlug,
  monthYearSlug,
  tokenizeField,
  type SearchIndexItem,
} from '@/lib/search'

export const prerender = true

export async function GET() {
  const vods = await getCollection('vods')
  const shows = await getShows()
  const index: SearchIndexItem[] = []

  const sortedVods = [...vods].sort(
    (a, b) => b.data['Stream Date'].valueOf() - a.data['Stream Date'].valueOf(),
  )

  for (const vod of sortedVods) {
    const title = vod.data['Title']
    const game = vod.data['Game'] || 'Other'
    const date = vod.data['Stream Date']
    const dateISO = date.toISOString()
    const dateDisplay = date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    const titleTokens = tokenizeField(title)
    const gameTokens = tokenizeField(game)
    const dateTokens = buildDateTokens(date)
    const blob = buildSearchBlob([title, game, ...dateTokens])

    index.push({
      type: 'vod',
      title,
      subtitle: `${game} · ${dateDisplay}`,
      category: 'VOD',
      href: `/watch/${vod.id}`,
      searchText: blob.text,
      searchCompact: blob.compact,
      _w: { title: titleTokens, game: gameTokens, date: dateTokens },
      date: dateISO,
    })
  }

  const games = sortedVods.reduce(
    (acc, vod) => {
      const game = vod.data['Game'] || 'Other'
      if (!acc.has(game)) acc.set(game, 0)
      acc.set(game, acc.get(game)! + 1)
      return acc
    },
    new Map<string, number>(),
  )

  for (const [game, count] of games) {
    const titleTokens = tokenizeField(game)
    const blob = buildSearchBlob([game, 'game', 'category', 'streams'])

    index.push({
      type: 'game',
      title: game,
      subtitle: `${count} stream${count === 1 ? '' : 's'}`,
      category: 'Game',
      href: `/games/${gameSlug(game)}`,
      searchText: blob.text,
      searchCompact: blob.compact,
      _w: { title: titleTokens, game: titleTokens },
    })
  }

  for (const show of shows) {
    const showTokens = tokenizeField(show.title)
    const descTokens = tokenizeField(show.description)
    const showBlob = buildSearchBlob([show.title, show.description, 'show', 'series'])

    index.push({
      type: 'show',
      title: show.title,
      subtitle: show.description,
      category: 'Show',
      href: `/shows/${show.id}`,
      searchText: showBlob.text,
      searchCompact: showBlob.compact,
      _w: { title: [...showTokens, ...descTokens], show: showTokens },
    })

    for (const season of show.seasons) {
      const seasonTokens = tokenizeField(season.title)
      for (const episode of season.episodes) {
        const title = episode.title
        const date = episode.airDate
        const dateDisplay = date.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
        const titleTokens = tokenizeField(title)
        const dateTokens = buildDateTokens(date)
        const blob = buildSearchBlob([
          title,
          show.title,
          season.title,
          ...dateTokens,
          'show',
          'episode',
        ])

        index.push({
          type: 'episode',
          title,
          subtitle: `${show.title} · ${season.title} · ${dateDisplay}`,
          category: 'Episode',
          href: `/shows/${show.id}/${season.id}/${episode.id}`,
          searchText: blob.text,
          searchCompact: blob.compact,
          _w: {
            title: titleTokens,
            show: showTokens,
            season: seasonTokens,
            date: dateTokens,
          },
          date: date.toISOString(),
        })
      }
    }
  }

  const monthYears = new Map<string, number>()
  for (const vod of sortedVods) {
    const monthYear = vod.data['Stream Date'].toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    })
    monthYears.set(monthYear, (monthYears.get(monthYear) ?? 0) + 1)
  }

  for (const [monthYear, count] of monthYears) {
    const [monthName, year] = monthYear.split(' ')
    const dateTokens = buildDateTokens(
      new Date(`${monthName} 1, ${year}`),
    )
    const titleTokens = tokenizeField(monthYear)
    const blob = buildSearchBlob([
      monthYear,
      monthName,
      year,
      ...dateTokens,
      'collection',
      'date',
      'month',
    ])

    index.push({
      type: 'date',
      title: monthYear,
      subtitle: `${count} video${count === 1 ? '' : 's'}`,
      category: 'Collection',
      href: `/collection/${monthYearSlug(monthYear)}`,
      searchText: blob.text,
      searchCompact: blob.compact,
      _w: { title: titleTokens, date: dateTokens },
    })
  }

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
