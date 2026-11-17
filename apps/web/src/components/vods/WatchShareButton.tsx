import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWatchPlayerTime } from '@/hooks/useWatchPlayerTime'
import { buildWatchUrl, formatTimecode } from '@/lib/watch-timecode'
import { cn } from '@/lib/utils'
import { Check, Link2, Share2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type CopiedOption = 'url' | 'timecode' | null

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function WatchShareButton() {
  const currentTime = useWatchPlayerTime()
  const [copiedOption, setCopiedOption] = useState<CopiedOption>(null)

  useEffect(() => {
    if (!copiedOption) return
    const timeout = window.setTimeout(() => setCopiedOption(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [copiedOption])

  const copyUrl = useCallback(
    async (withTimecode: boolean) => {
      const url = withTimecode
        ? buildWatchUrl(window.location.pathname, currentTime)
        : buildWatchUrl(window.location.pathname)

      const copied = await copyToClipboard(url)
      if (copied) {
        setCopiedOption(withTimecode ? 'timecode' : 'url')
      }
    },
    [currentTime],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer px-2"
          aria-label="Share VOD"
        >
          <Share2 className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="border-border/60 bg-popover/95 min-w-48 rounded-lg p-1 shadow-md backdrop-blur-xl"
      >
        <DropdownMenuItem
          onSelect={() => void copyUrl(false)}
          className={cn(
            'focus:bg-secondary/50 focus:text-foreground rounded-md p-0',
            'data-[highlighted]:bg-secondary/50 data-[highlighted]:text-foreground',
            copiedOption === 'url' && 'bg-secondary/40 text-foreground',
          )}
        >
          <span className="text-muted-foreground flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors">
            {copiedOption === 'url' ? (
              <Check className="size-4" />
            ) : (
              <Link2 className="size-4" />
            )}
            Copy link
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void copyUrl(true)}
          className={cn(
            'focus:bg-secondary/50 focus:text-foreground rounded-md p-0',
            'data-[highlighted]:bg-secondary/50 data-[highlighted]:text-foreground',
            copiedOption === 'timecode' && 'bg-secondary/40 text-foreground',
          )}
        >
          <span className="text-muted-foreground flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors">
            {copiedOption === 'timecode' ? (
              <Check className="size-4" />
            ) : (
              <Link2 className="size-4" />
            )}
            Copy link at {formatTimecode(currentTime)}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
