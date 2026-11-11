import { ApiClient } from '@owotv/core'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface CliConfig {
  url?: string
  token?: string
}

export const configPath = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
  'owotv',
  'config.json',
)

export async function loadSavedConfig(): Promise<CliConfig> {
  let text: string
  try {
    text = await readFile(configPath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${configPath} is not valid JSON. Fix or delete it.`)
  }
}

export async function loadConfig(): Promise<CliConfig> {
  const saved = await loadSavedConfig()
  return {
    url: process.env.OWOTV_URL || saved.url,
    token: process.env.OWOTV_TOKEN || saved.token,
  }
}

export async function saveConfig(config: CliConfig) {
  await mkdir(dirname(configPath), { recursive: true })
  const tmp = `${configPath}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  await rename(tmp, configPath)
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
