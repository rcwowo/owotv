import type { APIRoute } from 'astro'
import { CHATLOG_LIMITS } from '@/lib/api/chatlogs'

export const prerender = false

const authError = {
  description:
    'Unauthorized: missing or invalid API key. Admin keys authenticate against ADMIN_API_KEYS; read keys against READ_API_KEYS.',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
      example: { error: 'Unauthorized' },
    },
  },
}

const vodIdParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'VOD identifier (UUIDv4, the key used by /watch/ URLs).',
  schema: { type: 'string', format: 'uuid' },
  example: '3f1d8a2e-6b7c-4f8e-9d2a-1b0c9e8f7a6d',
}

const episodeIdParam = {
  name: 'id',
  in: 'path',
  required: true,
  description:
    'Episode identifier. Not a UUID in practice: episode ids are stable UUIDv5-derived strings for seeded shows, but the API accepts and stores any non-empty string.',
  schema: { type: 'string' },
  example: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d',
}

const showSlugParam = {
  name: 'slug',
  in: 'path',
  required: true,
  description:
    'Show slug (lowercase alphanumerics or hyphens, must start alphanumeric).',
  schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
  example: 'sleepless-nights',
}

const chatlogPathParam = {
  name: 'path',
  in: 'path',
  required: true,
  description:
    'Chatlog object key (R2 key), without leading or trailing slashes. Printable ASCII only; each path segment may use letters, digits and _ . @ + = : ~ - (dots and ".." segments are rejected).',
  schema: { type: 'string' },
  example: '2025/09/stream-2025-09-20.jsonl',
}

const standardErrors = {
  '401': authError,
  '500': {
    description: 'Internal server error.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { error: 'Something went wrong.' },
      },
    },
  },
}

