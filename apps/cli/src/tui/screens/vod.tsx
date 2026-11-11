import {
  parseDuration,
  parseYouTubeId,
  uploadChat,
  type IngestEvent,
} from '@owotv/core'
import type {
  ApiVod,
  TwitchDownloaderChat,
  UpdateVodInput,
} from '@owotv/shared'
import { Box, Text } from 'ink'
import { useState } from 'react'
import { downloadChat, loadChat } from '../../chat-source'
import { errorMessage } from '../../output'
import {
  Confirm,
  ErrorText,
  Form,
  Frame,
  Loading,
  SelectList,
  useBodyHeight,
  TaskView,
  type ListItem,
} from '../components'
import { useApp, useClient, useKeys } from '../context'
import { useAsync, useTask } from '../hooks'

export const formatDuration = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n, i) => (i ? String(n).padStart(2, '0') : String(n)))
    .join(':')

type EditKey = 'title' | 'streamDate' | 'youtube' | 'duration'

const editFields: Record<EditKey, { label: string; placeholder?: string }> = {
  title: { label: 'Title' },
  streamDate: { label: 'Date', placeholder: 'YYYY-MM-DD' },
  youtube: { label: 'YouTube', placeholder: 'https://youtu.be/…' },
  duration: { label: 'Length', placeholder: 'H:MM:SS' },
}

function editPatch(key: EditKey, value: string): UpdateVodInput {
  if (key === 'youtube') return { youtubeId: parseYouTubeId(value) }
  if (key === 'duration') return { durationS: parseDuration(value) }
  return { [key]: value.trim() }
}

function initialValue(vod: ApiVod, key: EditKey) {
  if (key === 'youtube') return `https://youtu.be/${vod.youtubeId}`
  if (key === 'duration') return formatDuration(vod.durationS)
  return vod[key]
}

type Mode =
  | { name: 'menu' }
  | {
      name: 'edit'
      key: EditKey
      value: string
      error?: string
      busy?: boolean
    }
  | { name: 'chatFile'; path: string }
  | { name: 'confirm'; action: 'deleteVod' | 'deleteChat' }
  | { name: 'task' }

type Action =
  | { type: 'edit'; key: EditKey }
  | { type: 'chatTwitch' }
  | { type: 'chatFile' }
  | { type: 'deleteChat' }
  | { type: 'deleteVod' }

