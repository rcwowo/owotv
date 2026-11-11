import { importVod, parseDuration, parseYouTubeId } from '@owotv/core'
import type { TwitchDownloaderChat, UpdateVodInput } from '@owotv/shared'
import { parseArgs } from 'node:util'
import { apiClient } from '../config'
import { output, readJsonFile, table } from '../output'
import { runGroup, type CommandGroup } from './types'

const json = { json: { type: 'boolean', default: false } } as const

const commands: CommandGroup = {
  list: {
    summary: 'List VODs, newest first',
    usage:
      'owotv vod list [--channel <slug>] [--limit <n>] [--offset <n>] [--json]',
    async run(argv) {
      const { values } = parseArgs({
        args: argv,
        options: {
          ...json,
          channel: { type: 'string' },
          limit: { type: 'string', default: '25' },
          offset: { type: 'string', default: '0' },
        },
      })
      const out = output(values.json)
      for (const key of ['limit', 'offset'] as const) {
        if (!/^\d+$/.test(values[key])) {
          throw new Error(`--${key} must be a whole number.`)
        }
      }
      const vods = await (
        await apiClient()
      ).listVods({
        channel: values.channel,
        limit: Number(values.limit),
        offset: Number(values.offset),
      })
      out.result(vods, () =>
        table(
          vods.map((v) => ({
            ...v,
            chat: v.chatStatus === 'ready' ? v.chatMessageCount : v.chatStatus,
            title: v.title.length > 60 ? `${v.title.slice(0, 57)}...` : v.title,
          })),
          ['slug', 'streamDate', 'channel', 'chat', 'title'],
        ),
      )
      return 0
    },
  },
  add: {
    summary: 'Import a VOD from a TwitchDownloader chat file',
    usage: `owotv vod add --chat <file.json> --youtube <url> [options]

Title, date, length, game chapters and channel come from the chat file.
  --channel <slug>   Channel to add it to (default: matched from the file)
  --title <text>     Override the stream title
  --date YYYY-MM-DD  Override the stream date
  --tz <zone>        Time zone used to work out the date (default: this machine's)
  --no-emotes        Skip the 7TV emote snapshot
  --json             Print only the result as JSON`,
    async run(argv) {
      const { values } = parseArgs({
        args: argv,
        options: {
          ...json,
          chat: { type: 'string' },
          youtube: { type: 'string' },
          channel: { type: 'string' },
          title: { type: 'string' },
          date: { type: 'string' },
          tz: { type: 'string' },
          'no-emotes': { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      if (!values.chat || !values.youtube) {
        throw new Error('Pass --chat <file.json> and --youtube <url>.')
      }
      const chat = await readJsonFile<TwitchDownloaderChat>(values.chat)
      const client = await apiClient({ auth: true })
      const { vod, messageCount } = await importVod(client, chat, {
        youtube: values.youtube,
        channel: values.channel,
        title: values.title,
        streamDate: values.date,
        timeZone: values.tz,
        emotes: !values['no-emotes'],
        onEvent: out.onEvent,
      })
      out.result(vod, () =>
        out.log(
          `\nAdded ${vod.slug}: ${vod.title}\n  ${client.baseUrl}/watch/${vod.slug}\n  ${messageCount} chat messages`,
        ),
      )
      return 0
    },
  },
  edit: {
    summary: 'Change a VOD’s details',
    usage:
      'owotv vod edit <slug> [--title <text>] [--date YYYY-MM-DD] [--youtube <url>] [--duration H:MM:SS] [--thumbnail <url|none>]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          ...json,
          title: { type: 'string' },
          date: { type: 'string' },
          youtube: { type: 'string' },
          duration: { type: 'string' },
          thumbnail: { type: 'string' },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the VOD slug.')
      const input: UpdateVodInput = {}
      if (values.title) input.title = values.title
      if (values.date) input.streamDate = values.date
      if (values.youtube) input.youtubeId = parseYouTubeId(values.youtube)
      if (values.duration) input.durationS = parseDuration(values.duration)
      if (values.thumbnail) {
        input.thumbnailUrl =
          values.thumbnail === 'none' ? null : values.thumbnail
      }
      if (!Object.keys(input).length) throw new Error('Nothing to change.')
      const vod = await (await apiClient({ auth: true })).updateVod(slug, input)
      out.result(vod, () => out.log(`Updated ${vod.slug}.`))
      return 0
    },
  },
  rm: {
    summary: 'Delete a VOD and its chat',
    usage: 'owotv vod rm <slug> --yes',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { ...json, yes: { type: 'boolean', default: false } },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the VOD slug.')
      if (!values.yes)
        throw new Error('This deletes the VOD. Pass --yes to confirm.')
      await (await apiClient({ auth: true })).deleteVod(slug)
      out.result({ slug, deleted: true }, () => out.log(`Deleted ${slug}.`))
      return 0
    },
  },
}

export const vod = {
  summary: 'List, import, edit or delete VODs',
  usage: 'owotv vod <list|add|edit|rm>',
  run: (argv: string[]) => runGroup(commands, 'vod', argv),
}
