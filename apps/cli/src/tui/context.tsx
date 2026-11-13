import type { ApiClient } from '@owotv/core'
import type { ApiMe } from '@owotv/shared'
import { useInput } from 'ink'
import { createContext, useContext } from 'react'
import type { CliConfig } from '../config'

export type Route =
  | { name: 'home' }
  | { name: 'vods' }
  | { name: 'vod'; slug: string }
  | { name: 'import' }
  | { name: 'channels' }
  | { name: 'channel'; slug: string }
  | { name: 'shows' }
  | { name: 'show'; slug: string }
  | { name: 'season'; show: string; season: string }
  | { name: 'episode'; slug: string }
  | { name: 'instances' }
  | { name: 'instance'; edit?: string }

export interface AppState {
  config: CliConfig
  client: ApiClient | null
  me: ApiMe | null
  meError?: string
  canWrite: (channel?: string) => boolean
  /** Admin for this channel: an unscoped admin, or one limited to it. */
  canManage: (channel: string) => boolean
  /** Switches to another connection and returns to the home screen. */
  connect: (config: CliConfig) => void
  push: (route: Route) => void
  replace: (route: Route) => void
  pop: () => void
  revision: number
  changed: () => void
}

export const AppContext = createContext<AppState | null>(null)

export function useApp() {
  const state = useContext(AppContext)
  if (!state) throw new Error('useApp outside AppContext')
  return state
}

export const ScreenActive = createContext(true)

export const useScreenActive = () => useContext(ScreenActive)

export function useKeys(
  handler: Parameters<typeof useInput>[0],
  opts: { isActive?: boolean } = {},
) {
  const active = useContext(ScreenActive)
  useInput(handler, { isActive: active && (opts.isActive ?? true) })
}

export function useClient() {
  const { client } = useApp()
  if (!client) throw new Error('Not connected. Set the site URL in Settings.')
  return client
}
