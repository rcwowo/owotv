import {
  apiChannel,
  apiError,
  apiMe,
  apiVod,
  channelInput,
  chatManifest,
  chatSegment,
  createVodInput,
  emoteSet,
  MAX_CHAT_SEGMENT_BYTES,
  MAX_EMOTE_SET_BYTES,
  updateVodInput,
} from '@owotv/shared'
import { version } from 'package.json'
import { z } from 'zod'

const description = `
The owoTV API lists the archive's channels and VODs, serves chat replays, and lets tools add, edit, and remove VODs.

## Authentication

Reading is public. Writing needs an API token sent as \`Authorization: Bearer owotv_…\`.

Tokens are created by whoever runs the instance:

\`\`\`sh
bun run owotv token create --name my-bot --role write [--channel <slug>] --remote
\`\`\`

| Role | Can |
| --- | --- |
| \`read\` | Call \`GET /api/me\` |
| \`write\` | Create, edit, and delete VODs and their chat |
| \`admin\` | Everything above, plus create channels |

A token created with \`--channel\` can only touch VODs on that channel.

## Adding a VOD with chat

1. \`POST /api/vods\` creates the VOD and returns its \`slug\`.
2. Optionally \`PUT /api/emotes/{hash}\` uploads the channel's third-party emotes.
3. \`PUT /api/vods/{slug}/chat/{segment}\` uploads each chat segment.
4. \`PUT /api/vods/{slug}/chat/manifest\` checks every segment arrived and makes the chat live.

To replace a VOD's chat, \`DELETE /api/vods/{slug}/chat\` first. The \`owotv\` CLI does all of this from a TwitchDownloader chat file.

## Chat format

Chat is split into time windows of \`segmentSeconds\` (300 to 3600). Segment \`n\` holds messages from \`n × segmentSeconds\` up to the next window, and \`manifest.segments[n]\` is its message count. Segments with no messages are not stored.

Each message is \`[offsetSeconds, userIndex, fragments]\`. \`userIndex\` points into the segment's \`users\`. A fragment is plain text, or \`[text, twitchEmoteId]\` for a Twitch emote.

## Errors

Errors return \`{ "error": "…" }\`. Validation errors (400) add \`issues\`, and conflicts (409) add the \`slug\` of the existing record.
`.trim()

