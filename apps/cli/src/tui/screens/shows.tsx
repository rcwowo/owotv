import { fetchYouTubeVideo, parseDuration } from '@owotv/core'
import type {
  ApiShow,
  UpdateEpisodeInput,
  UpdateShowInput,
} from '@owotv/shared'
import { Box, Text } from 'ink'
import { useState } from 'react'
import { formatLength, youtubeIdFrom } from '../../commands/show'
import { errorMessage } from '../../output'
import {
  Confirm,
  ErrorText,
  Form,
  Frame,
  Loading,
  SelectList,
  useBodyHeight,
  type FormField,
  type ListItem,
} from '../components'
import { useApp, useClient, useKeys } from '../context'
import { useAsync } from '../hooks'
import { ChannelPicker } from './channels'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Text wrap="truncate-end">
      <Text dimColor>{label.padEnd(9)}</Text>
      {value}
    </Text>
  )
}

/** A one-field form with saving and error states. */
function FieldEditor({
  field,
  initial,
  note,
  onSave,
  onDone,
}: {
  field: FormField
  initial: string
  note?: string
  onSave: (value: string) => Promise<unknown>
  onDone: () => void
}) {
  const [value, setValue] = useState(initial)
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({})
  return (
    <Box flexDirection="column">
      {note ? <Text dimColor>{note}</Text> : null}
      <Form
        fields={[{ ...field, key: 'value' }]}
        values={{ value }}
        isActive={!state.busy}
        onChange={(v) => setValue(v.value ?? '')}
        onSubmit={() => {
          setState({ busy: true })
          onSave(value).then(onDone, (err) =>
            setState({ error: errorMessage(err) }),
          )
        }}
        onCancel={onDone}
      />
      {state.busy ? <Loading label="Saving" /> : null}
      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
    </Box>
  )
}

const REORDER_HINT = '[ ] reorder'

// Show list

type ShowsMode =
  | { name: 'list' }
  | { name: 'pickChannel' }
  | {
      name: 'add'
      channel: string
      values: Record<string, string>
      busy?: boolean
      error?: string
    }

