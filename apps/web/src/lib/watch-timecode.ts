const TIMECODE_PARAM = 't'

export function parseTimecodeParam(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

export function getTimecodeFromUrl(
  url: URL = new URL(window.location.href),
): number | null {
  return parseTimecodeParam(url.searchParams.get(TIMECODE_PARAM))
}

export function buildWatchUrl(pathname: string, seconds?: number): string {
  const url = new URL(pathname, window.location.origin)
  if (seconds !== undefined && seconds > 0) {
    url.searchParams.set(TIMECODE_PARAM, String(Math.floor(seconds)))
  }
  return url.toString()
}

export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}
