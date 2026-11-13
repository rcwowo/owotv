import { fetchYouTubeVideo, parseDuration, parseYouTubeId } from '@owotv/core'
import type {
  ApiShow,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  UpdateSeasonInput,
  UpdateShowInput,
} from '@owotv/shared'
import { parseArgs } from 'node:util'
import { apiClient } from '../config'
import { confirm, output, table, type Output } from '../output'
import { runGroup, type CommandGroup } from './types'

const json = { json: { type: 'boolean', default: false } } as const
const yes = { yes: { type: 'boolean', default: false } } as const

export const formatLength = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n, i) => (i ? String(n).padStart(2, '0') : String(n)))
    .join(':')

/** Accepts a YouTube URL or a bare 11 character video id. */
export const youtubeIdFrom = (value: string) =>
  /^[\w-]{11}$/.test(value.trim()) ? value.trim() : parseYouTubeId(value)

const orNull = (v: string) => (v.trim() && v !== 'none' ? v.trim() : null)

function position(value: string | undefined) {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('--position must be 1 or more (1 is first).')
  }
  return n - 1
}

function printShow(out: Output, show: ApiShow) {
  out.log(`${show.name} (${show.slug}) · ${show.channel}`)
  if (show.description) out.log(`  ${show.description}`)
  if (show.coverUrl) out.log(`  Cover  ${show.coverUrl}`)
  if (show.logoUrl) out.log(`  Logo   ${show.logoUrl}`)
  for (const season of show.seasons) {
    out.log(`\n${season.title} (${season.slug})`)
    if (!season.episodes.length) out.log('  no episodes')
    for (const e of season.episodes) {
      out.log(
        `  ${e.slug}  ${e.airDate}  ${formatLength(e.durationS).padStart(8)}  ${e.title}`,
      )
    }
  }
}

const showCommands: CommandGroup = {
  list: {
    summary: 'List shows',
    usage: 'owotv show list [--channel <slug>] [--json]',
    async run(argv) {
      const { values } = parseArgs({
        args: argv,
        options: { ...json, channel: { type: 'string' } },
      })
      const out = output(values.json)
      const shows = await (
        await apiClient()
      ).listShows({ channel: values.channel })
      out.result(shows, () =>
        table(
          shows.map((s) => ({
            ...s,
            seasons: s.seasonCount,
            episodes: s.episodeCount,
          })),
          ['slug', 'channel', 'seasons', 'episodes', 'name'],
        ),
      )
      return 0
    },
  },
  get: {
    summary: 'Show a show’s seasons and episodes',
    usage: 'owotv show get <show> [--json]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: json,
      })
      const out = output(values.json)
      if (!positionals[0]) throw new Error('Pass the show slug.')
      const show = await (await apiClient()).getShow(positionals[0])
      out.result(show, () => printShow(out, show))
      return 0
    },
  },
  add: {
    summary: 'Create a show',
    usage: `owotv show add <channel> <name> [--slug <slug>] [--description <text>]
    [--cover <url>] [--logo <url>] [--json]

Add seasons with \`owotv season add\`, then episodes with \`owotv episode add\`.`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          ...json,
          slug: { type: 'string' },
          description: { type: 'string' },
          cover: { type: 'string' },
          logo: { type: 'string' },
        },
      })
      const out = output(values.json)
      const [channel, name] = positionals
      if (!channel || !name) throw new Error('Pass the channel and show name.')
      const show = await (
        await apiClient({ auth: true })
      ).createShow({
        channel,
        name,
        slug: values.slug,
        description: values.description,
        coverUrl: values.cover,
        logoUrl: values.logo,
      })
      out.result(show, () => out.log(`Created show ${show.slug}.`))
      return 0
    },
  },
  edit: {
    summary: 'Change a show, or move it to another channel',
    usage: `owotv show edit <show> [--name <text>] [--slug <slug>] [--description <text>]
    [--cover <url|none>] [--logo <url|none>] [--channel <slug>] [--position <n>] [--json]

--channel moves the show to another channel (needs a token for both).
--position puts it at that place in its channel's list (1 is first).`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          ...json,
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          cover: { type: 'string' },
          logo: { type: 'string' },
          channel: { type: 'string' },
          position: { type: 'string' },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the show slug.')
      const input: UpdateShowInput = {}
      if (values.name !== undefined) input.name = values.name
      if (values.slug !== undefined) input.slug = values.slug
      if (values.description !== undefined) {
        input.description = values.description
      }
      if (values.cover !== undefined) input.coverUrl = orNull(values.cover)
      if (values.logo !== undefined) input.logoUrl = orNull(values.logo)
      if (values.channel !== undefined) input.channel = values.channel
      const pos = position(values.position)
      if (pos !== undefined) input.position = pos
      if (!Object.keys(input).length) throw new Error('Nothing to change.')
      const show = await (
        await apiClient({ auth: true })
      ).updateShow(slug, input)
      out.result(show, () => out.log(`Updated show ${show.slug}.`))
      return 0
    },
  },
  rm: {
    summary: 'Delete a show with its seasons and episodes',
    usage: 'owotv show rm <show> [--yes] [--json]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { ...json, ...yes },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the show slug.')
      const client = await apiClient({ auth: true })
      const show = await client.getShow(slug)
      await confirm(
        `Delete "${show.name}" with ${show.seasonCount} seasons and ${show.episodeCount} episodes?`,
        values.yes,
      )
      await client.deleteShow(slug)
      out.result({ slug, deleted: true }, () =>
        out.log(`Deleted show ${slug}.`),
      )
      return 0
    },
  },
}

