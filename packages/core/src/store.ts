import type { Db } from '@owotv/db'

export interface BucketLike {
  put(
    key: string,
    value: string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  head(key: string): Promise<unknown | null>
  delete(keys: string | string[]): Promise<void>
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    objects: { key: string }[]
    truncated: boolean
    cursor?: string
  }>
}

export interface Store {
  db: Db
  bucket: BucketLike
}

export async function deletePrefix(bucket: BucketLike, prefix: string) {
  let cursor: string | undefined
  let deleted = 0
  do {
    const page = await bucket.list({ prefix, cursor })
    const keys = page.objects.map((o) => o.key)
    if (keys.length) await bucket.delete(keys)
    deleted += keys.length
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return deleted
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}
