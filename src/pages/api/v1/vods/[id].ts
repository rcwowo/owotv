import type { APIRoute } from 'astro'
import { authenticate } from '@/lib/api/auth'
import { error, isUuid, json } from '@/lib/api/http'
import {
  db,
  deleteVodRecord,
  getVodRecord,
  updateVodRecord,
} from '@/lib/api/records'
import { purgeVodCaches } from '@/lib/api/cache-purge'

export const prerender = false

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await authenticate(request, 'read')
  if (!auth) return error(401, 'Unauthorized')
  const id = params.id ?? ''
  if (!isUuid(id)) return error(400, 'Invalid VOD id')

  const vod = await getVodRecord(db(), auth.scope, id)
  if (!vod) return error(404, 'VOD not found')
  return json(vod)
}

export const PUT: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const id = params.id ?? ''
  if (!isUuid(id)) return error(400, 'Invalid VOD id')

  const body = await readBody(request)
  if (!body) return error(400, 'Request body must be valid JSON')

  const response = await updateVodRecord(db(), id, body)
  if (response.status === 200) await purgeVodCaches(id)
  return response
}

export const PATCH: APIRoute = PUT

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const id = params.id ?? ''
  if (!isUuid(id)) return error(400, 'Invalid VOD id')

  const response = await deleteVodRecord(db(), id)
  if (response.status === 200) await purgeVodCaches(id)
  return response
}
