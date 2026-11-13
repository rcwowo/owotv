import { ApiClient } from '@owotv/core'
import { parseArgs } from 'node:util'
import {
  apiClient,
  configPath,
  instanceNameFor,
  loadConfig,
  loadConfigFile,
  normalizeUrl,
  updateConfigFile,
} from '../config'
import { output, readStdin } from '../output'
import type { Command } from './types'

export const login: Command = {
  summary: 'Save a site URL and API token as an instance',
  usage: `owotv login --url <url> [--token <token>] [--name <name>]
owotv login --token <token>            (update the current instance)

Each site is saved as a named instance (the URL's host unless --name is
given) and becomes the current one. See \`owotv instance\` to switch.
Pass \`--token -\` to read it from stdin: \`echo $TOKEN | owotv login --url <url> --token -\`.
Saved to ${configPath}. OWOTV_URL and OWOTV_TOKEN override it.`,
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: {
        url: { type: 'string' },
        token: { type: 'string' },
        name: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
    if (values.help) {
      console.log(login.usage)
      return 0
    }
    const out = output(values.json)
    const file = await loadConfigFile()
    const url = values.url ? normalizeUrl(values.url) : undefined
    const name =
      values.name?.trim() ||
      (url
        ? (Object.entries(file.instances).find(([, i]) => i.url === url)?.[0] ??
          instanceNameFor(url))
        : file.current)
    if (!name) throw new Error('Pass --url <url>.')
    const existing = file.instances[name]
    const siteUrl = url ?? existing?.url
    if (!siteUrl)
      throw new Error(`No instance "${name}" yet. Pass --url <url>.`)
    const token =
      values.token === '-'
        ? await readStdin()
        : (values.token ?? (existing?.url === siteUrl ? existing.token : ''))

    const client = new ApiClient(siteUrl, token || undefined)
    const me = token ? await client.whoami() : null
    if (!me) await client.listChannels()
    await updateConfigFile((f) => {
      f.instances[name] = { url: client.baseUrl, token: token || undefined }
      f.current = name
    })

    out.result({ instance: name, url: client.baseUrl, ...me }, () =>
      out.log(
        me
          ? `Logged in to ${client.baseUrl} as "${me.name}" (${me.role}${me.channel ? `, ${me.channel} only` : ''}). Saved as "${name}".`
          : `Saved ${client.baseUrl} as "${name}" without a token (read-only).`,
      ),
    )
    return 0
  },
}

export const whoami: Command = {
  summary: 'Show which token the CLI is using',
  usage: 'owotv whoami [--json]',
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: {
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
    if (values.help) {
      console.log(whoami.usage)
      return 0
    }
    const out = output(values.json)
    const client = await apiClient({ auth: true })
    const me = await client.whoami()
    const { instance } = await loadConfig()
    out.result({ instance: instance ?? null, url: client.baseUrl, ...me }, () =>
      console.log(
        `${instance ? `${instance} · ` : ''}${client.baseUrl}\n${me.name} (${me.role}${me.channel ? `, ${me.channel} only` : ''})`,
      ),
    )
    return 0
  },
}
