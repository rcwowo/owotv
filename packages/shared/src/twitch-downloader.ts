import {
  CHAT_FORMAT_VERSION,
  DEFAULT_SEGMENT_SECONDS,
  segmentForTime,
  type ChatFragment,
  type ChatManifest,
  type ChatSegment,
  type ChatUser,
  type ThirdPartyEmote,
} from './chat'

export interface TwitchDownloaderComment {
  content_offset_seconds: number
  commenter: { display_name: string; name: string }
  message: {
    body: string
    user_color?: string | null
    user_badges?: Array<{ _id: string; version: string }> | null
    fragments?: Array<{
      text: string
      emoticon: { emoticon_id: string } | null
    }> | null
  }
}

export interface TwitchDownloaderChat {
  comments: TwitchDownloaderComment[]
  video?: { length?: number }
}

export interface ChatArchive {
  manifest: ChatManifest
  segments: ChatSegment[]
}

export interface BuildChatArchiveOptions {
  durationS?: number
  segmentSeconds?: number
  emotes?: Record<string, ThirdPartyEmote>
}

function toFragments(c: TwitchDownloaderComment): ChatFragment[] {
  const frags = c.message.fragments
  if (!frags?.length) return [c.message.body]
  const out: ChatFragment[] = []
  for (const f of frags) {
    if (f.emoticon) {
      out.push([f.text, f.emoticon.emoticon_id])
    } else if (typeof out.at(-1) === 'string') {
      out[out.length - 1] += f.text
    } else {
      out.push(f.text)
    }
  }
  return out
}

export function buildChatArchive(
  chat: TwitchDownloaderChat,
  opts: BuildChatArchiveOptions = {},
): ChatArchive {
  const segmentSeconds = opts.segmentSeconds ?? DEFAULT_SEGMENT_SECONDS
  const comments = [...chat.comments].sort(
    (a, b) => a.content_offset_seconds - b.content_offset_seconds,
  )
  const lastOffset = comments.at(-1)?.content_offset_seconds ?? 0
  const durationS = Math.ceil(
    opts.durationS ?? chat.video?.length ?? lastOffset,
  )
  const segmentTotal = Math.max(
    1,
    Math.ceil(Math.max(durationS, lastOffset + 1) / segmentSeconds),
  )

  const built = new Map<
    number,
    { seg: ChatSegment; userIndex: Map<string, number> }
  >()

  for (const c of comments) {
    const n = segmentForTime(c.content_offset_seconds, segmentSeconds)
    let entry = built.get(n)
    if (!entry) {
      entry = {
        seg: { v: CHAT_FORMAT_VERSION, segment: n, users: [], messages: [] },
        userIndex: new Map(),
      }
      built.set(n, entry)
    }

    const user: ChatUser = {
      login: c.commenter.name,
      name: c.commenter.display_name,
      badges: (c.message.user_badges ?? []).map((b) => [b._id, b.version]),
    }
    if (c.message.user_color) user.color = c.message.user_color

    const userKey = JSON.stringify([
      user.login,
      user.name,
      user.color,
      user.badges,
    ])
    let ui = entry.userIndex.get(userKey)
    if (ui === undefined) {
      ui = entry.seg.users.push(user) - 1
      entry.userIndex.set(userKey, ui)
    }

    const offset = Math.round(c.content_offset_seconds * 1000) / 1000
    entry.seg.messages.push([offset, ui, toFragments(c)])
  }

  const counts = Array.from(
    { length: segmentTotal },
    (_, n) => built.get(n)?.seg.messages.length ?? 0,
  )

  return {
    manifest: {
      v: CHAT_FORMAT_VERSION,
      segmentSeconds,
      durationS,
      messageCount: comments.length,
      segments: counts,
      emotes: opts.emotes ?? {},
    },
    segments: [...built.values()]
      .map((e) => e.seg)
      .sort((a, b) => a.segment - b.segment),
  }
}
