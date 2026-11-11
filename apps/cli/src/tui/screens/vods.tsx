import type { ApiVod } from '@owotv/shared'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { useMemo, useState } from 'react'
import {
  ErrorText,
  Frame,
  Loading,
  SelectList,
  useBodyHeight,
  type ListItem,
} from '../components'
import { useApp, useClient, useKeys, useScreenActive } from '../context'
import { useAsync } from '../hooks'

export async function listAllVods(
  client: ReturnType<typeof useClient>,
): Promise<ApiVod[]> {
  const all: ApiVod[] = []
  for (;;) {
    const page = await client.listVods({ limit: 500, offset: all.length })
    all.push(...page)
    if (page.length < 500) return all
  }
}

const chatLabel = (v: ApiVod) =>
  v.chatStatus === 'ready'
    ? `${v.chatMessageCount.toLocaleString()} msgs`
    : v.chatStatus === 'none'
      ? 'no chat'
      : v.chatStatus

export function Vods() {
  const { push, pop, revision, canWrite } = useApp()
  const client = useClient()
  const vods = useAsync(() => listAllVods(client), [client, revision])
  const [filter, setFilter] = useState('')
  const [filtering, setFiltering] = useState(false)
  const active = useScreenActive()
  const height = useBodyHeight(filtering || filter ? 3 : 1)

  useKeys(
    (input, key) => {
      if (input === '/') setFiltering(true)
      else if (input === 'r') vods.reload()
      else if (input === 'i' && canWrite()) push({ name: 'import' })
      else if (key.escape) {
        if (filter) setFilter('')
        else pop()
      }
    },
    { isActive: !filtering },
  )
  useKeys(
    (_, key) => {
      if (key.escape) {
        setFilter('')
        setFiltering(false)
      }
    },
    { isActive: filtering },
  )

  const multiChannel = new Set(vods.data?.map((v) => v.channel)).size > 1
  const items = useMemo<ListItem<ApiVod>[]>(() => {
    const q = filter.trim().toLowerCase()
    return (vods.data ?? [])
      .filter(
        (v) =>
          !q ||
          [v.title, v.slug, v.streamDate, v.game ?? '', v.channel].some((s) =>
            s.toLowerCase().includes(q),
          ),
      )
      .map((v) => ({
        key: v.slug,
        label: `${v.streamDate}  ${multiChannel ? `${v.channel}  ` : ''}${v.title}`,
        detail: chatLabel(v),
        dim: v.chatStatus !== 'ready',
        value: v,
      }))
  }, [vods.data, filter, multiChannel])

  return (
    <Frame
      title="VODs"
      hints={
        filtering
          ? 'type to filter · enter done · esc clear'
          : '↑↓ move · enter open · / filter · i import · r reload · esc back'
      }
    >
      {filtering || filter ? (
        <Box marginBottom={1}>
          <Text color="gray">/ </Text>
          <TextInput
            value={filter}
            onChange={setFilter}
            focus={filtering && active}
            showCursor={filtering && active}
            onSubmit={() => setFiltering(false)}
          />
        </Box>
      ) : null}
      {vods.error ? <ErrorText>{vods.error}</ErrorText> : null}
      {vods.loading && !vods.data ? (
        <Loading label="Loading VODs" />
      ) : (
        <SelectList
          items={items}
          height={height}
          isActive={!filtering}
          empty={filter ? 'No matches.' : 'No VODs yet. Press i to import one.'}
          onSelect={(item) => push({ name: 'vod', slug: item.value.slug })}
        />
      )}
    </Frame>
  )
}
