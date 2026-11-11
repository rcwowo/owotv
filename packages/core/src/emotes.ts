import { emoteSetKey, type EmoteSet } from '@owotv/shared'
import type { BucketLike } from './store'

interface SevenTvResponse {
  data?: {
    users?: {
      userByConnection?: {
        style?: { activeEmoteSetId?: string | null }
        emoteSets?: Array<{
          id: string
          emotes?: { items?: Array<{ id: string; alias: string }> }
        }>
      } | null
    }
  }
}

const query = `
  query($id: String!) {
    users {
      userByConnection(platform: TWITCH, platformId: $id) {
        style { activeEmoteSetId }
        emoteSets { id emotes { items { id alias } } }
      }
    }
  }
`

export async function fetchSevenTvEmotes(twitchId: string): Promise<EmoteSet> {
  const res = await fetch('https://7tv.io/v4/gql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id: twitchId } }),
  })
  if (!res.ok) throw new Error(`7TV request failed: ${res.status}`)

  const user = ((await res.json()) as SevenTvResponse).data?.users
    ?.userByConnection
  const activeId = user?.style?.activeEmoteSetId
  const set = user?.emoteSets?.find((s) => s.id === activeId)

  const emotes: EmoteSet = {}
  for (const e of set?.emotes?.items ?? []) {
    emotes[e.alias] = { provider: '7tv', id: e.id }
  }
  return emotes
}

export async function writeEmoteSet(
  bucket: BucketLike,
  emotes: EmoteSet,
): Promise<string | null> {
  const sorted = Object.fromEntries(
    Object.entries(emotes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  )
  if (!Object.keys(sorted).length) return null
  const body = JSON.stringify(sorted)
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body),
  )
  const hash = [...new Uint8Array(digest).slice(0, 8)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const key = emoteSetKey(hash)
  if (!(await bucket.head(key))) {
    await bucket.put(key, body, {
      httpMetadata: { contentType: 'application/json' },
    })
  }
  return hash
}
