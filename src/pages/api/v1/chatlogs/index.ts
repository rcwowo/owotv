import type { APIRoute } from 'astro'
import type { R2Bucket } from '@cloudflare/workers-types'
import { authenticate } from '@/lib/api/auth'
import { error, json, safeChatlogKey } from '@/lib/api/http'
import { CHATLOG_LIMITS, chatlogsBucket, toObjectInfo } from '@/lib/api/chatlogs'

export const prerender = false

/** R2 accepts at most 1000 keys per bulk delete call. */
const R2_MAX_BULK_DELETE = 1000

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed)) return 100
  return Math.min(Math.max(parsed, 1), 1000)
}

export const GET: APIRoute = async ({ request, url }) => {
  if (!(await authenticate(request, 'read'))) return error(401, 'Unauthorized')

  const bucket = chatlogsBucket()
  const limit = parseLimit(url.searchParams.get('limit'))
  const cursor = url.searchParams.get('cursor') ?? undefined
  const prefix = url.searchParams.get('prefix') ?? undefined

  try {
    const listed = await bucket.list({ limit, cursor, prefix })
    return new Response(
      JSON.stringify({
        data: listed.objects
          .filter((obj) => !('prefix' in obj))
          .map((obj) => toObjectInfo(obj)),
        truncated: listed.truncated,
        cursor: listed.truncated && listed.cursor ? listed.cursor : null,
        limits: CHATLOG_LIMITS,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  } catch {
    return error(400, 'Invalid chatlog list request (bad cursor or prefix?)')
  }
}

function validateContentLength(request: Request): Response | null {
  const raw = request.headers.get('content-length')
  if (raw === null) return null // chunked upload; only R2 can decide size
  const size = Number(raw)
  if (!Number.isFinite(size)) return null
  if (size > CHATLOG_LIMITS.maxBytes) {
    return error(413, `Request body exceeds the ${CHATLOG_LIMITS.maxBytes} byte chatlog limit`)
  }
  return null
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')

  const key = safeChatlogKey(request.headers.get('x-object-key'))
  if (!key) return error(400, 'Missing or invalid X-Object-Key header')

  if (!request.body) return error(400, 'Request body is required')

  const tooLarge = validateContentLength(request)
  if (tooLarge) return tooLarge

  try {
    // Stream the (potentially very large) body directly into R2 without
    // buffering; R2 only accepts streaming bodies from the original request.
    const body = request.body as unknown as Parameters<R2Bucket['put']>[1]
    const object = await chatlogsBucket().put(key, body, {
      httpMetadata: {
        contentType: request.headers.get('content-type') ?? 'application/octet-stream',
      },
    })
    return json(
      { key, size: object.size, uploaded: object.uploaded.toISOString() },
      201,
    )
  } catch {
    return error(500, 'Failed to upload chatlog')
  }
}

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')

  const keys = [
    ...new Set(
      [...url.searchParams.getAll('key'), ...url.searchParams.getAll('key[]')]
        .map((k) => safeChatlogKey(k))
        .filter((k): k is string => k !== null),
    ),
  ]
  if (keys.length === 0) return error(400, 'Provide at least one valid ?key= parameter')
  if (keys.length > R2_MAX_BULK_DELETE) {
    return error(413, `Bulk delete is capped at ${R2_MAX_BULK_DELETE} keys`)
  }

  try {
    const bucket = chatlogsBucket()
    if (keys.length === 1) {
      await bucket.delete(keys[0])
    } else {
      await bucket.delete(keys)
    }
    return json({ deleted: keys })
  } catch {
    return error(500, 'Failed to delete chatlogs')
  }
}
