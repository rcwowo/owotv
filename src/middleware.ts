import type { MiddlewareHandler } from 'astro'
import { getOrRender } from '@/lib/cache'

export const onRequest: MiddlewareHandler = async (context, next) => {
  if (context.url.pathname.startsWith('/api/')) return next()
  return getOrRender(context.request, next)
}
