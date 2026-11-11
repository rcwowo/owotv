import { CHAT_CACHE_TAG, chatCacheTag, EMOTES_CACHE_TAG } from '@/lib/cache'
import app, { PURGE_HEADER } from '@/server/api'
import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

export const ALL: APIRoute = async ({ request, locals, cache, url }) => {
  const response = await app.fetch(request, env, locals.cfContext)

  const purge = response.headers.get(PURGE_HEADER)
  if (purge) {
    const headers = new Headers(response.headers)
    headers.delete(PURGE_HEADER)
    try {
      await cache.invalidate({ tags: purge.split(',') })
    } catch (err) {
      console.warn('[api] cache purge failed', err)
    }
    return new Response(response.body, { status: response.status, headers })
  }

  if (request.method !== 'GET' || response.status !== 200) return response

  const [, , kind, vodSlug] = url.pathname.split('/')
  if (kind === 'chat' && vodSlug) {
    cache.set({
      maxAge: 300,
      swr: 86400,
      tags: [CHAT_CACHE_TAG, chatCacheTag(vodSlug)],
    })
  } else if (kind === 'emotes') {
    cache.set({ maxAge: 31536000, tags: [EMOTES_CACHE_TAG] })
  }
  return response
}
