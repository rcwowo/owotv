import {
  ChatUploadError,
  fetchTwitchChapters,
  fetchTwitchVideo,
  importVod,
  listTwitchVideos,
  localDate,
  parseTwitchVodId,
  parseYouTubeId,
  type TwitchVideoSummary,
} from '@owotv/core'
import type { ApiChannel } from '@owotv/shared'
import { Box, Text } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import { downloadChat } from '../../chat-source'
import { errorMessage } from '../../output'
import {
  ErrorText,
  Form,
  Frame,
  Loading,
  SelectList,
  TaskView,
  useBodyHeight,
  type ListItem,
} from '../components'
import { useApp, useClient, useKeys } from '../context'
import { useAsync, useTask } from '../hooks'
import { listAllVods } from './vods'
import { formatDuration } from './vod'

type Step =
  | { name: 'channel' }
  | { name: 'pick'; channel: ApiChannel }
  | { name: 'manual'; channel: ApiChannel; input: string; error?: string }
  | { name: 'details'; channel: ApiChannel; twitchId: string }

export function Import() {
  const client = useClient()
  const { pop, canWrite } = useApp()
  const all = useAsync(() => client.listChannels(), [client])
  const data = useMemo(
    () => all.data?.filter((c) => canWrite(c.slug)),
    [all.data, canWrite],
  )
  const channels = { ...all, data }
  const [step, setStep] = useState<Step>({ name: 'channel' })

  useEffect(() => {
    if (step.name === 'channel' && channels.data?.length === 1) {
      const channel = channels.data[0]!
      setStep(
        channel.twitchId
          ? { name: 'pick', channel }
          : { name: 'manual', channel, input: '' },
      )
    }
  }, [channels.data, step.name])

  useKeys(
    (_, key) => {
      if (key.escape) pop()
    },
    { isActive: step.name === 'channel' },
  )

  if (step.name === 'channel') {
    return (
      <Frame title="Import" hints="↑↓ move · enter select · esc back">
        {channels.error ? <ErrorText>{channels.error}</ErrorText> : null}
        {channels.loading ? (
          <Loading label="Loading channels" />
        ) : channels.error ? null : channels.data?.length ? (
          <>
            <Text>Which channel is this stream from?</Text>
            <Box marginTop={1}>
              <SelectList
                items={channels.data.map((c) => ({
                  key: c.slug,
                  label: c.displayName,
                  detail: c.slug,
                  value: c,
                }))}
                height={channels.data.length}
                onSelect={({ value: channel }) =>
                  setStep(
                    channel.twitchId
                      ? { name: 'pick', channel }
                      : { name: 'manual', channel, input: '' },
                  )
                }
              />
            </Box>
          </>
        ) : (
          <Text color="yellow">
            Add a channel first, from the Channels screen.
          </Text>
        )}
      </Frame>
    )
  }

  const back = () =>
    channels.data && channels.data.length > 1
      ? setStep({ name: 'channel' })
      : pop()

  if (step.name === 'pick') {
    return (
      <Pick
        channel={step.channel}
        onBack={back}
        onManual={() =>
          setStep({ name: 'manual', channel: step.channel, input: '' })
        }
        onPick={(twitchId) =>
          setStep({ name: 'details', channel: step.channel, twitchId })
        }
      />
    )
  }

  if (step.name === 'manual') {
    return (
      <Frame title="Import" hints="enter continue · esc back">
        <Text>Paste a Twitch VOD URL or id.</Text>
        <Box marginTop={1} flexDirection="column">
          <Form
            fields={[
              {
                key: 'input',
                label: 'Twitch VOD',
                placeholder: 'https://twitch.tv/videos/…',
              },
            ]}
            values={{ input: step.input }}
            onChange={({ input }) =>
              setStep({ ...step, input: input ?? '', error: undefined })
            }
            onSubmit={() => {
              try {
                setStep({
                  name: 'details',
                  channel: step.channel,
                  twitchId: parseTwitchVodId(step.input),
                })
              } catch (err) {
                setStep({ ...step, error: errorMessage(err) })
              }
            }}
            onCancel={() =>
              step.channel.twitchId
                ? setStep({ name: 'pick', channel: step.channel })
                : back()
            }
          />
          {step.error ? <ErrorText>{step.error}</ErrorText> : null}
        </Box>
      </Frame>
    )
  }

  return (
    <Details
      channel={step.channel}
      twitchId={step.twitchId}
      onBack={() =>
        setStep(
          step.channel.twitchId
            ? { name: 'pick', channel: step.channel }
            : { name: 'manual', channel: step.channel, input: '' },
        )
      }
    />
  )
}

type PickValue =
  | { type: 'manual' }
  | { type: 'video'; video: TwitchVideoSummary; slug?: string }

