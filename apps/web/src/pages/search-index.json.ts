import { listGames, listMonths, listVods } from '@/lib/data'
import { getShows } from '@/lib/shows'
import {
  buildDateTokens,
  buildSearchBlob,
  tokenizeField,
  type SearchIndexItem,
} from '@/lib/search'

export async function GET() {
  const [vods, games, months, shows] = await Promise.all([
    listVods(),
    listGames(),
    listMonths(),
    getShows(),
  ])
  const index: SearchIndexItem[] = []

  for (const vod of vods) {
    const title = vod.title
    const game = vod.game?.name ?? 'Other'
    const date = vod.streamedAt
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
      href: `/watch/${vod.slug}`,
      searchText: blob.text,
      searchCompact: blob.compact,
      _w: { title: titleTokens, game: gameTokens, date: dateTokens },
      date: dateISO,
    })
  }

  for (const { name: game, slug, vodCount: count } of games) {
    const titleTokens = tokenizeField(game)
    const blob = buildSearchBlob([game, 'game', 'category', 'streams'])

    index.push({
      type: 'game',
      title: game,
      subtitle: `${count} stream${count === 1 ? '' : 's'}`,
      category: 'Game',
      href: `/games/${slug}`,
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

  for (const { label: monthYear, slug, vodCount: count } of months) {
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
      href: `/collection/${slug}`,
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
