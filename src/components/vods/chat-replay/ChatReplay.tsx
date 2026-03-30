import { useEffect, useRef, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from './Badge'
import { ChatMessage } from './ChatMessage'
import { SITE } from '@/consts'
import type {
  ChatComment,
  ChatData,
  ChatReplayProps,
  YouTubePlayer,
  YouTubeEvent,
  SevenTvObject,
  SevenTvEmoteSet,
} from './types'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: {
          videoId: string
          playerVars?: Record<string, any>
          events?: Record<string, (event: YouTubeEvent) => void>
        },
      ) => YouTubePlayer
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

export default function ChatReplay({
  chatReplayURL,
  youtubeId,
}: ChatReplayProps) {
  const [comments, setComments] = useState<ChatComment[]>([])
  const [visibleComments, setVisibleComments] = useState<ChatComment[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [userScrolled, setUserScrolled] = useState(false)
  const [emoteData, setEmoteData] = useState<
    Record<string, { type: 'twitch' | '7tv'; id: string }>
  >({})
  const [isCollapsed, setIsCollapsed] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const MAX_VISIBLE_MESSAGES = 200

  // Load chat messages and process emotes
  useEffect(() => {
    const fetchComments = async () => {
      try {
        console.log('[ChatReplay] Fetching comments from:', chatReplayURL)
        const response = await fetch(chatReplayURL)
        const data: ChatData = await response.json()
        console.log('[ChatReplay] Fetched', data.comments.length, 'comments')

        // Process emotes from all comments
        const emoteMap: Record<string, { type: 'twitch' | '7tv'; id: string }> =
          {}
        data.comments.forEach((comment) => {
          comment.message.fragments?.forEach((fragment) => {
            if (fragment.emoticon) {
              emoteMap[fragment.text] = {
                type: 'twitch',
                id: fragment.emoticon.emoticon_id,
              }
            }
          })
        })

        // Fetch 7TV emotes
        try {
          const sevenTvResponse = await fetch('https://7tv.io/v4/gql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `
                query($id: String!) {
                  users {
                    userByConnection(platform: TWITCH, platformId: $id) {
                      style {
                        activeEmoteSetId
                      }
                      emoteSets {
                        id
                        emotes {
                          items {
                            id 
                            alias
                          }
                        }
                      }
                    } 
                  }
                }
              `,
              variables: {
                id: SITE.TWITCH_USER_ID.toString(),
              },
            }),
          })

          const sevenTvData: SevenTvObject = await sevenTvResponse.json()
          const activeEmoteSetId: string | undefined =
            sevenTvData.data.users.userByConnection.style.activeEmoteSetId

          if (activeEmoteSetId) {
            const activeEmoteSet: SevenTvEmoteSet | undefined =
              sevenTvData.data.users.userByConnection.emoteSets.find(
                (obj) => obj.id === activeEmoteSetId,
              )
            console.log('[ChatReplay] Active emote set:', activeEmoteSet)
            console.log(
              '[ChatReplay] Fetched 7TV emotes:',
              activeEmoteSet?.emotes?.items?.length || 0,
            )

            // Add 7TV emotes to the emote map
            if (activeEmoteSet) {
              activeEmoteSet.emotes?.items?.forEach(
                (emote: { id: string; alias: string }) => {
                  emoteMap[emote.alias] = {
                    type: '7tv',
                    id: emote.id,
                  }
                },
              )
            } else {
              console.error(
                '[ChatReplay] Active emote set not found, skipping 7TV emotes',
              )
            }
          } else {
            console.error(
              '[ChatReplay] Active emote set not found, skipping 7TV emotes',
            )
          }
        } catch (error) {
          console.error('[ChatReplay] Error fetching 7TV emotes:', error)
        }

        setEmoteData(emoteMap)
        setComments(
          data.comments.sort(
            (a, b) => a.content_offset_seconds - b.content_offset_seconds,
          ),
        )
      } catch (error) {
        console.error('[ChatReplay] Error fetching comments:', error)
      }
    }
    fetchComments()
  }, [chatReplayURL])
  // Initialize YouTube Player API
  useEffect(() => {
    if (!youtubeId) return

    let attempts = 0
    const maxAttempts = 10
    const retryInterval = 1000 // 1 second

    const iframeId = `youtube-player-${youtubeId}`
    console.log('[ChatReplay] Looking for iframe:', iframeId)

    const initPlayer = () => {
      const iframe = document.getElementById(iframeId)
      if (!iframe) {
        console.error('[ChatReplay] Iframe not found:', iframeId)
        return false
      }
      console.log('[ChatReplay] Found iframe, initializing player')

      try {
        if (!window.YT || !window.YT.Player) {
          console.log('[ChatReplay] YouTube API not ready yet')
          return false
        }

        console.log('[ChatReplay] Initializing player')

        // Destroy existing player if it exists
        if (playerRef.current) {
          playerRef.current.destroy()
        }

        // Create new player
        playerRef.current = new window.YT.Player(iframeId, {
          videoId: youtubeId,
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
            enablejsapi: 1,
          },
          events: {
            onReady: (event: YouTubeEvent) => {
              console.log('[ChatReplay] Player ready', event)
            },
            onStateChange: (event: YouTubeEvent) => {
              console.log('[ChatReplay] Player state changed:', event.data)
              if (event.data === 1) {
                // Playing
                const updateTime = () => {
                  if (playerRef.current) {
                    try {
                      const time = playerRef.current.getCurrentTime()
                      setCurrentTime(time)
                      if (event.data === 1) {
                        // Only continue if still playing
                        requestAnimationFrame(updateTime)
                      }
                    } catch (error) {
                      console.error('[ChatReplay] Error getting time:', error)
                    }
                  }
                }
                updateTime()
              }
            },
            onError: (event: any) => {
              console.error('[ChatReplay] Player error:', event.data)
            },
          },
        })
        return true
      } catch (error) {
        console.error('[ChatReplay] Error initializing player:', error)
        return false
      }
    }

    const loadYouTubeAPI = () => {
      return new Promise<void>((resolve) => {
        if (window.YT && window.YT.Player) {
          console.log('[ChatReplay] YouTube API already loaded')
          resolve()
          return
        }

        console.log('[ChatReplay] Loading YouTube API script')
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        const firstScriptTag = document.getElementsByTagName('script')[0]
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)

        window.onYouTubeIframeAPIReady = () => {
          console.log('[ChatReplay] YouTube API script loaded')
          resolve()
        }
      })
    }

    const attemptInitialization = async () => {
      if (attempts >= maxAttempts) {
        console.error('[ChatReplay] Max initialization attempts reached')
        return
      }

      attempts++
      console.log(
        `[ChatReplay] Initialization attempt ${attempts}/${maxAttempts}`,
      )

      await loadYouTubeAPI()

      if (!initPlayer()) {
        console.log('[ChatReplay] Initialization failed, retrying...')
        setTimeout(attemptInitialization, retryInterval)
      }
    }

    attemptInitialization()

    return () => {
      if (playerRef.current) {
        console.log('[ChatReplay] Cleaning up player')
        playerRef.current.destroy()
      }
    }
  }, [youtubeId])

  // Update visible messages based on current time
  useEffect(() => {
    const visibleComments = comments
      .filter((comment) => comment.content_offset_seconds <= currentTime)
      .slice(-MAX_VISIBLE_MESSAGES)
    setVisibleComments(visibleComments)

    // Auto-scroll to bottom only if user hasn't scrolled up
    if (chatContainerRef.current && !userScrolled) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [currentTime, comments, userScrolled])

  // Handle scroll events
  const handleScroll = () => {
    if (!chatContainerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20

    // Update userScrolled state based on scroll position
    setUserScrolled(!isAtBottom)
  }

  return (
    <div
      className={cn(
        'relative flex flex-col border-l bg-background transition-all duration-300',
        isCollapsed ? 'w-12' : 'w-80',
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="absolute -left-3 top-4 z-10 h-6 w-6 border bg-background shadow-md hover:bg-accent"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        {isCollapsed ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
      </Button>

      {!isCollapsed ? (
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b px-6">
            <h3 className="font-semibold">Chat Replay</h3>
            {userScrolled && (
              <button
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                onClick={() => {
                  if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop =
                      chatContainerRef.current.scrollHeight
                  }
                }}
              >
                Scrolling Paused
              </button>
            )}
          </div>
          <div
            ref={chatContainerRef}
            className="grow space-y-2 overflow-y-auto p-4"
            onScroll={handleScroll}
          >
            {visibleComments.map((comment) => (
              <div
                key={comment._id}
                className="wrap-break-word text-sm leading-tight"
              >
                <span
                  className="font-semibold"
                  style={{ color: comment.message.user_color || 'inherit' }}
                >
                  {comment.message.user_badges?.map((badge) => (
                    <Badge
                      key={`${badge._id}-${badge.version}`}
                      badgeId={badge._id}
                      version={badge.version}
                    />
                  ))}
                  {comment.commenter.display_name}
                </span>
                {': '}
                <ChatMessage
                  fragments={
                    comment.message.fragments || [
                      { text: comment.message.body, emoticon: null },
                    ]
                  }
                  userColor={comment.message.user_color || 'inherit'}
                  emoteData={emoteData}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-4 py-4">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <span className="rotate-180 select-none font-semibold uppercase text-muted-foreground [writing-mode:vertical-lr]">
            Chat Replay
          </span>
        </div>
      )}
    </div>
  )
}
