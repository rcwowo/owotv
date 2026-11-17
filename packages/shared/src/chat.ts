import { z } from 'zod'

export * from './client'

export const CHAT_FORMAT_VERSION = 1
export const MIN_SEGMENT_SECONDS = 300
export const MAX_SEGMENT_SECONDS = 3600
export const TARGET_SEGMENT_MESSAGES = 1000

export function pickSegmentSeconds(messageCount: number, durationS: number) {
  if (messageCount <= 0) return MAX_SEGMENT_SECONDS
  const ideal = (durationS * TARGET_SEGMENT_MESSAGES) / messageCount
  const rounded = Math.ceil(ideal / MIN_SEGMENT_SECONDS) * MIN_SEGMENT_SECONDS
  return Math.min(MAX_SEGMENT_SECONDS, Math.max(MIN_SEGMENT_SECONDS, rounded))
}

export const chatManifestKey = (vodSlug: string) =>
  `chat/${vodSlug}/manifest.json`
export const chatSegmentKey = (vodSlug: string, segment: number) =>
  `chat/${vodSlug}/${segment}.json`

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

export const emoteSet = z.record(z.string(), thirdPartyEmote)
export type EmoteSet = z.infer<typeof emoteSet>

export const emoteSetKey = (hash: string) => `emotes/${hash}.json`

export const chatManifest = z.object({
  v: z.literal(CHAT_FORMAT_VERSION),
  segmentSeconds: z.number().int().positive(),
  durationS: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
  segments: z.array(z.number().int().nonnegative()),
  emoteSet: z.string().nullable().default(null),
})
export type ChatManifest = z.infer<typeof chatManifest>
