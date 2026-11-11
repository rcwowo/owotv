import { parseTwitchVodId, uploadChat } from '@owotv/core'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { downloadChat, loadChat } from '../chat-source'
import { apiClient } from '../config'
import { confirm, output } from '../output'
import { runGroup, type CommandGroup } from './types'

const commands: CommandGroup = {
  download: {
    summary: 'Download a Twitch VOD’s chat to a file',
    usage: `owotv chat download <twitch url|id> [-o <file>] [--fresh] [--json]

Saves a TwitchDownloader-compatible JSON file (default: <id>.json).
Downloads are cached, so --fresh forces a new one.`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          output: { type: 'string', short: 'o' },
          fresh: { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      if (!positionals[0]) throw new Error('Pass a Twitch VOD URL or id.')
      const id = parseTwitchVodId(positionals[0])
      const chat = await downloadChat(id, {
        fresh: values.fresh,
        onEvent: out.onEvent,
      })
      const file = values.output ?? `${id}.json`
      await writeFile(file, JSON.stringify(chat))
      out.result({ file, messageCount: chat.comments.length }, () =>
        out.log(`Saved ${chat.comments.length} messages to ${file}.`),
      )
      return 0
    },
  },
  upload: {
    summary: 'Upload or replace a VOD’s chat',
    usage: `owotv chat upload <slug> [--twitch <url|id> | --chat <file.json>] [--no-emotes] [--json]

Without --twitch or --chat, chat is downloaded from the VOD's original Twitch VOD.`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          chat: { type: 'string' },
          twitch: { type: 'string' },
          'no-emotes': { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the VOD slug.')
      if (values.chat && values.twitch) {
        throw new Error('Pass either --chat or --twitch, not both.')
      }
      const client = await apiClient({ auth: true })
      const vod = await client.getVod(slug)
      const twitch =
        values.twitch ?? (values.chat ? undefined : vod.sourceTwitchVodId)
      if (!twitch && !values.chat) {
        throw new Error(
          `${slug} has no Twitch VOD id. Pass --twitch or --chat.`,
        )
      }
      const chat = (await loadChat(
        { file: values.chat, twitch: twitch ?? undefined },
        { onEvent: out.onEvent },
      ))!
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
    usage: 'owotv chat rm <slug> [--yes] [--json]',
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
      const client = await apiClient({ auth: true })
      const vod = await client.getVod(slug)
      await confirm(
        `Remove the chat from "${vod.title}" (${slug})?`,
        values.yes,
      )
      await client.deleteChat(slug)
      out.result({ slug, chat: 'removed' }, () =>
        out.log(`Removed chat from ${slug}.`),
      )
      return 0
    },
  },
}

export const chat = {
  summary: 'Download, upload or remove chat replays',
  usage: 'owotv chat <download|upload|rm>',
  run: (argv: string[]) => runGroup(commands, 'chat', argv),
}
