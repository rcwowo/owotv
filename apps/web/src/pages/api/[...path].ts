import { CHAT_CACHE_TAG, chatCacheTag, EMOTES_CACHE_TAG } from '@/lib/cache'
import app from '@/server/api'
import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'

export const ALL: APIRoute = async ({ request, locals, cache, url }) => {
  const response = await app.fetch(request, env, locals.cfContext)
  if (response.status !== 200) return response

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
