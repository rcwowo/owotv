import type { ApiChannel } from '@owotv/shared'
import { describe, expect, test } from 'bun:test'
import { localDate, pickChannel, readChatFileMeta } from './ingest'
import { primaryChapter } from './vods'

const chat = {
  comments: [],
  streamer: { name: 'rcwOwO', login: 'rcwowo', id: 194814599 },
  video: {
    id: '2735890781',
    title: ' DAY 30/31 ',
    created_at: '2026-03-31T01:47:25Z',
    length: 14587,
    game: 'BETON BRUTAL',
    chapters: [
      {
        startMilliseconds: 0,
        gameId: '1073072196',
        gameDisplayName: 'BETON BRUTAL',
        gameBoxArtUrl:
          'https://static-cdn.jtvnw.net/ttv-boxart/1073072196-40x53.jpg',
      },
    ],
  },
}

const channel = (slug: string, twitchId: string | null): ApiChannel => ({
  slug,
  displayName: slug,
  twitchId,
  avatarUrl: null,
})

describe('readChatFileMeta', () => {
  test('reads title, ids, length and chapters', () => {
    const meta = readChatFileMeta(chat)
    expect(meta.title).toBe('DAY 30/31')
    expect(meta.twitchVodId).toBe('2735890781')
    expect(meta.durationS).toBe(14587)
    expect(meta.streamer).toEqual({
      login: 'rcwowo',
      name: 'rcwOwO',
      id: '194814599',
    })
    expect(meta.chapters).toEqual([
      {
        name: 'BETON BRUTAL',
        startS: 0,
        twitchGameId: '1073072196',
        coverUrl:
          'https://static-cdn.jtvnw.net/ttv-boxart/1073072196-285x380.jpg',
      },
    ])
  })

  test('falls back to the video game when there are no chapters', () => {
    const meta = readChatFileMeta({
      comments: [],
      video: { game: 'Just Chatting', chapters: [] },
    })
    expect(meta.chapters).toEqual([{ name: 'Just Chatting', startS: 0 }])
  })
})

test('localDate uses the given time zone', () => {
  const evening = new Date('2026-03-31T01:47:25Z')
  expect(localDate(evening, 'America/New_York')).toBe('2026-03-30')
  expect(localDate(evening, 'UTC')).toBe('2026-03-31')
})

describe('pickChannel', () => {
  const meta = readChatFileMeta(chat)
  test('matches by Twitch id, then login', () => {
    expect(
      pickChannel([channel('a', '1'), channel('x', '194814599')], meta)?.slug,
    ).toBe('x')
    expect(
      pickChannel([channel('a', '1'), channel('rcwowo', null)], meta)?.slug,
    ).toBe('rcwowo')
  })
  test('uses the only channel, otherwise gives up', () => {
    expect(pickChannel([channel('solo', null)], meta)?.slug).toBe('solo')
    expect(
      pickChannel([channel('a', '1'), channel('b', '2')], meta),
    ).toBeUndefined()
  })
})

test('primaryChapter picks the game played longest', () => {
  const chapters = [
    { name: 'A', startS: 0 },
    { name: 'B', startS: 600 },
    { name: 'A', startS: 1800 },
  ]
  expect(primaryChapter(chapters, 2000)?.name).toBe('B')
  expect(primaryChapter(chapters, 4000)?.name).toBe('A')
  expect(primaryChapter([], 100)).toBeUndefined()
})
