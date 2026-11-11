import { expect, test } from 'bun:test'
import { readChatFileMeta } from './ingest'
import {
  downloadTwitchChat,
  parseTwitchVodId,
  type TwitchFetch,
} from './twitch'

test('parseTwitchVodId accepts ids and URLs', () => {
  expect(parseTwitchVodId('2912355720')).toBe('2912355720')
  expect(parseTwitchVodId('https://www.twitch.tv/videos/2912355720')).toBe(
    '2912355720',
  )
  expect(parseTwitchVodId('twitch.tv/shroud/video/123?t=1h')).toBe('123')
  expect(() => parseTwitchVodId('https://youtu.be/abc')).toThrow()
})

const comment = (id: string, offset: number, emote = false) => ({
  cursor: `c-${id}`,
  node: {
    id,
    commenter: { id: '1', login: 'viewer', displayName: ' Viewer ' },
    contentOffsetSeconds: offset,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, offset)).toISOString(),
    message: {
      fragments: emote
        ? [{ text: 'Kappa', emote: { emoteID: '25' } }]
        : [{ text: `hi ${id}`, emote: null }],
      userBadges: [
        { setID: 'sub', version: '3' },
        { setID: '', version: '' },
      ],
      userColor: '#ff0000',
    },
  },
})

const comments = [
  comment('a', 1),
  comment('b', 40, true),
  comment('c', 70),
  comment('d', 110),
  comment('e', 150),
]

const fakeTwitchWith =
  (
    comments: ReturnType<typeof comment>[],
    lengthSeconds: number,
  ): TwitchFetch =>
  async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    const json = (data: unknown) => new Response(JSON.stringify({ data }))
    if (body.query?.includes('video(id:')) {
      return json({
        video: {
          id: '99',
          title: 'Test stream',
          createdAt: '2026-01-01T00:00:00Z',
          lengthSeconds,
          owner: { id: '7', login: 'streamer', displayName: 'Streamer' },
          game: {
            id: '5',
            displayName: 'Game',
            boxArtURL: 'https://x/5-{width}x{height}.jpg',
          },
        },
      })
    }
    if (body.operationName === 'VideoPlayer_ChapterSelectButtonVideo') {
      return json({ video: { moments: { edges: [] } } })
    }
    if (
      !body.variables.cursor &&
      body.variables.contentOffsetSeconds >
        (comments.at(-1)?.node.contentOffsetSeconds ?? -1)
    ) {
      return new Response(
        JSON.stringify({
          errors: [{ message: 'service error' }],
          data: { video: { comments: null } },
        }),
      )
    }
    const start = body.variables.cursor
      ? comments.findIndex((c) => c.cursor === body.variables.cursor) + 1
      : comments.findIndex(
          (c) =>
            c.node.contentOffsetSeconds >= body.variables.contentOffsetSeconds,
        )
    const page = start < 0 ? [] : comments.slice(start, start + 2)
    return json({
      video: {
        comments: {
          edges: page,
          pageInfo: { hasNextPage: start >= 0 && start + 2 < comments.length },
        },
      },
    })
  }

const fakeTwitch = fakeTwitchWith(comments, 160)

test('downloadTwitchChat merges parallel ranges into a TwitchDownloader file', async () => {
  const chat = await downloadTwitchChat('99', {
    connections: 3,
    fetch: fakeTwitch,
  })
  expect(chat.comments.map((c) => c._id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  expect(chat.streamer).toEqual({
    id: '7',
    login: 'streamer',
    name: 'Streamer',
  })
  expect(chat.video?.chapters).toEqual([
    {
      startMilliseconds: 0,
      gameId: '5',
      gameDisplayName: 'Game',
      gameBoxArtUrl: 'https://x/5-{width}x{height}.jpg',
    },
  ])
  const b = chat.comments[1]!
  expect(b.commenter.display_name).toBe('Viewer')
  expect(b.message.fragments).toEqual([
    { text: 'Kappa', emoticon: { emoticon_id: '25' } },
  ])
  expect(b.message.user_badges).toEqual([{ _id: 'sub', version: '3' }])
  expect(readChatFileMeta(chat).chapters[0]?.coverUrl).toBe(
    'https://x/5-285x380.jpg',
  )
})

test('downloadTwitchChat handles chat that ends before the VOD does', async () => {
  const chat = await downloadTwitchChat('99', {
    connections: 4,
    fetch: fakeTwitchWith(comments, 600),
  })
  expect(chat.comments.map((c) => c._id)).toEqual(['a', 'b', 'c', 'd', 'e'])
})

test('downloadTwitchChat handles a VOD with no chat', async () => {
  const chat = await downloadTwitchChat('99', {
    connections: 2,
    fetch: fakeTwitchWith([], 300),
  })
  expect(chat.comments).toEqual([])
  expect(chat.video?.length).toBe(300)
})
