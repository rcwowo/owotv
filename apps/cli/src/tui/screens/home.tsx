import { Box, Text, useApp as useInkApp } from 'ink'
import { Frame, SelectList, type ListItem } from '../components'
import { useApp, useKeys, type Route } from '../context'

export function Home() {
  const { config, push, canWrite } = useApp()
  const { exit } = useInkApp()

  useKeys((input, key) => {
    if (input === 'q') exit()
  })

  const connected = Boolean(config.url)
  const items: ListItem<Route | null>[] = [
    ...(connected
      ? [
          {
            key: 'vods',
            label: 'VODs',
            detail: 'browse, edit and delete',
            value: { name: 'vods' } as Route,
          },
          ...(canWrite()
            ? [
                {
                  key: 'import',
                  label: 'Import from Twitch',
                  detail: 'download chat and add a stream',
                  value: { name: 'import' } as Route,
                },
              ]
            : []),
          {
            key: 'channels',
            label: 'Channels',
            detail: 'streamers on this site',
            value: { name: 'channels' } as Route,
          },
        ]
      : []),
    {
      key: 'settings',
      label: 'Settings',
      detail: 'site URL and API token',
      value: { name: 'settings' },
    },
    { key: 'quit', label: 'Quit', value: null },
  ]

  return (
    <Frame hints="↑↓ move · enter select · q quit">
      {connected ? null : (
        <Box marginBottom={1}>
          <Text color="yellow">
            Not connected yet. Open Settings to add your site URL and token.
          </Text>
        </Box>
      )}
      <SelectList
        items={items}
        height={items.length}
        onSelect={(item) => (item.value ? push(item.value) : exit())}
      />
    </Frame>
  )
}
