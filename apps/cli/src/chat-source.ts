import {
  downloadTwitchChat,
  parseTwitchVodId,
  type IngestEvent,
} from '@owotv/core'
import type { TwitchDownloaderChat } from '@owotv/shared'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readJsonFile } from './output'

export const chatCacheDir = join(
  process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
  'owotv',
  'chat',
)

export async function downloadChat(
  input: string,
  opts: {
    onEvent?: (event: IngestEvent) => void
    signal?: AbortSignal
    fresh?: boolean
  } = {},
): Promise<TwitchDownloaderChat> {
  const id = parseTwitchVodId(input)
  const path = join(chatCacheDir, `${id}.json`)
  if (!opts.fresh) {
    const cached = await readFile(path, 'utf8')
      .then((text) => JSON.parse(text) as TwitchDownloaderChat)
      .catch(() => undefined)
    if (Array.isArray(cached?.comments) && cached.video?.id === id) {
      opts.onEvent?.({ type: 'step', message: `Using cached chat for ${id}` })
      return cached
    }
  }

  opts.onEvent?.({
    type: 'step',
    message: `Downloading chat for Twitch VOD ${id}`,
  })
  let live = false
  const chat = await downloadTwitchChat(id, {
    signal: opts.signal,
    onEvent: (e) => {
      if (e.type === 'video' && e.video.status === 'RECORDING') {
        live = true
        opts.onEvent?.({
          type: 'warn',
          message: 'This stream is still live, so its chat is incomplete',
        })
      } else if (e.type === 'progress') {
        opts.onEvent?.({
          type: 'progress',
          label: 'Downloading chat',
          done: e.percent,
          total: 100,
          unit: '%',
        })
      } else if (e.type === 'retry') {
        opts.onEvent?.({ type: 'warn', message: e.message })
      }
    },
  })
  if (live) return chat
  await mkdir(chatCacheDir, { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(chat))
  await rename(tmp, path)
  return chat
}

export async function loadChat(
  source: { file?: string; twitch?: string },
  opts: Parameters<typeof downloadChat>[1] = {},
) {
  if (source.file && source.twitch) {
    throw new Error('Pass either --chat or --twitch, not both.')
  }
  if (source.file) return readJsonFile<TwitchDownloaderChat>(source.file)
  if (source.twitch) return downloadChat(source.twitch, opts)
  return undefined
}
