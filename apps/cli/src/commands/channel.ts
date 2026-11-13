import {
  channelFromTwitch,
  channelSyncFromTwitch,
  deleteChannelWithContent,
  listChannelContent,
} from '@owotv/core'
import {
  channelPlatforms,
  type ApiChannel,
  type ChannelLink,
  type ChannelPlatform,
  type UpdateChannelInput,
} from '@owotv/shared'
import { parseArgs } from 'node:util'
import { apiClient } from '../config'
import { askYesNo, confirm, output, table, type Output } from '../output'

function printChannel(out: Output, c: ApiChannel) {
  out.log(`${c.displayName} (${c.slug})`)
  if (c.twitchId) out.log(`  Twitch id    ${c.twitchId}`)
  if (c.avatarUrl) out.log(`  Avatar       ${c.avatarUrl}`)
  if (c.bannerUrl) out.log(`  Banner       ${c.bannerUrl}`)
  if (c.description) out.log(`  Description  ${c.description}`)
  for (const link of c.links) {
    out.log(`  ${link.platform.padEnd(12)} ${link.url}`)
  }
}

/** Applies `platform=url` flags to a link list. An empty url removes it. */
export function applyLinkFlags(current: ChannelLink[], flags: string[]) {
  const links = [...current]
  for (const flag of flags) {
    const eq = flag.indexOf('=')
    const platform = (eq < 0 ? flag : flag.slice(0, eq)).toLowerCase()
    const url = eq < 0 ? '' : flag.slice(eq + 1).trim()
    if (!channelPlatforms.includes(platform as ChannelPlatform)) {
      throw new Error(
        `Unknown platform "${platform}". Use one of: ${channelPlatforms.join(', ')}`,
      )
    }
    const i = links.findIndex((l) => l.platform === platform)
    if (!url) {
      if (i >= 0) links.splice(i, 1)
    } else if (i >= 0) {
      links[i] = { platform: platform as ChannelPlatform, url }
    } else {
      links.push({ platform: platform as ChannelPlatform, url })
    }
  }
  return links
}
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
  show: {
    summary: 'Show a channel',
    usage: 'owotv channel show <slug> [--json]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { json: { type: 'boolean', default: false } },
      })
      const out = output(values.json)
      if (!positionals[0]) throw new Error('Pass the channel’s slug.')
      const channel = await (await apiClient()).getChannel(positionals[0])
      out.result(channel, () => printChannel(out, channel))
      return 0
    },
  },
  edit: {
    summary: 'Edit a channel (admin token for that channel)',
    usage: `owotv channel edit <slug> [--slug <new slug>] [--name <display name>]
    [--description <text>] [--avatar <url>] [--banner <url>] [--twitch-id <id>]
    [--link <platform>=<url> ...] [--clear-links] [--json]

--link adds or replaces one platform's link; --link <platform>= removes it.
Platforms: ${channelPlatforms.join(', ')}.
Pass an empty value (--banner "") to clear --avatar, --banner or --twitch-id.
Changing --slug keeps the old slug working as a redirect.`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          slug: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          avatar: { type: 'string' },
          banner: { type: 'string' },
          'twitch-id': { type: 'string' },
          link: { type: 'string', multiple: true },
          'clear-links': { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the channel’s slug.')
      const client = await apiClient({ auth: true })

      const input: UpdateChannelInput = {}
      const orNull = (v: string) => v.trim() || null
      if (values.slug !== undefined) input.slug = values.slug.trim()
      if (values.name !== undefined) input.displayName = values.name.trim()
      if (values.description !== undefined) {
        input.description = values.description.trim()
      }
      if (values.avatar !== undefined) input.avatarUrl = orNull(values.avatar)
      if (values.banner !== undefined) input.bannerUrl = orNull(values.banner)
      if (values['twitch-id'] !== undefined) {
        input.twitchId = orNull(values['twitch-id'])
      }
      if (values['clear-links'] || values.link?.length) {
        const current = values['clear-links']
          ? []
          : (await client.getChannel(slug)).links
        input.links = applyLinkFlags(current, values.link ?? [])
      }
      if (!Object.keys(input).length) {
        throw new Error('Nothing to change. See `owotv channel edit --help`.')
      }

      const channel = await client.updateChannel(slug, input)
      out.result(channel, () => {
        out.log(`Updated ${channel.slug}.`)
        printChannel(out, channel)
      })
      return 0
    },
  },
  sync: {
    summary: 'Update a channel’s slug, name and avatar from Twitch',
    usage: `owotv channel sync <slug> [--dry-run] [--json]

Looks the channel up by its Twitch id, so it follows username changes.`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          'dry-run': { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the channel’s slug.')
      const client = await apiClient({ auth: !values['dry-run'] })
      const current = await client.getChannel(slug)
      const patch = await channelSyncFromTwitch(current)
      if (!Object.keys(patch).length) {
        out.result(current, () => out.log(`${current.slug} is up to date.`))
        return 0
      }
      for (const [key, value] of Object.entries(patch)) {
        const before = current[key as keyof ApiChannel]
        out.log(`  ${key}: ${String(before)} → ${String(value)}`)
      }
      if (values['dry-run']) {
        out.result(patch, () => out.log('Dry run, nothing changed.'))
        return 0
      }
      const channel = await client.updateChannel(current.slug, patch)
      out.result(channel, () => out.log(`Synced ${channel.slug}.`))
      return 0
    },
  },
  rm: {
    summary: 'Delete a channel (admin token not limited to a channel)',
    usage: `owotv channel rm <slug> [--with-content | --move-to <slug>] [--yes] [--json]

If the channel has VODs or shows, you're asked whether to delete them too.
  --with-content    Delete its VODs (with chat) and shows without asking
  --move-to <slug>  Keep its VODs and shows by moving them to another channel
Old slugs and API tokens limited to the channel are deleted with it.`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          'with-content': { type: 'boolean', default: false },
          'move-to': { type: 'string' },
          yes: { type: 'boolean', default: false },
          json: { type: 'boolean', default: false },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the channel’s slug.')
      if (values['with-content'] && values['move-to']) {
        throw new Error('Pass --with-content or --move-to, not both.')
      }
      const client = await apiClient({ auth: true })
      const me = await client.whoami()
      if (me.role !== 'admin' || me.channel) {
        throw new Error(
          'Deleting a channel needs an admin token not limited to a channel.',
        )
      }
      const channel = await client.getChannel(slug)
      const name = `${channel.displayName} (${channel.slug})`

      if (values['move-to']) {
        const target = await client.getChannel(values['move-to'])
        await confirm(
          `Move everything from ${name} to ${target.displayName}, then delete ${channel.slug}?`,
          values.yes,
        )
        await client.deleteChannel(channel.slug, { moveTo: target.slug })
        out.result({ deleted: channel.slug, movedTo: target.slug }, () =>
          out.log(
            `Moved content to ${target.slug} and deleted ${channel.slug}.`,
          ),
        )
        return 0
      }

      const content = await listChannelContent(client, channel.slug)
      const vodCount = content.vods.length
      const showCount = content.shows.length
      const plural = (n: number, word: string) =>
        `${n} ${word}${n === 1 ? '' : 's'}`
      const what = [
        vodCount && `${plural(vodCount, 'VOD')} (with chat)`,
        showCount && plural(showCount, 'show'),
      ]
        .filter(Boolean)
        .join(' and ')
      let withContent = values['with-content']
      if (what && !withContent) {
        if (
          values.yes ||
          !(await askYesNo(`${name} has ${what}. Delete them too?`))
        ) {
          throw new Error(
            `${name} has ${what}, so it wasn't deleted. Pass --with-content to delete them, or --move-to <slug> to keep them.`,
          )
        }
        withContent = true
      }
      await confirm(
        what && withContent
          ? `Delete ${name} and its ${what}? This can't be undone.`
          : `Delete ${name}?`,
        values.yes,
      )
      const result = await deleteChannelWithContent(client, channel.slug, {
        onEvent: out.onEvent,
      })
      out.result({ deleted: channel.slug, ...result }, () =>
        out.log(`Deleted ${channel.slug}.`),
      )
      return 0
    },
  },
}

export const channel = {
  summary: 'List, add, edit, sync or delete channels',
  usage: 'owotv channel <list|show|add|edit|sync|rm>',
  run: (argv: string[]) => runGroup(commands, 'channel', argv),
}
