import type { Episode } from '@/lib/shows'
import { cn } from '@/lib/utils'
import { Play } from 'lucide-react'

interface PlaylistEpisodeCardProps {
  episode: Episode
  href: string
  isCurrent: boolean
}

export function PlaylistEpisodeCard({
  episode,
  href,
  isCurrent,
}: PlaylistEpisodeCardProps) {
  return (
    <a
      href={href}
      className={cn(
        'group flex gap-3 rounded-xl p-2 text-left outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isCurrent ? 'bg-primary/15 hover:bg-primary/20' : 'hover:bg-secondary/60',
      )}
    >
      <div
        className={cn(
          'relative aspect-video w-28 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-card',
          isCurrent && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
        )}
      >
        <img
          src={episode.thumbnailUrl}
          alt={episode.title}
          loading="lazy"
          className={cn(
            'h-full w-full object-cover transition-transform duration-500 ease-out',
            isCurrent ? 'opacity-60' : 'group-hover:scale-[1.04]',
          )}
        />

        {isCurrent ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
            <div className="h-2.5 w-2.5 rotate-45 animate-pulse bg-primary" />
          </div>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100">
              <div className="rounded-full bg-primary/90 p-1.5 text-primary-foreground shadow-lg opacity-0 scale-90 transition-[opacity,transform] duration-300 ease-out group-hover:opacity-100 group-hover:scale-100">
                <Play className="size-4 fill-current" />
              </div>
            </div>

            <div className="pointer-events-none absolute left-[-30%] top-0 z-10 h-full w-1/3 -skew-x-12 bg-linear-to-r from-white/0 via-white/10 to-white/0 opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <span className="line-clamp-2 text-sm font-medium leading-tight">
          {episode.title}
        </span>
        <span className="text-xs text-muted-foreground">{episode.duration}</span>
      </div>
    </a>
  )
}
