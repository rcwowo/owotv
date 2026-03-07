import { type FC } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import type { SeventvEmoteProps } from './types'

export const SeventvEmote: FC<SeventvEmoteProps> = ({ emoteId, text }) => {
  // 7TV CDN URL for emotes
  const emoteUrl = `https://cdn.7tv.app/emote/${emoteId}/1x.webp`

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <img
            src={emoteUrl}
            alt={text}
            className="-my-1 inline-block h-6 w-auto"
            loading="lazy"
          />
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
