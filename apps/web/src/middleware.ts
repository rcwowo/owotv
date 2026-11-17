import { CONTENT_CACHE_TAG } from '@/lib/cache'
import { defineMiddleware } from 'astro:middleware'

export const onRequest = defineMiddleware((context, next) => {
  if (!context.url.pathname.startsWith('/api/')) {
    context.cache.set({ maxAge: 300, swr: 86400, tags: [CONTENT_CACHE_TAG] })
  }
  return next()
})
