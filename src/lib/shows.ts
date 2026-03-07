import { getCollection } from 'astro:content'

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
  seasons: Season[]
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function getShows(): Promise<Show[]> {
  const showsCollection = await getCollection('shows')
  const episodesCollection = await getCollection('episodes')

  return showsCollection
    .sort((a, b) => parseFloat(a.data.order) - parseFloat(b.data.order))
    .map((show) => {
      // Get all episodes for this show
      const showEpisodes = episodesCollection.filter((ep) =>
        ep.data.Shows.some((s) => s.id === parseInt(show.id)),
      )

      // Group episodes by season
      const seasonMap = new Map<string, Episode[]>()
      for (const ep of showEpisodes) {
        const seasonTitle = ep.data.Season
        if (!seasonMap.has(seasonTitle)) {
          seasonMap.set(seasonTitle, [])
        }
        seasonMap.get(seasonTitle)!.push({
          id: ep.id,
          title: ep.data.Title,
          thumbnailUrl: ep.data['Thumbnail URL'],
          videoUrl: ep.data['Video URL'],
          duration: ep.data.Duration,
          airDate: ep.data['Air Date'],
        })
      }

      // Convert to seasons array and sort episodes within each season
      const seasons: Season[] = Array.from(seasonMap.entries()).map(
        ([title, episodes]) => ({
          id: slugify(title),
          title,
          episodes: episodes.sort(
            (a, b) => a.airDate.getTime() - b.airDate.getTime(),
          ),
        }),
      )

      // Sort seasons by earliest episode air date
      seasons.sort((a, b) => {
        const aDate = a.episodes[0]?.airDate.getTime() ?? 0
        const bDate = b.episodes[0]?.airDate.getTime() ?? 0
        return aDate - bDate
      })

      return {
        id: show.id,
        title: show.data.Name,
        description: show.data.Description,
        coverUrl: show.data['Cover URL'],
        logoUrl: show.data['Logo URL'],
        seasons,
      }
    })
}
