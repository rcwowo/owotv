import type { APIRoute } from 'astro'
import { json } from '@/lib/api/http'
import { CHATLOG_LIMITS } from '@/lib/api/chatlogs'

export const prerender = false

export const GET: APIRoute = async () =>
  json({
    name: 'owotv API',
    version: 'v1',
    auth: 'Authorization: Bearer <key> or X-API-Key header. Admin keys: full access; read keys: GET/HEAD only.',
    limits: CHATLOG_LIMITS,
    endpoints: [
      'GET    /api/v1/docs  (interactive Scalar API reference)',
      'GET    /api/v1/openapi.json  (OpenAPI 3.1 spec)',
      'GET    /api/v1/vods',
      'POST   /api/v1/vods',
      'GET    /api/v1/vods/{id}',
      'PUT    /api/v1/vods/{id}  (PATCH is an alias)',
      'DELETE /api/v1/vods/{id}',
      'GET    /api/v1/shows',
      'POST   /api/v1/shows',
      'GET    /api/v1/shows/{slug}',
      'PUT    /api/v1/shows/{slug}  (PATCH is an alias)',
      'DELETE /api/v1/shows/{slug}',
      'POST   /api/v1/shows/{slug}/episodes',
      'DELETE /api/v1/shows/{slug}/episodes/{episodeId}',
      'GET    /api/v1/episodes',
      'POST   /api/v1/episodes',
      'GET    /api/v1/episodes/{id}',
      'PUT    /api/v1/episodes/{id}  (PATCH is an alias)',
      'DELETE /api/v1/episodes/{id}',
      'GET    /api/v1/chatlogs?limit=&cursor=&prefix=',
      'POST   /api/v1/chatlogs  (X-Object-Key header)',
      'DELETE /api/v1/chatlogs?key=...&key=...  (up to 1000 keys)',
      'GET    /api/v1/chatlogs/{path}  (X-Object-Metadata header = HEAD equivalent)',
      'PUT    /api/v1/chatlogs/{path}',
      'DELETE /api/v1/chatlogs/{path}',
    ],
  })
