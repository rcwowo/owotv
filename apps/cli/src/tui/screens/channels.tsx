import {
  channelFromTwitch,
  channelSyncFromTwitch,
  deleteChannelWithContent,
  listChannelContent,
} from '@owotv/core'
import {
  channelPlatforms,
  type ApiChannel,
  type ChannelInput,
  type ChannelLink,
  type UpdateChannelInput,
} from '@owotv/shared'
import { Box, Text } from 'ink'
import { useState } from 'react'
import { errorMessage } from '../../output'
import {
  Confirm,
  ErrorText,
  Form,
  Frame,
  Loading,
  SelectList,
  useBodyHeight,
  type ListItem,
  TaskView,
} from '../components'
import { useApp, useClient, useKeys } from '../context'
import { useAsync, useTask } from '../hooks'

type Mode =
  | { name: 'list' }
  | { name: 'add'; login: string; error?: string; busy?: boolean }
  | { name: 'confirm'; input: ChannelInput; error?: string; busy?: boolean }

export function Channels() {
  const client = useClient()
  const { pop, push, revision, changed, me } = useApp()
  const channels = useAsync(() => client.listChannels(), [client, revision])
  const [mode, setMode] = useState<Mode>({ name: 'list' })
  const height = useBodyHeight(2)

  useKeys(
    (_, key) => {
      if (key.escape) pop()
    },
    { isActive: mode.name === 'list' },
  )
  useKeys(
    (input, key) => {
      if (mode.name !== 'confirm' || mode.busy) return
      if (key.escape || input === 'n')
        setMode({ name: 'add', login: mode.input.slug })
      else if (key.return || input === 'y') {
        setMode({ ...mode, busy: true, error: undefined })
        client.createChannel(mode.input).then(
          () => {
            changed()
            setMode({ name: 'list' })
          },
          (err) => setMode({ ...mode, busy: false, error: errorMessage(err) }),
        )
      }
    },
    { isActive: mode.name === 'confirm' },
  )

  const lookup = (login: string) => {
    if (mode.name !== 'add') return
    setMode({ ...mode, busy: true, error: undefined })
    channelFromTwitch(login).then(
      (input) => setMode({ name: 'confirm', input }),
      (err) => setMode({ name: 'add', login, error: errorMessage(err) }),
    )
  }

  const items: ListItem<ApiChannel | null>[] = [
    ...(channels.data ?? []).map((c) => ({
      key: c.slug,
      label: c.displayName,
      detail: [c.slug, c.twitchId && `twitch ${c.twitchId}`]
        .filter(Boolean)
        .join(' · '),
      value: c,
    })),
    ...(me?.role === 'admin' && !me.channel
      ? [{ key: '+', label: '+ Add a channel', value: null }]
      : []),
  ]

  return (
    <Frame
      title="Channels"
      hints={
        mode.name === 'list'
          ? `↑↓ move · enter open${me?.role === 'admin' && !me.channel ? ' or add' : ''} · esc back`
          : mode.name === 'add'
            ? 'enter look up on Twitch · esc cancel'
            : 'enter add · esc back'
      }
    >
      {channels.error ? <ErrorText>{channels.error}</ErrorText> : null}
      {channels.loading && !channels.data ? <Loading /> : null}

      {mode.name === 'list' && channels.data ? (
        <SelectList
          items={items}
          height={height}
          onSelect={({ value }) => {
            if (!value) setMode({ name: 'add', login: '' })
            else push({ name: 'channel', slug: value.slug })
          }}
        />
      ) : null}

      {mode.name === 'add' ? (
        <Box flexDirection="column">
          <Text>Twitch login of the channel to add.</Text>
          <Box marginTop={1}>
            <Form
              fields={[{ key: 'login', label: 'Login' }]}
              values={{ login: mode.login }}
              isActive={!mode.busy}
              onChange={({ login }) =>
                setMode({ name: 'add', login: login ?? '' })
              }
              onSubmit={() => lookup(mode.login)}
              onCancel={() => setMode({ name: 'list' })}
            />
          </Box>
          {mode.busy ? <Loading label="Looking up on Twitch" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}

      {mode.name === 'confirm' ? (
        <Box flexDirection="column">
          <Text>
            Add <Text bold>{mode.input.displayName}</Text>{' '}
            <Text dimColor>
              ({mode.input.slug}, Twitch id {mode.input.twitchId})
            </Text>
            ?
          </Text>
          {mode.busy ? <Loading label="Adding" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}
    </Frame>
  )
}

type FieldKey =
  | 'displayName'
  | 'slug'
  | 'description'
  | 'avatarUrl'
  | 'bannerUrl'
  | 'twitchId'

const fieldLabels: Record<FieldKey, { label: string; placeholder?: string }> = {
  displayName: { label: 'Name' },
  slug: { label: 'Slug', placeholder: 'new twitch login' },
  description: { label: 'Description' },
  avatarUrl: { label: 'Avatar', placeholder: 'https://… (empty to clear)' },
  bannerUrl: { label: 'Banner', placeholder: 'https://… (empty to clear)' },
  twitchId: { label: 'Twitch id', placeholder: 'empty to clear' },
}

const nullable = new Set<FieldKey>(['avatarUrl', 'bannerUrl', 'twitchId'])

const platformLabels: Record<(typeof channelPlatforms)[number], string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  x: 'X',
  bluesky: 'Bluesky',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  threads: 'Threads',
  discord: 'Discord',
  website: 'Website',
}

type DetailMode =
  | { name: 'menu' }
  | {
      name: 'field'
      key: FieldKey
      value: string
      error?: string
      busy?: boolean
    }
  | {
      name: 'links'
      values: Record<string, string>
      error?: string
      busy?: boolean
    }
  | { name: 'sync'; patch?: UpdateChannelInput; error?: string; busy?: boolean }
  | { name: 'deleteCheck'; error?: string }
  | { name: 'deleteChoice'; vodCount: number; showCount: number }
  | { name: 'deleteMove' }
  | { name: 'deleteConfirm'; vodCount: number; showCount: number }
  | { name: 'task' }

type DeleteChoice = 'delete' | 'move' | 'cancel'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type DetailAction =
  | { type: 'field'; key: FieldKey }
  | { type: 'links' }
  | { type: 'sync' }
  | { type: 'delete' }

export function Channel({ slug }: { slug: string }) {
  const client = useClient()
  const { pop, replace, revision, changed, canManage, config, me } = useApp()
  const task = useTask()
  const channel = useAsync(
    () => client.getChannel(slug),
    [client, slug, revision],
  )
  const [mode, setMode] = useState<DetailMode>({ name: 'menu' })
  const height = useBodyHeight(10)

  useKeys(
    (_, key) => {
      if (key.escape) pop()
    },
    { isActive: mode.name === 'menu' },
  )

  const save = async (input: UpdateChannelInput) => {
    const updated = await client.updateChannel(slug, input)
    changed()
    setMode({ name: 'menu' })
    if (updated.slug !== slug) replace({ name: 'channel', slug: updated.slug })
  }

  useKeys(
    (input, key) => {
      if (mode.name !== 'sync' || mode.busy) return
      const empty = !mode.patch || !Object.keys(mode.patch).length
      if (key.escape || input === 'n' || empty) {
        setMode({ name: 'menu' })
      } else if (key.return || input === 'y') {
        const patch = mode.patch!
        setMode({ ...mode, busy: true, error: undefined })
        save(patch).catch((err) =>
          setMode({ name: 'sync', patch, error: errorMessage(err) }),
        )
      }
    },
    { isActive: mode.name === 'sync' },
  )
  useKeys(
    (_, key) => {
      if (key.escape) setMode({ name: 'menu' })
    },
    { isActive: mode.name === 'deleteCheck' || mode.name === 'deleteChoice' },
  )
  useKeys(
    (_, key) => {
      if (task.status === 'running') {
        if (key.escape) task.cancel()
      } else if (key.escape || key.return) {
        const done = task.status === 'done'
        task.reset()
        if (done) pop()
        else setMode({ name: 'menu' })
      }
    },
    { isActive: mode.name === 'task' },
  )

  const c = channel.data
  if (!c) {
    return (
      <Frame title={slug} hints="esc back">
        {channel.error ? <ErrorText>{channel.error}</ErrorText> : <Loading />}
      </Frame>
    )
  }

  const manageable = canManage(c.slug)
  // Like creating channels, deleting needs an admin not limited to a channel.
  const canDelete = me?.role === 'admin' && !me.channel
  const actions: ListItem<DetailAction>[] = manageable
    ? [
        ...(Object.keys(fieldLabels) as FieldKey[]).map((key) => ({
          key,
          label: `Edit ${fieldLabels[key].label.toLowerCase()}`,
          value: { type: 'field', key } as DetailAction,
        })),
        { key: 'links', label: 'Edit social links', value: { type: 'links' } },
        {
          key: 'sync',
          label: 'Sync name, slug and avatar from Twitch',
          value: { type: 'sync' },
        },
        ...(canDelete
          ? [
              {
                key: 'delete',
                label: 'Delete channel',
                value: { type: 'delete' } as DetailAction,
              },
            ]
          : []),
      ]
    : []

  const onAction = ({ value: a }: ListItem<DetailAction>) => {
    if (a.type === 'field') {
      setMode({ name: 'field', key: a.key, value: c[a.key] ?? '' })
    } else if (a.type === 'links') {
      setMode({
        name: 'links',
        values: Object.fromEntries(c.links.map((l) => [l.platform, l.url])),
      })
    } else if (a.type === 'delete') {
      setMode({ name: 'deleteCheck' })
      listChannelContent(client, c.slug).then(
        ({ vods, shows }) =>
          setMode(
            vods.length || shows.length
              ? {
                  name: 'deleteChoice',
                  vodCount: vods.length,
                  showCount: shows.length,
                }
              : { name: 'deleteConfirm', vodCount: 0, showCount: 0 },
          ),
        (err) => setMode({ name: 'deleteCheck', error: errorMessage(err) }),
      )
    } else {
      setMode({ name: 'sync', busy: true })
      channelSyncFromTwitch(c).then(
        (patch) => setMode({ name: 'sync', patch }),
        (err) => setMode({ name: 'sync', error: errorMessage(err) }),
      )
    }
  }

  const saveField = (key: FieldKey, value: string) => {
    const v = value.trim()
    setMode({ name: 'field', key, value, busy: true })
    save({ [key]: nullable.has(key) && !v ? null : v }).catch((err) =>
      setMode({ name: 'field', key, value, error: errorMessage(err) }),
    )
  }

  const saveLinks = (values: Record<string, string>) => {
    const links: ChannelLink[] = channelPlatforms.flatMap((platform) => {
      const url = values[platform]?.trim()
      return url ? [{ platform, url }] : []
    })
    setMode({ name: 'links', values, busy: true })
    save({ links }).catch((err) =>
      setMode({ name: 'links', values, error: errorMessage(err) }),
    )
  }

  const runDelete = (moveTo?: string) => {
    setMode({ name: 'task' })
    void task.run(async (onEvent, signal) => {
      if (moveTo) {
        onEvent({ type: 'step', message: `Moving content to ${moveTo}` })
        await client.deleteChannel(c.slug, { moveTo })
      } else {
        await deleteChannelWithContent(client, c.slug, { onEvent, signal })
      }
      onEvent({ type: 'step', message: `Deleted ${c.displayName}` })
      changed()
    })
  }

  const site = config.url?.replace(/\/+$/, '')
  const syncChanges =
    mode.name === 'sync' && mode.patch ? Object.entries(mode.patch) : []

  return (
    <Frame
      title={c.displayName}
      hints={
        mode.name === 'menu'
          ? manageable
            ? '↑↓ move · enter select · esc back'
            : 'esc back'
          : mode.name === 'task'
            ? task.status === 'running'
              ? 'esc stop'
              : 'enter continue'
            : mode.name === 'deleteConfirm'
              ? ''
              : mode.name === 'deleteCheck' ||
                  mode.name === 'deleteChoice' ||
                  mode.name === 'deleteMove'
                ? '↑↓ move · enter select · esc cancel'
                : mode.name === 'sync'
                  ? syncChanges.length
                    ? 'enter apply · esc cancel'
                    : 'enter back'
                  : mode.name === 'links'
                    ? '↑↓ move · enter next/save · esc cancel'
                    : 'enter save · esc cancel'
      }
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{c.displayName}</Text>
        <Text dimColor>
          {[c.slug, c.twitchId && `twitch ${c.twitchId}`]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {c.description ? (
          <Text wrap="truncate-end">{c.description}</Text>
        ) : null}
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text dimColor>Page </Text>
            {site}/channels/{c.slug}
          </Text>
          {c.links.map((l) => (
            <Text key={l.platform}>
              <Text dimColor>{platformLabels[l.platform].padEnd(8)}</Text>
              {l.url}
            </Text>
          ))}
        </Box>
      </Box>

      {mode.name === 'menu' && manageable ? (
        <SelectList items={actions} height={height} onSelect={onAction} />
      ) : null}
      {mode.name === 'menu' && !manageable ? (
        <Text dimColor>Editing a channel needs an admin token for it.</Text>
      ) : null}

      {mode.name === 'field' ? (
        <Box flexDirection="column">
          {mode.key === 'slug' ? (
            <Text dimColor>The old slug will keep redirecting here.</Text>
          ) : null}
          <Form
            fields={[{ key: 'value', ...fieldLabels[mode.key] }]}
            values={{ value: mode.value }}
            onChange={({ value }) => setMode({ ...mode, value: value ?? '' })}
            isActive={!mode.busy}
            onSubmit={() => saveField(mode.key, mode.value)}
            onCancel={() => setMode({ name: 'menu' })}
          />
          {mode.busy ? <Loading label="Saving" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}

      {mode.name === 'links' ? (
        <Box flexDirection="column">
          <Text dimColor>Leave a platform empty to remove it.</Text>
          <Form
            fields={channelPlatforms.map((p) => ({
              key: p,
              label: platformLabels[p],
              placeholder: 'https://…',
            }))}
            values={mode.values}
            onChange={(values) => setMode({ ...mode, values })}
            isActive={!mode.busy}
            onSubmit={() => saveLinks(mode.values)}
            onCancel={() => setMode({ name: 'menu' })}
          />
          {mode.busy ? <Loading label="Saving" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}

      {mode.name === 'deleteCheck' ? (
        mode.error ? (
          <ErrorText>{mode.error}</ErrorText>
        ) : (
          <Loading label="Checking what the channel has" />
        )
      ) : null}

      {mode.name === 'deleteChoice' ? (
        <Box flexDirection="column">
          <Text>
            {c.displayName} has {plural(mode.vodCount, 'VOD')} and{' '}
            {plural(mode.showCount, 'show')}. What should happen to them?
          </Text>
          <SelectList<DeleteChoice>
            items={[
              {
                key: 'delete',
                label: 'Delete them too',
                detail: 'VODs, their chat, and shows',
                value: 'delete',
              },
              {
                key: 'move',
                label: 'Move them to another channel',
                value: 'move',
              },
              { key: 'cancel', label: 'Cancel', value: 'cancel' },
            ]}
            height={3}
            onSelect={({ value }) => {
              const { vodCount, showCount } = mode
              if (value === 'delete') {
                setMode({ name: 'deleteConfirm', vodCount, showCount })
              } else if (value === 'move') setMode({ name: 'deleteMove' })
              else setMode({ name: 'menu' })
            }}
          />
        </Box>
      ) : null}

      {mode.name === 'deleteMove' ? (
        <ChannelPicker
          current={c.slug}
          onCancel={() => setMode({ name: 'menu' })}
          onPick={(target) => runDelete(target)}
        />
      ) : null}

      {mode.name === 'deleteConfirm' ? (
        <Box flexDirection="column">
          <Confirm
            message={
              mode.vodCount || mode.showCount
                ? `Delete ${c.displayName} with ${plural(mode.vodCount, 'VOD')} and ${plural(mode.showCount, 'show')}? This can't be undone.`
                : `Delete ${c.displayName}?`
            }
            onYes={() => runDelete()}
            onNo={() => setMode({ name: 'menu' })}
          />
          <Text dimColor>
            API tokens limited to this channel are deleted with it.
          </Text>
        </Box>
      ) : null}

      {mode.name === 'task' ? <TaskView task={task} /> : null}

      {mode.name === 'sync' ? (
        <Box flexDirection="column">
          {mode.busy && !mode.patch ? (
            <Loading label="Looking up on Twitch" />
          ) : null}
          {mode.patch && !syncChanges.length ? (
            <Text>Already matches Twitch.</Text>
          ) : null}
          {syncChanges.length ? (
            <>
              <Text>Apply these changes from Twitch?</Text>
              {syncChanges.map(([key, value]) => (
                <Text key={key}>
                  <Text dimColor>{key.padEnd(12)}</Text>
                  {String(c[key as keyof ApiChannel] ?? '—')} →{' '}
                  <Text bold>{String(value)}</Text>
                </Text>
              ))}
            </>
          ) : null}
          {mode.busy && mode.patch ? <Loading label="Saving" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}
    </Frame>
  )
}

/**
 * Picks a channel other than `current`, for moving a VOD or show.
 * Moving needs a token that can reach both channels.
 */
export function ChannelPicker({
  current,
  onPick,
  onCancel,
  busy,
  error,
}: {
  current: string
  onPick: (slug: string) => void
  onCancel: () => void
  busy?: boolean
  error?: string
}) {
  const client = useClient()
  const channels = useAsync(() => client.listChannels(), [client])
  const height = useBodyHeight(10)

  useKeys(
    (_, key) => {
      if (key.escape) onCancel()
    },
    { isActive: !busy },
  )

  const items: ListItem<string>[] = (channels.data ?? [])
    .filter((c) => c.slug !== current)
    .map((c) => ({
      key: c.slug,
      label: c.displayName,
      detail: c.slug,
      value: c.slug,
    }))

  return (
    <Box flexDirection="column">
      <Text>Move to which channel?</Text>
      {channels.error ? <ErrorText>{channels.error}</ErrorText> : null}
      {channels.loading && !channels.data ? <Loading /> : null}
      {channels.data ? (
        <SelectList
          items={items}
          height={height}
          isActive={!busy}
          empty="There are no other channels."
          onSelect={({ value }) => onPick(value)}
        />
      ) : null}
      {busy ? <Loading label="Moving" /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Box>
  )
}
