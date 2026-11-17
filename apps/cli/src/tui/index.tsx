import { ApiClient, roleAllows } from '@owotv/core'
import { Box, render } from 'ink'
import { useCallback, useMemo, useState } from 'react'
import { loadConfig, type CliConfig } from '../config'
import { AppContext, ScreenActive, type AppState, type Route } from './context'
import { useAsync } from './hooks'
import { Channel, Channels } from './screens/channels'
import { Home } from './screens/home'
import { Import } from './screens/import'
import { InstanceForm, Instances } from './screens/instances'
import { Episode, Season, Show, Shows } from './screens/shows'
import { Vod } from './screens/vod'
import { Vods } from './screens/vods'

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <Home />
    case 'vods':
      return <Vods />
    case 'vod':
      return <Vod slug={route.slug} />
    case 'import':
      return <Import />
    case 'channels':
      return <Channels />
    case 'channel':
      return <Channel slug={route.slug} />
    case 'shows':
      return <Shows />
    case 'show':
      return <Show slug={route.slug} />
    case 'season':
      return <Season show={route.show} season={route.season} />
    case 'episode':
      return <Episode slug={route.slug} />
    case 'instances':
      return <Instances />
    case 'instance':
      return <InstanceForm edit={route.edit} />
  }
}

let nextId = 1

function App({ initial }: { initial: CliConfig }) {
  const [config, setConfig] = useState(initial)
  const [stack, setStack] = useState<Array<{ id: number; route: Route }>>(
    () => [
      { id: 0, route: initial.url ? { name: 'home' } : { name: 'instances' } },
    ],
  )
  const [revision, setRevision] = useState(0)

  const client = useMemo(
    () => (config.url ? new ApiClient(config.url, config.token) : null),
    [config],
  )
  const me = useAsync(
    async () => (client && config.token ? client.whoami() : null),
    // A channel rename changes the slug /me reports.
    [client, revision],
  )

  const push = useCallback(
    (route: Route) => setStack((s) => [...s, { id: nextId++, route }]),
    [],
  )
  const replace = useCallback(
    (route: Route) =>
      setStack((s) => [...s.slice(0, -1), { id: nextId++, route }]),
    [],
  )
  const pop = useCallback(
    () =>
      setStack((s) =>
        s.length > 1
          ? s.slice(0, -1)
          : [{ id: nextId++, route: { name: 'home' } }],
      ),
    [],
  )
  const changed = useCallback(() => setRevision((n) => n + 1), [])
  const connect = useCallback((next: CliConfig) => {
    setConfig(next)
    setStack([
      {
        id: nextId++,
        route: next.url ? { name: 'home' } : { name: 'instances' },
      },
    ])
  }, [])

  const canWrite = useCallback(
    (channel?: string) =>
      Boolean(
        me.data &&
        roleAllows(me.data.role, 'write') &&
        (!channel || !me.data.channel || me.data.channel === channel),
      ),
    [me.data],
  )
  const canManage = useCallback(
    (channel: string) =>
      Boolean(
        me.data &&
        me.data.role === 'admin' &&
        (!me.data.channel || me.data.channel === channel),
      ),
    [me.data],
  )

  const state: AppState = {
    config,
    client,
    me: me.data ?? null,
    meError: me.error,
    canWrite,
    canManage,
    connect,
    push,
    replace,
    pop,
    revision,
    changed,
  }
  return (
    <AppContext.Provider value={state}>
      {stack.map(({ id, route }, i) => {
        const top = i === stack.length - 1
        return (
          <ScreenActive.Provider key={id} value={top}>
            <Box display={top ? 'flex' : 'none'} flexDirection="column">
              <Screen route={route} />
            </Box>
          </ScreenActive.Provider>
        )
      })}
    </AppContext.Provider>
  )
}

export async function runTui() {
  const instance = render(<App initial={await loadConfig()} />, {
    alternateScreen: true,
  })
  await instance.waitUntilExit()
  return 0
}
