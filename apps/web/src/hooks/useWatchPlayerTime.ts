import { watchPlayerStore } from '@/lib/watch-player-store'
import { useEffect, useState } from 'react'

export function useWatchPlayerTime(): number {
  const [currentTime, setCurrentTime] = useState(() =>
    watchPlayerStore.getCurrentTime(),
  )

  useEffect(() => watchPlayerStore.subscribeTime(setCurrentTime), [])

  return currentTime
}
