export type YouTubeFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

export interface YouTubeVideoInfo {
  id: string
  title: string
  /** Missing when YouTube didn't include it in the page */
  durationS?: number
  /** YYYY-MM-DD */
  publishDate?: string
}

/** Reads the JSON object assigned to `name` in a page's scripts. */
export function extractJsonAssignment(html: string, name: string) {
  const start = html.indexOf(`${name} = {`)
  if (start < 0) return undefined
  let i = html.indexOf('{', start)
  const begin = i
  let depth = 0
  let inString = false
  for (; i < html.length; i++) {
    const c = html[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(begin, i + 1)) as unknown
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

interface PlayerResponse {
  videoDetails?: { title?: string; lengthSeconds?: string }
  microformat?: {
    playerMicroformatRenderer?: { publishDate?: string; uploadDate?: string }
  }
}

/**
 * Looks up a video's title, length and publish date so they don't have to be
 * typed in. Best effort: it reads the public watch page, and falls back to
 * oEmbed (title only) when that fails.
 */
export async function fetchYouTubeVideo(
  id: string,
  opts: { fetch?: YouTubeFetch; signal?: AbortSignal } = {},
): Promise<YouTubeVideoInfo> {
  const f = opts.fetch ?? fetch
  try {
    const res = await f(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        // Skips the EU cookie consent page.
        Cookie: 'CONSENT=YES+1',
      },
      signal: opts.signal,
    })
    if (res.ok) {
      const player = extractJsonAssignment(
        await res.text(),
        'ytInitialPlayerResponse',
      ) as PlayerResponse | undefined
      const details = player?.videoDetails
      if (details?.title) {
        const micro = player?.microformat?.playerMicroformatRenderer
        const date = (micro?.publishDate ?? micro?.uploadDate)?.slice(0, 10)
        const length = Number(details.lengthSeconds)
        return {
          id,
          title: details.title,
          ...(length > 0 ? { durationS: length } : {}),
          ...(date && /^\d{4}-\d{2}-\d{2}$/.test(date)
            ? { publishDate: date }
            : {}),
        }
      }
    }
  } catch (err) {
    if (opts.signal?.aborted) throw err
  }

  const res = await f(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
    { signal: opts.signal },
  )
  if (!res.ok) {
    throw new Error(
      res.status === 404 || res.status === 400
        ? `YouTube video ${id} not found`
        : `YouTube returned ${res.status} for ${id}`,
    )
  }
  const data = (await res.json()) as { title?: string }
  if (!data.title) throw new Error(`YouTube video ${id} not found`)
  return { id, title: data.title }
}
