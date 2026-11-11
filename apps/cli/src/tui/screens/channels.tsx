import { channelFromTwitch } from '@owotv/core'
import type { ApiChannel, ChannelInput } from '@owotv/shared'
import { Box, Text } from 'ink'
import { useState } from 'react'
import { errorMessage } from '../../output'
import {
  ErrorText,
  Form,
  Frame,
  Loading,
  SelectList,
  useBodyHeight,
  type ListItem,
} from '../components'
import { useApp, useClient, useKeys } from '../context'
import { useAsync } from '../hooks'

type Mode =
  | { name: 'list' }
  | { name: 'add'; login: string; error?: string; busy?: boolean }
  | { name: 'confirm'; input: ChannelInput; error?: string; busy?: boolean }

export function Channels() {
  const client = useClient()
  const { pop, revision, changed, me } = useApp()
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
          ? `↑↓ move${me?.role === 'admin' && !me.channel ? ' · enter on + to add' : ''} · esc back`
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
