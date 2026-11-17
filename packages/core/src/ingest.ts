import {
  buildChatArchive,
  type ApiChannel,
  type ApiVod,
  type GameChapterInput,
  type TwitchDownloaderChat,
} from '@owotv/shared'
import { ApiRequestError, type ApiClient } from './client'
import { encodeEmoteSet, fetchSevenTvEmotes } from './emotes'
import { parseYouTubeId } from './parse'
import { mapLimit } from './store'

export type IngestEvent =
  | { type: 'step'; message: string }
  | { type: 'warn'; message: string }
  | {
      type: 'progress'
      label: string
      done: number
      total: number
      unit?: '%'
    }

export interface ChatFileMeta {
  title?: string
  createdAt?: Date
  durationS?: number
  twitchVodId?: string
  streamer?: { login?: string; name: string; id: string }
  chapters: GameChapterInput[]
}

const boxArt = (url: string) =>
  url.replace(/-(\d+x\d+|\{width\}x\{height\})(\.\w+)$/, '-285x380$2')

export function readChatFileMeta(chat: TwitchDownloaderChat): ChatFileMeta {
  const v = chat.video ?? {}
  const chapters: GameChapterInput[] = []
  for (const ch of v.chapters ?? []) {
    if (!ch.gameDisplayName) continue
    chapters.push({
      name: ch.gameDisplayName,
      startS: Math.round(ch.startMilliseconds / 1000),
      ...(ch.gameId ? { twitchGameId: ch.gameId } : {}),
      ...(ch.gameBoxArtUrl ? { coverUrl: boxArt(ch.gameBoxArtUrl) } : {}),
    })
  }
  if (!chapters.length && v.game) chapters.push({ name: v.game, startS: 0 })

  return {
    title: v.title?.trim() || undefined,
    createdAt:
      v.created_at && !Number.isNaN(Date.parse(v.created_at))
        ? new Date(v.created_at)
        : undefined,
    durationS: v.length ? Math.round(v.length) : undefined,
    twitchVodId: v.id || undefined,
    streamer: chat.streamer
      ? {
          login: chat.streamer.login,
          name: chat.streamer.name,
          id: String(chat.streamer.id),
        }
      : undefined,
    chapters,
  }
}

export function localDate(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function pickChannel(channels: ApiChannel[], meta: ChatFileMeta) {
  const s = meta.streamer
  const login = s?.login?.toLowerCase()
  const match =
    (s && channels.find((c) => c.twitchId === s.id)) ??
    (login && channels.find((c) => c.slug === login))
  if (match) return match
  if (channels.length === 1) return channels[0]!
  return undefined
}

export interface UploadChatOptions {
  emotes?: boolean
  twitchId?: string | null
  onEvent?: (event: IngestEvent) => void
}

export async function uploadChat(
  client: ApiClient,
  vod: Pick<ApiVod, 'slug' | 'durationS'>,
  chat: TwitchDownloaderChat,
  opts: UploadChatOptions = {},
) {
  const emit = opts.onEvent ?? (() => {})

  let emoteSet: string | null = null
  if (opts.emotes !== false && opts.twitchId) {
    emit({ type: 'step', message: 'Snapshotting 7TV emotes' })
    try {
      const encoded = await encodeEmoteSet(
        await fetchSevenTvEmotes(opts.twitchId),
      )
      if (encoded) {
        await client.putEmoteSet(encoded.hash, encoded.body)
        emoteSet = encoded.hash
      }
    } catch (err) {
      emit({
        type: 'warn',
        message: `7TV emotes skipped: ${(err as Error).message}`,
      })
    }
  }

  const archive = buildChatArchive(chat, { durationS: vod.durationS, emoteSet })
  await client.deleteChat(vod.slug)
  let done = 0
  await mapLimit(archive.segments, 4, async (seg) => {
    await client.putChatSegment(vod.slug, seg.segment, JSON.stringify(seg))
    emit({
      type: 'progress',
      label: 'Uploading chat',
      done: ++done,
      total: archive.segments.length,
    })
  })
  const updated = await client.finalizeChat(vod.slug, archive.manifest)
  return { vod: updated, messageCount: archive.manifest.messageCount }
}

export class ChatUploadError extends Error {
  constructor(
    readonly slug: string,
    message: string,
  ) {
    super(message)
  }
}

export interface ImportVodOptions {
  youtube: string
  channel?: string
  title?: string
  streamDate?: string
  timeZone?: string
  emotes?: boolean
  onEvent?: (event: IngestEvent) => void
}

export async function importVod(
  client: ApiClient,
  chat: TwitchDownloaderChat,
  opts: ImportVodOptions,
) {
  const emit = opts.onEvent ?? (() => {})
  const meta = readChatFileMeta(chat)

  const channels = await client.listChannels()
  const channel = opts.channel
    ? channels.find((c) => c.slug === opts.channel)
    : pickChannel(channels, meta)
  if (!channel) {
    throw new Error(
      opts.channel
        ? `No channel "${opts.channel}". Create it with \`owotv channel add\`.`
        : 'Could not tell which channel this chat belongs to. Pass --channel.',
    )
  }

  const title = opts.title ?? meta.title
  const streamDate =
    opts.streamDate ??
    (meta.createdAt ? localDate(meta.createdAt, opts.timeZone) : undefined)
  const durationS = meta.durationS
  if (!title) throw new Error('The chat file has no title. Pass --title.')
  if (!streamDate) throw new Error('The chat file has no date. Pass --date.')
  if (!durationS) throw new Error('The chat file has no video length.')

  emit({ type: 'step', message: `Creating VOD on ${channel.slug}` })
  let vod: ApiVod
  try {
    vod = await client.createVod({
      channel: channel.slug,
      title,
      streamDate,
      durationS,
      youtubeId: parseYouTubeId(opts.youtube),
      sourceTwitchVodId: meta.twitchVodId,
      chapters: meta.chapters,
    })
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 409 && err.body.slug) {
      throw new Error(
        `${err.message} as ${err.body.slug}. Use \`owotv chat upload ${err.body.slug}\` to replace its chat.`,
      )
    }
    throw err
  }

  try {
    const result = await uploadChat(client, vod, chat, {
      emotes: opts.emotes,
      twitchId: channel.twitchId,
      onEvent: emit,
    })
    return result
  } catch (err) {
    throw new ChatUploadError(
      vod.slug,
      `VOD ${vod.slug} was created but its chat failed to upload: ${(err as Error).message}. Retry with \`owotv chat upload ${vod.slug}\`.`,
    )
  }
}
