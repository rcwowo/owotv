import { chatManifestKey, chatSegmentKey, emoteSetKey } from '@owotv/shared'
import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>().basePath('/api')

async function serveObject(
  bucket: R2Bucket,
  key: string,
  request: Request,
  cacheControl: string,
) {
  const object = await bucket.get(key, { onlyIf: request.headers })
  if (!object) return new Response('Not found', { status: 404 })

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': cacheControl,
    ETag: object.httpEtag,
  })
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  return new Response(object.body, { headers })
}

app.get('/chat/:vod/:file{(manifest|[0-9]+)\\.json}', (c) => {
  const { vod, file } = c.req.param()
  const name = file.replace('.json', '')
  const key =
    name === 'manifest'
      ? chatManifestKey(vod)
      : chatSegmentKey(vod, Number(name))
  return serveObject(
    c.env.BUCKET,
    key,
    c.req.raw,
    'public, max-age=300, stale-while-revalidate=86400',
  )
})

app.get('/emotes/:file{[0-9a-f]{16}\\.json}', (c) =>
  serveObject(
    c.env.BUCKET,
    emoteSetKey(c.req.param('file').replace('.json', '')),
    c.req.raw,
    'public, max-age=31536000, immutable',
  ),
)

export default app
