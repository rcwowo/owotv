import type { APIRoute } from 'astro'
import { authenticate } from '@/lib/api/auth'
import { error, json } from '@/lib/api/http'
import {
  db,
  deleteShowRecord,
  getShowRecord,
  listEpisodeIdsForShow,
  updateShowRecord,
} from '@/lib/api/records'
import { purgeCatalogCaches } from '@/lib/api/cache-purge'

export const prerender = false

export const GET: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'read'))) return error(401, 'Unauthorized')
  const slug = params.slug ?? ''

  const show = await getShowRecord(db(), slug)
  if (!show) return error(404, 'Show not found')

  const episodes = await listEpisodeIdsForShow(db(), slug)
  return json({ ...show, episode_ids: episodes ?? [] })
}

export const PUT: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const slug = params.slug ?? ''

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return error(400, 'Request body must be valid JSON')
  }
  return updateShowRecord(db(), slug, body).then(async (response) => {
    if (response.status === 200) await purgeCatalogCaches()
    return response
  })
}

export const PATCH: APIRoute = PUT

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const slug = params.slug ?? ''
  return deleteShowRecord(db(), slug).then(async (response) => {
    if (response.status === 200) await purgeCatalogCaches()
    return response
  })
}
