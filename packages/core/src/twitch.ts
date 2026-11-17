import type {
  ApiChannel,
  ChannelInput,
  TwitchDownloaderChapter,
  TwitchDownloaderChat,
  TwitchDownloaderComment,
  UpdateChannelInput,
} from '@owotv/shared'

const GQL_URL = 'https://gql.twitch.tv/gql'
const WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const COMMENTS_CLIENT_ID = 'kd1unb4b3q4t58fwlpcbzcbnm76a8fp'
const CHAPTERS_HASH =
  '71835d5ef425e154bf282453a926d99b328cdc5e32f36d3a209d0f4778b41203'
const COMMENTS_HASH =
  'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a'

export type TwitchFetch = (url: string, init?: RequestInit) => Promise<Response>

export interface TwitchVideo {
  id: string
  title: string
  createdAt: string
  lengthSeconds: number
  status: string | null
  owner: { id: string; login: string; displayName: string } | null
  game: { id: string; displayName: string; boxArtURL: string } | null
}

export interface TwitchVideoSummary {
  id: string
  title: string
  createdAt: string
  lengthSeconds: number
  game: string | null
}

interface GqlComment {
  id: string
  commenter: { id: string; login: string; displayName: string } | null
  contentOffsetSeconds: number
  createdAt: string
  message: {
    fragments: Array<{ text: string | null; emote: { emoteID: string } | null }>
    userBadges: Array<{ setID: string; version: string }> | null
    userColor: string | null
  }
}

interface GqlCommentPage {
  video: {
    comments: {
      edges: Array<{ cursor: string; node: GqlComment }>
      pageInfo: { hasNextPage: boolean }
    } | null
  } | null
}

interface GqlChapters {
  video: {
    moments: {
      edges: Array<{
        node: {
          positionMilliseconds: number
          durationMilliseconds: number
          details: {
            game?: { id: string; displayName: string; boxArtURL: string } | null
          } | null
        }
      }>
    } | null
  } | null
}

export type ChatDownloadEvent =
  | { type: 'video'; video: TwitchVideo }
  | { type: 'progress'; percent: number; comments: number }
  | { type: 'retry'; message: string }

export interface DownloadChatOptions {
  connections?: number
  signal?: AbortSignal
  onEvent?: (event: ChatDownloadEvent) => void
  fetch?: TwitchFetch
}

export function parseTwitchVodId(input: string) {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  const match = trimmed.match(/twitch\.tv\/(?:[^/]+\/)?videos?\/(\d+)/)
  if (!match) throw new Error(`Not a Twitch VOD URL or id: "${input}"`)
  return match[1]!
}

