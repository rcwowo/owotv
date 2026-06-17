import type { YouTubePlayer } from '@/components/vods/chat-replay/types'
import { getTimecodeFromUrl } from '@/lib/watch-timecode'

type TimeListener = (time: number) => void
type ReadyListener = () => void

const YT_PLAYING = 1

class WatchPlayerStore {
  private player: YouTubePlayer | null = null
  private currentTime =
    typeof window !== 'undefined' ? (getTimecodeFromUrl() ?? 0) : 0
  private timeListeners = new Set<TimeListener>()
  private readyListeners = new Set<ReadyListener>()
  private pendingSeek: number | null = null
  private rafId: number | null = null
  private isReady = false
  private isPlaying = false

  getCurrentTime(): number {
    if (this.player && this.isReady) {
      try {
        return this.player.getCurrentTime()
      } catch {
        return this.currentTime
      }
    }
    return this.currentTime
  }

  setPlayer(player: YouTubePlayer): void {
    this.player = player
  }

  markReady(): void {
    this.isReady = true

    const urlTimecode = getTimecodeFromUrl()
    const seekTarget = this.pendingSeek ?? urlTimecode
    this.pendingSeek = null

    if (seekTarget !== null && seekTarget > 0) {
      this.seekTo(seekTarget)
    }

    this.readyListeners.forEach((listener) => listener())
    this.syncTimeFromPlayer()
  }

  handleStateChange(state: number): void {
    this.isPlaying = state === YT_PLAYING
    if (this.isPlaying) {
      this.startTimePolling()
      return
    }
    this.stopTimePolling()
    this.syncTimeFromPlayer()
  }

  seekTo(seconds: number): void {
    const clamped = Math.max(0, Math.floor(seconds))
    this.currentTime = clamped
    this.notifyTime()

    if (!this.player || !this.isReady) {
      this.pendingSeek = clamped
      return
    }

    try {
      this.player.seekTo(clamped, true)
      this.player.playVideo()
    } catch (error) {
      console.error('[WatchPlayer] Failed to seek:', error)
    }
  }

  subscribeTime(listener: TimeListener): () => void {
    this.timeListeners.add(listener)
    listener(this.getCurrentTime())
    return () => {
      this.timeListeners.delete(listener)
    }
  }

  subscribeReady(listener: ReadyListener): () => void {
    this.readyListeners.add(listener)
    if (this.isReady) {
      listener()
    }
    return () => {
      this.readyListeners.delete(listener)
    }
  }

  destroy(): void {
    this.stopTimePolling()
    this.isReady = false
    this.isPlaying = false
    this.pendingSeek = null

    if (this.player) {
      try {
        this.player.destroy()
      } catch {
        // Player may already be destroyed.
      }
      this.player = null
    }
  }

  private startTimePolling(): void {
    if (this.rafId !== null) return

    const poll = () => {
      if (!this.isPlaying) {
        this.rafId = null
        return
      }

      this.syncTimeFromPlayer()
      this.rafId = requestAnimationFrame(poll)
    }

    this.rafId = requestAnimationFrame(poll)
  }

  private stopTimePolling(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private syncTimeFromPlayer(): void {
    if (!this.player || !this.isReady) return

    try {
      const time = this.player.getCurrentTime()
      if (!Number.isFinite(time)) return
      this.currentTime = time
      this.notifyTime()
    } catch {
      // Player may be unavailable during teardown.
    }
  }

  private notifyTime(): void {
    const time = this.currentTime
    this.timeListeners.forEach((listener) => listener(time))
  }
}

export const watchPlayerStore = new WatchPlayerStore()
