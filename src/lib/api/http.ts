export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function error(status: number, message: string): Response {
  return json({ error: message }, status)
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : value
}

export function toIntOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number.parseInt(value, 10)
  return null
}

/**
 * Guards chatlog object keys: no leading/trailing slashes, no empty or
 * traversing segments, printable ASCII only.
 */
export function safeChatlogKey(raw: string | null): string | null {
  if (!raw) return null
  const key = raw.replace(/^\/+|\/+$/g, '')
  if (!key || /[\x00-\x1f\x7f]/.test(key)) return null
  const segments = key.split('/')
  for (const segment of segments) {
    if (!segment || segment === '..' || segment === '.') return null
    if (!/^[\w.@+=:~-]+$/.test(segment)) return null
  }
  return key
}
