export interface ChatReplayProps {
  vodSlug: string
}

export interface YouTubePlayer {
  getCurrentTime(): number
  getPlayerState(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  destroy(): void
}

export interface YouTubeEvent {
  target: YouTubePlayer
  data: number
}

export interface BadgeProps {
  badgeId: string
  version: string
}

export interface TwitchEmoteProps {
  emoteId: string
  text: string
}

export interface SeventvEmoteProps {
  emoteId: string
  text: string
}
