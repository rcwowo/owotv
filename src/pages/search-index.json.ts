import type { APIContext } from 'astro'
import { getShows } from '@/lib/shows'
import { getDb, getVods } from '@/lib/db'
import {
  buildDateTokens,
  buildSearchBlob,
  gameSlug,
  monthYearSlug,
  tokenizeField,
  type SearchIndexItem,
} from '@/lib/search'

export async function GET(context: APIContext) {
  const db = getDb()
  const vods = await getVods(db)
  const shows = await getShows(db)
  const index: SearchIndexItem[] = []

  const sortedVods = [...vods].sort(
    (a, b) => b.streamDate.valueOf() - a.streamDate.valueOf(),
  )

  for (const vod of sortedVods) {
    const title = vod.title
    const game = vod.game || 'Other'
    const date = vod.streamDate
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
      const game = vod.game || 'Other'
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
    const showTokens = tokenizeField(show.name)
    const descTokens = tokenizeField(show.description)
    const showBlob = buildSearchBlob([show.name, show.description, 'show', 'series'])

    index.push({
      type: 'show',
      title: show.name,
      subtitle: show.description,
      category: 'Show',
      href: `/shows/${show.slug}`,
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
          show.name,
          season.title,
          ...dateTokens,
          'show',
          'episode',
        ])

        index.push({
          type: 'episode',
          title,
          subtitle: `${show.name} · ${season.title} · ${dateDisplay}`,
          category: 'Episode',
          href: `/shows/${show.slug}/${season.id}/${episode.id}`,
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
    const monthYear = vod.streamDate.toLocaleString('en-US', {
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
