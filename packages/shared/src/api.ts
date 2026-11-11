import { z } from 'zod'

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/)
const youtubeId = z.string().regex(/^[\w-]{11}$/)
const isoDate = z.iso.date()

export const channelInput = z.object({
  slug,
  displayName: z.string().min(1),
  twitchId: z.string().regex(/^\d+$/).optional(),
  avatarUrl: z.url().optional(),
})
export type ChannelInput = z.infer<typeof channelInput>

export const gameChapterInput = z.object({
  name: z.string().min(1),
  twitchGameId: z.string().regex(/^\d+$/).optional(),
  coverUrl: z.url().optional(),
  startS: z.number().int().nonnegative(),
})
export type GameChapterInput = z.infer<typeof gameChapterInput>

export const createVodInput = z.object({
  channel: slug,
  title: z.string().min(1),
  streamDate: isoDate,
  durationS: z.number().int().positive(),
  youtubeId,
  thumbnailUrl: z.url().optional(),
  sourceTwitchVodId: z.string().regex(/^\d+$/).optional(),
  chapters: z.array(gameChapterInput).default([]),
})
export type CreateVodInput = z.input<typeof createVodInput>

export const updateVodInput = z
  .object({
    title: z.string().min(1),
    streamDate: isoDate,
    durationS: z.number().int().positive(),
    youtubeId,
    thumbnailUrl: z.url().nullable(),
  })
  .partial()
export type UpdateVodInput = z.infer<typeof updateVodInput>

export interface ApiChannel {
  slug: string
  displayName: string
  twitchId: string | null
  avatarUrl: string | null
}

export interface ApiVod {
  slug: string
  channel: string
  title: string
  streamDate: string
  durationS: number
  youtubeId: string
  thumbnailUrl: string | null
  game: string | null
  sourceTwitchVodId: string | null
  chatStatus: 'none' | 'processing' | 'ready' | 'failed'
  chatMessageCount: number
}

export interface ApiError {
  error: string
  slug?: string
  issues?: unknown
}

export const MAX_CHAT_SEGMENT_BYTES = 25 * 1024 * 1024
export const MAX_EMOTE_SET_BYTES = 1024 * 1024