const registry = z.registry<{ id: string; description?: string }>()
registry.add(apiChannel, { id: 'Channel' })
registry.add(channelInput, { id: 'ChannelInput' })
registry.add(apiVod, { id: 'Vod' })
registry.add(createVodInput, { id: 'CreateVod' })
registry.add(updateVodInput, {
  id: 'UpdateVod',
  description: 'Only the fields you send are changed',
})
registry.add(apiMe, { id: 'Me' })
registry.add(apiError, { id: 'Error' })
registry.add(chatManifest, { id: 'ChatManifest' })
registry.add(chatSegment, { id: 'ChatSegment' })
registry.add(emoteSet, {
  id: 'EmoteSet',
  description: 'Emote names mapped to their provider and id',
})

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` })
const json = (schema: object) => ({
  content: { 'application/json': { schema } },
})
const ok = (id: string, description = 'OK') => ({
  description,
  ...json(ref(id)),
})
const list = (id: string) => ({
  description: 'OK',
  ...json({ type: 'array', items: ref(id) }),
})
const body = (id: string, description?: string) => ({
  required: true,
  ...(description ? { description } : {}),
  ...json(ref(id)),
})
const error = (description: string) => ({ description, ...json(ref('Error')) })

const errors = {
  badRequest: error('Invalid request body'),
  unauthorized: error('Missing or invalid token'),
  forbidden: error('Token lacks the role or channel access'),
  notFound: error('Not found'),
  conflict: error('Already exists'),
  tooLarge: error('Body is too large'),
}

const path = (name: string, description: string, pattern?: string) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', ...(pattern ? { pattern } : {}) },
})
const vodSlug = path('slug', 'VOD slug')
const auth = [{ token: [] }]
const writeErrors = {
  401: errors.unauthorized,
  403: errors.forbidden,
  404: errors.notFound,
}
const noContent = { 204: { description: 'Done' } }

const paths = {
  '/api/me': {
    get: {
      tags: ['Tokens'],
      operationId: 'getMe',
      summary: 'Show the current token',
      security: auth,
      responses: { 200: ok('Me'), 401: errors.unauthorized },
    },
  },
  '/api/channels': {
    get: {
      tags: ['Channels'],
      operationId: 'listChannels',
      summary: 'List channels',
      security: [],
      responses: { 200: list('Channel') },
    },
    post: {
      tags: ['Channels'],
      operationId: 'createChannel',
      summary: 'Create a channel',
      description: 'Needs an admin token that is not limited to a channel.',
      security: auth,
      requestBody: body('ChannelInput'),
      responses: {
        201: ok('Channel', 'Created'),
        400: errors.badRequest,
        401: errors.unauthorized,
        403: errors.forbidden,
        409: errors.conflict,
      },
    },
  },
  '/api/vods': {
    get: {
      tags: ['VODs'],
      operationId: 'listVods',
      summary: 'List VODs',
      description: 'Newest first.',
      security: [],
      parameters: [
        {
          name: 'channel',
          in: 'query',
          description: 'Only VODs from this channel',
          schema: { type: 'string' },
        },
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
        },
        {
          name: 'offset',
          in: 'query',
          schema: { type: 'integer', minimum: 0, maximum: 100000, default: 0 },
        },
      ],
      responses: { 200: list('Vod'), 404: errors.notFound },
    },
    post: {
      tags: ['VODs'],
      operationId: 'createVod',
      summary: 'Create a VOD',
      description:
        'Needs a write token. Returns 409 with the existing slug when `sourceTwitchVodId` is already archived.',
      security: auth,
      requestBody: body('CreateVod'),
      responses: {
        201: ok('Vod', 'Created'),
        400: errors.badRequest,
        ...writeErrors,
        409: errors.conflict,
      },
    },
  },
  '/api/vods/{slug}': {
    parameters: [vodSlug],
    get: {
      tags: ['VODs'],
      operationId: 'getVod',
      summary: 'Get a VOD',
      security: [],
      responses: { 200: ok('Vod'), 404: errors.notFound },
    },
    patch: {
      tags: ['VODs'],
      operationId: 'updateVod',
      summary: 'Edit a VOD',
      security: auth,
      requestBody: body('UpdateVod'),
      responses: { 200: ok('Vod'), 400: errors.badRequest, ...writeErrors },
    },
    delete: {
      tags: ['VODs'],
      operationId: 'deleteVod',
      summary: 'Delete a VOD',
      description: 'Also deletes its chat.',
      security: auth,
      responses: { ...noContent, ...writeErrors },
    },
  },
  '/api/vods/{slug}/chat/{segment}': {
    parameters: [vodSlug, path('segment', 'Segment number', '^[0-9]+$')],
    put: {
      tags: ['Chat upload'],
      operationId: 'putChatSegment',
      summary: 'Upload a chat segment',
      description: `Stored as sent, without validation. Needs a \`Content-Length\` header and at most ${MAX_CHAT_SEGMENT_BYTES / 1024 / 1024} MB. The chat goes live once the manifest is uploaded.`,
      security: auth,
      requestBody: body('ChatSegment'),
      responses: {
        ...noContent,
        ...writeErrors,
        411: error('Missing Content-Length'),
        413: errors.tooLarge,
      },
    },
  },
  '/api/vods/{slug}/chat/manifest': {
    parameters: [vodSlug],
    put: {
      tags: ['Chat upload'],
      operationId: 'finalizeChat',
      summary: 'Finish a chat upload',
      description:
        'Checks that every segment with messages was uploaded, removes segments left over from an older upload, and marks the chat ready.',
      security: auth,
      requestBody: body('ChatManifest'),
      responses: {
        200: ok('Vod'),
        400: errors.badRequest,
        ...writeErrors,
        409: error('Some segments were not uploaded'),
      },
    },
  },
  '/api/vods/{slug}/chat': {
    parameters: [vodSlug],
    delete: {
      tags: ['Chat upload'],
      operationId: 'deleteChat',
      summary: 'Delete a VOD’s chat',
      security: auth,
      responses: { ...noContent, ...writeErrors },
    },
  },
  '/api/emotes/{hash}': {
    parameters: [
      path(
        'hash',
        'First 16 hex characters of the SHA-256 of the body',
        '^[0-9a-f]{16}$',
      ),
    ],
    put: {
      tags: ['Chat upload'],
      operationId: 'putEmoteSet',
      summary: 'Upload an emote set',
      description: `Emote sets are shared between VODs and never change, so uploading an existing hash does nothing. At most ${MAX_EMOTE_SET_BYTES / 1024 / 1024} MB.`,
      security: auth,
      requestBody: body('EmoteSet'),
      responses: {
        ...noContent,
        400: errors.badRequest,
        401: errors.unauthorized,
        403: errors.forbidden,
        411: error('Missing Content-Length'),
        413: errors.tooLarge,
      },
    },
  },
  '/api/chat/{slug}/manifest.json': {
    parameters: [vodSlug],
    get: {
      tags: ['Chat replay'],
      operationId: 'getChatManifest',
      summary: 'Get a VOD’s chat manifest',
      security: [],
      responses: { 200: ok('ChatManifest'), 404: { description: 'No chat' } },
    },
  },
  '/api/chat/{slug}/{segment}.json': {
    parameters: [vodSlug, path('segment', 'Segment number', '^[0-9]+$')],
    get: {
      tags: ['Chat replay'],
      operationId: 'getChatSegment',
      summary: 'Get a chat segment',
      security: [],
      responses: {
        200: ok('ChatSegment'),
        404: { description: 'No such segment' },
      },
    },
  },
  '/api/emotes/{hash}.json': {
    parameters: [path('hash', 'Emote set hash', '^[0-9a-f]{16}$')],
    get: {
      tags: ['Chat replay'],
      operationId: 'getEmoteSet',
      summary: 'Get an emote set',
      description: 'The hash comes from `ChatManifest.emoteSet`.',
      security: [],
      responses: { 200: ok('EmoteSet'), 404: { description: 'Not found' } },
    },
  },
}

