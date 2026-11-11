import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date) {
  return Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}
export function getYouTubeVideoID(url: string) {
  const urlRegex = /^https?:\/\/(?:www\.)?youtu(?:be\.com|\.be)\/(?:watch\?v=)?([^&\s]+)/
  const match = url.match(urlRegex)
  return match ? match[1] : undefined
}