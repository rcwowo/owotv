import type { R2Bucket } from '@cloudflare/workers-types'
import { env } from 'cloudflare:workers'

interface R2ObjectInfo {
  key: string
  size: number
  uploaded: string
}

// Legacy size limit reserved for chatlog uploads: chatlogs can be tens of MB
// and are streamed straight into R2, so nothing is buffered in memory here.
const MAX_CHATLOG_SIZE_BYTES = 512 * 1024 * 1024

export function chatlogsBucket(): R2Bucket {
  const bucket = (env as unknown as { CHATLOGS?: R2Bucket }).CHATLOGS
  if (!bucket) throw new Error('R2 binding "CHATLOGS" not found.')
  return bucket
}

export const CHATLOG_LIMITS = { maxBytes: MAX_CHATLOG_SIZE_BYTES }

export function toObjectInfo(obj: {
  key: string
  size: number
  uploaded: Date
}): R2ObjectInfo {
  return { key: obj.key, size: obj.size, uploaded: obj.uploaded.toISOString() }
}
