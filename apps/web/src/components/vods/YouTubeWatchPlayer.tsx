import {
  createYouTubePlayer,
  getYouTubePlayerElementId,
  loadYouTubeAPI,
} from '@/lib/youtube-api'
import { watchPlayerStore } from '@/lib/watch-player-store'
import { useEffect } from 'react'

interface YouTubeWatchPlayerProps {
  youtubeId: string
}

export default function YouTubeWatchPlayer({
  youtubeId,
}: YouTubeWatchPlayerProps) {
  useEffect(() => {
    if (!youtubeId) return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 10
    const retryInterval = 1000
    const elementId = getYouTubePlayerElementId(youtubeId)

    const initPlayer = () => {
      if (cancelled) return true

      const element = document.getElementById(elementId)
      if (!element || !window.YT?.Player) {
        return false
      }

      watchPlayerStore.destroy()

      const player = createYouTubePlayer(elementId, youtubeId, {
        onReady: () => {
          if (!cancelled) {
            watchPlayerStore.setPlayer(player)
            watchPlayerStore.markReady()
          }
        },
        onStateChange: (state) => {
          if (!cancelled) {
            watchPlayerStore.handleStateChange(state)
          }
        },
        onError: (code) => {
          console.error('[YouTubeWatchPlayer] Player error:', code)
        },
      })

      watchPlayerStore.setPlayer(player)
      return true
    }

    const attemptInitialization = async () => {
      if (cancelled || attempts >= maxAttempts) {
        if (attempts >= maxAttempts) {
          console.error('[YouTubeWatchPlayer] Max initialization attempts reached')
        }
        return
      }

      attempts++
      await loadYouTubeAPI()

      if (!initPlayer()) {
        window.setTimeout(attemptInitialization, retryInterval)
      }
    }

    attemptInitialization()

    return () => {
      cancelled = true
      watchPlayerStore.destroy()
    }
  }, [youtubeId])

  return null
}
