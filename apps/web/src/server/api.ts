import { chatCacheTag, CONTENT_CACHE_TAG } from '@/lib/cache'
import {
  ConflictError,
  createChannel,
  createVod,
  deleteChat,
  deleteVod,
  finalizeChat,
  findChannel,
  getApiVod,
  listApiVods,
  listChannels,
  NotFoundError,
  roleAllows,
  sha256Hex,
  updateVod,
  verifyToken,
  type Store,
  type TokenIdentity,
} from '@owotv/core'
import { channels, createDb, vods, type TokenRole } from '@owotv/db'
import {
  channelInput,
  chatManifest,
  chatManifestKey,
  chatSegmentKey,
  createVodInput,
  emoteSet,
  emoteSetKey,
  MAX_CHAT_SEGMENT_BYTES,
  MAX_EMOTE_SET_BYTES,
  updateVodInput,
} from '@owotv/shared'
import { eq } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { docsHtml, openApiSpec } from './openapi'
import { ZodError } from 'zod'

export const PURGE_HEADER = 'X-Owotv-Purge'

type ApiEnv = {
  Bindings: Env
  Variables: { token: TokenIdentity; store: Store }
}

const app = new Hono<ApiEnv>().basePath('/api')

class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 411 | 413,
    message: string,
  ) {
    super(message)
  }
}

app.use(async (c, next) => {
  c.set('store', { db: createDb(c.env.DB), bucket: c.env.BUCKET })
  await next()
})

app.onError((err, c) => {
  if (err instanceof HttpError)
    return c.json({ error: err.message }, err.status)
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404)
  if (err instanceof ConflictError) {
    return c.json({ error: err.message, slug: err.slug }, 409)
  }
  if (err instanceof ZodError) {
    return c.json({ error: 'Invalid request body', issues: err.issues }, 400)
  }
  console.error(err)
  return c.json({ error: 'Internal error' }, 500)
})

const requireRole = (role: TokenRole) =>
  createMiddleware<ApiEnv>(async (c, next) => {
    const header = c.req.header('Authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    const identity = token ? await verifyToken(c.var.store.db, token) : null
    if (!identity) throw new HttpError(401, 'Missing or invalid API token')
    if (!roleAllows(identity.role, role)) {
      throw new HttpError(403, `This token needs the "${role}" role`)
    }
    c.set('token', identity)
    await next()
  })

function assertChannelAccess(token: TokenIdentity, channelId: number) {
  if (token.channelId !== null && token.channelId !== channelId) {
    throw new HttpError(403, 'This token is limited to another channel')
  }
}

async function vodForWrite(c: Context<ApiEnv>, slug: string) {
  const vod = await c.var.store.db.query.vods.findFirst({
    where: eq(vods.slug, slug),
    columns: { id: true, channelId: true },
  })
  if (!vod) throw new NotFoundError(`No VOD "${slug}"`)
  assertChannelAccess(c.var.token, vod.channelId)
  return vod
}

const purge = (c: Context<ApiEnv>, ...tags: string[]) =>
  c.header(PURGE_HEADER, tags.join(','))

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

async function readLimitedBody(c: Context<ApiEnv>, limit: number) {
  const declared = Number(c.req.header('Content-Length'))
  if (!Number.isInteger(declared) || declared < 0) {
    throw new HttpError(411, 'Content-Length is required')
  }
  if (declared > limit) throw new HttpError(413, 'Request body is too large')
  const body = await c.req.arrayBuffer()
  if (body.byteLength > limit) {
    throw new HttpError(413, 'Request body is too large')
  }
  return body
}

async function readJson(c: Context<ApiEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON')
  }
}

app.get('/', (c) => c.redirect('/api/docs'))
app.get('/docs', (c) => c.html(docsHtml))
app.get('/openapi.json', (c) => c.json(openApiSpec(new URL(c.req.url).origin)))

