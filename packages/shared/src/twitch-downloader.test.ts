import { describe, expect, test } from 'bun:test'
import {
  chatManifest,
  chatSegment,
  pickSegmentSeconds,
  resolveSegment,
} from './chat'
import {
  buildChatArchive,
  type TwitchDownloaderComment,
} from './twitch-downloader'

const comment = (
  offset: number,
  login: string,
  body: string,
  extra: Partial<TwitchDownloaderComment['message']> = {},
): TwitchDownloaderComment => ({
  content_offset_seconds: offset,
  commenter: { name: login, display_name: login.toUpperCase() },
  message: { body, ...extra },
})

describe('buildChatArchive', () => {
  test('splits messages into fixed windows and skips empty ones', () => {
    const { manifest, segments } = buildChatArchive(
      {
        comments: [
          comment(650, 'b', 'late'),
          comment(1.5, 'a', 'first'),
          comment(299.999, 'a', 'edge'),
          comment(300, 'b', 'next window'),
        ],
        video: { length: 700 },
      },
      { segmentSeconds: 300 },
    )

    expect(manifest.segments).toEqual([2, 1, 1])
    expect(manifest.messageCount).toBe(4)
    expect(manifest.durationS).toBe(700)
    expect(segments.map((s) => s.segment)).toEqual([0, 1, 2])
    expect(segments[0]!.messages.map((m) => m[0])).toEqual([1.5, 299.999])

    chatManifest.parse(manifest)
    for (const s of segments) chatSegment.parse(s)
  })

  test('leaves a gap for silent windows', () => {
    const { manifest, segments } = buildChatArchive(
      { comments: [comment(10, 'a', 'x'), comment(910, 'a', 'y')] },
      { segmentSeconds: 300, durationS: 1000 },
    )
    expect(manifest.segments).toEqual([1, 0, 0, 1])
    expect(segments).toHaveLength(2)
  })

  test('dedupes users per segment but keeps badge changes', () => {
    const sub = { user_badges: [{ _id: 'subscriber', version: '1' }] }
    const { segments } = buildChatArchive({
      comments: [
        comment(1, 'a', 'one', sub),
        comment(2, 'a', 'two', sub),
        comment(3, 'a', 'resubbed', {
          user_badges: [{ _id: 'subscriber', version: '2' }],
        }),
      ],
    })
    const seg = segments[0]!
    expect(seg.users).toHaveLength(2)
    expect(seg.messages.map((m) => m[1])).toEqual([0, 0, 1])
  })

  test('keeps emotes as tuples and merges plain text', () => {
    const { segments } = buildChatArchive({
      comments: [
        comment(1, 'a', 'hi Kappa there', {
          fragments: [
            { text: 'hi ', emoticon: null },
            { text: 'Kappa', emoticon: { emoticon_id: '25' } },
            { text: ' the', emoticon: null },
            { text: 're', emoticon: null },
          ],
        }),
        comment(2, 'a', 'no fragments'),
      ],
    })
    const [first, second] = resolveSegment(segments[0]!)
    expect(first!.fragments).toEqual(['hi ', ['Kappa', '25'], ' there'])
    expect(second!.fragments).toEqual(['no fragments'])
    expect(first!.user.name).toBe('A')
  })

  test('handles an empty chat', () => {
    const { manifest, segments } = buildChatArchive({ comments: [] })
    expect(manifest.segments).toEqual([0])
    expect(segments).toEqual([])
  })
})

describe('pickSegmentSeconds', () => {
  test('aims for ~1000 messages per segment within bounds', () => {
    expect(pickSegmentSeconds(0, 7200)).toBe(3600)
    expect(pickSegmentSeconds(500, 7200)).toBe(3600)
    expect(pickSegmentSeconds(4000, 3600)).toBe(900)
    expect(pickSegmentSeconds(100_000, 3600)).toBe(300)
  })

  test('is used when no segment length is given', () => {
    const comments = Array.from({ length: 10 }, (_, i) =>
      comment(i * 600, 'a', 'x'),
    )
    const { manifest } = buildChatArchive({ comments, video: { length: 6000 } })
    expect(manifest.segmentSeconds).toBe(3600)
    expect(manifest.segments).toEqual([6, 4])
  })
})
