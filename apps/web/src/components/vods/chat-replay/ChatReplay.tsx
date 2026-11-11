import { Button, buttonVariants } from '@/components/ui/button'
import { useWatchPlayerTime } from '@/hooks/useWatchPlayerTime'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Badge } from './Badge'
import { ChatMessage } from './ChatMessage'
import type { ChatReplayProps } from './types'
import { useChatArchive } from './useChatArchive'

export default function ChatReplay({ vodSlug }: ChatReplayProps) {
  const currentTime = useWatchPlayerTime()
  const { visible, sevenTv } = useChatArchive(vodSlug, currentTime)
  const [userScrolled, setUserScrolled] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatContainerRef.current && !userScrolled) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [visible, userScrolled])

  const handleScroll = () => {
    if (!chatContainerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20
    setUserScrolled(!isAtBottom)
  }

  return (
    <div
      className={cn(
        'bg-background relative flex flex-col border-l transition-all duration-300',
        isCollapsed ? 'w-12' : 'w-80',
      )}
    >
      <Button
        variant="outline"
        size="icon"
        className="border-border/60 bg-card absolute top-4 -left-2.5 z-10 size-6 cursor-pointer shadow-sm"
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
            {visible.map((msg) => (
              <div
                key={msg.key}
                className="text-sm leading-tight wrap-break-word"
              >
                <span
                  className="font-semibold"
                  style={{ color: msg.user.color || 'inherit' }}
                >
                  {msg.user.badges.map(([set, version]) => (
                    <Badge
                      key={`${set}-${version}`}
                      badgeId={set}
                      version={version}
                    />
                  ))}
                  {msg.user.name}
                </span>
                {': '}
                <ChatMessage fragments={msg.fragments} sevenTv={sevenTv} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-4 py-4">
          <MessageSquare className="text-muted-foreground h-5 w-5" />
          <span className="text-muted-foreground rotate-180 font-semibold uppercase select-none [writing-mode:vertical-lr]">
            Chat Replay
          </span>
        </div>
      )}
    </div>
  )
}