let schemas: Record<string, unknown> | undefined

function componentSchemas() {
  if (schemas) return schemas
  const generated = z.toJSONSchema(registry, {
    io: 'input',
    uri: (id) => `#/components/schemas/${id}`,
  }).schemas
  schemas = Object.fromEntries(
    Object.entries(generated).map(([id, { $schema, $id, ...schema }]) => [
      id,
      schema,
    ]),
  )
  return schemas
}

export function openApiSpec(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'owoTV API',
      version,
      description,
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: origin }],
    tags: [
      { name: 'VODs', description: 'Archived streams' },
      { name: 'Channels', description: 'Streamers archived on this instance' },
      { name: 'Chat replay', description: 'Public, cached chat files' },
      { name: 'Chat upload', description: 'Adding and replacing chat' },
      { name: 'Tokens', description: 'API token details' },
    ],
    paths,
    components: {
      schemas: componentSchemas(),
      securitySchemes: {
        token: {
          type: 'http',
          scheme: 'bearer',
          description: 'An API token starting with `owotv_`',
        },
      },
    },
  }
}

export const docsHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>owoTV API</title>
    <link rel="icon" type="image/png" href="/static/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Roboto+Mono&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.76.0"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '/api/openapi.json',
        forceDarkModeState: 'dark',
        hideDarkModeToggle: true,
        hideClientButton: true,
        showDeveloperTools: 'never',
        agent: { disabled: true },
        withDefaultFonts: false,
        customCss: \`
          :root {
            --scalar-font: Outfit, ui-sans-serif, system-ui, sans-serif;
            --scalar-font-code: 'Roboto Mono', ui-monospace, monospace;
          }
          .dark-mode {
            --scalar-background-1: hsl(250 15% 4%);
            --scalar-background-2: hsl(250 12% 7%);
            --scalar-background-3: hsl(250 10% 12%);
            --scalar-border-color: hsl(250 10% 14%);
            --scalar-color-1: hsl(45 10% 90%);
            --scalar-color-2: hsl(250 5% 65%);
            --scalar-color-3: hsl(250 5% 50%);
            --scalar-color-accent: hsl(330 80% 65%);
            --scalar-background-accent: hsl(330 80% 65% / 0.1);
          }
          .generate-sdk-button,
          .explore-scalar-cta,
          .explore-scalar-headline { display: none !important; }
          .dark-mode .sidebar { --scalar-sidebar-background-1: hsl(250 15% 4%); }
        \`,
      })
    </script>
  </body>
</html>`
