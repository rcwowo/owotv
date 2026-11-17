import type {
  ApiChannel,
  ApiEpisode,
  ApiShow,
  ApiShowSummary,
  CreateEpisodeInput,
  CreateSeasonInput,
  CreateShowInput,
  UpdateEpisodeInput,
  UpdateSeasonInput,
  UpdateShowInput,
  ApiMe,
  ApiError,
  ApiVod,
  ChannelInput,
  ChatManifest,
  CreateVodInput,
  UpdateChannelInput,
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

  getChannel(slug: string) {
    return this.request<ApiChannel>(
      'GET',
      `/channels/${encodeURIComponent(slug)}`,
    )
  }

  createChannel(input: ChannelInput) {
    return this.request<ApiChannel>('POST', '/channels', { json: input })
  }

  updateChannel(slug: string, input: UpdateChannelInput) {
    return this.request<ApiChannel>(
      'PATCH',
      `/channels/${encodeURIComponent(slug)}`,
      { json: input },
    )
  }

  /** Fails with 409 if the channel has content, unless `moveTo` is given. */
  deleteChannel(slug: string, opts: { moveTo?: string } = {}) {
    const q = opts.moveTo ? `?moveTo=${encodeURIComponent(opts.moveTo)}` : ''
    return this.request<void>(
      'DELETE',
      `/channels/${encodeURIComponent(slug)}${q}`,
    )
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

  listShows(opts: { channel?: string } = {}) {
    const q = new URLSearchParams()
    if (opts.channel) q.set('channel', opts.channel)
    return this.request<ApiShowSummary[]>('GET', `/shows?${q}`)
  }

  getShow(slug: string) {
    return this.request<ApiShow>('GET', `/shows/${encodeURIComponent(slug)}`)
  }

  createShow(input: CreateShowInput) {
    return this.request<ApiShow>('POST', '/shows', { json: input })
  }

  updateShow(slug: string, input: UpdateShowInput) {
    return this.request<ApiShow>(
      'PATCH',
      `/shows/${encodeURIComponent(slug)}`,
      { json: input },
    )
  }

  deleteShow(slug: string) {
    return this.request<void>('DELETE', `/shows/${encodeURIComponent(slug)}`)
  }

  createSeason(show: string, input: CreateSeasonInput) {
    return this.request<ApiShow>(
      'POST',
      `/shows/${encodeURIComponent(show)}/seasons`,
      { json: input },
    )
  }

  updateSeason(show: string, season: string, input: UpdateSeasonInput) {
    return this.request<ApiShow>(
      'PATCH',
      `/shows/${encodeURIComponent(show)}/seasons/${encodeURIComponent(season)}`,
      { json: input },
    )
  }

  deleteSeason(show: string, season: string) {
    return this.request<void>(
      'DELETE',
      `/shows/${encodeURIComponent(show)}/seasons/${encodeURIComponent(season)}`,
    )
  }

  createEpisode(show: string, season: string, input: CreateEpisodeInput) {
    return this.request<ApiEpisode>(
      'POST',
      `/shows/${encodeURIComponent(show)}/seasons/${encodeURIComponent(season)}/episodes`,
      { json: input },
    )
  }

  getEpisode(slug: string) {
    return this.request<ApiEpisode>(
      'GET',
      `/episodes/${encodeURIComponent(slug)}`,
    )
  }

  updateEpisode(slug: string, input: UpdateEpisodeInput) {
    return this.request<ApiEpisode>(
      'PATCH',
      `/episodes/${encodeURIComponent(slug)}`,
      { json: input },
    )
  }

  deleteEpisode(slug: string) {
    return this.request<void>('DELETE', `/episodes/${encodeURIComponent(slug)}`)
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
