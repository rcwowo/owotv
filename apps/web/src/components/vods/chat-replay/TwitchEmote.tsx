import { type FC } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import type { TwitchEmoteProps } from './types'

export const TwitchEmote: FC<TwitchEmoteProps> = ({ emoteId, text }) => {
  // Twitch CDN URL for emotes
  const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/1.0`

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
