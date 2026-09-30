import type { APIRoute } from 'astro'
import { authenticate } from '@/lib/api/auth'
import type { R2Bucket } from '@cloudflare/workers-types'
import { error, safeChatlogKey } from '@/lib/api/http'
import { CHATLOG_LIMITS, chatlogsBucket, toObjectInfo } from '@/lib/api/chatlogs'

export const prerender = false

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

export const GET: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'read'))) return error(401, 'Unauthorized')

  const key = safeChatlogKey(params.path ?? null)
  if (!key) return error(400, 'Invalid chatlog key')

  if (request.headers.has('x-object-metadata')) {
    try {
      const head = await chatlogsBucket().head(key)
      if (!head) return new Response(null, { status: 404 })
      return new Response(JSON.stringify(toObjectInfo(head)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    } catch {
      return error(500, 'Failed to read chatlog metadata')
    }
  }

  const object = await chatlogsBucket().get(key)
  if (!object) return new Response(null, { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers as never)
  headers.set('etag', object.httpEtag)
  headers.set('cache-control', 'private, no-store')
  return new Response(object.body as unknown as BodyInit, { headers })
}

export const PUT: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const key = safeChatlogKey(params.path ?? null)
  if (!key) return error(400, 'Invalid chatlog key')
  if (!request.body) return error(400, 'Request body is required')

  const tooLarge = validateContentLength(request)
  if (tooLarge) return tooLarge

  try {
    const body = request.body as unknown as Parameters<R2Bucket['put']>[1]
    const object = await chatlogsBucket().put(key, body, {
      httpMetadata: {
        contentType: request.headers.get('content-type') ?? 'application/octet-stream',
      },
    })
    return new Response(
      JSON.stringify({ key: object.key, size: object.size }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  } catch {
    return error(500, 'Failed to upload chatlog')
  }
}

export const DELETE: APIRoute = async ({ request, params }) => {
  if (!(await authenticate(request, 'admin'))) return error(401, 'Unauthorized')
  const key = safeChatlogKey(params.path ?? null)
  if (!key) return error(400, 'Invalid chatlog key')

  try {
    await chatlogsBucket().delete(key)
    return new Response(JSON.stringify({ deleted: key }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch {
    return error(500, 'Failed to delete chatlog')
  }
}
