import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

export const GET: APIRoute = async ({ params }) => {
  const path = params.path?.replace(/^\//, '') ?? ''
  if (!path || path.includes('..')) return new Response(null, { status: 404 })

  const object = await env.CHATLOGS.get(path)
  if (!object) return new Response(null, { status: 404 })

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('etag', object.httpEtag)
  return new Response(object.body, { headers })
}