export class TwitchGqlError extends Error {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal!.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

async function gql<T>(
  body: object,
  opts: { clientId?: string; fetch?: TwitchFetch; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await (opts.fetch ?? fetch)(GQL_URL, {
    method: 'POST',
    headers: {
      'Client-ID': opts.clientId ?? WEB_CLIENT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok) throw new Error(`Twitch returned ${res.status}`)
  const json = (await res.json()) as {
    data?: T
    errors?: Array<{ message: string }>
  }
  if (json.errors?.length) {
    throw new TwitchGqlError(
      `Twitch: ${json.errors.map((e) => e.message).join(', ')}`,
    )
  }
  if (!json.data) throw new TwitchGqlError('Twitch returned no data')
  return json.data
}

const quote = (s: string) => JSON.stringify(s)

export async function fetchTwitchVideo(
  id: string,
  opts: { fetch?: TwitchFetch; signal?: AbortSignal } = {},
) {
  const data = await gql<{ video: TwitchVideo | null }>(
    {
      query: `query{video(id:${quote(id)}){id,title,createdAt,lengthSeconds,status,owner{id,login,displayName},game{id,displayName,boxArtURL}}}`,
    },
    opts,
  )
  if (!data.video) throw new Error(`Twitch VOD ${id} not found or expired`)
  return data.video
}

export async function fetchTwitchChapters(
  video: TwitchVideo,
  opts: { fetch?: TwitchFetch; signal?: AbortSignal } = {},
): Promise<TwitchDownloaderChapter[]> {
  const data = await gql<GqlChapters>(
    {
      operationName: 'VideoPlayer_ChapterSelectButtonVideo',
      variables: { videoID: video.id },
      extensions: { persistedQuery: { version: 1, sha256Hash: CHAPTERS_HASH } },
    },
    opts,
  ).catch((err) => {
    if (err instanceof TwitchGqlError) return undefined
    throw err
  })

  const chapters: TwitchDownloaderChapter[] = []
  for (const { node } of data?.video?.moments?.edges ?? []) {
    const game = node.details?.game
    chapters.push({
      startMilliseconds: node.positionMilliseconds,
      gameId: game?.id ?? null,
      gameDisplayName: game?.displayName ?? null,
      gameBoxArtUrl: game?.boxArtURL ?? null,
    })
  }
  if (!chapters.length && video.game) {
    chapters.push({
      startMilliseconds: 0,
      gameId: video.game.id,
      gameDisplayName: video.game.displayName,
      gameBoxArtUrl: video.game.boxArtURL,
    })
  }
  return chapters
}

export async function listTwitchVideos(
  channelId: string,
  opts: { first?: number; fetch?: TwitchFetch; signal?: AbortSignal } = {},
): Promise<TwitchVideoSummary[]> {
  const data = await gql<{
    user: {
      videos: {
        edges: Array<{
          node: Omit<TwitchVideoSummary, 'game'> & {
            game: { displayName: string } | null
          }
        }>
      }
    } | null
  }>(
    {
      query: `query{user(id:${quote(channelId)}){videos(first:${opts.first ?? 20},type:ARCHIVE,sort:TIME){edges{node{id,title,createdAt,lengthSeconds,game{displayName}}}}}}`,
    },
    opts,
  )
  return (data.user?.videos.edges ?? []).map(({ node }) => ({
    ...node,
    game: node.game?.displayName ?? null,
  }))
}

function toComment(c: GqlComment): TwitchDownloaderComment | undefined {
  if (!c.commenter) return undefined
  const fragments = c.message.fragments
    .filter((f): f is { text: string; emote: { emoteID: string } | null } =>
      Boolean(f.text),
    )
    .map((f) => ({
      text: f.text,
      emoticon: f.emote ? { emoticon_id: f.emote.emoteID } : null,
    }))
  return {
    _id: c.id,
    created_at: c.createdAt,
    content_offset_seconds: c.contentOffsetSeconds,
    commenter: {
      _id: c.commenter.id,
      name: c.commenter.login,
      display_name: c.commenter.displayName.trim(),
    },
    message: {
      body: fragments.map((f) => f.text).join(''),
      fragments,
      user_badges: (c.message.userBadges ?? [])
        .filter((b) => b.setID || b.version)
        .map((b) => ({ _id: b.setID, version: b.version })),
      user_color: c.message.userColor,
    },
  }
}

async function downloadRange(
  videoId: string,
  start: number,
  end: number,
  toEnd: boolean,
  opts: DownloadChatOptions,
  report: (latest: number, added: number) => void,
) {
  const comments: TwitchDownloaderComment[] = []
  let cursor: string | undefined
  let failures = 0

  for (;;) {
    let page: GqlCommentPage
    try {
      page = await gql<GqlCommentPage>(
        {
          operationName: 'VideoCommentsByOffsetOrCursor',
          variables: cursor
            ? { videoID: videoId, cursor }
            : { videoID: videoId, contentOffsetSeconds: start },
          extensions: {
            persistedQuery: { version: 1, sha256Hash: COMMENTS_HASH },
          },
        },
        {
          clientId: COMMENTS_CLIENT_ID,
          fetch: opts.fetch,
          signal: opts.signal,
        },
      )
      if (!page.video?.comments?.edges) {
        throw new TwitchGqlError('No comments returned')
      }
    } catch (err) {
      if (opts.signal?.aborted) throw err
      if (!cursor && err instanceof TwitchGqlError && failures >= 1) {
        return comments
      }
      if (++failures > 10) throw err
      opts.onEvent?.({
        type: 'retry',
        message: `${(err as Error).message}, retrying (${failures}/10)`,
      })
      await sleep(1000 * failures, opts.signal)
      continue
    }
    failures = Math.max(0, failures - 0.1)

    const { edges, pageInfo } = page.video.comments
    let latest = start
    let added = 0
    for (const { node } of edges) {
      latest = Math.max(latest, node.contentOffsetSeconds)
      if (node.contentOffsetSeconds < start) continue
      if (!toEnd && node.contentOffsetSeconds >= end) continue
      const comment = toComment(node)
      if (comment) {
        comments.push(comment)
        added++
      }
    }
    report(latest, added)
    if (!pageInfo.hasNextPage || !edges.length) break
    if (!toEnd && latest >= end) break
    cursor = edges.at(-1)!.cursor
  }
  return comments
}

function adjustOffsets(
  comments: TwitchDownloaderComment[],
  videoCreatedAt: string,
) {
  const first = comments[0]
  if (!first?.created_at) return
  const sinceStart =
    (Date.parse(first.created_at) - Date.parse(videoCreatedAt)) / 1000
  if (!(sinceStart >= -300)) return
  const offset = Math.min(
    first.content_offset_seconds - sinceStart,
    first.content_offset_seconds,
  )
  if (!(offset >= 5)) return
  for (const c of comments) c.content_offset_seconds -= offset
}

export async function downloadTwitchChat(
  input: string,
  opts: DownloadChatOptions = {},
): Promise<TwitchDownloaderChat> {
  const id = parseTwitchVodId(input)
  const video = await fetchTwitchVideo(id, opts)
  opts.onEvent?.({ type: 'video', video })
  const chapters = await fetchTwitchChapters(video, opts)

  const length = Math.max(1, video.lengthSeconds)
  const connections = Math.max(
    1,
    Math.min(opts.connections ?? 4, Math.ceil(length / 60)),
  )
  const chunk = Math.ceil((length + 1) / connections)
  const progress = new Array<number>(connections).fill(0)
  let total = 0
  const ctrl = new AbortController()
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, ctrl.signal])
    : ctrl.signal

  const ranges = await Promise.all(
    Array.from({ length: connections }, (_, i) => {
      const start = chunk * i
      const end = Math.min(length + 1, start + chunk)
      return downloadRange(
        id,
        start,
        end,
        i === connections - 1,
        { ...opts, signal },
        (latest, added) => {
          progress[i] = Math.min(
            1,
            Math.max(0, (latest - start) / Math.max(1, end - start)),
          )
          total += added
          opts.onEvent?.({
            type: 'progress',
            percent: Math.min(
              99,
              Math.floor(
                (progress.reduce((a, b) => a + b, 0) / connections) * 100,
              ),
            ),
            comments: total,
          })
        },
      ).catch((err) => {
        ctrl.abort(err)
        throw err
      })
    }),
  )

  const seen = new Set<string>()
  const comments = ranges
    .flat()
    .filter((c) => !seen.has(c._id!) && seen.add(c._id!))
    .sort((a, b) => a.content_offset_seconds - b.content_offset_seconds)
  adjustOffsets(comments, video.createdAt)
  opts.onEvent?.({ type: 'progress', percent: 100, comments: comments.length })

  return {
    streamer: video.owner
      ? {
          id: video.owner.id,
          login: video.owner.login,
          name: video.owner.displayName,
        }
      : undefined,
    video: {
      id: video.id,
      title: video.title,
      created_at: video.createdAt,
      length:
        video.lengthSeconds ||
        Math.ceil(comments.at(-1)?.content_offset_seconds ?? 0),
      game: video.game?.displayName ?? null,
      chapters,
    },
    comments,
  }
}

export interface TwitchUser {
  id: string
  login: string
  displayName: string
  profileImageURL: string | null
}

const USER_FIELDS = 'id,login,displayName,profileImageURL(width:300)'

export async function fetchTwitchUser(
  login: string,
  opts: { fetch?: TwitchFetch; signal?: AbortSignal } = {},
) {
  const data = await gql<{ user: TwitchUser | null }>(
    {
      query: `query{user(login:${quote(login.trim().toLowerCase())}){${USER_FIELDS}}}`,
    },
    opts,
  )
  if (!data.user) throw new Error(`No Twitch user "${login}"`)
  return data.user
}

/** Looks a user up by their permanent id, which survives username changes. */
export async function fetchTwitchUserById(
  id: string,
  opts: { fetch?: TwitchFetch; signal?: AbortSignal } = {},
) {
  const data = await gql<{ user: TwitchUser | null }>(
    { query: `query{user(id:${quote(id)}){${USER_FIELDS}}}` },
    opts,
  )
  if (!data.user) throw new Error(`No Twitch user with id ${id}`)
  return data.user
}

export async function channelFromTwitch(
  login: string,
  opts: { fetch?: TwitchFetch; signal?: AbortSignal } = {},
): Promise<ChannelInput> {
  const user = await fetchTwitchUser(login, opts)
  return {
    slug: user.login,
    displayName: user.displayName,
    twitchId: user.id,
    ...(user.profileImageURL ? { avatarUrl: user.profileImageURL } : {}),
  }
}

/**
 * The changes needed to bring a channel in line with its Twitch account:
 * login (slug), display name and avatar. Empty when nothing changed.
 */
export async function channelSyncFromTwitch(
  channel: Pick<ApiChannel, 'slug' | 'displayName' | 'twitchId' | 'avatarUrl'>,
  opts: { fetch?: TwitchFetch; signal?: AbortSignal } = {},
): Promise<UpdateChannelInput> {
  const user = channel.twitchId
    ? await fetchTwitchUserById(channel.twitchId, opts)
    : await fetchTwitchUser(channel.slug, opts)
  const patch: UpdateChannelInput = {}
  if (user.login !== channel.slug) patch.slug = user.login
  if (user.displayName !== channel.displayName) {
    patch.displayName = user.displayName
  }
  if (!channel.twitchId) patch.twitchId = user.id
  if (user.profileImageURL && user.profileImageURL !== channel.avatarUrl) {
    patch.avatarUrl = user.profileImageURL
  }
  return patch
}
