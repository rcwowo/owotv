import { Button, buttonVariants } from '@/components/ui/button'
import { useWatchPlayerTime } from '@/hooks/useWatchPlayerTime'
import { SITE } from '@/consts'
import type {
  ChatComment,
  ChatData,
  ChatReplayProps,
  SevenTvObject,
  SevenTvEmoteSet,
} from './types'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from './Badge'
import { ChatMessage } from './ChatMessage'

export default function ChatReplay({
  chatReplayURL,
}: ChatReplayProps) {
  const [comments, setComments] = useState<ChatComment[]>([])
  const [visibleComments, setVisibleComments] = useState<ChatComment[]>([])
  const currentTime = useWatchPlayerTime()
  const [userScrolled, setUserScrolled] = useState(false)
  const [emoteData, setEmoteData] = useState<
    Record<string, { type: 'twitch' | '7tv'; id: string }>
  >({})
  const [isCollapsed, setIsCollapsed] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const MAX_VISIBLE_MESSAGES = 200

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const response = await fetch(chatReplayURL)
        const data: ChatData = await response.json()

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

            if (activeEmoteSet) {
              activeEmoteSet.emotes?.items?.forEach(
                (emote: { id: string; alias: string }) => {
                  emoteMap[emote.alias] = {
                    type: '7tv',
                    id: emote.id,
                  }
                },
              )
            }
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

  useEffect(() => {
    const visible = comments
      .filter((comment) => comment.content_offset_seconds <= currentTime)
      .slice(-MAX_VISIBLE_MESSAGES)
    setVisibleComments(visible)

    if (chatContainerRef.current && !userScrolled) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [currentTime, comments, userScrolled])

  const handleScroll = () => {
    if (!chatContainerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20
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
        variant="outline"
        size="icon"
        className="absolute -left-2.5 top-4 z-10 size-6 border-border/60 bg-card shadow-sm"
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
                    setUserScrolled(false)
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
