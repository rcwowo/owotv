import { ApiClient } from '@owotv/core'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** One owoTV site and the token used for it. */
export interface Instance {
  url: string
  token?: string
}

/** What's saved in config.json. */
export interface ConfigFile {
  current?: string
  instances: Record<string, Instance>
}

/** The connection in use, after env overrides. */
export interface CliConfig {
  url?: string
  token?: string
  /** Name of the saved instance in use */
  instance?: string
  /** OWOTV_URL or OWOTV_TOKEN is set, so switching instances has no effect */
  envOverride?: boolean
}

export const configPath = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
  'owotv',
  'config.json',
)

/** A default instance name for a URL: its host, like `owo.example.com`. */
export function instanceNameFor(url: string) {
  return URL.parse(url)?.host || url
}

export function normalizeUrl(url: string) {
  const trimmed = url.trim()
  if (!/^https?:\/\/[^/]/.test(trimmed)) {
    throw new Error('The URL must start with http:// or https://')
  }
  return new ApiClient(trimmed).baseUrl
}

export async function loadConfigFile(): Promise<ConfigFile> {
  let text: string
  try {
    text = await readFile(configPath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { instances: {} }
    }
    throw err
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`${configPath} is not valid JSON. Fix or delete it.`)
  }
  const data = (raw ?? {}) as Partial<ConfigFile> & Partial<Instance>
  if (data.instances && typeof data.instances === 'object') {
    return { current: data.current, instances: data.instances }
  }
  // Before multiple instances, the file was a single { url, token }.
  if (data.url) {
    const name = instanceNameFor(data.url)
    return {
      current: name,
      instances: { [name]: { url: data.url, token: data.token } },
    }
  }
  return { instances: {} }
}

export async function saveConfigFile(file: ConfigFile) {
  await mkdir(dirname(configPath), { recursive: true })
  const tmp = `${configPath}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 })
  await rename(tmp, configPath)
}

/** Applies a change to the saved config and writes it back. */
export async function updateConfigFile(
  change: (file: ConfigFile) => void,
): Promise<ConfigFile> {
  const file = await loadConfigFile()
  change(file)
  if (file.current && !file.instances[file.current]) file.current = undefined
  await saveConfigFile(file)
  return file
}

/**
 * Resolves the connection to use: OWOTV_INSTANCE (or `--instance`) picks a
 * saved instance, otherwise the current one; OWOTV_URL and OWOTV_TOKEN
 * override both.
 */
export function resolveConfig(file: ConfigFile): CliConfig {
  const wanted = process.env.OWOTV_INSTANCE || file.current
  if (process.env.OWOTV_INSTANCE && !file.instances[wanted!]) {
    throw new Error(
      `No saved instance "${wanted}". Run \`owotv instance list\` to see them.`,
    )
  }
  const saved = wanted ? file.instances[wanted] : undefined
  const envOverride = Boolean(process.env.OWOTV_URL || process.env.OWOTV_TOKEN)
  return {
    url: process.env.OWOTV_URL || saved?.url,
    token: process.env.OWOTV_TOKEN || saved?.token,
    instance: process.env.OWOTV_URL ? undefined : saved && wanted,
    envOverride,
  }
}

export async function loadConfig(): Promise<CliConfig> {
  return resolveConfig(await loadConfigFile())
}

export async function apiClient(opts: { auth?: boolean } = {}) {
  const config = await loadConfig()
  if (!config.url) {
    throw new Error('No owoTV URL set. Run `owotv login --url <url>` first.')
  }
  if (opts.auth && !config.token) {
    throw new Error('No API token set. Run `owotv login` first.')
  }
  return new ApiClient(config.url, config.token)
}
