<div align="center">

![Showcase Card](public/static/twitter-card.webp)
# owoTV
A project to archive past VODs from Twitch.

</div>

## About this repo.
Originally starting as a static Astro site, this project has become a fully self-contained VOD archive for Twitch streams, or even videos from other platforms. Complete with chat replay, sorting by date, game, or searching by keyword.

And of course, this project is open source and fully available under the [MIT License](LICENSE) - modify to your hearts content.

## How does it work?
Originally derived from my own [website](https://github.com/rcwowo/website), this project removed a lot of the unnecessary junk that was scattered around the website and made VOD archival it's own separate thing. It also used to rely heavily on automations, however, the project is now a self-contained dynamic site instead of being purely static.

The project heavily relies on Cloudflare's stack:

- A [Cloudflare Worker](https://developers.cloudflare.com/workers/) renders the site on request via [Astro](https://astro.build) SSR.
- A [Cloudflare D1](https://developers.cloudflare.com/d1/) database stores all the applicable data.
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket stores the chatlogs for the chat replay feature.

## How do I modify this?
Until I make a full guide on how to create the entire system for yourself, you'll have to figure it out and make your own solution if you intend to fork this project. If you find a bug, please report it to me either here on GitHub, or on Discord.

That being said, if you still want to develop this for yourself, it's easy:

```sh
# Clone the repo
git clone https://github.com/rcwowo/owotv

# Install dependencies
cd owotv && bun install

# Create the databases
bun run db:create
bun run db:schema

# Run the test server
bun dev
```

## API
Instances expose an authenticated management API under `/api/v1` for the [owoTV CLI](https://github.com/rcwowo/owotv) (and anything else) to drive the D1 database and R2 chatlogs bucket remotely - including unpublished (draft) VODs.

### Keys
Keys are secrets set per instance:

```sh
# production (Cloudflare)
bunx wrangler secret put ADMIN_API_KEYS   # comma-separated, full access
bunx wrangler secret put READ_API_KEYS    # comma-separated, GET/HEAD only
export SITE_URL=https://tv.rcw.lol        # used for cache purging

# local development
cp .dev.vars.example .dev.vars
```

Admin keys can read and write. Read keys can only call GET/HEAD endpoints, which is handy for read-only views on someone else's published instance. Keys are sent as `Authorization: Bearer <key>` or `X-API-Key: <key>`.

### Endpoints
Interactive docs are served at `/api/v1/docs` (Scalar) and the raw OpenAPI 3.1 spec at `/api/v1/openapi.json`; `GET /api/v1` is a machine-readable discovery endpoint.

```
GET  /api/v1                              discovery
GET  /api/v1/docs                         Scalar API reference (browser)
GET  /api/v1/openapi.json                 OpenAPI spec
GET/POST  /api/v1/vods                    list (earns drafts for admin) / create
GET/PUT/DELETE /api/v1/vods/{id}          single VOD (full DB columns; drafts for admin)
GET/POST  /api/v1/shows                   list / create
GET/PUT/DELETE /api/v1/shows/{slug}       single show (+ episode_ids)
POST/DELETE /api/v1/shows/{slug}/episodes/{episodeId}   link/unlink episode
GET/POST  /api/v1/episodes                list / create
GET/PUT/DELETE /api/v1/episodes/{id}      single episode
GET  /api/v1/chatlogs?limit=&cursor=&prefix=   R2 object listing
POST /api/v1/chatlogs  (X-Object-Key, body streamed)  upload
GET/PUT/DELETE /api/v1/chatlogs/{path}    fetch (streams) / replace / delete
GET  /api/v1/chatlogs/{path}  with X-Object-Metadata header = HEAD-equivalent
DELETE /api/v1/chatlogs?key=...&key=...   bulk delete (up to 1000 keys, enforced)
```

Chatlog uploads stream straight into R2 without buffering, so large files (100MB+) work from any HTTP client - just POST/PUT the file bytes with a `Content-Type`. Example:

```sh
curl -X PUT "$INSTANCE/api/v1/chatlogs/chat/2026-01-01.jsonl" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/jsonl" \
  --data-binary @chatlog.jsonl
```

Mutating catalog data (VODs, shows, episodes, links) purges the site's edge cache for the affected pages automatically.

Note: `security.checkOrigin` is disabled in this project so CLI clients can drive the API with plain HTTP methods; there are no browser HTML forms in this app to protect.