const seasonCommands: CommandGroup = {
  add: {
    summary: 'Add a season to a show',
    usage: 'owotv season add <show> <title> [--slug <slug>] [--json]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { ...json, slug: { type: 'string' } },
      })
      const out = output(values.json)
      const [show, title] = positionals
      if (!show || !title) throw new Error('Pass the show slug and a title.')
      const updated = await (
        await apiClient({ auth: true })
      ).createSeason(show, { title, slug: values.slug })
      const season = updated.seasons.at(-1)
      out.result(updated, () =>
        out.log(`Added season ${season?.slug} to ${updated.slug}.`),
      )
      return 0
    },
  },
  edit: {
    summary: 'Rename or reorder a season',
    usage:
      'owotv season edit <show> <season> [--title <text>] [--slug <slug>] [--position <n>] [--json]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          ...json,
          title: { type: 'string' },
          slug: { type: 'string' },
          position: { type: 'string' },
        },
      })
      const out = output(values.json)
      const [show, season] = positionals
      if (!show || !season) throw new Error('Pass the show and season slugs.')
      const input: UpdateSeasonInput = {}
      if (values.title !== undefined) input.title = values.title
      if (values.slug !== undefined) input.slug = values.slug
      const pos = position(values.position)
      if (pos !== undefined) input.position = pos
      if (!Object.keys(input).length) throw new Error('Nothing to change.')
      const updated = await (
        await apiClient({ auth: true })
      ).updateSeason(show, season, input)
      out.result(updated, () => out.log(`Updated season in ${updated.slug}.`))
      return 0
    },
  },
  rm: {
    summary: 'Delete a season with its episodes',
    usage: 'owotv season rm <show> <season> [--yes] [--json]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { ...json, ...yes },
      })
      const out = output(values.json)
      const [show, season] = positionals
      if (!show || !season) throw new Error('Pass the show and season slugs.')
      const client = await apiClient({ auth: true })
      const found = (await client.getShow(show)).seasons.find(
        (s) => s.slug === season,
      )
      if (!found) throw new Error(`No season "${season}" in "${show}".`)
      await confirm(
        `Delete "${found.title}" and its ${found.episodes.length} episodes?`,
        values.yes,
      )
      await client.deleteSeason(show, season)
      out.result({ show, season, deleted: true }, () =>
        out.log(`Deleted season ${season}.`),
      )
      return 0
    },
  },
}