const vodItemErrors = {
  '400': {
    description: 'The {id} path parameter is not a valid UUID.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { error: 'Invalid VOD id' },
      },
    },
  },
  ...standardErrors,
}

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'owotv API',
    version: '1.0.0',
    summary: 'Management API for the owoTV VOD archive.',
    description: `Authenticated management API for the owoTV VOD archive (built on Cloudflare D1 + R2).

## Authentication
All endpoints except the discovery and documentation routes require an API key, sent as either:
- \`Authorization: Bearer <key>\`, or
- \`X-API-Key: <key>\` (takes precedence when both are present).

Keys are configured server-side as comma-separated lists in the \`ADMIN_API_KEYS\` and \`READ_API_KEYS\` secrets and compared by SHA-256 digest. **Admin** keys get full access. **Read** keys may only call read endpoints (GET/HEAD) and only see published VODs (\`published = 1\`).

## Resources
- \`vods\`, \`shows\`, \`episodes\` and show↔episode links live in D1 (SQLite).
- \`chatlogs\` are raw objects in R2, uploaded and downloaded as streams; nothing is buffered in memory. Upload bodies are streamed straight into R2, so the practical size ceiling is R2's per-object limit (512 MiB), enforced nowhere in the API itself.
- Creating, updating or deleting a VOD also purges the site's CDN/page caches for affected public pages.

## Documentation
- Interactive Scalar UI: \`GET /api/v1/docs\`
- This document: \`GET /api/v1/openapi.json\`
- Machine-readable discovery: \`GET /api/v1\``,
    license: {
      name: 'MIT',
      url: 'https://github.com/rcwowo/owotv/blob/main/LICENSE',
    },
    contact: { email: 'riley@rcw.lol' },
  },
  servers: [
    {
      url: '/',
      description:
        'Current instance (relative — resolves against the host serving this document).',
    },
  ],
  tags: [
    { name: 'VODs', description: 'Streamed VOD records stored in D1.' },
    { name: 'Shows', description: 'Show records and their episode links.' },
    { name: 'Episodes', description: 'Episode records stored in D1.' },
    { name: 'Chatlogs', description: 'Raw chat log objects backed by R2.' },
    {
      name: 'Discovery',
      description: 'Unauthenticated discovery and documentation routes.',
    },
  ],
  security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  paths: {
    '/api/v1': {
      get: {
        tags: ['Discovery'],
        summary: 'Discovery endpoint',
        description:
          'Unauthenticated machine-readable index of the API (name, version, auth rules, limits, endpoint list).',
        security: [],
        responses: {
          '200': {
            description: 'Discovery metadata.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', examples: ['owotv API'] },
                    version: { type: 'string', examples: ['v1'] },
                    auth: {
                      type: 'string',
                      description: 'Human-readable auth summary.',
                    },
                    limits: { $ref: '#/components/schemas/ChatlogLimits' },
                    endpoints: {
                      type: 'array',
                      items: { type: 'string' },
                      description:
                        'Flat list of "METHOD /path" entries, including the docs and OpenAPI routes.',
                    },
                  },
                  required: ['name', 'version', 'auth', 'limits', 'endpoints'],
                },
                example: {
                  name: 'owotv API',
                  version: 'v1',
                  auth: 'Authorization: Bearer <key> or X-API-Key header. Admin keys: full access; read keys: GET/HEAD only.',
                  limits: { maxBytes: 536870912 },
                  endpoints: [
                    'GET    /api/v1/docs',
                    'GET    /api/v1/openapi.json',
                    'GET    /api/v1/vods',
                    'POST   /api/v1/vods',
                    'DELETE /api/v1/chatlogs?key=...&key=...',
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/docs': {
      get: {
        tags: ['Discovery'],
        summary: 'Interactive API documentation (Scalar UI)',
        description:
          'Renders the Scalar API Reference UI with this OpenAPI document. No authentication required. Served as HTML; open in a browser.',
        security: [],
        responses: {
          '200': {
            description: 'The interactive documentation page.',
            content: {
              'text/html': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },
    '/api/v1/openapi.json': {
      get: {
        tags: ['Discovery'],
        summary: 'This OpenAPI document',
        description:
          'Returns the raw OpenAPI 3.1 document that powers /api/v1/docs. No authentication required.',
        security: [],
        responses: {
          '200': {
            description: 'OpenAPI 3.1 JSON document.',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
    '/api/v1/vods': {
      get: {
        tags: ['VODs'],
        summary: 'List VODs',
        description:
          'Returns every VOD record ordered by stream date (newest first), rank ascending. Read keys only receive published VODs; admin keys also receive unpublished ones.',
        responses: {
          '200': {
            description: 'VOD list (empty when the database has none).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VodListResponse' },
                example: {
                  data: [
                    {
                      id: '3f1d8a2e-6b7c-4f8e-9d2a-1b0c9e8f7a6d',
                      title: 'perfect king - private remedy 2',
                      stream_date: '2025-09-20',
                      duration: '4:31:07',
                      game: 'Private Remedy',
                      game_cover_url:
                        'https://static-cdn.jtvnw.net/boxart/49205248.jpg',
                      vod_url: 'https://www.twitch.tv/videos/2448839102',
                      thumbnail_url:
                        'https://static-cdn.jtvnw.net/previews-ttv/live_user_rcwowo.jpg',
                      chat_replay_path: '2025/09/stream-2025-09-20.jsonl',
                      published: 1,
                      rank: 0,
                    },
                  ],
                },
              },
            },
          },
          '401': authError,
          '500': standardErrors['500'],
        },
      },
      post: {
        tags: ['VODs'],
        summary: 'Create a VOD',
        description:
          'Creates a VOD record. `title`, `stream_date`, `duration`, `game`, `game_cover_url`, `vod_url` and `thumbnail_url` are required non-empty strings; everything else is optional (type-checked the same way as PUT). An explicit `id` (any non-empty string, conventionally a UUIDv4) is honoured if provided, otherwise one is generated. `published` is stored as the SQLite-style 0/1 integer. Purges public site caches on success.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateVodRequest' },
              example: {
                id: '3f1d8a2e-6b7c-4f8e-9d2a-1b0c9e8f7a6d',
                title: 'perfect king - private remedy 2',
                stream_date: '2025-09-20',
                duration: '4:31:07',
                game: 'Private Remedy',
                game_cover_url:
                  'https://static-cdn.jtvnw.net/boxart/49205248.jpg',
                vod_url: 'https://www.twitch.tv/videos/2448839102',
                thumbnail_url:
                  'https://static-cdn.jtvnw.net/previews-ttv/live_user_rcwowo.jpg',
                chat_replay_path: '2025/09/stream-2025-09-20.jsonl',
                published: 1,
                rank: 0,
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'The created VOD record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VodRecord' },
              },
            },
          },
          '400': {
            description:
              'Body is not valid JSON, or required fields are missing/empty. The error message lists the offending fields.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  invalidJson: {
                    summary: 'Body is not valid JSON',
                    value: { error: 'Request body must be valid JSON' },
                  },
                  missingFields: {
                    summary: 'Required fields missing',
                    value: {
                      error: 'Missing or invalid fields: title, vod_url',
                    },
                  },
                  invalidValues: {
                    summary: 'Present-but-invalid field values',
                    value: {
                      error: 'Invalid fields: stream_date, rank, published',
                    },
                  },
                },
              },
            },
          },
          '401': authError,
          '409': {
            description: 'A VOD with the same id already exists.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error:
                    'VOD with id "3f1d8a2e-6b7c-4f8e-9d2a-1b0c9e8f7a6d" already exists',
                },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
    '/api/v1/vods/{id}': {
      get: {
        tags: ['VODs'],
        summary: 'Get a VOD',
        description:
          'Returns a single VOD by id. Read keys only receive the record if it is published.',
        parameters: [vodIdParam],
        responses: {
          '200': {
            description: 'The VOD record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VodRecord' },
              },
            },
          },
          ...vodItemErrors,
          '404': {
            description:
              'No such VOD (or it is not published and the key only has read scope).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'VOD not found' },
              },
            },
          },
        },
      },
      put: {
        tags: ['VODs'],
        summary: 'Update a VOD',
        description:
          'Partially updates the given VOD: only fields present in the body are written. Field values are type-checked (`stream_date` must be a valid YYYY-MM-DD date, `published` a 0/1 integer or boolean, `rank` an integer, strings non-empty) — present-but-invalid values are rejected with `Invalid fields: <field>`. Sending no updatable fields returns 400. `chat_replay_path` can be set to null to unset it. Purges public site caches on success.',
        parameters: [vodIdParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateVodRequest' },
              example: {
                title: 'perfect king - private remedy 2 (fixed)',
                published: 1,
                rank: 2,
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'The updated VOD record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VodRecord' },
              },
            },
          },
          ...vodItemErrors,
          '404': {
            description:
              'No such VOD (or it vanished between lookup and update).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error:
                    'VOD "3f1d8a2e-6b7c-4f8e-9d2a-1b0c9e8f7a6d" not found or already deleted',
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ['VODs'],
        summary: 'Delete a VOD',
        description:
          'Deletes the VOD record permanently. Purges public site caches on success.',
        parameters: [vodIdParam],
        responses: {
          '200': {
            description: 'Deletion succeeded.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteOkResponse' },
                example: { deleted: '3f1d8a2e-6b7c-4f8e-9d2a-1b0c9e8f7a6d' },
              },
            },
          },
          ...vodItemErrors,
          '404': {
            description: 'No VOD with this id.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error: 'VOD "3f1d8a2e-6b7c-4f8e-9d2a-1b0c9e8f7a6d" not found',
                },
              },
            },
          },
        },
      },
      patch: {
        tags: ['VODs'],
        summary: 'Update a VOD (alias of PUT)',
        description:
          'PATCH is registered as an exact alias of PUT on this route; the request semantics are identical.',
        parameters: [vodIdParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateVodRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'The updated VOD record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/VodRecord' },
              },
            },
          },
          ...vodItemErrors,
          '404': {
            description: 'No such VOD.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error:
                    'VOD "3f1d8a2e-6b7c-4f8e-9d2a-1b0c9e8f7a6d" not found or already deleted',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/shows': {
      get: {
        tags: ['Shows'],
        summary: 'List shows',
        description:
          'Returns every show ordered by rank ascending, then name ascending. (Shows are not scope-filtered: read keys see them all.)',
        responses: {
          '200': {
            description: 'Show list.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShowListResponse' },
                example: {
                  data: [
                    {
                      slug: 'sleepless-nights',
                      name: 'Sleepless Nights',
                      description: 'Late-night co-op chaos.',
                      cover_url:
                        'https://example.com/covers/sleepless-nights.webp',
                      logo_url:
                        'https://example.com/logos/sleepless-nights.webp',
                      rank: 0,
                    },
                  ],
                },
              },
            },
          },
          '401': authError,
          '500': standardErrors['500'],
        },
      },
      post: {
        tags: ['Shows'],
        summary: 'Create a show',
        description:
          'Creates a show. `slug`, `name`, `cover_url` and `logo_url` are required non-empty strings; `slug` must match `^[a-z0-9][a-z0-9-]*$`. `description` defaults to "" and `rank` to 0 (type-checked the same way as PUT). Purges public site caches on success.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateShowRequest' },
              example: {
                slug: 'sleepless-nights',
                name: 'Sleepless Nights',
                description: 'Late-night co-op chaos.',
                cover_url: 'https://example.com/covers/sleepless-nights.webp',
                logo_url: 'https://example.com/logos/sleepless-nights.webp',
                rank: 0,
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'The created show record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShowRecord' },
              },
            },
          },
          '400': {
            description:
              'Body is not valid JSON, required fields are missing, or the slug is malformed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  invalidJson: {
                    summary: 'Body is not valid JSON',
                    value: { error: 'Request body must be valid JSON' },
                  },
                  missingFields: {
                    summary: 'Required fields missing',
                    value: { error: 'Missing or invalid fields: logo_url' },
                  },
                  invalidSlug: {
                    summary: 'Slug violates the pattern',
                    value: {
                      error: 'Slug must be lowercase alphanumerics or hyphens',
                    },
                  },
                  invalidValues: {
                    summary: 'Present-but-invalid field values',
                    value: {
                      error: 'Invalid fields: name, rank',
                    },
                  },
                },
              },
            },
          },
          '401': authError,
          '409': {
            description: 'A show with the same slug already exists.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Show "sleepless-nights" already exists' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
    '/api/v1/shows/{slug}': {
      get: {
        tags: ['Shows'],
        summary: 'Get a show',
        description:
          'Returns the show record plus the ids of every linked episode.',
        parameters: [showSlugParam],
        responses: {
          '200': {
            description: 'The show record with its linked episode ids.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShowWithEpisodes' },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'No show with this slug.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Show not found' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
      put: {
        tags: ['Shows'],
        summary: 'Update a show',
        description:
          'Partially updates the given show: only fields present in the body are written (values type-checked like create — invalid values are rejected with `Invalid fields: <field>`). The slug itself is immutable. Sending no updatable fields returns 400. Purges public site caches on success.',
        parameters: [showSlugParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateShowRequest' },
              example: {
                description: 'Late-night co-op chaos, now weekly.',
                rank: 1,
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'The updated show record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShowRecord' },
              },
            },
          },
          '400': {
            description:
              'Body is not valid JSON, or no updatable fields were provided.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  invalidJson: {
                    summary: 'Body is not valid JSON',
                    value: { error: 'Request body must be valid JSON' },
                  },
                  noFields: {
                    summary: 'Nothing to update',
                    value: { error: 'No valid fields to update' },
                  },
                },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'No show with this slug.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Show "sleepless-nights" not found' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
      patch: {
        tags: ['Shows'],
        summary: 'Update a show (alias of PUT)',
        description:
          'PATCH is registered as an exact alias of PUT on this route; the request semantics are identical.',
        parameters: [showSlugParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateShowRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'The updated show record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ShowRecord' },
              },
            },
          },
          '400': {
            description:
              'Body is not valid JSON, or no updatable fields were provided.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  invalidJson: {
                    summary: 'Body is not valid JSON',
                    value: { error: 'Request body must be valid JSON' },
                  },
                  noFields: {
                    summary: 'Nothing to update',
                    value: { error: 'No valid fields to update' },
                  },
                },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'No show with this slug.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Show "sleepless-nights" not found' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
      delete: {
        tags: ['Shows'],
        summary: 'Delete a show',
        description:
          'Deletes the show. Links in show↔episode table are removed automatically by the database (ON DELETE CASCADE). Purges public site caches on success.',
        parameters: [showSlugParam],
        responses: {
          '200': {
            description: 'Deletion succeeded.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteOkResponse' },
                example: { deleted: 'sleepless-nights' },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'No show with this slug.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Show "sleepless-nights" not found' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
    '/api/v1/shows/{slug}/episodes': {
      post: {
        tags: ['Shows'],
        summary: 'Link an episode to a show',
        description:
          'Creates a show↔episode link from `{ "episode_id": "..." }` in the body. Both the show and the episode must exist. Linking an episode that is already linked is idempotent (INSERT OR IGNORE) and still returns 200. Purges public site caches on success.',
        parameters: [showSlugParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LinkEpisodeRequest' },
              example: { episode_id: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d' },
            },
          },
        },
        responses: {
          '200': {
            description:
              'Link exists after the call (created now or already present).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EpisodeLink' },
                example: {
                  show_slug: 'sleepless-nights',
                  episode_id: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d',
                },
              },
            },
          },
          '400': {
            description:
              'Body is not valid JSON, or the `episode_id` field is missing/empty.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  invalidJson: {
                    summary: 'Body is not valid JSON',
                    value: { error: 'Request body must be valid JSON' },
                  },
                  missingEpisodeId: {
                    summary: 'episode_id missing',
                    value: { error: 'Field "episode_id" is required' },
                  },
                },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'The show or the episode does not exist.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  noShow: {
                    summary: 'Unknown show',
                    value: { error: 'Show "sleepless-nights" not found' },
                  },
                  noEpisode: {
                    summary: 'Unknown episode',
                    value: {
                      error:
                        'Episode "4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d" not found',
                    },
                  },
                },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
    '/api/v1/shows/{slug}/episodes/{episodeId}': {
      delete: {
        tags: ['Shows'],
        summary: 'Unlink an episode from a show',
        description:
          'Removes the show↔episode link. Returns 404 when the link does not exist (the show or episode may exist without being linked). Purges public site caches on success.',
        parameters: [
          showSlugParam,
          {
            name: 'episodeId',
            in: 'path',
            required: true,
            description: 'Episode id. Accepted as any non-empty string.',
            schema: { type: 'string' },
            example: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d',
          },
        ],
        responses: {
          '200': {
            description: 'Link removed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UnlinkResponse' },
                example: {
                  unlinked: {
                    show_slug: 'sleepless-nights',
                    episode_id: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d',
                  },
                },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'The link does not exist.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Link not found' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
      post: {
        tags: ['Shows'],
        summary: 'Link an episode to a show (path form)',
        description:
          'Creates a show↔episode link using the episode id from the URL path (no body required). Equivalent to `POST /api/v1/shows/{slug}/episodes` with `{ "episode_id": "<episodeId>" }`. Both the show and the episode must exist; linking an already-linked episode is idempotent (INSERT OR IGNORE) and still returns 200. Purges public site caches on success.',
        parameters: [
          showSlugParam,
          {
            name: 'episodeId',
            in: 'path',
            required: true,
            description: 'Episode id. Accepted as any non-empty string.',
            schema: { type: 'string' },
            example: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d',
          },
        ],
        responses: {
          '200': {
            description:
              'Link exists after the call (created now or already present).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EpisodeLink' },
              },
            },
          },
          '400': {
            description: 'The URL has no episode id segment.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Missing episode id' },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'The show or the episode does not exist.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  noShow: {
                    summary: 'Unknown show',
                    value: { error: 'Show "sleepless-nights" not found' },
                  },
                  noEpisode: {
                    summary: 'Unknown episode',
                    value: {
                      error:
                        'Episode "4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d" not found',
                    },
                  },
                },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
    '/api/v1/episodes': {
      get: {
        tags: ['Episodes'],
        summary: 'List episodes',
        description:
          'Returns every episode ordered by air date (newest first), rank ascending.',
        responses: {
          '200': {
            description: 'Episode list.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EpisodeListResponse' },
                example: {
                  data: [
                    {
                      id: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d',
                      title: 'S1E07 - The Long Drive',
                      duration: '1:57:33',
                      air_date: '2025-08-30',
                      thumbnail_url: 'https://example.com/thumbs/ep107.webp',
                      video_url: 'https://example.com/videos/ep107.mp4',
                      season: 'S1',
                      rank: 0,
                    },
                  ],
                },
              },
            },
          },
          '401': authError,
          '500': standardErrors['500'],
        },
      },
      post: {
        tags: ['Episodes'],
        summary: 'Create an episode',
        description:
          'Creates an episode. Unlike VODs, the client must supply `id` (any non-empty string; seeded episodes use UUIDv5-style stable ids derived from show+season+title). `title`, `duration`, `air_date`, `thumbnail_url`, `video_url` and `season` are also required. `rank` defaults to 0 (type-checked the same way as PUT — `air_date` must be a valid YYYY-MM-DD date). Purges public site caches on success.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateEpisodeRequest' },
              example: {
                id: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d',
                title: 'S1E07 - The Long Drive',
                duration: '1:57:33',
                air_date: '2025-08-30',
                thumbnail_url: 'https://example.com/thumbs/ep107.webp',
                video_url: 'https://example.com/videos/ep107.mp4',
                season: 'S1',
                rank: 0,
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'The created episode record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EpisodeRecord' },
              },
            },
          },
          '400': {
            description:
              'Body is not valid JSON, or required fields are missing/empty (including `id`).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  invalidJson: {
                    summary: 'Body is not valid JSON',
                    value: { error: 'Request body must be valid JSON' },
                  },
                  missingFields: {
                    summary: 'Required fields missing',
                    value: {
                      error: 'Missing or invalid fields: air_date, video_url',
                    },
                  },
                  invalidValues: {
                    summary: 'Present-but-invalid field values',
                    value: { error: 'Invalid fields: air_date, rank' },
                  },
                },
              },
            },
          },
          '401': authError,
          '409': {
            description: 'An episode with the same id already exists.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error:
                    'Episode "4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d" already exists',
                },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
    '/api/v1/episodes/{id}': {
      get: {
        tags: ['Episodes'],
        summary: 'Get an episode',
        description:
          'Returns a single episode by id. The id is matched verbatim against D1 — any string is accepted.',
        parameters: [episodeIdParam],
        responses: {
          '200': {
            description: 'The episode record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EpisodeRecord' },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'No episode with this id.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Episode not found' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
      put: {
        tags: ['Episodes'],
        summary: 'Update an episode',
        description:
          'Partially updates the given episode: only fields present in the body are written (values type-checked like create — invalid values are rejected with `Invalid fields: <field>`). If the body contains no updatable fields, the current record is returned unchanged (200). The id is immutable. Purges public site caches on success.',
        parameters: [episodeIdParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateEpisodeRequest' },
              example: { title: 'S1E07 - The Long Drive (re-upload)', rank: 3 },
            },
          },
        },
        responses: {
          '200': {
            description: 'The updated (or unchanged) episode record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EpisodeRecord' },
              },
            },
          },
          '400': {
            description: 'Body is not valid JSON.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Request body must be valid JSON' },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'No episode with this id.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error:
                    'Episode "4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d" not found',
                },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
      patch: {
        tags: ['Episodes'],
        summary: 'Update an episode (alias of PUT)',
        description:
          'PATCH is registered as an exact alias of PUT on this route; the request semantics are identical.',
        parameters: [episodeIdParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateEpisodeRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'The updated (or unchanged) episode record.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/EpisodeRecord' },
              },
            },
          },
          '400': {
            description: 'Body is not valid JSON.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Request body must be valid JSON' },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'No episode with this id.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error:
                    'Episode "4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d" not found',
                },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
      delete: {
        tags: ['Episodes'],
        summary: 'Delete an episode',
        description:
          'Deletes the episode. Its show↔episode links are removed automatically (ON DELETE CASCADE).',
        parameters: [episodeIdParam],
        responses: {
          '200': {
            description: 'Deletion succeeded.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteOkResponse' },
                example: { deleted: '4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d' },
              },
            },
          },
          '401': authError,
          '404': {
            description: 'No episode with this id.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error:
                    'Episode "4d1f0c2a-77e3-5a9b-8c1d-0e2f3a4b5c6d" not found',
                },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
    '/api/v1/chatlogs': {
      get: {
        tags: ['Chatlogs'],
        summary: 'List chatlog objects',
        description:
          'Lists chatlog objects currently stored in R2 (the bucket CHATLOGS). Supports key-based pagination via `cursor`. When `truncated` is true, pass the returned `cursor` to fetch the next page.',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            description:
              'Maximum number of objects to return. An integer string between 1 and 1000; values above 1000 are clamped, anything non-numeric returns 400. Defaults to 100.',
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 1000,
              default: 100,
            },
            example: 100,
          },
          {
            name: 'cursor',
            in: 'query',
            required: false,
            description:
              'Opaque continuation token from a previous truncated listing.',
            schema: { type: 'string' },
          },
          {
            name: 'prefix',
            in: 'query',
            required: false,
            description: 'Only list objects whose key starts with this prefix.',
            schema: { type: 'string' },
            example: '2025/09/',
          },
        ],
        responses: {
          '200': {
            description: 'Object listing (metadata only, no content).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatlogListResponse' },
              },
            },
          },
          '401': authError,
          '400': {
            description:
              'The listing request is invalid — most commonly an unrecognized `cursor`, a non-numeric `limit`, or an R2 listing failure.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error: 'Invalid chatlog list request (bad cursor or prefix?)',
                },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
      post: {
        tags: ['Chatlogs'],
        summary: 'Upload a chatlog',
        description:
          "Streams the raw request body into R2 under the key given in the `X-Object-Key` header. The body is never buffered in memory; when a `Content-Length` is sent it is checked up front against the 512 MiB chatlog limit (413 otherwise). The request `Content-Type` is preserved as the object's metadata (defaulting to `application/octet-stream`). The object is overwritten if the key already exists.",
        parameters: [
          {
            name: 'X-Object-Key',
            in: 'header',
            required: true,
            description:
              'R2 object key for the upload, without leading/trailing slashes. Printable ASCII only; each segment may use letters, digits and _ . @ + = : ~ - (empty, "." and ".." segments are rejected).',
            schema: { type: 'string' },
            example: '2025/09/stream-2025-09-20.jsonl',
          },
        ],
        requestBody: {
          required: true,
          description:
            'Raw chatlog bytes (e.g. JSONL). Any content type is accepted; `application/json` / `application/x-ndjson` / `application/octet-stream` are all common.',
          content: {
            'application/octet-stream': {
              schema: { $ref: '#/components/schemas/BinaryStream' },
            },
            'application/x-ndjson': {
              schema: { $ref: '#/components/schemas/BinaryStream' },
            },
          },
        },
        responses: {
          '201': {
            description: 'The uploaded object.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatlogUploadCreated' },
                example: {
                  key: '2025/09/stream-2025-09-20.jsonl',
                  size: 46_512_301,
                  uploaded: '2025-09-21T02:14:00.512Z',
                },
              },
            },
          },
          '400': {
            description:
              'The `X-Object-Key` header is missing/invalid, or the request has no body.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  badKey: {
                    summary: 'Missing or malformed X-Object-Key',
                    value: { error: 'Missing or invalid X-Object-Key header' },
                  },
                  noBody: {
                    summary: 'Empty body',
                    value: { error: 'Request body is required' },
                  },
                },
              },
            },
          },
          '401': authError,
          '413': {
            description:
              'The streamed body exceeds the 512 MiB chatlog size limit (checked against `Content-Length` when present).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error: 'Request body exceeds the 536870912 byte chatlog limit',
                },
              },
            },
          },
          '500': {
            description: 'The upload to R2 failed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Failed to upload chatlog' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Chatlogs'],
        summary: 'Delete chatlog objects (bulk)',
        description:
          'Deletes one or many objects in a single call. Pass each key as a `key` (or `key[]`) query parameter, repeated — up to 1000 unique keys per call (enforced with 413). Keys are validated with the same rules as the `X-Object-Key` header; invalid keys are silently dropped, duplicates de-duplicated, and deleting a key that does not exist is not an error.',
        parameters: [
          {
            name: 'key',
            in: 'query',
            required: true,
            description:
              'Object key to delete. Repeat the parameter for bulk deletes (e.g. `?key=a.jsonl&key=b.jsonl`), up to 1000 keys. The `key[]` alias is also accepted.',
            schema: { type: 'string' },
            style: 'form',
            explode: true,
            example: '2025/09/stream-2025-09-20.jsonl',
          },
          {
            name: 'key[]',
            in: 'query',
            required: false,
            description: 'Alias accepted in addition to `key`.',
            schema: { type: 'string' },
            style: 'form',
            explode: true,
          },
        ],
        responses: {
          '200': {
            description: 'The keys that were submitted for deletion.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ChatlogBulkDeleteResponse',
                },
                example: {
                  deleted: [
                    '2025/09/stream-2025-09-20.jsonl',
                    '2025/08/stream-2025-08-13.jsonl',
                  ],
                },
              },
            },
          },
          '400': {
            description: 'No valid `key` parameters were supplied.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error: 'Provide at least one valid ?key= parameter',
                },
              },
            },
          },
          '401': authError,
          '413': {
            description:
              'More than 1000 distinct valid keys were supplied (after deduplication).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Bulk delete is capped at 1000 keys' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
    '/api/v1/chatlogs/{path}': {
      get: {
        tags: ['Chatlogs'],
        summary: 'Download a chatlog (or HEAD-style metadata)',
        description:
          'Streams the object body straight from R2 with its stored content type, an `ETag` and `Cache-Control: private, no-store`. Sending the `X-Object-Metadata` header turns this into a HEAD-equivalent: instead of the object body you receive the object metadata (`{key,size,uploaded}`) as JSON. An empty 404 body is returned when the object is missing.',
        parameters: [
          chatlogPathParam,
          {
            name: 'X-Object-Metadata',
            in: 'header',
            required: false,
            description:
              'When present (any value), the response is the object metadata JSON instead of the object content (HEAD equivalent — the API exposes no literal HEAD method).',
            schema: { type: 'string' },
            example: '1',
          },
        ],
        responses: {
          '200': {
            description:
              'The chatlog object. Without `X-Object-Metadata`: the raw streamed object with its content type and ETag. With the header: the metadata JSON.',
            content: {
              'application/octet-stream': {
                schema: { $ref: '#/components/schemas/BinaryStream' },
              },
              'application/x-ndjson': {
                schema: { $ref: '#/components/schemas/BinaryStream' },
              },
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatlogObjectInfo' },
                example: {
                  key: '2025/09/stream-2025-09-20.jsonl',
                  size: 46_512_301,
                  uploaded: '2025-09-21T02:14:00.512Z',
                },
              },
            },
          },
          '401': authError,
          '400': {
            description:
              'The path is not a valid chatlog key (e.g. a `..` segment or control characters).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Invalid chatlog key' },
              },
            },
          },
          '404': {
            description:
              'The object does not exist. The response has an empty body (no JSON) for this route.',
          },
          '500': standardErrors['500'],
        },
      },
      put: {
        tags: ['Chatlogs'],
        summary: 'Upload a chatlog to an exact path',
        description:
          "Same as `POST /api/v1/chatlogs` but the key comes from the URL path (which must be percent-encoded if it contains characters outside the safe set). The body is streamed into R2 without buffering; the Content-Type is preserved as object metadata. When a `Content-Length` is sent it is checked up front against the 512 MiB chatlog limit (413 otherwise). Returns 200 (not 201) on success.",
        parameters: [chatlogPathParam],
        requestBody: {
          required: true,
          description: 'Raw chatlog bytes; any content type is accepted.',
          content: {
            'application/octet-stream': {
              schema: { $ref: '#/components/schemas/BinaryStream' },
            },
            'application/x-ndjson': {
              schema: { $ref: '#/components/schemas/BinaryStream' },
            },
          },
        },
        responses: {
          '200': {
            description:
              'The uploaded object (without the `uploaded` timestamp).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatlogUploadUpdated' },
                example: {
                  key: '2025/09/stream-2025-09-20.jsonl',
                  size: 46_512_301,
                },
              },
            },
          },
          '400': {
            description:
              'The path is not a valid chatlog key, or the request has no body.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                examples: {
                  invalidKey: {
                    summary: 'Path is not a valid chatlog key',
                    value: { error: 'Invalid chatlog key' },
                  },
                  noBody: {
                    summary: 'Empty body',
                    value: { error: 'Request body is required' },
                  },
                },
              },
            },
          },
          '401': authError,
          '413': {
            description:
              'The streamed body exceeds the 512 MiB chatlog size limit (checked against `Content-Length` when present).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: {
                  error: 'Request body exceeds the 536870912 byte chatlog limit',
                },
              },
            },
          },
          '500': {
            description: 'The upload to R2 failed.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Failed to upload chatlog' },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Chatlogs'],
        summary: 'Delete a chatlog',
        description:
          'Deletes the object at this key. Deleting a key that does not exist still returns 200 (R2 delete is idempotent). An invalid key returns 400.',
        parameters: [chatlogPathParam],
        responses: {
          '200': {
            description: 'The key was submitted for deletion.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DeleteOkResponse' },
                example: { deleted: '2025/09/stream-2025-09-20.jsonl' },
              },
            },
          },
          '401': authError,
          '400': {
            description: 'The path is not a valid chatlog key.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Invalid chatlog key' },
              },
            },
          },
          '500': standardErrors['500'],
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description:
          '`Authorization: Bearer <key>` — checked against ADMIN_API_KEYS (full access) and READ_API_KEYS (read scope: GET/HEAD only).',
      },
      apiKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description:
          '`X-API-Key: <key>` — takes precedence over the Authorization header when both are sent. Same key lists as above.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description:
              'Human-readable error message. See the endpoint description for the exact strings the API returns.',
          },
        },
        required: ['error'],
      },
      DeleteOkResponse: {
        type: 'object',
        properties: {
          deleted: {
            type: 'string',
            description: 'The id / slug / key that was deleted.',
          },
        },
        required: ['deleted'],
      },
      VodRecord: {
        type: 'object',
        description: 'One streamed VOD. Mirrors the `vods` D1 table 1:1.',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'UUIDv4 primary key; used by public /watch/{id} URLs.',
          },
          title: { type: 'string' },
          stream_date: {
            type: 'string',
            format: 'date',
            description: 'YYYY-MM-DD.',
          },
          duration: {
            type: 'string',
            description: 'Human-formatted duration, e.g. "4:31:07".',
          },
          game: { type: 'string' },
          game_cover_url: {
            type: 'string',
            description: 'Absolute URL to the game cover art.',
          },
          vod_url: {
            type: 'string',
            description: 'Absolute URL to the source VOD (e.g. Twitch).',
          },
          thumbnail_url: {
            type: 'string',
            description: 'Absolute URL to the preview thumbnail.',
          },
          chat_replay_path: {
            type: ['string', 'null'],
            description:
              'R2 chatlog key backing the chat replay for this VOD, or null when there is none. Managed via the Chatlogs endpoints.',
            examples: ['2025/09/stream-2025-09-20.jsonl'],
          },
          published: {
            type: 'integer',
            enum: [0, 1],
            description:
              'SQLite-style 0/1 flag. Read keys only see records where published = 1.',
          },
          rank: {
            type: 'integer',
            description: 'Sort rank within the same stream date (lower first).',
          },
        },
        required: [
          'id',
          'title',
          'stream_date',
          'duration',
          'game',
          'game_cover_url',
          'vod_url',
          'thumbnail_url',
          'chat_replay_path',
          'published',
          'rank',
        ],
      },
      VodListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/VodRecord' },
          },
        },
        required: ['data'],
      },
      CreateVodRequest: {
        type: 'object',
        description:
          'VOD create payload. Bold-required fields must be non-empty strings.',
        properties: {
          id: {
            type: 'string',
            description:
              'Optional explicit id (any non-empty string, conventionally a UUIDv4). Must not exist yet.',
          },
          title: { type: 'string', description: 'Required.' },
          stream_date: {
            type: 'string',
            format: 'date',
            description: 'Required. YYYY-MM-DD.',
          },
          duration: {
            type: 'string',
            description: 'Required. Human-formatted duration string.',
          },
          game: { type: 'string', description: 'Required.' },
          game_cover_url: { type: 'string', description: 'Required.' },
          vod_url: { type: 'string', description: 'Required.' },
          thumbnail_url: { type: 'string', description: 'Required.' },
          chat_replay_path: {
            type: ['string', 'null'],
            description: 'Optional. Defaults to null.',
          },
          published: {
            type: 'integer',
            enum: [0, 1],
            description:
              'Optional. 0 = draft, 1 = published (booleans true/false are accepted and coerced). Any other value is rejected. Defaults to 0.',
          },
          rank: { type: 'integer', description: 'Optional. Defaults to 0.' },
        },
        required: [
          'title',
          'stream_date',
          'duration',
          'game',
          'game_cover_url',
          'vod_url',
          'thumbnail_url',
        ],
      },
      UpdateVodRequest: {
        type: 'object',
        description:
          'VOD update payload. Only present fields are written. `published` is only written for the integer 1 or 0; `rank` only for a JSON number. `chat_replay_path` may be null. An empty payload yields 400.',
        properties: {
          title: { type: 'string' },
          stream_date: { type: 'string', format: 'date' },
          duration: { type: 'string' },
          game: { type: 'string' },
          game_cover_url: { type: 'string' },
          vod_url: { type: 'string' },
          thumbnail_url: { type: 'string' },
          chat_replay_path: { type: ['string', 'null'] },
          published: { type: 'integer', enum: [0, 1] },
          rank: { type: 'integer' },
        },
      },
      ShowRecord: {
        type: 'object',
        description: 'One show. Mirrors the `shows` D1 table 1:1.',
        properties: {
          slug: {
            type: 'string',
            pattern: '^[a-z0-9][a-z0-9-]*$',
            description: 'Primary key.',
          },
          name: { type: 'string' },
          description: {
            type: 'string',
            description: 'Free-form description (empty string allowed).',
          },
          cover_url: {
            type: 'string',
            description: 'Absolute URL to the cover image.',
          },
          logo_url: {
            type: 'string',
            description: 'Absolute URL to the logo image.',
          },
          rank: { type: 'integer', description: 'Sort rank (lower first).' },
        },
        required: [
          'slug',
          'name',
          'description',
          'cover_url',
          'logo_url',
          'rank',
        ],
      },
      ShowListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ShowRecord' },
          },
        },
        required: ['data'],
      },
      ShowWithEpisodes: {
        type: 'object',
        description: 'A show record plus the ids of all linked episodes.',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          cover_url: { type: 'string' },
          logo_url: { type: 'string' },
          rank: { type: 'integer' },
          episode_ids: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Episode ids linked to this show (unordered). Empty array when none.',
          },
        },
        required: [
          'slug',
          'name',
          'description',
          'cover_url',
          'logo_url',
          'rank',
          'episode_ids',
        ],
      },
      CreateShowRequest: {
        type: 'object',
        description:
          'Show create payload. `slug` must match ^[a-z0-9][a-z0-9-]*$.',
        properties: {
          slug: {
            type: 'string',
            pattern: '^[a-z0-9][a-z0-9-]*$',
            description: 'Required.',
          },
          name: { type: 'string', description: 'Required.' },
          description: {
            type: 'string',
            description: 'Optional. Defaults to "".',
          },
          cover_url: { type: 'string', description: 'Required.' },
          logo_url: { type: 'string', description: 'Required.' },
          rank: { type: 'integer', description: 'Optional. Defaults to 0.' },
        },
        required: ['slug', 'name', 'cover_url', 'logo_url'],
      },
      UpdateShowRequest: {
        type: 'object',
        description:
          'Show update payload. Only present fields are written; `rank` only for a JSON number. The slug is immutable. An empty payload yields 400.',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          cover_url: { type: 'string' },
          logo_url: { type: 'string' },
          rank: { type: 'integer' },
        },
      },
      EpisodeRecord: {
        type: 'object',
        description:
          'One episodic show entry. Mirrors the `episodes` D1 table 1:1.',
        properties: {
          id: {
            type: 'string',
            description:
              'Primary key. Seeded shows use stable UUIDv5-style ids (show+season+title); any string is accepted by the API.',
          },
          title: { type: 'string' },
          duration: {
            type: 'string',
            description: 'Human-formatted duration string.',
          },
          air_date: {
            type: 'string',
            format: 'date',
            description: 'YYYY-MM-DD.',
          },
          thumbnail_url: {
            type: 'string',
            description: 'Absolute URL to the thumbnail.',
          },
          video_url: {
            type: 'string',
            description: 'Absolute URL to the video file.',
          },
          season: {
            type: 'string',
            description: 'Free-form season label, e.g. "S1".',
          },
          rank: {
            type: 'integer',
            description: 'Sort rank within the same air date (lower first).',
          },
        },
        required: [
          'id',
          'title',
          'duration',
          'air_date',
          'thumbnail_url',
          'video_url',
          'season',
          'rank',
        ],
      },
      EpisodeListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/EpisodeRecord' },
          },
        },
        required: ['data'],
      },
      CreateEpisodeRequest: {
        type: 'object',
        description:
          'Episode create payload. Unlike VODs, `id` is required here (any non-empty string) and must not exist yet.',
        properties: {
          id: {
            type: 'string',
            description: 'Required. Any non-empty string.',
          },
          title: { type: 'string', description: 'Required.' },
          duration: { type: 'string', description: 'Required.' },
          air_date: {
            type: 'string',
            format: 'date',
            description: 'Required. YYYY-MM-DD.',
          },
          thumbnail_url: { type: 'string', description: 'Required.' },
          video_url: { type: 'string', description: 'Required.' },
          season: { type: 'string', description: 'Required.' },
          rank: { type: 'integer', description: 'Optional. Defaults to 0.' },
        },
        required: [
          'id',
          'title',
          'duration',
          'air_date',
          'thumbnail_url',
          'video_url',
          'season',
        ],
      },
      UpdateEpisodeRequest: {
        type: 'object',
        description:
          'Episode update payload. Only present fields are written; `rank` only for a JSON number. If nothing updatable is present, the record is returned unchanged (no 400). The id is immutable.',
        properties: {
          title: { type: 'string' },
          duration: { type: 'string' },
          air_date: { type: 'string', format: 'date' },
          thumbnail_url: { type: 'string' },
          video_url: { type: 'string' },
          season: { type: 'string' },
          rank: { type: 'integer' },
        },
      },
      EpisodeLink: {
        type: 'object',
        description: 'A show↔episode link (the join table row).',
        properties: {
          show_slug: { type: 'string' },
          episode_id: { type: 'string' },
        },
        required: ['show_slug', 'episode_id'],
      },
      LinkEpisodeRequest: {
        type: 'object',
        properties: {
          episode_id: {
            type: 'string',
            description: 'Required. Id of an existing episode to link.',
          },
        },
        required: ['episode_id'],
      },
      UnlinkResponse: {
        type: 'object',
        properties: {
          unlinked: { $ref: '#/components/schemas/EpisodeLink' },
        },
        required: ['unlinked'],
      },
      ChatlogLimits: {
        type: 'object',
        description:
          'Documented size limit for chatlog uploads (echoed by GET /api/v1 and the chatlog listing).',
        properties: {
          maxBytes: {
            type: 'integer',
            description:
              '512 MiB — the R2 per-object ceiling documented in code as CHATLOG_LIMITS.maxBytes.',
          },
        },
        required: ['maxBytes'],
      },
      ChatlogObjectInfo: {
        type: 'object',
        description: 'R2 object metadata for one chatlog.',
        properties: {
          key: { type: 'string', description: 'R2 object key.' },
          size: { type: 'integer', description: 'Object size in bytes.' },
          uploaded: {
            type: 'string',
            format: 'date-time',
            description: 'ISO 8601 upload timestamp (UTC).',
          },
        },
        required: ['key', 'size', 'uploaded'],
      },
      ChatlogListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            description:
              'Object metadata; R2 "common prefixes" (directory markers) are filtered out.',
            items: { $ref: '#/components/schemas/ChatlogObjectInfo' },
          },
          truncated: {
            type: 'boolean',
            description: 'True when more objects exist beyond this page.',
          },
          cursor: {
            type: ['string', 'null'],
            description:
              'Continuation token for the next page; null when truncated is false.',
          },
          limits: { $ref: '#/components/schemas/ChatlogLimits' },
        },
        required: ['data', 'truncated', 'cursor', 'limits'],
      },
      ChatlogUploadCreated: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          size: { type: 'integer' },
          uploaded: { type: 'string', format: 'date-time' },
        },
        required: ['key', 'size', 'uploaded'],
      },
      ChatlogUploadUpdated: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          size: { type: 'integer' },
        },
        required: ['key', 'size'],
      },
      ChatlogBulkDeleteResponse: {
        type: 'object',
        properties: {
          deleted: {
            type: 'array',
            items: { type: 'string' },
            description:
              'The validated keys that were submitted for deletion (non-existent keys are not reported as errors).',
          },
        },
        required: ['deleted'],
      },
      BinaryStream: {
        type: 'string',
        format: 'binary',
        description:
          'Raw bytes, streamed end-to-end (request upload or response download). Never buffered in the Worker.',
      },
    },
  },
  // CHATLOG_LIMITS.maxBytes is the documented chatlog upload ceiling (512 MiB).
  'x-chatlog-limits': CHATLOG_LIMITS,
} as const

export const GET: APIRoute = async () =>
  new Response(JSON.stringify(spec), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  })
