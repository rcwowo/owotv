import { uploadChat } from '@owotv/core'
import type { TwitchDownloaderChat } from '@owotv/shared'
import { parseArgs } from 'node:util'
import { apiClient } from '../config'
import { output, readJsonFile } from '../output'
import { runGroup, type CommandGroup } from './types'

const commands: CommandGroup = {
  upload: {
    summary: 'Upload or replace a VOD’s chat',
    usage: 'owotv chat upload <slug> --chat <file.json> [--no-emotes] [--json]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          chat: { type: 'string' },
          'no-emotes': { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug || !values.chat) throw new Error('Pass <slug> and --chat.')
      const chat = await readJsonFile<TwitchDownloaderChat>(values.chat)
      const client = await apiClient({ auth: true })
      const vod = await client.getVod(slug)
      const channel = (await client.listChannels()).find(
        (c) => c.slug === vod.channel,
      )
      const result = await uploadChat(client, vod, chat, {
        emotes: !values['no-emotes'],
        twitchId: channel?.twitchId,
        onEvent: out.onEvent,
      })
      out.result(result.vod, () =>
        out.log(`Uploaded ${result.messageCount} messages to ${slug}.`),
      )
      return 0
    },
  },
  rm: {
    summary: 'Remove a VOD’s chat',
    usage: 'owotv chat rm <slug> --yes',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          yes: { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the VOD slug.')
      if (!values.yes) throw new Error('Pass --yes to confirm.')
      await (await apiClient({ auth: true })).deleteChat(slug)
      out.result({ slug, chat: 'removed' }, () =>
        out.log(`Removed chat from ${slug}.`),
      )
      return 0
    },
  },
}

export const chat = {
  summary: 'Upload or remove chat replays',
  usage: 'owotv chat <upload|rm>',
  run: (argv: string[]) => runGroup(commands, 'chat', argv),
}
