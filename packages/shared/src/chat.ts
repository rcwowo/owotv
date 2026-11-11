import { z } from 'zod'

export const CHAT_FORMAT_VERSION = 1
export const DEFAULT_SEGMENT_SECONDS = 300

export const chatManifestKey = (vodSlug: string) =>
  `chat/${vodSlug}/manifest.json`
export const chatSegmentKey = (vodSlug: string, segment: number) =>
  `chat/${vodSlug}/${segment}.json`

export const segmentForTime = (seconds: number, segmentSeconds: number) =>
  Math.max(0, Math.floor(seconds / segmentSeconds))

export const chatFragment = z.union([
  z.string(),
  z.tuple([z.string(), z.string()]),
])
export type ChatFragment = z.infer<typeof chatFragment>

export const chatUser = z.object({
  login: z.string(),
  name: z.string(),
  color: z.string().optional(),
  badges: z.array(z.tuple([z.string(), z.string()])).default([]),
})
export type ChatUser = z.infer<typeof chatUser>

export const chatMessage = z.tuple([
  z.number().nonnegative(),
  z.number().int().nonnegative(),
  z.array(chatFragment),
])
export type ChatMessage = z.infer<typeof chatMessage>

export const chatSegment = z.object({
  v: z.literal(CHAT_FORMAT_VERSION),
  segment: z.number().int().nonnegative(),
  users: z.array(chatUser),
  messages: z.array(chatMessage),
})
export type ChatSegment = z.infer<typeof chatSegment>

export const emoteProviders = ['7tv', 'bttv', 'ffz'] as const
export const thirdPartyEmote = z.object({
  provider: z.enum(emoteProviders),
  id: z.string(),
})
export type ThirdPartyEmote = z.infer<typeof thirdPartyEmote>

export const chatManifest = z.object({
  v: z.literal(CHAT_FORMAT_VERSION),
  segmentSeconds: z.number().int().positive(),
  durationS: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  segments: z.array(z.number().int().nonnegative()),
  emotes: z.record(z.string(), thirdPartyEmote).default({}),
})
export type ChatManifest = z.infer<typeof chatManifest>

export interface ResolvedChatMessage {
  key: string
  offset: number
  user: ChatUser
  fragments: ChatFragment[]
}

export function resolveSegment(seg: ChatSegment): ResolvedChatMessage[] {
  return seg.messages.map(([offset, userIndex, fragments], i) => ({
    key: `${seg.segment}:${i}`,
    offset,
    user: seg.users[userIndex] ?? { login: '', name: 'unknown', badges: [] },
    fragments,
  }))
}
