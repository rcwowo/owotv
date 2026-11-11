import { z } from 'zod'

const channelSlug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .describe('Channel slug, usually the Twitch login')
const vodSlug = z.string().describe('Random 10 character VOD id')
const youtubeId = z
  .string()
  .regex(/^[\w-]{11}$/)
  .describe('YouTube video id')
const streamDate = z.iso
  .date()
  .describe('Day the stream happened, in the streamer’s time zone')
const durationS = z.number().int().positive().describe('Length in seconds')
const twitchId = z.string().regex(/^\d+$/)

export const channelInput = z.object({
  slug: channelSlug,
  displayName: z.string().min(1),
  twitchId: twitchId.optional().describe('Twitch user id'),
  avatarUrl: z.url().optional(),
})
export type ChannelInput = z.infer<typeof channelInput>

export const gameChapterInput = z.object({
  name: z.string().min(1).describe('Game name as shown on Twitch'),
  twitchGameId: twitchId.optional().describe('Twitch category id'),
  coverUrl: z.url().optional().describe('Box art URL'),
  startS: z
    .number()
    .int()
    .nonnegative()
    .describe('When this game starts, in seconds from the start of the VOD'),
})
export type GameChapterInput = z.infer<typeof gameChapterInput>

export const createVodInput = z.object({
  channel: channelSlug,
  title: z.string().min(1),
  streamDate,
  durationS,
  youtubeId,
  thumbnailUrl: z
    .url()
    .optional()
    .describe('Defaults to the YouTube thumbnail'),
  sourceTwitchVodId: twitchId
    .optional()
    .describe('Original Twitch VOD id. Used to reject duplicate imports.'),
  chapters: z
    .array(gameChapterInput)
    .default([])
    .describe(
      'Games played. The one played longest becomes the VOD’s main game.',
    ),
})
export type CreateVodInput = z.input<typeof createVodInput>

export const updateVodInput = z
  .object({
    title: z.string().min(1),
    streamDate,
    durationS,
    youtubeId,
    thumbnailUrl: z.url().nullable(),
  })
  .partial()
export type UpdateVodInput = z.infer<typeof updateVodInput>

export const apiChannel = z.object({
  slug: channelSlug,
  displayName: z.string(),
  twitchId: z.string().nullable(),
  avatarUrl: z.string().nullable(),
})
export type ApiChannel = z.infer<typeof apiChannel>

export const apiVod = z.object({
  slug: vodSlug,
  channel: channelSlug,
  title: z.string(),
  streamDate,
  durationS,
  youtubeId,
  thumbnailUrl: z.string().nullable(),
  game: z.string().nullable().describe('Main game'),
  sourceTwitchVodId: z.string().nullable(),
  chatStatus: z.enum(['none', 'processing', 'ready', 'failed']),
  chatMessageCount: z.number().int().nonnegative(),
})
export type ApiVod = z.infer<typeof apiVod>

export const apiMe = z.object({
  name: z.string(),
  role: z.enum(['read', 'write', 'admin']),
  channel: channelSlug
    .nullable()
    .describe('Set when the token is limited to one channel'),
})
export type ApiMe = z.infer<typeof apiMe>

export const apiError = z.object({
  error: z.string(),
  slug: z
    .string()
    .optional()
    .describe('On 409, the slug of the existing record'),
  issues: z
    .array(z.unknown())
    .optional()
    .describe('On 400, the validation issues'),
})
export type ApiError = z.infer<typeof apiError>

export const MAX_CHAT_SEGMENT_BYTES = 25 * 1024 * 1024
export const MAX_EMOTE_SET_BYTES = 1024 * 1024
