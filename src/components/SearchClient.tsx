import { Calendar, Clock, FileQuestion, Gamepad, Tv } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'

type VodIndexItem = {
  id: string
  title: string
  game: string
  date: string
  dateDisplay: string
  duration: string
  thumbnail: string
  tokens: string[]
  _w: { title: string[]; game: string[] }
}

type EpisodeIndexItem = {
  id: string
  title: string
  showId: string
  showTitle: string
  seasonId: string
  seasonTitle: string
  date: string
  dateDisplay: string
  duration: string
  thumbnail: string
  tokens: string[]
  _w: { title: string[]; show: string[]; season: string[] }
}

type VodIndexResponse = {
  generatedAt: string
  count: number
  vods: VodIndexItem[]
}

type EpisodeIndexResponse = {
  generatedAt: string
  count: number
  episodes: EpisodeIndexItem[]
}

interface Props {
  initialQuery?: string
}

interface ScoredVod extends VodIndexItem {
  score: number
  type: 'vod'
}

interface ScoredEpisode extends EpisodeIndexItem {
  score: number
  type: 'episode'
}

type ScoredResult = ScoredVod | ScoredEpisode

const fetchVodIndex = async (): Promise<VodIndexResponse> => {
  const res = await fetch('/vods-search-index.json')
  if (!res.ok) throw new Error('Failed to load VOD search index')
  return res.json()
}

const fetchEpisodeIndex = async (): Promise<EpisodeIndexResponse> => {
  const res = await fetch('/episodes-search-index.json')
  if (!res.ok) throw new Error('Failed to load episode search index')
  return res.json()
}

