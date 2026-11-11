import { expect, test } from 'bun:test'
import { writeEmoteSet } from './emotes'
import type { BucketLike } from './store'

function memoryBucket() {
  const objects = new Map<string, string>()
  let puts = 0
  const bucket: BucketLike = {
    put: async (key, value) => {
      puts++
      objects.set(key, value)
    },
    head: async (key) => (objects.has(key) ? {} : null),
    delete: async () => {},
    list: async () => ({ objects: [], truncated: false }),
  }
  return { bucket, objects, puts: () => puts }
}

test('identical sets share one file regardless of key order', async () => {
  const mem = memoryBucket()
  const a = await writeEmoteSet(mem.bucket, {
    x: { provider: '7tv', id: '1' },
    y: { provider: '7tv', id: '2' },
  })
  const b = await writeEmoteSet(mem.bucket, {
    y: { provider: '7tv', id: '2' },
    x: { provider: '7tv', id: '1' },
  })
  expect(a).toMatch(/^[0-9a-f]{16}$/)
  expect(b).toBe(a)
  expect(mem.puts()).toBe(1)
  expect([...mem.objects.keys()]).toEqual([`emotes/${a}.json`])
})

test('empty set writes nothing', async () => {
  const mem = memoryBucket()
  expect(await writeEmoteSet(mem.bucket, {})).toBeNull()
  expect(mem.puts()).toBe(0)
})
