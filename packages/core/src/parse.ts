export function parseDuration(text: string): number {
  const raw = text.trim().split(':')
  if (raw.length > 3 || raw.some((p) => !/^\d+$/.test(p))) {
    throw new Error(`Invalid duration: "${text}"`)
  }
  const parts = raw.map(Number)
  return parts.reduce((total, n) => total * 60 + n, 0)
}

export function parseYouTubeId(url: string): string {
  const u = new URL(url)
  const host = u.hostname.replace(/^(www\.|m\.)/, '')
  const id =
    host === 'youtu.be'
      ? u.pathname.slice(1).split('/')[0]
      : host === 'youtube.com'
        ? (u.searchParams.get('v') ??
          u.pathname.match(/^\/(?:embed|live|shorts)\/([^/]+)/)?.[1])
        : undefined
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw new Error(`Not a YouTube video URL: "${url}"`)
  }
  return id
}