export function Vod({ slug }: { slug: string }) {
  const { pop, changed, revision, config, canWrite } = useApp()
  const client = useClient()
  const height = useBodyHeight(9)
  const vod = useAsync(() => client.getVod(slug), [client, slug, revision])
  const [mode, setMode] = useState<Mode>({ name: 'menu' })
  const task = useTask()

  useKeys(
    (_, key) => {
      if (key.escape) pop()
    },
    { isActive: mode.name === 'menu' },
  )
  useKeys(
    (_, key) => {
      if (task.status === 'running') {
        if (key.escape) task.cancel()
      } else if (key.escape || key.return) {
        task.reset()
        setMode({ name: 'menu' })
      }
    },
    { isActive: mode.name === 'task' },
  )

  const v = vod.data
  if (!v) {
    return (
      <Frame title={slug} hints="esc back">
        {vod.error ? <ErrorText>{vod.error}</ErrorText> : <Loading />}
      </Frame>
    )
  }

  const replaceChat = (
    load: (
      onEvent: (e: IngestEvent) => void,
      signal: AbortSignal,
    ) => Promise<TwitchDownloaderChat | undefined>,
  ) => {
    setMode({ name: 'task' })
    void task.run(async (onEvent, signal) => {
      const chat = await load(onEvent, signal)
      if (!chat) throw new Error('No chat to upload')
      signal.throwIfAborted()
      const channel = (await client.listChannels()).find(
        (c) => c.slug === v.channel,
      )
      const result = await uploadChat(client, v, chat, {
        twitchId: channel?.twitchId,
        onEvent,
      })
      onEvent({
        type: 'step',
        message: `Uploaded ${result.messageCount.toLocaleString()} messages`,
      })
      changed()
    })
  }

  const writable = canWrite(v.channel)
  const actions: ListItem<Action>[] = !writable
    ? []
    : [
        {
          key: 'title',
          label: 'Edit title',
          value: { type: 'edit', key: 'title' },
        },
        {
          key: 'date',
          label: 'Edit date',
          value: { type: 'edit', key: 'streamDate' },
        },
        {
          key: 'yt',
          label: 'Edit YouTube link',
          value: { type: 'edit', key: 'youtube' },
        },
        {
          key: 'len',
          label: 'Edit length',
          value: { type: 'edit', key: 'duration' },
        },
        ...(v.sourceTwitchVodId
          ? [
              {
                key: 'chatTwitch',
                label:
                  v.chatStatus === 'ready'
                    ? 'Re-download chat from Twitch'
                    : 'Download chat from Twitch',
                value: { type: 'chatTwitch' } as Action,
              },
            ]
          : []),
        {
          key: 'chatFile',
          label: 'Upload chat from a file',
          value: { type: 'chatFile' },
        },
        ...(v.chatStatus !== 'none'
          ? [
              {
                key: 'deleteChat',
                label: 'Remove chat',
                value: { type: 'deleteChat' } as Action,
              },
            ]
          : []),
        { key: 'deleteVod', label: 'Delete VOD', value: { type: 'deleteVod' } },
      ]

  const onAction = ({ value: a }: ListItem<Action>) => {
    if (a.type === 'edit') {
      setMode({ name: 'edit', key: a.key, value: initialValue(v, a.key) })
    } else if (a.type === 'chatTwitch') {
      replaceChat((onEvent, signal) =>
        downloadChat(v.sourceTwitchVodId!, { onEvent, signal, fresh: true }),
      )
    } else if (a.type === 'chatFile') {
      setMode({ name: 'chatFile', path: '' })
    } else {
      setMode({ name: 'confirm', action: a.type })
    }
  }

  const saveEdit = async (key: EditKey, value: string) => {
    setMode({ name: 'edit', key, value, busy: true })
    try {
      await client.updateVod(slug, editPatch(key, value))
      changed()
      setMode({ name: 'menu' })
    } catch (err) {
      setMode({ name: 'edit', key, value, error: errorMessage(err) })
    }
  }

  const confirm = async (action: 'deleteVod' | 'deleteChat') => {
    setMode({ name: 'task' })
    await task.run(async (onEvent) => {
      if (action === 'deleteVod') {
        onEvent({ type: 'step', message: `Deleting ${slug}` })
        await client.deleteVod(slug)
        changed()
        pop()
      } else {
        onEvent({ type: 'step', message: 'Removing chat' })
        await client.deleteChat(slug)
        changed()
      }
    })
  }

  const site = config.url?.replace(/\/+$/, '')

  return (
    <Frame
      title={v.title}
      hints={
        mode.name === 'menu'
          ? writable
            ? '↑↓ move · enter select · esc back'
            : 'esc back'
          : mode.name === 'task'
            ? task.status === 'running'
              ? 'esc cancel download'
              : 'enter continue'
            : mode.name === 'confirm'
              ? ''
              : 'enter save · esc cancel'
      }
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>{v.title}</Text>
        <Text dimColor>
          {[v.streamDate, formatDuration(v.durationS), v.game, v.channel]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <Box marginTop={1} flexDirection="column">
          <Row label="Page" value={`${site}/watch/${v.slug}`} />
          <Row label="YouTube" value={`https://youtu.be/${v.youtubeId}`} />
          {v.sourceTwitchVodId ? (
            <Row
              label="Twitch"
              value={`https://twitch.tv/videos/${v.sourceTwitchVodId}`}
            />
          ) : null}
          <Row
            label="Chat"
            value={
              v.chatStatus === 'ready'
                ? `${v.chatMessageCount.toLocaleString()} messages`
                : v.chatStatus === 'none'
                  ? 'none'
                  : v.chatStatus
            }
          />
        </Box>
      </Box>

      {mode.name === 'menu' && writable ? (
        <SelectList items={actions} height={height} onSelect={onAction} />
      ) : null}
      {mode.name === 'menu' && !writable ? (
        <Text dimColor>This token can’t edit this VOD.</Text>
      ) : null}

      {mode.name === 'edit' ? (
        <Box flexDirection="column">
          <Form
            fields={[{ key: 'value', ...editFields[mode.key] }]}
            values={{ value: mode.value }}
            onChange={({ value }) => setMode({ ...mode, value: value ?? '' })}
            isActive={!mode.busy}
            onSubmit={() => void saveEdit(mode.key, mode.value)}
            onCancel={() => setMode({ name: 'menu' })}
          />
          {mode.busy ? <Loading label="Saving" /> : null}
          {mode.error ? <ErrorText>{mode.error}</ErrorText> : null}
        </Box>
      ) : null}

      {mode.name === 'chatFile' ? (
        <Form
          fields={[
            {
              key: 'path',
              label: 'Chat file',
              placeholder: '/path/to/chat.json',
            },
          ]}
          values={{ path: mode.path }}
          onChange={({ path }) =>
            setMode({ name: 'chatFile', path: path ?? '' })
          }
          onSubmit={() =>
            replaceChat(() =>
              loadChat({
                file: mode.path
                  .trim()
                  .replace(/^~(?=\/)/, process.env.HOME ?? '~'),
              }),
            )
          }
          onCancel={() => setMode({ name: 'menu' })}
        />
      ) : null}

      {mode.name === 'confirm' ? (
        <Confirm
          message={
            mode.action === 'deleteVod'
              ? 'Delete this VOD and its chat? This can’t be undone.'
              : 'Remove this VOD’s chat?'
          }
          onYes={() => void confirm(mode.action)}
          onNo={() => setMode({ name: 'menu' })}
        />
      ) : null}

      {mode.name === 'task' ? <TaskView task={task} /> : null}
    </Frame>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box width={9} flexShrink={0}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text wrap="truncate-end">{value}</Text>
    </Box>
  )
}
