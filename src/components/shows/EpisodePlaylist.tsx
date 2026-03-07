import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Show } from '@/lib/shows'
import { ChevronDown, ChevronLeft, ChevronRight, ListVideo } from 'lucide-react'
import { useState } from 'react'

interface EpisodePlaylistProps {
  show: Show
  currentSeasonId: string
  currentEpisodeId: string
}

export function EpisodePlaylist({
  show,
  currentSeasonId,
  currentEpisodeId,
}: EpisodePlaylistProps) {
  const [selectedSeasonId, setSelectedSeasonId] = useState(currentSeasonId)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const selectedSeason =
    show.seasons.find((s) => s.id === selectedSeasonId) || show.seasons[0]

  return (
    <div
      className={cn(
        'relative flex flex-col border-l bg-background transition-all duration-300',
        isCollapsed ? 'w-12' : 'w-80 md:w-96',
      )}
    >
      {/* Collapse Toggle */}
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
        <>
          {/* Header */}
          <div className="flex flex-col gap-2 border-b p-6">
            <h2 className="text-lg font-semibold leading-none tracking-tight">
              {show.title}
            </h2>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {selectedSeason?.title}
                  <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {show.seasons.map((season) => (
                  <DropdownMenuItem
                    key={season.id}
                    onSelect={() => setSelectedSeasonId(season.id)}
                  >
                    {season.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Episode List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {selectedSeason?.episodes.map((episode, index) => {
                const isCurrent =
                  episode.id === currentEpisodeId &&
                  selectedSeason.id === currentSeasonId

                return (
                  <a
                    key={episode.id}
                    href={`/shows/${show.id}/${selectedSeason.id}/${episode.id}`}
                    className={cn(
                      'group flex gap-3 border p-2 text-left transition-colors hover:bg-accent/80',
                      isCurrent
                        ? 'border-primary/20 bg-primary/20'
                        : 'border-primary/20',
                    )}
                  >
                    <div className="relative aspect-video w-24 flex-none overflow-hidden bg-muted">
                      <div className="absolute inset-x-0 top-0 z-20 h-0.5 bg-primary"></div>
                      <img
                        src={episode.thumbnailUrl}
                        alt={episode.title}
                        className={cn(
                          'h-full w-full object-cover transition-all',
                          isCurrent ? 'opacity-50' : 'group-hover:scale-105',
                        )}
                      />
                      {isCurrent && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-3 w-3 rotate-45 animate-pulse bg-primary" />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                      <span className="line-clamp-2 text-sm font-medium leading-tight">
                        <span className="mr-1 font-bold">#{index + 1}</span>
                        {episode.title}
                      </span>
                      <span className="text-xs">{episode.duration}</span>
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center space-y-4 py-4">
          <ListVideo className="h-5 w-5 text-muted-foreground" />
          <span className="rotate-180 select-none font-semibold uppercase text-muted-foreground [writing-mode:vertical-lr]">
            Playlist Viewer
          </span>
        </div>
      )}
    </div>
  )
}
