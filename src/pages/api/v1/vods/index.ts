import type { APIRoute } from 'astro'
import { authenticate } from '@/lib/api/auth'
import { error, json } from '@/lib/api/http'
import { createVodRecord, db, listVods } from '@/lib/api/records'
import { purgeVodCaches } from '@/lib/api/cache-purge'

export const prerender = false

export const GET: APIRoute = async ({ request }) => {
  const auth = await authenticate(request, 'read')
  if (!auth) return error(401, 'Unauthorized')
  return json({ data: await listVods(auth.scope) })
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return error(400, 'Request body must be valid JSON')
  }
  const response = await createVodRecord(db(), body)
  if (response.status === 201) await purgeVodCaches()
  return response
}
