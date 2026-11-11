import { ApiClient } from '@owotv/core'
import { parseArgs } from 'node:util'
import { apiClient, configPath, loadSavedConfig, saveConfig } from '../config'
import { output, readStdin } from '../output'
import type { Command } from './types'

export const login: Command = {
  summary: 'Save the site URL and API token',
  usage: `owotv login --url <url> [--token <token>]

Pass \`--token -\` to read it from stdin: \`echo $TOKEN | owotv login --url <url> --token -\`.
Saved to ${configPath}. OWOTV_URL and OWOTV_TOKEN override it.`,
  async run(argv) {
    const { values } = parseArgs({
      args: argv,
      options: {
        url: { type: 'string' },
        token: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    })
    if (values.help) {
      console.log(login.usage)
      return 0
    }
    const out = output(values.json)
    const current = await loadSavedConfig()
    const url = values.url ?? current.url
    if (!url) throw new Error('Pass --url <url>.')
    const token =
      values.token === '-' ? await readStdin() : (values.token ?? current.token)

    const client = new ApiClient(url, token || undefined)
    const me = token ? await client.whoami() : null
    if (!me) await client.listChannels()
    await saveConfig({ url: client.baseUrl, token: token || undefined })

    out.result({ url: client.baseUrl, ...me }, () =>
      out.log(
        me
          ? `Logged in to ${client.baseUrl} as "${me.name}" (${me.role}${me.channel ? `, ${me.channel} only` : ''}).`
          : `Saved ${client.baseUrl} without a token (read-only).`,
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
    out.result({ url: client.baseUrl, ...me }, () =>
      console.log(
        `${client.baseUrl}\n${me.name} (${me.role}${me.channel ? `, ${me.channel} only` : ''})`,
      ),
    )
    return 0
  },
}