app.get('/chat/:vod{[0-9a-z]+}/:file{(manifest|[0-9]+)\\.json}', (c) => {
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

app.get('/me', requireRole('read'), async (c) => {
  const { token, store } = c.var
  const channel = token.channelId
    ? await store.db.query.channels.findFirst({
        where: eq(channels.id, token.channelId),
        columns: { slug: true },
      })
    : undefined
  return c.json({
    name: token.name,
    role: token.role,
    channel: channel?.slug ?? null,
  })
})

app.get('/channels', async (c) => c.json(await listChannels(c.var.store.db)))

app.post('/channels', requireRole('admin'), async (c) => {
  if (c.var.token.channelId !== null) {
    throw new HttpError(403, 'This token is limited to one channel')
  }
  const channel = await createChannel(
    c.var.store.db,
    channelInput.parse(await readJson(c)),
  )
  purge(c, CONTENT_CACHE_TAG)
  return c.json(channel, 201)
})

app.get('/vods', async (c) => {
  const db = c.var.store.db
  const slug = c.req.query('channel')
  const channel = slug ? await findChannel(db, slug) : undefined
  if (slug && !channel) throw new NotFoundError(`No channel "${slug}"`)
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 500)
  const offset = Math.min(Math.max(Number(c.req.query('offset')) || 0, 0), 1e5)
  return c.json(
    await listApiVods(db, { channelId: channel?.id, limit, offset }),
  )
})

app.get('/vods/:slug', async (c) => {
  const vod = await getApiVod(c.var.store.db, c.req.param('slug'))
  if (!vod) throw new NotFoundError(`No VOD "${c.req.param('slug')}"`)
  return c.json(vod)
})

app.post('/vods', requireRole('write'), async (c) => {
  const input = createVodInput.parse(await readJson(c))
  const channel = await findChannel(c.var.store.db, input.channel)
  if (!channel) throw new NotFoundError(`No channel "${input.channel}"`)
  assertChannelAccess(c.var.token, channel.id)
  const vod = await createVod(c.var.store.db, channel.id, input)
  purge(c, CONTENT_CACHE_TAG)
  return c.json(vod, 201)
})

app.patch('/vods/:slug', requireRole('write'), async (c) => {
  const slug = c.req.param('slug')
  await vodForWrite(c, slug)
  const input = updateVodInput.parse(await readJson(c))
  const vod = await updateVod(c.var.store.db, slug, input)
  purge(c, CONTENT_CACHE_TAG)
  return c.json(vod)
})

app.delete('/vods/:slug', requireRole('write'), async (c) => {
  const slug = c.req.param('slug')
  await vodForWrite(c, slug)
  await deleteVod(c.var.store, slug)
  purge(c, CONTENT_CACHE_TAG, chatCacheTag(slug))
  return c.body(null, 204)
})

app.put(
  '/vods/:slug/chat/:segment{[0-9]+}',
  requireRole('write'),
  async (c) => {
    const slug = c.req.param('slug')
    await vodForWrite(c, slug)
    const body = await readLimitedBody(c, MAX_CHAT_SEGMENT_BYTES)
    await c.env.BUCKET.put(
      chatSegmentKey(slug, Number(c.req.param('segment'))),
      body,
      { httpMetadata: { contentType: 'application/json' } },
    )
    return c.body(null, 204)
  },
)

app.put('/vods/:slug/chat/manifest', requireRole('write'), async (c) => {
  const slug = c.req.param('slug')
  await vodForWrite(c, slug)
  const manifest = chatManifest.parse(await readJson(c))
  await finalizeChat(c.var.store, slug, manifest)
  purge(c, CONTENT_CACHE_TAG, chatCacheTag(slug))
  return c.json(await getApiVod(c.var.store.db, slug))
})

app.delete('/vods/:slug/chat', requireRole('write'), async (c) => {
  const slug = c.req.param('slug')
  await vodForWrite(c, slug)
  await deleteChat(c.var.store, slug)
  purge(c, CONTENT_CACHE_TAG, chatCacheTag(slug))
  return c.body(null, 204)
})

app.put('/emotes/:hash{[0-9a-f]{16}}', requireRole('write'), async (c) => {
  const hash = c.req.param('hash')
  const body = new TextDecoder().decode(
    await readLimitedBody(c, MAX_EMOTE_SET_BYTES),
  )
  if ((await sha256Hex(body)).slice(0, 16) !== hash) {
    throw new HttpError(400, 'Emote set does not match its hash')
  }
  try {
    emoteSet.parse(JSON.parse(body))
  } catch (err) {
    if (err instanceof ZodError) throw err
    throw new HttpError(400, 'Request body is not valid JSON')
  }
  const key = emoteSetKey(hash)
  if (!(await c.env.BUCKET.head(key))) {
    await c.env.BUCKET.put(key, body, {
      httpMetadata: { contentType: 'application/json' },
    })
  }
  return c.body(null, 204)
})

export default app
