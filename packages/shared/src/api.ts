import { z } from 'zod'

const channelSlug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/)
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

export const channelPlatforms = [
  'twitch',
  'youtube',
  'x',
  'bluesky',
  'instagram',
  'tiktok',
  'threads',
  'discord',
  'website',
] as const
export type ChannelPlatform = (typeof channelPlatforms)[number]

export const channelLink = z.object({
  platform: z.enum(channelPlatforms),
  url: z.url({ protocol: /^https?$/ }),
})
export type ChannelLink = z.infer<typeof channelLink>

const channelLinks = z
  .array(channelLink)
  .max(channelPlatforms.length)
  .refine(
    (links) => new Set(links.map((l) => l.platform)).size === links.length,
    'Each platform can only be linked once',
  )
  .describe('Social links, shown in this order on the channel page')
const channelDescription = z.string().max(1000)
const imageUrl = z.url({ protocol: /^https?$/ })

export const channelInput = z.object({
  slug: channelSlug,
  displayName: z.string().min(1),
  twitchId: twitchId.optional().describe('Twitch user id'),
  avatarUrl: imageUrl.optional(),
  bannerUrl: imageUrl
    .optional()
    .describe('Background image for the channel page'),
  description: channelDescription.optional(),
  links: channelLinks.optional(),
})
export type ChannelInput = z.infer<typeof channelInput>

export const updateChannelInput = z
  .object({
    slug: channelSlug.describe(
      'New slug, usually the new Twitch login. The old slug keeps redirecting to the channel.',
    ),
    displayName: z.string().min(1),
    twitchId: twitchId.nullable(),
    avatarUrl: imageUrl.nullable(),
    bannerUrl: imageUrl.nullable(),
    description: channelDescription,
    links: channelLinks,
  })
  .partial()
export type UpdateChannelInput = z.infer<typeof updateChannelInput>

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
    channel: channelSlug.describe(
      'Move the VOD to this channel. The token needs access to both channels.',
    ),
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
  bannerUrl: z.string().nullable(),
  description: z.string(),
  links: z.array(channelLink),
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

const contentSlug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .max(80)
const sortOrder = z
  .number()
  .int()
  .describe('Lower comes first. New items go last by default.')
const position = z
  .number()
  .int()
  .nonnegative()
  .describe('Move to this place (0 is first) in its list, renumbering the rest')

export const createShowInput = z.object({
  channel: channelSlug,
  name: z.string().min(1),
  slug: contentSlug.optional().describe('URL slug. Defaults to the name.'),
  description: z.string().max(2000).optional(),
  coverUrl: imageUrl.optional().describe('16:9 image for cards and the hero'),
  logoUrl: imageUrl.optional().describe('Transparent logo for the show page'),
  sort: sortOrder.optional(),
})
export type CreateShowInput = z.infer<typeof createShowInput>

export const updateShowInput = z
  .object({
    channel: channelSlug.describe(
      'Move the show to this channel. The token needs access to both channels.',
    ),
    name: z.string().min(1),
    slug: contentSlug,
    description: z.string().max(2000),
    coverUrl: imageUrl.nullable(),
    logoUrl: imageUrl.nullable(),
    position,
  })
  .partial()
export type UpdateShowInput = z.infer<typeof updateShowInput>

export const createSeasonInput = z.object({
  title: z.string().min(1).describe('For example "Season 1"'),
  slug: contentSlug.optional().describe('Defaults to the title'),
  sort: sortOrder.optional(),
})
export type CreateSeasonInput = z.infer<typeof createSeasonInput>

export const updateSeasonInput = z
  .object({ title: z.string().min(1), slug: contentSlug, position })
  .partial()
export type UpdateSeasonInput = z.infer<typeof updateSeasonInput>

export const createEpisodeInput = z.object({
  title: z.string().min(1),
  youtubeId,
  airDate: streamDate.describe('Day the episode came out'),
  durationS,
  thumbnailUrl: z
    .url()
    .optional()
    .describe('Defaults to the YouTube thumbnail'),
  sort: sortOrder.optional(),
})
export type CreateEpisodeInput = z.infer<typeof createEpisodeInput>

export const updateEpisodeInput = z
  .object({
    season: contentSlug.describe('Move to another season of the same show'),
    title: z.string().min(1),
    youtubeId,
    airDate: streamDate,
    durationS,
    thumbnailUrl: z.url().nullable(),
    position,
  })
  .partial()
export type UpdateEpisodeInput = z.infer<typeof updateEpisodeInput>

export const apiEpisode = z.object({
  slug: vodSlug.describe('Random 10 character episode id'),
  show: contentSlug,
  season: contentSlug,
  title: z.string(),
  youtubeId,
  airDate: streamDate,
  durationS,
  thumbnailUrl: z.string().nullable(),
  sort: z.number().int(),
})
export type ApiEpisode = z.infer<typeof apiEpisode>

export const apiSeason = z.object({
  slug: contentSlug,
  title: z.string(),
  sort: z.number().int(),
  episodes: z.array(apiEpisode),
})
export type ApiSeason = z.infer<typeof apiSeason>

export const apiShowSummary = z.object({
  slug: contentSlug,
  channel: channelSlug,
  name: z.string(),
  description: z.string(),
  coverUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  sort: z.number().int(),
  seasonCount: z.number().int(),
  episodeCount: z.number().int(),
})
export type ApiShowSummary = z.infer<typeof apiShowSummary>

export const apiShow = apiShowSummary.extend({ seasons: z.array(apiSeason) })
export type ApiShow = z.infer<typeof apiShow>

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
  vodCount: z
    .number()
    .int()
    .optional()
    .describe('When deleting a channel that still has content'),
  showCount: z
    .number()
    .int()
    .optional()
    .describe('When deleting a channel that still has content'),
})
export type ApiError = z.infer<typeof apiError>

export const MAX_CHAT_SEGMENT_BYTES = 25 * 1024 * 1024
export const MAX_EMOTE_SET_BYTES = 1024 * 1024
