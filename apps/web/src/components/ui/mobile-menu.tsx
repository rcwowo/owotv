import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NAV_LINKS, type Link } from '@/consts'
import { cn } from '@/lib/utils'
import { Menu } from 'lucide-react'

const MobileMenu = ({ links = NAV_LINKS }: { links?: Link[] }) => {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleViewTransitionStart = () => {
      setIsOpen(false)
    }

    document.addEventListener('astro:before-swap', handleViewTransitionStart)

    return () => {
      document.removeEventListener(
        'astro:before-swap',
        handleViewTransitionStart,
      )
    }
  }, [])

  if (links.length > 0) {
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'header-menu-trigger sm:hidden',
              'h-9 w-9 shrink-0 rounded-lg border p-0 shadow-none',
              'hover:bg-secondary/60 focus-visible:ring-1',
            )}
            title="Menu"
          >
            <Menu className="size-4" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="border-border/60 bg-popover/95 min-w-40 rounded-lg p-1 shadow-md backdrop-blur-xl"
        >
          {links.map((item) => (
            <DropdownMenuItem
              key={item.href}
              asChild
              className="focus:bg-secondary/50 focus:text-foreground data-[highlighted]:bg-secondary/50 data-[highlighted]:text-foreground rounded-md p-0"
            >
              <a
                href={item.href}
                className="text-muted-foreground block w-full cursor-pointer rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-hidden"
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </a>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
}

export default MobileMenu
