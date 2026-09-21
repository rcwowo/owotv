import type { APIContext } from 'astro'

// Cloudflare's Cache API (`caches.default`) is absent from the TS DOM lib.
type CacheApi = Cache & { default: Cache }

function edgeCache(): Cache {
  return (caches as unknown as CacheApi).default
}

const DEFAULT_SMAXAGE = 60

const CACHEABLE_TYPES = [
  'text/html',
  'application/json',
  'application/xml',
  'application/rss+xml',
  'text/xml',
]

function isCacheableResponse(response: Response): boolean {
  if (!response.ok) return false
  const contentType = response.headers.get('content-type')?.split(';')[0] ?? ''
  return CACHEABLE_TYPES.some((t) => contentType === t)
}

function cacheKey(request: Request): Request {
  const url = new URL(request.url)
  url.search = ''
  return new Request(url.toString(), { method: 'GET' })
}

function shouldSkip(request: Request): boolean {
  if (!import.meta.env.PROD) return true
  if (request.method !== 'GET' && request.method !== 'HEAD') return true
  if (request.headers.has('authorization')) return true
  const cookie = request.headers.get('cookie')
  if (cookie && !/prefers-?theme|CookieConsent|consent/i.test(cookie)) return true
  if (
    request.headers.get('cf-connecting-device-id') ||
    request.headers.get('cf-ipcountry') === 'PRIV'
  ) {
    return true
  }
  return false
}

export async function getOrRender(
  request: Request,
  render: () => Promise<Response>,
): Promise<Response> {
  if (shouldSkip(request)) return render()

  const key = cacheKey(request)
  const cache = edgeCache()

  const hit = await cache.match(key)
  if (hit) return hit

  const response = await render()

  if (isCacheableResponse(response)) {
    const cacheable = new Response(response.clone().body, response)
    cacheable.headers.set(
      'cache-control',
      `public, s-maxage=${DEFAULT_SMAXAGE}, stale-while-revalidate=600`,
    )
    await cache.put(key, cacheable)
  }

  return response
}

export async function purgePath(context: APIContext, pathname: string): Promise<void> {
  const url = new URL(context.request.url)
  url.pathname = pathname
  url.search = ''
  await edgeCache().delete(new Request(url.toString(), { method: 'GET' }))
}

export async function purgePaths(startPaths: string[], siteUrl: string): Promise<void> {
  const base = new URL(siteUrl)
  await Promise.all(
    startPaths.map((p) => {
      const url = new URL(p, base)
      url.search = ''
      return edgeCache().delete(new Request(url.toString(), { method: 'GET' }))
    }),
  )
}
