import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWatchPlayerTime } from '@/hooks/useWatchPlayerTime'
import { buildWatchUrl, formatTimecode } from '@/lib/watch-timecode'
import { Check, Link2, Share2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type CopiedOption = 'url' | 'timecode' | null

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()

    try {
      return document.execCommand('copy')
    } finally {
      document.body.removeChild(textarea)
    }
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

  const copyUrl = useCallback(async (withTimecode: boolean) => {
    const url = withTimecode
      ? buildWatchUrl(window.location.pathname, currentTime)
      : buildWatchUrl(window.location.pathname)

    const copied = await copyToClipboard(url)
    if (copied) {
      setCopiedOption(withTimecode ? 'timecode' : 'url')
    }
  }, [currentTime])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Share VOD">
          <Share2 className="size-4 md:mr-2" />
          <span className="hidden md:inline">Share</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => void copyUrl(false)}>
          {copiedOption === 'url' ? (
            <Check className="mr-2 size-4" />
          ) : (
            <Link2 className="mr-2 size-4" />
          )}
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyUrl(true)}>
          {copiedOption === 'timecode' ? (
            <Check className="mr-2 size-4" />
          ) : (
            <Link2 className="mr-2 size-4" />
          )}
          Copy link at {formatTimecode(currentTime)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
