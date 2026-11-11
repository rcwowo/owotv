import { vods } from '@owotv/db'
import {
  chatManifestKey,
  chatSegmentKey,
  type ChatArchive,
} from '@owotv/shared'
import { eq } from 'drizzle-orm'
import { deletePrefix, mapLimit, type Store } from './store'

const json = { httpMetadata: { contentType: 'application/json' } }

export async function writeChatArchive(
  store: Store,
  vod: { id: number; slug: string },
  archive: ChatArchive,
) {
  await store.db
    .update(vods)
    .set({ chatStatus: 'processing' })
    .where(eq(vods.id, vod.id))

  try {
    await deletePrefix(store.bucket, `chat/${vod.slug}/`)
    await mapLimit(archive.segments, 8, (seg) =>
      store.bucket.put(
        chatSegmentKey(vod.slug, seg.segment),
        JSON.stringify(seg),
        json,
      ),
    )
    await store.bucket.put(
      chatManifestKey(vod.slug),
      JSON.stringify(archive.manifest),
      json,
    )
  } catch (err) {
    await store.db
      .update(vods)
      .set({ chatStatus: 'failed' })
      .where(eq(vods.id, vod.id))
    throw err
  }

  await store.db
    .update(vods)
    .set({
      chatStatus: 'ready',
      chatMessageCount: archive.manifest.messageCount,
    })
    .where(eq(vods.id, vod.id))
}
