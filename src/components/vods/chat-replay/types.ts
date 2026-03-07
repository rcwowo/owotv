export interface ChatComment {
  _id: string
  created_at: string
  content_offset_seconds: number
  commenter: {
    display_name: string
    name: string
    logo?: string
  }
  message: {
    body: string
    user_color?: string
    user_badges?: Array<{
      _id: string
      version: string
    }>
    fragments: Array<{
      text: string
      emoticon: {
        emoticon_id: string
      } | null
    }>
  }
}

export interface ChatData {
  comments: ChatComment[]
  video: {
    title: string
    created_at: string
    length: number
  }
}

export interface ChatReplayProps {
  chatReplayURL: string
  youtubeId: string | undefined
}

export interface YouTubePlayer {
  getCurrentTime(): number
  getPlayerState(): number
  destroy(): void
}

export interface YouTubeEvent {
  target: YouTubePlayer
  data: number
}

export interface SevenTvObject {
  data: {
    users: {
      userByConnection: {
        style: {
          activeEmoteSetId: string | undefined
        }
        emoteSets: SevenTvEmoteSet[]
      }
    }
  }
}

export interface SevenTvEmoteSet {
  id: string
  emotes: {
    items: [
      {
        id: string
        alias: string
      },
    ]
  }
}

export interface BadgeProps {
  badgeId: string;
  version: string;
}

export interface TwitchEmoteProps {
  emoteId: string
  text: string
}

export interface SeventvEmoteProps {
  emoteId: string
  text: string
}

export interface MessageFragment {
  text: string
  emoticon: {
    emoticon_id: string
  } | null
}

export interface ChatMessageProps {
  fragments: MessageFragment[]
  userColor: string
  emoteData: Record<string, { type: 'twitch' | '7tv'; id: string }>
}
