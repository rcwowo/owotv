import { expect, test } from 'bun:test'
import { encodeEmoteSet } from './emotes'

test('identical sets encode the same regardless of key order', async () => {
  const a = await encodeEmoteSet({
    x: { provider: '7tv', id: '1' },
    y: { provider: '7tv', id: '2' },
  })
  const b = await encodeEmoteSet({
    y: { provider: '7tv', id: '2' },
    x: { provider: '7tv', id: '1' },
  })
  expect(a?.hash).toMatch(/^[0-9a-f]{16}$/)
  expect(b).toEqual(a)
})

test('empty set encodes to nothing', async () => {
  expect(await encodeEmoteSet({})).toBeNull()
})
