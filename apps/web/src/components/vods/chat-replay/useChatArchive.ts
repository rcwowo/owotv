import {
  resolveSegment,
  segmentForTime,
  type ChatManifest,
  type ChatSegment,
  type EmoteSet,
  type ResolvedChatMessage,
} from '@owotv/shared/client'
import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_VISIBLE_MESSAGES = 200
const PREFETCH_SECONDS = 30

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json() as Promise<T>
}

export function useChatArchive(vodSlug: string, currentTime: number) {
  const [manifest, setManifest] = useState<ChatManifest | null>(null)
  const [sevenTv, setSevenTv] = useState<Map<string, string>>(new Map())
  const [segments, setSegments] = useState<Map<number, ResolvedChatMessage[]>>(
    new Map(),
  )
  const requested = useRef(new Set<number>())

  useEffect(() => {
    let cancelled = false
    requested.current = new Set()
    setManifest(null)
    setSegments(new Map())
    setSevenTv(new Map())

    const load = async () => {
      const m = await fetchJson<ChatManifest>(
        `/api/chat/${vodSlug}/manifest.json`,
      )
      if (cancelled) return
      setManifest(m)
      if (!m.emoteSet) return
      const set = await fetchJson<EmoteSet>(`/api/emotes/${m.emoteSet}.json`)
      if (cancelled) return
      setSevenTv(
        new Map(
          Object.entries(set)
            .filter(([, e]) => e.provider === '7tv')
            .map(([alias, e]) => [alias, e.id]),
        ),
      )
    }
    load().catch((err) => console.error('[ChatReplay]', err))
    return () => {
      cancelled = true
    }
  }, [vodSlug])

  const current = manifest
    ? segmentForTime(currentTime, manifest.segmentSeconds)
    : -1
  const nearNext =
    manifest !== null &&
    currentTime >= (current + 1) * manifest.segmentSeconds - PREFETCH_SECONDS

  useEffect(() => {
    if (!manifest) return
    const wanted = [current - 1, current, ...(nearNext ? [current + 1] : [])]
    for (const n of wanted) {
      if (n < 0 || !manifest.segments[n] || requested.current.has(n)) continue
      requested.current.add(n)
      fetchJson<ChatSegment>(`/api/chat/${vodSlug}/${n}.json`)
        .then((seg) =>
          setSegments((prev) => new Map(prev).set(n, resolveSegment(seg))),
        )
        .catch((err) => {
          requested.current.delete(n)
          console.error('[ChatReplay]', err)
        })
    }
  }, [manifest, vodSlug, current, nearNext])

  const visible = useMemo(() => {
    if (current < 0) return []
    const messages = [
      ...(segments.get(current - 1) ?? []),
      ...(segments.get(current) ?? []),
    ]
    let lo = 0
    let hi = messages.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (messages[mid]!.offset <= currentTime) lo = mid + 1
      else hi = mid
    }
    return messages.slice(Math.max(0, lo - MAX_VISIBLE_MESSAGES), lo)
  }, [segments, current, currentTime])

  return { visible, sevenTv }
}
