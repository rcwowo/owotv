import type {
  ApiChannel,
  ApiMe,
  ApiError,
  ApiVod,
  ChannelInput,
  ChatManifest,
  CreateVodInput,
  UpdateVodInput,
} from '@owotv/shared'

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.error)
  }
}

type Body = { json: unknown } | { raw: string }

export class ApiClient {
  readonly baseUrl: string

  constructor(
    baseUrl: string,
    private readonly token?: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  private async request<T>(method: string, path: string, body?: Body) {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (this.token) headers.Authorization = `Bearer ${this.token}`
    if (body) headers['Content-Type'] = 'application/json'

    const url = `${this.baseUrl}/api${path}`
    let res: Response
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body
          ? 'raw' in body
            ? body.raw
            : JSON.stringify(body.json)
          : undefined,
      })
    } catch (err) {
      const cause = (err as Error & { cause?: Error }).cause
      throw new Error(
        `Could not reach ${url}: ${cause?.message ?? (err as Error).message}`,
      )
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    let data: unknown
    try {
      data = text ? JSON.parse(text) : undefined
    } catch {
      throw new ApiRequestError(res.status, {
        error: `Expected JSON from ${url} but got ${res.headers.get('Content-Type') ?? 'something else'}`,
      })
    }
    if (!res.ok) {
      const err =
        data && typeof data === 'object' && 'error' in data
          ? (data as ApiError)
          : { error: `${res.status} ${res.statusText}` }
      throw new ApiRequestError(res.status, err)
    }
    return data as T
  }

  whoami() {
    return this.request<ApiMe>('GET', '/me')
  }

  listChannels() {
    return this.request<ApiChannel[]>('GET', '/channels')
  }

  createChannel(input: ChannelInput) {
    return this.request<ApiChannel>('POST', '/channels', { json: input })
  }

  listVods(opts: { channel?: string; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams()
    if (opts.channel) q.set('channel', opts.channel)
    if (opts.limit) q.set('limit', String(opts.limit))
    if (opts.offset) q.set('offset', String(opts.offset))
    return this.request<ApiVod[]>('GET', `/vods?${q}`)
  }

  getVod(slug: string) {
    return this.request<ApiVod>('GET', `/vods/${encodeURIComponent(slug)}`)
  }

  createVod(input: CreateVodInput) {
    return this.request<ApiVod>('POST', '/vods', { json: input })
  }

  updateVod(slug: string, input: UpdateVodInput) {
    return this.request<ApiVod>('PATCH', `/vods/${encodeURIComponent(slug)}`, {
      json: input,
    })
  }

  deleteVod(slug: string) {
    return this.request<void>('DELETE', `/vods/${encodeURIComponent(slug)}`)
  }

  putEmoteSet(hash: string, body: string) {
    return this.request<void>('PUT', `/emotes/${hash}`, { raw: body })
  }

  putChatSegment(slug: string, segment: number, body: string) {
    return this.request<void>(
      'PUT',
      `/vods/${encodeURIComponent(slug)}/chat/${segment}`,
      {
        raw: body,
      },
    )
  }

  finalizeChat(slug: string, manifest: ChatManifest) {
    return this.request<ApiVod>(
      'PUT',
      `/vods/${encodeURIComponent(slug)}/chat/manifest`,
      {
        json: manifest,
      },
    )
  }

  deleteChat(slug: string) {
    return this.request<void>(
      'DELETE',
      `/vods/${encodeURIComponent(slug)}/chat`,
    )
  }
}
