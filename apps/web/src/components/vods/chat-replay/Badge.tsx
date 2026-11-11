import { BADGES } from '@/consts'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import type { BadgeId } from '@/consts'
import type { BadgeProps } from './types'

export function Badge({ badgeId }: BadgeProps) {
  const badge = BADGES[badgeId as BadgeId]

  if (!badge) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <img
            src={badge.imageUrl}
            alt={badge.title}
            className="mr-1 inline-block h-4 w-4"
          />
        </TooltipTrigger>
        <TooltipContent>
          {badge.title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
