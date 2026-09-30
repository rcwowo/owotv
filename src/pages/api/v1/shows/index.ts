import type { APIRoute } from 'astro'
import { authenticate } from '@/lib/api/auth'
import { error, json } from '@/lib/api/http'
import { createShowRecord, db, listShows } from '@/lib/api/records'
import { purgeCatalogCaches } from '@/lib/api/cache-purge'

export const prerender = false

export const GET: APIRoute = async ({ request }) => {
  if (!(await authenticate(request, 'read'))) return error(401, 'Unauthorized')
  return json({ data: await listShows() })
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return error(400, 'Request body must be valid JSON')
  }
  const response = await createShowRecord(db(), body)
  if (response.status === 201) await purgeCatalogCaches()
  return response
}
