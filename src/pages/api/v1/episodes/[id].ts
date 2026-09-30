import type { APIRoute } from 'astro'
import { authenticate } from '@/lib/api/auth'
import { error, json } from '@/lib/api/http'
import {
  db,
  deleteEpisodeRecord,
  getEpisodeRecord,
  updateEpisodeRecord,
} from '@/lib/api/records'
import { purgeCatalogCaches } from '@/lib/api/cache-purge'

export const prerender = false

export const GET: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'read'))) return error(401, 'Unauthorized')
  const id = params.id ?? ''

  const episode = await getEpisodeRecord(db(), id)
  if (!episode) return error(404, 'Episode not found')
  return json(episode)
}

export const PUT: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const id = params.id ?? ''

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return error(400, 'Request body must be valid JSON')
  }
  return updateEpisodeRecord(db(), id, body).then(async (response) => {
    if (response.status === 200) await purgeCatalogCaches()
    return response
  })
}

export const PATCH: APIRoute = PUT

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const id = params.id ?? ''
  return deleteEpisodeRecord(db(), id).then(async (response) => {
    if (response.status === 200) await purgeCatalogCaches()
    return response
  })
}
