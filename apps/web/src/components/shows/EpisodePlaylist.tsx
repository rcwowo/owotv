import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PlaylistEpisodeCard } from '@/components/shows/PlaylistEpisodeCard'
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
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false)

  const selectedSeason =
    show.seasons.find((s) => s.id === selectedSeasonId) || show.seasons[0]

  return (
    <div
      className={cn(
        'bg-background relative flex flex-col border-l transition-all duration-300',
        isCollapsed ? 'w-12' : 'w-80 md:w-96',
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
        <>
          <div className="flex flex-col gap-3 border-b p-6">
            <h2 className="text-lg leading-none font-semibold tracking-tight">
              {show.title}
            </h2>

            <DropdownMenu
              open={seasonMenuOpen}
              onOpenChange={setSeasonMenuOpen}
              modal={false}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={cn(
                    'h-9 w-full justify-between rounded-lg border px-3 shadow-none',
                    'hover:bg-secondary/60 focus-visible:ring-1',
                  )}
                >
                  <span className="truncate">{selectedSeason?.title}</span>
                  <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="border-border/60 bg-popover/95 min-w-(--radix-dropdown-menu-trigger-width) rounded-lg p-1 shadow-md backdrop-blur-xl"
              >
                {show.seasons.map((season) => (
                  <DropdownMenuItem
                    key={season.id}
                    onSelect={() => setSelectedSeasonId(season.id)}
                    className={cn(
                      'focus:bg-secondary/50 focus:text-foreground rounded-md p-0',
                      'data-[highlighted]:bg-secondary/50 data-[highlighted]:text-foreground',
                      selectedSeasonId === season.id &&
                        'bg-secondary/40 text-foreground',
                    )}
                  >
                    <span className="text-muted-foreground block w-full cursor-pointer rounded-md px-3 py-2 text-sm transition-colors">
                      {season.title}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {selectedSeason?.episodes.map((episode) => (
                <PlaylistEpisodeCard
                  key={episode.id}
                  episode={episode}
                  isCurrent={
                    episode.id === currentEpisodeId &&
                    selectedSeason.id === currentSeasonId
                  }
                  href={`/shows/${show.id}/${selectedSeason.id}/${episode.id}`}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center space-y-4 py-4">
          <ListVideo className="text-muted-foreground h-5 w-5" />
          <span className="text-muted-foreground rotate-180 font-semibold uppercase select-none [writing-mode:vertical-lr]">
            Playlist Viewer
          </span>
        </div>
      )}
    </div>
  )
}