const episodeCommands: CommandGroup = {
  add: {
    summary: 'Add a YouTube video as an episode',
    usage: `owotv episode add <show> <season> <youtube url> [--title <text>]
    [--date YYYY-MM-DD] [--duration H:MM:SS] [--thumbnail <url>] [--json]

Title, date and length are read from YouTube when not given.`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          ...json,
          title: { type: 'string' },
          date: { type: 'string' },
          duration: { type: 'string' },
          thumbnail: { type: 'string' },
        },
      })
      const out = output(values.json)
      const [show, season, url] = positionals
      if (!show || !season || !url) {
        throw new Error('Pass the show slug, season slug and YouTube URL.')
      }
      const youtubeId = youtubeIdFrom(url)
      const needInfo = !values.title || !values.date || !values.duration
      const info = needInfo ? await fetchYouTubeVideo(youtubeId) : undefined
      const input: CreateEpisodeInput = {
        title: values.title ?? info!.title,
        youtubeId,
        airDate: values.date ?? info?.publishDate ?? '',
        durationS: values.duration
          ? parseDuration(values.duration)
          : (info?.durationS ?? 0),
        thumbnailUrl: values.thumbnail,
      }
      if (!input.airDate) {
        throw new Error('Couldn’t read the date from YouTube. Pass --date.')
      }
      if (!input.durationS) {
        throw new Error(
          'Couldn’t read the length from YouTube. Pass --duration.',
        )
      }
      const episode = await (
        await apiClient({ auth: true })
      ).createEpisode(show, season, input)
      out.result(episode, () =>
        out.log(`Added episode ${episode.slug}: ${episode.title}`),
      )
      return 0
    },
  },
  edit: {
    summary: 'Change, reorder or move an episode',
    usage: `owotv episode edit <episode> [--title <text>] [--date YYYY-MM-DD]
    [--duration H:MM:SS] [--youtube <url>] [--thumbnail <url|none>]
    [--season <slug>] [--position <n>] [--json]

--season moves it to another season of the same show.
--position puts it at that place in its season (1 is first).`,
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
          ...json,
          title: { type: 'string' },
          date: { type: 'string' },
          duration: { type: 'string' },
          youtube: { type: 'string' },
          thumbnail: { type: 'string' },
          season: { type: 'string' },
          position: { type: 'string' },
        },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the episode slug.')
      const input: UpdateEpisodeInput = {}
      if (values.title !== undefined) input.title = values.title
      if (values.date !== undefined) input.airDate = values.date
      if (values.duration !== undefined) {
        input.durationS = parseDuration(values.duration)
      }
      if (values.youtube !== undefined) {
        input.youtubeId = youtubeIdFrom(values.youtube)
      }
      if (values.thumbnail !== undefined) {
        input.thumbnailUrl = orNull(values.thumbnail)
      }
      if (values.season !== undefined) input.season = values.season
      const pos = position(values.position)
      if (pos !== undefined) input.position = pos
      if (!Object.keys(input).length) throw new Error('Nothing to change.')
      const episode = await (
        await apiClient({ auth: true })
      ).updateEpisode(slug, input)
      out.result(episode, () => out.log(`Updated episode ${episode.slug}.`))
      return 0
    },
  },
  rm: {
    summary: 'Delete an episode',
    usage: 'owotv episode rm <episode> [--yes] [--json]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        allowPositionals: true,
        options: { ...json, ...yes },
      })
      const out = output(values.json)
      const slug = positionals[0]
      if (!slug) throw new Error('Pass the episode slug.')
      const client = await apiClient({ auth: true })
      const episode = await client.getEpisode(slug)
      await confirm(`Delete episode "${episode.title}"?`, values.yes)
      await client.deleteEpisode(slug)
      out.result({ slug, deleted: true }, () =>
        out.log(`Deleted episode ${slug}.`),
      )
      return 0
    },
  },
}

export const show = {
  summary: 'List, create, edit, move or delete shows',
  usage: 'owotv show <list|get|add|edit|rm>',
  run: (argv: string[]) => runGroup(showCommands, 'show', argv),
}

export const season = {
  summary: 'Add, edit or delete a show’s seasons',
  usage: 'owotv season <add|edit|rm>',
  run: (argv: string[]) => runGroup(seasonCommands, 'season', argv),
}

export const episode = {
  summary: 'Add, edit, move or delete show episodes',
  usage: 'owotv episode <add|edit|rm>',
  run: (argv: string[]) => runGroup(episodeCommands, 'episode', argv),
}