const normalize = (q: string) =>
  q
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s:.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export default function SearchClient({ initialQuery = '' }: Props) {
  // On mount, check for ?q= in the URL, fallback to initialQuery
  const getInitialQuery = () => {
    if (typeof window !== 'undefined') {
      const urlQ = new URL(window.location.href).searchParams.get('q')
      if (urlQ) return urlQ
    }
    return initialQuery
  }
  const [query, setQuery] = useState(getInitialQuery)
  const [vodIndex, setVodIndex] = useState<VodIndexResponse | null>(null)
  const [episodeIndex, setEpisodeIndex] = useState<EpisodeIndexResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load both indexes once
  useEffect(() => {
    setIsLoading(true)
    Promise.all([fetchVodIndex(), fetchEpisodeIndex()])
      .then(([vodIdx, episodeIdx]) => {
        setVodIndex(vodIdx)
        setEpisodeIndex(episodeIdx)
      })
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false))
  }, [])

  // On mount, sync query state with URL (for back/forward navigation)
  useEffect(() => {
    // Only run on first mount
    const urlQ = typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('q') : null
    if (urlQ && urlQ !== query) {
      setQuery(urlQ)
    }
    // Listen for popstate (browser back/forward)
    const onPopState = () => {
      const urlQ = new URL(window.location.href).searchParams.get('q') || ''
      setQuery(urlQ)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Sync query param with URL (debounced)
  useEffect(() => {
    const handler = setTimeout(() => {
      const url = new URL(window.location.href)
      if (query) url.searchParams.set('q', query)
      else url.searchParams.delete('q')
      window.history.replaceState({}, '', url.toString())
    }, 250)
    return () => clearTimeout(handler)
  }, [query])

  // VOD results with scoring
  const vodResults: ScoredVod[] = useMemo(() => {
    if (!vodIndex) return []
    const q = normalize(query)
    if (!q) {
      // No query: show nothing, handled by instruction card
      return []
    }
    const parts = q.split(' ').filter(Boolean)
    const matches: ScoredVod[] = []
    outer: for (const vod of vodIndex.vods) {
      let score = 0
      for (const token of parts) {
        // Direct token membership OR substring match inside title/game token
        const inTokens = vod.tokens.some((t) => t === token)
        const partial = !inTokens && vod.tokens.some((t) => t.startsWith(token))
        if (!inTokens && !partial) continue outer // AND semantics

        // Scoring weights
        if (vod._w.title.some((t) => t === token)) score += 6
        else if (vod._w.title.some((t) => t.startsWith(token))) score += 4
        else if (vod._w.game.some((t) => t === token)) score += 3
        else if (vod._w.game.some((t) => t.startsWith(token))) score += 2
        else score += 1 // date or generic token
      }
      // Boost newer content lightly
      const ageBoost =
        1 /
        (1 + (Date.now() - Date.parse(vod.date)) / (1000 * 60 * 60 * 24 * 30))
      score += ageBoost
      matches.push({ ...vod, score, type: 'vod' })
    }
    return matches
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.date.localeCompare(a.date)
      })
      .slice(0, 100)
  }, [vodIndex, query])

  // Episode results with scoring
  const episodeResults: ScoredEpisode[] = useMemo(() => {
    if (!episodeIndex) return []
    const q = normalize(query)
    if (!q) {
      return []
    }
    const parts = q.split(' ').filter(Boolean)
    const matches: ScoredEpisode[] = []
    outer: for (const episode of episodeIndex.episodes) {
      let score = 0
      for (const token of parts) {
        const inTokens = episode.tokens.some((t) => t === token)
        const partial = !inTokens && episode.tokens.some((t) => t.startsWith(token))
        if (!inTokens && !partial) continue outer // AND semantics

        // Scoring weights - prioritize show name and episode title
        if (episode._w.show.some((t) => t === token)) score += 6
        else if (episode._w.show.some((t) => t.startsWith(token))) score += 4
        else if (episode._w.title.some((t) => t === token)) score += 5
        else if (episode._w.title.some((t) => t.startsWith(token))) score += 3
        else if (episode._w.season.some((t) => t === token)) score += 2
        else if (episode._w.season.some((t) => t.startsWith(token))) score += 1
        else score += 1 // date or generic token
      }
      // Boost newer content lightly
      const ageBoost =
        1 /
        (1 + (Date.now() - Date.parse(episode.date)) / (1000 * 60 * 60 * 24 * 30))
      score += ageBoost
      matches.push({ ...episode, score, type: 'episode' })
    }
    return matches
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.date.localeCompare(a.date)
      })
      .slice(0, 100)
  }, [episodeIndex, query])

  // Combined results - merge and sort by score
  const combinedResults: ScoredResult[] = useMemo(() => {
    if (!query) return []
    return [...vodResults, ...episodeResults]
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return b.date.localeCompare(a.date)
      })
      .slice(0, 100)
  }, [vodResults, episodeResults, query])

  // UI
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2">
        <input
          id="vod-search"
          autoFocus
          className="w-full border bg-background px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring"
          placeholder="Search VODs and shows..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {query
            ? `${combinedResults.length} result${combinedResults.length === 1 ? '' : 's'} for "${query}"`
            : null}
        </p>
      </div>
      {error && (
        <div className="border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load search index: {error}
        </div>
      )}
      {isLoading && !vodIndex && !episodeIndex && (
        <div className="text-sm text-muted-foreground">Loading index…</div>
      )}

      {/* Instruction card when no query */}
      {!query && (
  <div className="bg-card flex flex-col justify-between gap-4 border p-6 shadow-xs sm:flex-row">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">Introducing search!</h2>
            <span className="text-left text-sm text-muted-foreground">
              <p>
                You can now find VODs and show episodes by using keywords like the game,
                date, title, or show name.
              </p>
              <p>See the examples below:</p>
            </span>
            <ul className="list-disc space-y-1 pl-4 font-mono text-sm">
              <li>exit 8</li>
              <li>minecraft january 2024</li>
              <li>morning show</li>
              <li>commonwealth reconstructed</li>
            </ul>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <a
              href="/collection"
              className={cn(
                buttonVariants({ variant: 'brand', size: 'lg' }),
                'flex h-full w-full flex-col gap-1 px-8 py-2',
              )}
            >
              <span className="flex">
                <Calendar size="20" className="mr-2" />
                Find By Month
              </span>
              <p className="text-xs">
                VODs by month and year they aired.
              </p>
            </a>
            <a
              href="/games"
              className={cn(
                buttonVariants({ variant: 'brand', size: 'lg' }),
                'flex h-full w-full flex-col gap-1 px-8 py-2',
              )}
            >
              <span className="flex">
                <Gamepad size="20" className="mr-2" />
                Find By Game
              </span>
              <p className="text-xs">
                Browse VODs by game played.
              </p>
            </a>
          </div>
        </div>
      )}

      {/* VOD results only */}
      {query && combinedResults.length > 0 && (
        <ul className="space-y-4">
          {combinedResults.map((result) => (
            <li key={`${result.type}-${result.id}`} className="group relative">
              <a
                href={
                  result.type === 'vod'
                    ? `/watch/${result.id}`
                    : `/shows/${result.showId}/${result.seasonId}/${result.id}`
                }
                className="relative bg-card flex flex-col items-stretch overflow-hidden border transition-shadow hover:shadow-md sm:flex-row"
              >
                {/* Hover overlay */}
                <div className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/20" />
                </div>
                {/* The actual stuff */}
                <div className="w-full aspect-video overflow-hidden sm:flex-none sm:h-24 sm:w-44">
                  <img
                    src={result.thumbnail}
                    alt={result.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="flex min-w-0 justify-center flex-1 flex-col p-3">
                  <div className="flex items-center gap-2">
                    {result.type === 'episode' && (
                      <span className="inline-flex items-center rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                        <Tv size="10" className="mr-1" />
                        Show
                      </span>
                    )}
                    <h3 className="line-clamp-2 text-base font-semibold sm:text-lg">
                      {result.title}
                    </h3>
                  </div>
                  <div className="mt-1 sm:mt-0 flex flex-wrap gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                    {result.type === 'vod' ? (
                      <span className="flex items-center">
                        <Gamepad size="12" className="mr-1" />
                        {result.game}
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Tv size="12" className="mr-1" />
                        {result.showTitle} • {result.seasonTitle}
                      </span>
                    )}
                    <span className="flex items-center">
                      <Calendar size="12" className="mr-1" />
                      {result.dateDisplay}
                    </span>
                    <span className="flex items-center">
                      <Clock size="12" className="mr-1" />
                      {result.duration}
                    </span>
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* No results found */}
      {vodIndex && episodeIndex && query && combinedResults.length === 0 && (
        <div className="bg-card flex flex-col items-center justify-center gap-2 border p-6 text-sm text-muted-foreground shadow-xs">
          <FileQuestion size={32} />
          <p>We couldn't find anything. Try different keywords.</p>
        </div>
      )}
    </div>
  )
}
