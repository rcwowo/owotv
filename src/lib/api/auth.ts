import { env } from 'cloudflare:workers'

export type ApiScope = 'read' | 'admin'

export interface ApiAuth {
  scope: ApiScope
}

function parseKeys(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
}

function extractKey(request: Request): string | null {
  const header = request.headers.get('x-api-key')
  if (header) return header.trim()

  const auth = request.headers.get('authorization')
  if (auth && /^[Bb][Ee][Aa][Rr][Ee][Rr] /.test(auth)) return auth.slice(7).trim()

  return null
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Authenticates the request against the `ADMIN_API_KEYS` / `READ_API_KEYS`
 * secrets (comma-separated lists). Admin keys can do everything; read keys
 * can only call GET/HEAD endpoints.
 *
 * Keys are compared by SHA-256 digest so raw keys never end up in hot
 * string comparisons.
 */
export async function authenticate(
  request: Request,
  need: ApiScope,
): Promise<ApiAuth | null> {
  const record = env as { ADMIN_API_KEYS?: string; READ_API_KEYS?: string }
  const presented = extractKey(request)
  if (!presented) return null

  const adminKeys = parseKeys(record.ADMIN_API_KEYS)
  const readKeys = parseKeys(record.READ_API_KEYS)
  const presentedHash = await sha256Hex(presented)

  if (adminKeys.length > 0) {
    const isAdmin = await matchAny(adminKeys, presentedHash)
    if (isAdmin) return { scope: 'admin' }
  }
  if (need === 'read' && readKeys.length > 0) {
    const isRead = await matchAny(readKeys, presentedHash)
    if (isRead) return { scope: 'read' }
  }

  return null
}

async function matchAny(keys: string[], presentedHash: string): Promise<boolean> {
  for (const key of keys) {
    if (timingSafeEqual(await sha256Hex(key), presentedHash)) return true
  }
  return false
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
