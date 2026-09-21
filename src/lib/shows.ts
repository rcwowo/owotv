import type { D1DatabaseBinding } from '@/lib/db'

export interface EpisodeSummary {
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
  episodes: EpisodeSummary[]
}

export interface ShowWithSeasons {
  slug: string
  name: string
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


interface EpisodeWithShowsRow {
  id: string
  title: string
  duration: string
  air_date: string
  thumbnail_url: string
  video_url: string
  season: string
  show_slugs: string
}

interface ShowWithEpisodesRow {
  slug: string
  name: string
  description: string
  cover_url: string
  logo_url: string
  episode_ids: string
}

export async function getShows(db: D1DatabaseBinding): Promise<ShowWithSeasons[]> {
  const { results: el } = await db
    .prepare(
      `SELECT e.id, e.title, e.duration, e.air_date, e.thumbnail_url, e.video_url, e.season,
              json_group_array(se.show_slug) AS show_slugs
       FROM episodes e
       LEFT JOIN show_episodes se ON se.episode_id = e.id
       GROUP BY e.id
       ORDER BY e.rank ASC`,
    )
    .all<EpisodeWithShowsRow>()

  const { results: sl } = await db
    .prepare(
      `SELECT s.slug, s.name, s.description, s.cover_url, s.logo_url,
              json_group_array(se.episode_id) AS episode_ids
       FROM shows s
       LEFT JOIN show_episodes se ON se.show_slug = s.slug
       GROUP BY s.slug
       ORDER BY s.rank ASC`,
    )
    .all<ShowWithEpisodesRow>()

  const episodes = el.map((row): EpisodeSummary & { season: string; showSlugs: string[] } => ({
    id: row.id,
    title: row.title,
    duration: row.duration,
    thumbnailUrl: row.thumbnail_url,
    videoUrl: row.video_url,
    airDate: new Date(`${row.air_date}T00:00:00Z`),
    season: row.season,
    showSlugs: JSON.parse(row.show_slugs).filter(Boolean) as string[],
  }))

  return sl.map((r): ShowWithSeasons => {
    const showEpisodes = episodes.filter((e) => e.showSlugs.includes(r.slug))

    const seasonMap = new Map<string, EpisodeSummary[]>()
    for (const ep of showEpisodes) {
      if (!seasonMap.has(ep.season)) {
        seasonMap.set(ep.season, [])
      }
      seasonMap.get(ep.season)!.push({
        id: ep.id,
        title: ep.title,
        thumbnailUrl: ep.thumbnailUrl,
        videoUrl: ep.videoUrl,
        duration: ep.duration,
        airDate: ep.airDate,
      })
    }

    const seasons: Season[] = Array.from(seasonMap.entries()).map(
      ([title, se]) => ({
        id: slugify(title),
        title,
        episodes: se.sort((a, b) => a.airDate.getTime() - b.airDate.getTime()),
      }),
    )

    seasons.sort((a, b) => {
      const aDate = a.episodes[0]?.airDate.getTime() ?? 0
      const bDate = b.episodes[0]?.airDate.getTime() ?? 0
      return aDate - bDate
    })

    return {
      slug: r.slug,
      name: r.name,
      description: r.description,
      coverUrl: r.cover_url,
      logoUrl: r.logo_url,
      seasons,
    }
  })
}

export async function getShow(
  db: D1DatabaseBinding,
  showSlug: string,
): Promise<ShowWithSeasons | null> {
  const shows = await getShows(db)
  return shows.find((s) => s.slug === showSlug) ?? null
}