function Pick({
  channel,
  onBack,
  onManual,
  onPick,
}: {
  channel: ApiChannel
  onBack: () => void
  onManual: () => void
  onPick: (twitchId: string) => void
}) {
  const client = useClient()
  const { push, revision } = useApp()
  const height = useBodyHeight(2)
  const data = useAsync(
    async (signal) => {
      const [videos, vods] = await Promise.all([
        listTwitchVideos(channel.twitchId!, { first: 50, signal }),
        listAllVods(client),
      ])
      const archived = new Map(
        vods
          .filter((v) => v.sourceTwitchVodId)
          .map((v) => [v.sourceTwitchVodId!, v.slug]),
      )
      return { videos, archived }
    },
    [channel.twitchId, client, revision],
  )

  useKeys((_, key) => {
    if (key.escape) onBack()
  })

  const items: ListItem<PickValue>[] = [
    {
      key: 'manual',
      label: 'Enter a Twitch URL or id…',
      value: { type: 'manual' },
    },
    ...(data.data?.videos ?? []).map((video) => {
      const slug = data.data!.archived.get(video.id)
      return {
        key: video.id,
        label: `${localDate(new Date(video.createdAt))}  ${video.title}`,
        detail: `${formatDuration(video.lengthSeconds)}${slug ? ` · ✓ ${slug}` : ''}`,
        dim: Boolean(slug),
        value: { type: 'video', video, slug } as PickValue,
      }
    }),
  ]

  return (
    <Frame
      title={`Import · ${channel.displayName}`}
      hints="↑↓ move · enter select · esc back"
    >
      <Text>
        Recent Twitch VODs <Text dimColor>(✓ already archived)</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        {data.error ? <ErrorText>{data.error}</ErrorText> : null}
        {data.loading && !data.data ? (
          <Loading label="Asking Twitch for recent VODs" />
        ) : null}
        <SelectList
          items={items}
          height={height}
          onSelect={({ value }) => {
            if (value.type === 'manual') onManual()
            else if (value.slug) push({ name: 'vod', slug: value.slug })
            else onPick(value.video.id)
          }}
        />
      </Box>
    </Frame>
  )
}

function Details({
  channel,
  twitchId,
  onBack,
}: {
  channel: ApiChannel
  twitchId: string
  onBack: () => void
}) {
  const client = useClient()
  const { replace, changed, pop } = useApp()
  const task = useTask()
  const [created, setCreated] = useState<string>()
  const [values, setValues] = useState<Record<string, string>>({
    youtube: '',
    title: '',
    date: '',
  })
  const [error, setError] = useState<string>()
  const info = useAsync(
    async (signal) => {
      const video = await fetchTwitchVideo(twitchId, { signal })
      const chapters = await fetchTwitchChapters(video, { signal })
      return {
        video,
        games: [
          ...new Set(chapters.map((c) => c.gameDisplayName).filter(Boolean)),
        ],
      }
    },
    [twitchId],
  )

  useEffect(() => {
    if (info.data) {
      setValues((v) => ({
        ...v,
        title: v.title || info.data!.video.title,
        date: v.date || localDate(new Date(info.data!.video.createdAt)),
      }))
    }
  }, [info.data])

  useKeys(
    (_, key) => {
      if (task.status === 'running') {
        if (key.escape) task.cancel()
      } else if (created) {
        if (key.return) replace({ name: 'vod', slug: created })
        else if (key.escape) pop()
      } else if (key.return || key.escape) {
        task.reset()
      }
    },
    { isActive: task.status !== 'idle' },
  )
  useKeys(
    (_, key) => {
      if (key.escape) onBack()
    },
    { isActive: task.status === 'idle' && !info.data },
  )

  const start = () => {
    const youtube = values.youtube?.trim() ?? ''
    const date = values.date?.trim() ?? ''
    try {
      parseYouTubeId(youtube)
    } catch {
      return setError('Paste a YouTube video link first.')
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return setError('Use YYYY-MM-DD for the date.')
    }
    setError(undefined)
    void task.run(async (onEvent, signal) => {
      const chat = await downloadChat(twitchId, { onEvent, signal })
      signal.throwIfAborted()
      const result = await importVod(client, chat, {
        youtube,
        channel: channel.slug,
        title: values.title?.trim() || undefined,
        streamDate: date || undefined,
        onEvent,
      }).catch((err) => {
        if (err instanceof ChatUploadError) setCreated(err.slug)
        throw err
      })
      onEvent({
        type: 'step',
        message: `Added ${result.vod.slug} with ${result.messageCount.toLocaleString()} chat messages`,
      })
      setCreated(result.vod.slug)
      changed()
    })
  }

  const v = info.data?.video
  return (
    <Frame
      title={`Import · ${channel.displayName}`}
      hints={
        task.status === 'idle'
          ? '↑↓/tab move · enter next/start · esc back'
          : task.status === 'running'
            ? 'esc cancel download'
            : created
              ? 'enter open VOD · esc back'
              : 'enter edit and retry'
      }
    >
      {info.error ? <ErrorText>{info.error}</ErrorText> : null}
      {info.loading ? (
        <Loading label={`Looking up Twitch VOD ${twitchId}`} />
      ) : null}
      {v ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold>{v.title}</Text>
          <Text dimColor>
            {[
              new Date(v.createdAt).toLocaleString(),
              formatDuration(v.lengthSeconds),
              info.data!.games.join(', '),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Box>
      ) : null}
      {v && task.status === 'idle' ? (
        <Box flexDirection="column">
          <Form
            fields={[
              {
                key: 'youtube',
                label: 'YouTube link',
                placeholder: 'https://youtu.be/…',
              },
              { key: 'title', label: 'Title' },
              { key: 'date', label: 'Stream date', placeholder: 'YYYY-MM-DD' },
            ]}
            values={values}
            onChange={setValues}
            onSubmit={start}
            onCancel={onBack}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
        </Box>
      ) : null}
      {task.status !== 'idle' ? <TaskView task={task} /> : null}
    </Frame>
  )
}
