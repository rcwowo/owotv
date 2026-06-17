import type {
  YouTubeEvent,
  YouTubePlayer,
} from '@/components/vods/chat-replay/types'

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          videoId: string
          playerVars?: Record<string, unknown>
          events?: Record<string, (event: YouTubeEvent) => void>
        },
      ) => YouTubePlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiLoadPromise: Promise<void> | null = null

export function loadYouTubeAPI(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }

  if (window.YT?.Player) {
    return Promise.resolve()
  }

  if (apiLoadPromise) {
    return apiLoadPromise
  }

  apiLoadPromise = new Promise<void>((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      resolve()
    }

    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
  })

  return apiLoadPromise
}

export function getYouTubePlayerElementId(youtubeId: string): string {
  return `youtube-player-${youtubeId}`
}

export function createYouTubePlayer(
  elementId: string,
  youtubeId: string,
  events: {
    onReady?: () => void
    onStateChange?: (state: number) => void
    onError?: (code: number) => void
  },
): YouTubePlayer {
  return new window.YT.Player(elementId, {
    videoId: youtubeId,
    playerVars: {
      autoplay: 1,
      playsinline: 1,
      rel: 0,
      origin: window.location.origin,
      enablejsapi: 1,
    },
    events: {
      onReady: () => events.onReady?.(),
      onStateChange: (event) => events.onStateChange?.(event.data),
      onError: (event) => events.onError?.(event.data),
    },
  })
}
