import type { ChatFragment, ChatSegment, ChatUser } from './chat'

export type {
  ChatFragment,
  ChatManifest,
  ChatSegment,
  ChatUser,
  EmoteSet,
} from './chat'

export const segmentForTime = (seconds: number, segmentSeconds: number) =>
  Math.max(0, Math.floor(seconds / segmentSeconds))

export interface ResolvedChatMessage {
  key: string
  offset: number
  user: ChatUser
  fragments: ChatFragment[]
}

export function resolveSegment(seg: ChatSegment): ResolvedChatMessage[] {
  return seg.messages.map(([offset, userIndex, fragments], i) => ({
    key: `${seg.segment}:${i}`,
    offset,
    user: seg.users[userIndex] ?? { login: '', name: 'unknown', badges: [] },
    fragments,
  }))
}
