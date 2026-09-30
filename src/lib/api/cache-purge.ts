import { env } from 'cloudflare:workers'

type CacheApi = Cache & { default: Cache }

const SITE_PATHS = ['/', '/vods', '/collection', '/shows', '/search-index.json', '/rss.xml', '/sitemap-index.xml']

function siteUrl(): string {
  return (env as { SITE_URL?: string }).SITE_URL ?? 'https://tv.rcw.lol'
}

function purgePaths(pathnames: string[]): Promise<unknown[]> {
  const base = new URL(siteUrl())
  return Promise.all(
    pathnames.map((pathname) => {
      const url = new URL(pathname, base)
      url.search = ''
      const key = new Request(url.toString(), { method: 'GET' })
      return (caches as unknown as CacheApi).default.delete(key)
    }),
  )
}

/** VOD mutations affect every static page plus the VOD's own /watch page. */
export function purgeVodCaches(vodId?: string): Promise<unknown[]> {
  const paths = [...SITE_PATHS]
  if (vodId) paths.push(`/watch/${vodId}`)
  return purgePaths(paths)
}

/** Catalog mutations affect the static pages that list shows/episodes. */
export function purgeCatalogCaches(showSlug?: string): Promise<unknown[]> {
  const paths = [...SITE_PATHS]
  if (showSlug) paths.push(`/shows/${showSlug}`)
  return purgePaths(paths)
}
