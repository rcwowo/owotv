import { expect, test } from 'bun:test'
import {
  extractJsonAssignment,
  fetchYouTubeVideo,
  type YouTubeFetch,
} from './youtube'

const player = {
  videoDetails: { title: 'Episode "1" {pilot}', lengthSeconds: '1234' },
  microformat: {
    playerMicroformatRenderer: { publishDate: '2026-02-03T08:00:00-08:00' },
  },
}
const page = `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var other = {};</script>`

test('extractJsonAssignment handles braces and quotes inside strings', () => {
  expect(extractJsonAssignment(page, 'ytInitialPlayerResponse')).toEqual(player)
  expect(extractJsonAssignment('nothing here', 'ytInitialPlayerResponse')).toBe(
    undefined,
  )
})

test('fetchYouTubeVideo reads title, length and date from the watch page', async () => {
  const fetch: YouTubeFetch = async () => new Response(page)
  expect(await fetchYouTubeVideo('abcdefghijk', { fetch })).toEqual({
    id: 'abcdefghijk',
    title: 'Episode "1" {pilot}',
    durationS: 1234,
    publishDate: '2026-02-03',
  })
})

test('fetchYouTubeVideo falls back to oEmbed for the title', async () => {
  const fetch: YouTubeFetch = async (url) =>
    url.includes('/oembed')
      ? Response.json({ title: 'From oEmbed' })
      : new Response('<html>consent page</html>')
  expect(await fetchYouTubeVideo('abcdefghijk', { fetch })).toEqual({
    id: 'abcdefghijk',
    title: 'From oEmbed',
  })
})

test('fetchYouTubeVideo reports missing videos', async () => {
  const fetch: YouTubeFetch = async (url) =>
    url.includes('/oembed')
      ? new Response('Not Found', { status: 404 })
      : new Response('')
  await expect(fetchYouTubeVideo('abcdefghijk', { fetch })).rejects.toThrow(
    'not found',
  )
})
