import type { APIRoute } from 'astro'
import { authenticate } from '@/lib/api/auth'
import { error } from '@/lib/api/http'
import { db, linkEpisodeToShow, unlinkEpisodeFromShow } from '@/lib/api/records'
import { purgeCatalogCaches } from '@/lib/api/cache-purge'

export const prerender = false

export const POST: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const slug = params.slug ?? ''
  const episodeId = params.episodeId ?? ''
  if (!episodeId) return error(400, 'Missing episode id')
  return linkEpisodeToShow(db(), slug, episodeId).then(async (response) => {
    if (response.status === 200) await purgeCatalogCaches(slug)
    return response
  })
}

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const slug = params.slug ?? ''
  const episodeId = params.episodeId ?? ''
  if (!episodeId) return error(400, 'Missing episode id')
  return unlinkEpisodeFromShow(db(), slug, episodeId).then(async (response) => {
    if (response.status === 200) await purgeCatalogCaches(slug)
    return response
  })
}
