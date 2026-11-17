import type { ChatFragment } from '@owotv/shared/client'
import { Fragment, type ReactNode } from 'react'
import { SeventvEmote } from './SeventvEmote'
import { TwitchEmote } from './TwitchEmote'

interface ChatMessageProps {
  fragments: ChatFragment[]
  sevenTv: Map<string, string>
}

function renderText(text: string, sevenTv: Map<string, string>, key: number) {
  if (!sevenTv.size) return text
  const out: ReactNode[] = []
  for (const [i, part] of text.split(/(\s+)/).entries()) {
    const id = sevenTv.get(part)
    out.push(
      id ? <SeventvEmote key={`${key}-${i}`} emoteId={id} text={part} /> : part,
    )
  }
  return out
}

export function ChatMessage({ fragments, sevenTv }: ChatMessageProps) {
  return (
    <span>
      {fragments.map((f, i) =>
        typeof f === 'string' ? (
          <Fragment key={i}>{renderText(f, sevenTv, i)}</Fragment>
        ) : (
          <TwitchEmote key={i} emoteId={f[1]} text={f[0]} />
        ),
      )}
    </span>
  )
}