export function Shows() {
  const client = useClient()
  const { push, pop, revision, changed, canWrite, me } = useApp()
  const shows = useAsync(() => client.listShows(), [client, revision])
  const channels = useAsync(() => client.listChannels(), [client])
  const [mode, setMode] = useState<ShowsMode>({ name: 'list' })
  const height = useBodyHeight(2)

  useKeys(
    (input, key) => {
      if (key.escape) pop()
      else if (input === 'r') shows.reload()
    },
    { isActive: mode.name === 'list' },
  )
  useKeys(
    (_, key) => {
      if (key.escape) setMode({ name: 'list' })
    },
    { isActive: mode.name === 'pickChannel' },
  )

  const startAdd = () => {
    const only =
      me?.channel ??
      (channels.data?.length === 1 ? channels.data[0]!.slug : undefined)
    if (only) setMode({ name: 'add', channel: only, values: {} })
    else setMode({ name: 'pickChannel' })
  }

  const add = (channel: string, values: Record<string, string>) => {
    setMode({ name: 'add', channel, values, busy: true })
    client
      .createShow({
        channel,
        name: values.name?.trim() ?? '',
        slug: values.slug?.trim() || undefined,
        description: values.description?.trim() || undefined,
      })
      .then(
        (show) => {
          changed()
          setMode({ name: 'list' })
          push({ name: 'show', slug: show.slug })
        },
        (err) =>
          setMode({ name: 'add', channel, values, error: errorMessage(err) }),
      )
  }

  const multiChannel = (channels.data?.length ?? 0) > 1
  const items: ListItem<string | null>[] = [
    ...(shows.data ?? []).map((s) => ({
      key: s.slug,
      label: s.name,
      detail: [
        multiChannel && s.channel,
        plural(s.seasonCount, 'season'),
        plural(s.episodeCount, 'episode'),
      ]
        .filter(Boolean)
        .join(' · '),
      value: s.slug,
    })),
    ...(canWrite() ? [{ key: '+', label: '+ Add a show', value: null }] : []),
  ]

  return (
    <Frame
      title="Shows"
      hints={
        mode.name === 'list'
          ? '↑↓ move · enter open · r reload · esc back'
          : mode.name === 'pickChannel'
            ? '↑↓ move · enter pick · esc cancel'
            : '↑↓/tab move · enter next/save · esc cancel'
      }
    >
      {shows.error ? <ErrorText>{shows.error}</ErrorText> : null}
      {shows.loading && !shows.data ? <Loading /> : null}

      {mode.name === 'list' && shows.data ? (
        <SelectList
          items={items}
          height={height}
          empty="No shows yet."
          onSelect={({ value }) =>
            value ? push({ name: 'show', slug: value }) : startAdd()
          }
        />
      ) : null}

      {mode.name === 'pickChannel' ? (
        <Box flexDirection="column">
          <Text>Which channel is the show for?</Text>
          <SelectList
            items={(channels.data ?? []).map((c) => ({
              key: c.slug,
              label: c.displayName,
              detail: c.slug,
              value: c.slug,
            }))}
            height={height - 1}
            onSelect={({ value }) =>
              setMode({ name: 'add', channel: value, values: {} })
            }
          />
        </Box>
      ) : null}

      {mode.name === 'add' ? (
        <Box flexDirection="column">
          <Text dimColor>New show on {mode.channel}</Text>
          <Form
            fields={[
              { key: 'name', label: 'Name' },
              {
                key: 'slug',
                label: 'Slug',
                placeholder: 'optional, made from the name',
              },
              {
                key: 'description',
                label: 'Description',
                placeholder: 'optional',
              },
            ]}
            values={mode.values}
            isActive={!mode.busy}
            onChange={(values) => setMode({ ...mode, values })}
            onSubmit={() => add(mode.channel, mode.values)}
            onCancel={() => setMode({ name: 'list' })}
          />
          <Text dimColor>
            Add a cover and logo after creating it, from the show’s menu.
          </Text>
          {mode.busy ? <Loading label="Creating" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}
    </Frame>
  )
}

// One show

type ShowField = 'name' | 'slug' | 'description' | 'coverUrl' | 'logoUrl'

const showFields: Record<ShowField, FormField> = {
  name: { key: 'name', label: 'Name' },
  slug: { key: 'slug', label: 'Slug' },
  description: { key: 'description', label: 'Description' },
  coverUrl: {
    key: 'coverUrl',
    label: 'Cover',
    placeholder: 'https://… 16:9 image (empty to clear)',
  },
  logoUrl: {
    key: 'logoUrl',
    label: 'Logo',
    placeholder: 'https://… transparent image (empty to clear)',
  },
}

type ShowAction =
  | { type: 'season'; slug: string; index: number }
  | { type: 'addSeason' }
  | { type: 'field'; key: ShowField }
  | { type: 'move' }
  | { type: 'delete' }

type ShowMode =
  | { name: 'menu'; error?: string }
  | { name: 'field'; key: ShowField }
  | { name: 'addSeason' }
  | { name: 'move'; busy?: boolean; error?: string }
  | { name: 'delete' }

export function Show({ slug }: { slug: string }) {
  const client = useClient()
  const { push, pop, replace, revision, changed, canWrite, me, config } =
    useApp()
  const show = useAsync(() => client.getShow(slug), [client, slug, revision])
  const [mode, setMode] = useState<ShowMode>({ name: 'menu' })
  const height = useBodyHeight(7)

  useKeys(
    (_, key) => {
      if (key.escape) pop()
    },
    { isActive: mode.name === 'menu' },
  )

  const s = show.data
  if (!s) {
    return (
      <Frame title={slug} hints="esc back">
        {show.error ? <ErrorText>{show.error}</ErrorText> : <Loading />}
      </Frame>
    )
  }

  const writable = canWrite(s.channel)
  const save = async (input: UpdateShowInput) => {
    const updated = await client.updateShow(slug, input)
    changed()
    if (updated.slug !== slug) replace({ name: 'show', slug: updated.slug })
    return updated
  }

  const items: ListItem<ShowAction>[] = [
    ...s.seasons.map((season, index) => ({
      key: `season:${season.slug}`,
      label: season.title,
      detail: plural(season.episodes.length, 'episode'),
      value: { type: 'season', slug: season.slug, index } as ShowAction,
    })),
    ...(writable
      ? ([
          {
            key: 'addSeason',
            label: '+ Add a season',
            value: { type: 'addSeason' },
          },
          ...(Object.keys(showFields) as ShowField[]).map((key) => ({
            key,
            label: `Edit ${showFields[key].label.toLowerCase()}`,
            value: { type: 'field', key },
            dim: true,
          })),
          ...(!me?.channel
            ? [
                {
                  key: 'move',
                  label: 'Move to another channel',
                  value: { type: 'move' },
                  dim: true,
                },
              ]
            : []),
          {
            key: 'delete',
            label: 'Delete show',
            value: { type: 'delete' },
            dim: true,
          },
        ] as ListItem<ShowAction>[])
      : []),
  ]

  const onAction = ({ value: a }: ListItem<ShowAction>) => {
    if (a.type === 'season') {
      push({ name: 'season', show: s.slug, season: a.slug })
    } else if (a.type === 'addSeason') setMode({ name: 'addSeason' })
    else if (a.type === 'field') setMode({ name: 'field', key: a.key })
    else if (a.type === 'move') setMode({ name: 'move' })
    else setMode({ name: 'delete' })
  }

  const reorder = (input: string, { value: a }: ListItem<ShowAction>) => {
    if (a.type !== 'season' || !writable) return
    const to = input === '[' ? a.index - 1 : input === ']' ? a.index + 1 : -1
    if (to < 0 || to >= s.seasons.length) return
    client
      .updateSeason(s.slug, a.slug, { position: to })
      .then(changed, (err) =>
        setMode({ name: 'menu', error: errorMessage(err) }),
      )
  }

  const site = config.url?.replace(/\/+$/, '')

  return (
    <Frame
      title={s.name}
      hints={
        mode.name === 'menu'
          ? `↑↓ move · enter select${writable && s.seasons.length > 1 ? ` · ${REORDER_HINT} seasons` : ''} · esc back`
          : mode.name === 'move'
            ? '↑↓ move · enter pick · esc cancel'
            : mode.name === 'delete'
              ? ''
              : 'enter save · esc cancel'
      }
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{s.name}</Text>
        <Text dimColor>
          {[
            s.slug,
            s.channel,
            plural(s.seasonCount, 'season'),
            plural(s.episodeCount, 'episode'),
          ].join(' · ')}
        </Text>
        {s.description ? (
          <Text wrap="truncate-end">{s.description}</Text>
        ) : null}
        <Row label="Page" value={`${site}/shows/${s.slug}`} />
        <Row label="Cover" value={s.coverUrl ?? 'none'} />
        <Row label="Logo" value={s.logoUrl ?? 'none'} />
      </Box>

      {mode.name === 'menu' ? (
        <>
          <SelectList
            items={items}
            height={height}
            empty="No seasons yet."
            onSelect={onAction}
            onKey={reorder}
          />
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </>
      ) : null}

      {mode.name === 'field' ? (
        <FieldEditor
          field={showFields[mode.key]}
          initial={s[mode.key] ?? ''}
          note={
            mode.key === 'slug'
              ? 'Changing the slug changes the show’s page URL.'
              : undefined
          }
          onSave={(value) => {
            const v = value.trim()
            const nullable = mode.key === 'coverUrl' || mode.key === 'logoUrl'
            return save({ [mode.key]: nullable && !v ? null : v })
          }}
          onDone={() => setMode({ name: 'menu' })}
        />
      ) : null}

      {mode.name === 'addSeason' ? (
        <FieldEditor
          field={{ key: 'title', label: 'Title', placeholder: 'Season 1' }}
          initial={`Season ${s.seasons.length + 1}`}
          onSave={async (title) => {
            await client.createSeason(s.slug, { title: title.trim() })
            changed()
          }}
          onDone={() => setMode({ name: 'menu' })}
        />
      ) : null}

      {mode.name === 'move' ? (
        <ChannelPicker
          current={s.channel}
          busy={mode.busy}
          error={mode.error}
          onCancel={() => setMode({ name: 'menu' })}
          onPick={(channel) => {
            setMode({ name: 'move', busy: true })
            save({ channel }).then(
              () => setMode({ name: 'menu' }),
              (err) => setMode({ name: 'move', error: errorMessage(err) }),
            )
          }}
        />
      ) : null}

      {mode.name === 'delete' ? (
        <Confirm
          message={`Delete "${s.name}" with ${plural(s.seasonCount, 'season')} and ${plural(s.episodeCount, 'episode')}?`}
          onYes={() =>
            client.deleteShow(s.slug).then(
              () => {
                changed()
                pop()
              },
              (err) => setMode({ name: 'menu', error: errorMessage(err) }),
            )
          }
          onNo={() => setMode({ name: 'menu' })}
        />
      ) : null}
    </Frame>
  )
}

// One season

type SeasonAction =
  | { type: 'episode'; slug: string; index: number }
  | { type: 'add' }
  | { type: 'rename' }
  | { type: 'delete' }

type EpisodeDraft = Record<'title' | 'date' | 'length', string>

type SeasonMode =
  | { name: 'menu'; error?: string }
  | { name: 'url'; url: string; busy?: boolean; error?: string }
  | {
      name: 'details'
      youtubeId: string
      values: EpisodeDraft
      busy?: boolean
      error?: string
    }
  | { name: 'rename' }
  | { name: 'delete' }

export function Season({ show, season }: { show: string; season: string }) {
  const client = useClient()
  const { push, pop, revision, changed, canWrite } = useApp()
  const data = useAsync(() => client.getShow(show), [client, show, revision])
  const [mode, setMode] = useState<SeasonMode>({ name: 'menu' })
  const height = useBodyHeight(4)

  useKeys(
    (_, key) => {
      if (key.escape) pop()
    },
    { isActive: mode.name === 'menu' },
  )

  const s = data.data
  const current = s?.seasons.find((x) => x.slug === season)
  if (!s || !current) {
    return (
      <Frame title={season} hints="esc back">
        {data.error ? (
          <ErrorText>{data.error}</ErrorText>
        ) : s ? (
          <ErrorText>No season "{season}"</ErrorText>
        ) : (
          <Loading />
        )}
      </Frame>
    )
  }

  const writable = canWrite(s.channel)
  const items: ListItem<SeasonAction>[] = [
    ...current.episodes.map((e, index) => ({
      key: e.slug,
      label: `${index + 1}. ${e.title}`,
      detail: `${e.airDate} · ${formatLength(e.durationS)}`,
      value: { type: 'episode', slug: e.slug, index } as SeasonAction,
    })),
    ...(writable
      ? ([
          { key: 'add', label: '+ Add an episode', value: { type: 'add' } },
          {
            key: 'rename',
            label: 'Rename season',
            value: { type: 'rename' },
            dim: true,
          },
          {
            key: 'delete',
            label: 'Delete season',
            value: { type: 'delete' },
            dim: true,
          },
        ] as ListItem<SeasonAction>[])
      : []),
  ]

  const lookUp = (url: string) => {
    let youtubeId: string
    try {
      youtubeId = youtubeIdFrom(url)
    } catch (err) {
      setMode({ name: 'url', url, error: errorMessage(err) })
      return
    }
    setMode({ name: 'url', url, busy: true })
    fetchYouTubeVideo(youtubeId).then(
      (info) =>
        setMode({
          name: 'details',
          youtubeId,
          values: {
            title: info.title,
            date: info.publishDate ?? '',
            length: info.durationS ? formatLength(info.durationS) : '',
          },
        }),
      // Lookup is a convenience; let the details be typed in instead.
      () =>
        setMode({
          name: 'details',
          youtubeId,
          values: { title: '', date: '', length: '' },
          error: 'Couldn’t read the video from YouTube. Fill these in.',
        }),
    )
  }

  const addEpisode = (youtubeId: string, values: EpisodeDraft) => {
    setMode({ name: 'details', youtubeId, values, busy: true })
    Promise.resolve()
      .then(() =>
        client.createEpisode(s.slug, current.slug, {
          title: values.title.trim(),
          youtubeId,
          airDate: values.date.trim(),
          durationS: parseDuration(values.length),
        }),
      )
      .then(
        () => {
          changed()
          setMode({ name: 'menu' })
        },
        (err) =>
          setMode({
            name: 'details',
            youtubeId,
            values,
            error: errorMessage(err),
          }),
      )
  }

  const reorder = (input: string, { value: a }: ListItem<SeasonAction>) => {
    if (a.type !== 'episode' || !writable) return
    const to = input === '[' ? a.index - 1 : input === ']' ? a.index + 1 : -1
    if (to < 0 || to >= current.episodes.length) return
    client
      .updateEpisode(a.slug, { position: to })
      .then(changed, (err) =>
        setMode({ name: 'menu', error: errorMessage(err) }),
      )
  }

  return (
    <Frame
      title={`${s.name} › ${current.title}`}
      hints={
        mode.name === 'menu'
          ? `↑↓ move · enter select${writable && current.episodes.length > 1 ? ` · ${REORDER_HINT}` : ''} · esc back`
          : mode.name === 'url'
            ? 'enter look up · esc cancel'
            : mode.name === 'delete'
              ? ''
              : '↑↓/tab move · enter next/save · esc cancel'
      }
    >
      <Box marginBottom={1}>
        <Text dimColor>
          {s.name} · {current.slug} ·{' '}
          {plural(current.episodes.length, 'episode')}
        </Text>
      </Box>

      {mode.name === 'menu' ? (
        <>
          <SelectList
            items={items}
            height={height}
            empty="No episodes yet."
            onSelect={({ value: a }) => {
              if (a.type === 'episode') push({ name: 'episode', slug: a.slug })
              else if (a.type === 'add') setMode({ name: 'url', url: '' })
              else if (a.type === 'rename') setMode({ name: 'rename' })
              else setMode({ name: 'delete' })
            }}
            onKey={reorder}
          />
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </>
      ) : null}

      {mode.name === 'url' ? (
        <Box flexDirection="column">
          <Text>Any YouTube video can be an episode.</Text>
          <Form
            fields={[
              {
                key: 'url',
                label: 'YouTube',
                placeholder: 'https://youtu.be/…',
              },
            ]}
            values={{ url: mode.url }}
            isActive={!mode.busy}
            onChange={({ url }) => setMode({ name: 'url', url: url ?? '' })}
            onSubmit={() => lookUp(mode.url)}
            onCancel={() => setMode({ name: 'menu' })}
          />
          {mode.busy ? <Loading label="Looking up on YouTube" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}

      {mode.name === 'details' ? (
        <Box flexDirection="column">
          <Text dimColor>https://youtu.be/{mode.youtubeId}</Text>
          <Form
            fields={[
              { key: 'title', label: 'Title' },
              { key: 'date', label: 'Aired', placeholder: 'YYYY-MM-DD' },
              { key: 'length', label: 'Length', placeholder: 'H:MM:SS' },
            ]}
            values={mode.values}
            isActive={!mode.busy}
            onChange={(v) =>
              setMode({ ...mode, values: { ...mode.values, ...v } })
            }
            onSubmit={() => addEpisode(mode.youtubeId, mode.values)}
            onCancel={() => setMode({ name: 'menu' })}
          />
          {mode.busy ? <Loading label="Adding" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}

      {mode.name === 'rename' ? (
        <FieldEditor
          field={{ key: 'title', label: 'Title' }}
          initial={current.title}
          onSave={async (title) => {
            await client.updateSeason(s.slug, current.slug, {
              title: title.trim(),
            })
            changed()
          }}
          onDone={() => setMode({ name: 'menu' })}
        />
      ) : null}

      {mode.name === 'delete' ? (
        <Confirm
          message={`Delete "${current.title}" and its ${plural(current.episodes.length, 'episode')}?`}
          onYes={() =>
            client.deleteSeason(s.slug, current.slug).then(
              () => {
                changed()
                pop()
              },
              (err) => setMode({ name: 'menu', error: errorMessage(err) }),
            )
          }
          onNo={() => setMode({ name: 'menu' })}
        />
      ) : null}
    </Frame>
  )
}

// One episode

type EpisodeField = 'title' | 'airDate' | 'length' | 'youtube' | 'thumbnailUrl'

const episodeFields: Record<EpisodeField, FormField> = {
  title: { key: 'title', label: 'Title' },
  airDate: { key: 'airDate', label: 'Aired', placeholder: 'YYYY-MM-DD' },
  length: { key: 'length', label: 'Length', placeholder: 'H:MM:SS' },
  youtube: {
    key: 'youtube',
    label: 'YouTube',
    placeholder: 'https://youtu.be/…',
  },
  thumbnailUrl: {
    key: 'thumbnailUrl',
    label: 'Thumbnail',
    placeholder: 'https://… (empty to use YouTube’s)',
  },
}

function episodePatch(key: EpisodeField, value: string): UpdateEpisodeInput {
  const v = value.trim()
  if (key === 'length') return { durationS: parseDuration(v) }
  if (key === 'youtube') return { youtubeId: youtubeIdFrom(v) }
  if (key === 'thumbnailUrl') return { thumbnailUrl: v || null }
  return { [key]: v }
}

type EpisodeAction =
  { type: 'field'; key: EpisodeField } | { type: 'season' } | { type: 'delete' }

type EpisodeMode =
  | { name: 'menu'; error?: string }
  | { name: 'field'; key: EpisodeField }
  | { name: 'season'; busy?: boolean; error?: string }
  | { name: 'delete' }

export function Episode({ slug }: { slug: string }) {
  const client = useClient()
  const { pop, revision, changed, canWrite, config } = useApp()
  const data = useAsync(async () => {
    const episode = await client.getEpisode(slug)
    const show: ApiShow = await client.getShow(episode.show)
    return { episode, show }
  }, [client, slug, revision])
  const [mode, setMode] = useState<EpisodeMode>({ name: 'menu' })
  const height = useBodyHeight(9)

  useKeys(
    (_, key) => {
      if (key.escape) pop()
    },
    { isActive: mode.name === 'menu' },
  )
  useKeys(
    (_, key) => {
      if (key.escape && mode.name === 'season' && !mode.busy) {
        setMode({ name: 'menu' })
      }
    },
    { isActive: mode.name === 'season' },
  )

  if (!data.data) {
    return (
      <Frame title={slug} hints="esc back">
        {data.error ? <ErrorText>{data.error}</ErrorText> : <Loading />}
      </Frame>
    )
  }
  const { episode: e, show } = data.data
  const seasonTitle =
    show.seasons.find((x) => x.slug === e.season)?.title ?? e.season
  const writable = canWrite(show.channel)

  const initial = (key: EpisodeField) =>
    key === 'length'
      ? formatLength(e.durationS)
      : key === 'youtube'
        ? `https://youtu.be/${e.youtubeId}`
        : (e[key] ?? '')

  const actions: ListItem<EpisodeAction>[] = writable
    ? [
        ...(Object.keys(episodeFields) as EpisodeField[]).map((key) => ({
          key,
          label: `Edit ${episodeFields[key].label.toLowerCase()}`,
          value: { type: 'field', key } as EpisodeAction,
        })),
        ...(show.seasons.length > 1
          ? [
              {
                key: 'season',
                label: 'Move to another season',
                value: { type: 'season' } as EpisodeAction,
              },
            ]
          : []),
        { key: 'delete', label: 'Delete episode', value: { type: 'delete' } },
      ]
    : []

  const site = config.url?.replace(/\/+$/, '')

  return (
    <Frame
      title={e.title}
      hints={
        mode.name === 'menu'
          ? writable
            ? '↑↓ move · enter select · esc back'
            : 'esc back'
          : mode.name === 'season'
            ? '↑↓ move · enter pick · esc cancel'
            : mode.name === 'delete'
              ? ''
              : 'enter save · esc cancel'
      }
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{e.title}</Text>
        <Text dimColor>
          {show.name} › {seasonTitle}
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Row
            label="Page"
            value={`${site}/shows/${show.slug}/${e.season}/${e.slug}`}
          />
          <Row label="YouTube" value={`https://youtu.be/${e.youtubeId}`} />
          <Row label="Aired" value={e.airDate} />
          <Row label="Length" value={formatLength(e.durationS)} />
        </Box>
      </Box>

      {mode.name === 'menu' && writable ? (
        <SelectList
          items={actions}
          height={height}
          onSelect={({ value: a }) =>
            a.type === 'field'
              ? setMode({ name: 'field', key: a.key })
              : a.type === 'season'
                ? setMode({ name: 'season' })
                : setMode({ name: 'delete' })
          }
        />
      ) : null}
      {mode.name === 'menu' && !writable ? (
        <Text dimColor>This token can’t edit this show.</Text>
      ) : null}
      {mode.name === 'menu' && mode.error ? (
        <ErrorText>{mode.error}</ErrorText>
      ) : null}

      {mode.name === 'field' ? (
        <FieldEditor
          field={episodeFields[mode.key]}
          initial={initial(mode.key)}
          onSave={async (value) => {
            await client.updateEpisode(slug, episodePatch(mode.key, value))
            changed()
          }}
          onDone={() => setMode({ name: 'menu' })}
        />
      ) : null}

      {mode.name === 'season' ? (
        <Box flexDirection="column">
          <Text>Move to which season?</Text>
          <SelectList
            items={show.seasons
              .filter((x) => x.slug !== e.season)
              .map((x) => ({ key: x.slug, label: x.title, value: x.slug }))}
            height={height}
            isActive={!mode.busy}
            onSelect={({ value }) => {
              setMode({ name: 'season', busy: true })
              client.updateEpisode(slug, { season: value }).then(
                () => {
                  changed()
                  setMode({ name: 'menu' })
                },
                (err) => setMode({ name: 'season', error: errorMessage(err) }),
              )
            }}
          />
          {mode.busy ? <Loading label="Moving" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}

      {mode.name === 'delete' ? (
        <Confirm
          message={`Delete episode "${e.title}"?`}
          onYes={() =>
            client.deleteEpisode(slug).then(
              () => {
                changed()
                pop()
              },
              (err) => setMode({ name: 'menu', error: errorMessage(err) }),
            )
          }
          onNo={() => setMode({ name: 'menu' })}
        />
      ) : null}
    </Frame>
  )
}
