import { channelFromTwitch } from '@owotv/core'
import { parseArgs } from 'node:util'
import { apiClient } from '../config'
import { output, table } from '../output'
import { runGroup, type CommandGroup } from './types'

const commands: CommandGroup = {
  list: {
    summary: 'List channels',
    usage: 'owotv channel list [--json]',
    async run(argv) {
      const { values } = parseArgs({
        args: argv,
        options: { json: { type: 'boolean', default: false } },
      })
      const out = output(values.json)
      const channels = await (await apiClient()).listChannels()
      out.result(channels, () =>
        table(channels, ['slug', 'displayName', 'twitchId']),
      )
      return 0
    },
  },
  add: {
    summary: 'Add a channel (admin token)',
    usage: `owotv channel add <twitch login> [--json]
owotv channel add <slug> --name <display name> [--twitch-id <id>] [--avatar <url>]

With only a login, the name, Twitch id and avatar are looked up on Twitch.`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          name: { type: 'string' },
          'twitch-id': { type: 'string' },
          avatar: { type: 'string' },
          json: { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the channel’s Twitch login or slug.')
      if (!values.name && (values['twitch-id'] || values.avatar)) {
        throw new Error('--twitch-id and --avatar need --name.')
      }
      const client = await apiClient({ auth: true })
      const channel = await client.createChannel(
        values.name
          ? {
              slug,
              displayName: values.name,
              twitchId: values['twitch-id'],
              avatarUrl: values.avatar,
            }
          : await channelFromTwitch(slug),
      )
      out.result(channel, () => out.log(`Added channel ${channel.slug}.`))
      return 0
    },
  },
}

export const channel = {
  summary: 'List or add channels',
  usage: 'owotv channel <list|add>',
  run: (argv: string[]) => runGroup(commands, 'channel', argv),
}
