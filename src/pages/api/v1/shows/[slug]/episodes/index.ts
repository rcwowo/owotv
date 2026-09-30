import type { APIRoute } from 'astro'
import { authenticate } from '@/lib/api/auth'
import { error } from '@/lib/api/http'
import { db, linkEpisodeToShow } from '@/lib/api/records'
import { purgeCatalogCaches } from '@/lib/api/cache-purge'

export const prerender = false

export const POST: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const slug = params.slug ?? ''

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return error(400, 'Request body must be valid JSON')
  }
  const episodeId = body.episode_id
  if (typeof episodeId !== 'string' || !episodeId) {
    return error(400, 'Field "episode_id" is required')
  }
  return linkEpisodeToShow(db(), slug, episodeId).then(async (response) => {
    if (response.status === 200) await purgeCatalogCaches(slug)
    return response
  })
}
