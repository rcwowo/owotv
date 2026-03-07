import { type FC } from 'react';
import { TwitchEmote } from './TwitchEmote';
import { SeventvEmote } from './SeventvEmote';
import type { ChatMessageProps } from './types';

export const ChatMessage: FC<ChatMessageProps> = ({ fragments, emoteData }) => {
  const processMessage = () => {
    let result: React.ReactNode[] = [];
    let currentIndex = 0;

    // First, process Twitch emotes since we have their positions
    fragments.forEach((fragment, index) => {
      if (fragment.emoticon) {
        // Add any text before the emote
        if (currentIndex < index) {
          const textContent = fragments
            .slice(currentIndex, index)
            .map(f => f.text)
            .join('');
          result.push(<span key={`text-${index}`}>{processSevenTvEmotes(textContent, emoteData)}</span>);
        }
        // Add the Twitch emote
        result.push(
          <TwitchEmote
            key={`twitch-${fragment.emoticon.emoticon_id}-${index}`}
            emoteId={fragment.emoticon.emoticon_id}
            text={fragment.text}
          />
        );
        currentIndex = index + 1;
      }
    });

    // Process any remaining text for 7TV emotes
    if (currentIndex < fragments.length) {
      const remainingText = fragments
        .slice(currentIndex)
        .map(f => f.text)
        .join('');
      result.push(<span key="remaining">{processSevenTvEmotes(remainingText, emoteData)}</span>);
    }

    return result;
  };

  // Helper function to process text for 7TV emotes
  const processSevenTvEmotes = (text: string, emoteData: Record<string, { type: 'twitch' | '7tv', id: string }>) => {
    const result: React.ReactNode[] = [];
    let currentPosition = 0;

    // Create a regex pattern that matches any of the 7TV emote aliases as complete words
    const sevenTvEmotes = Object.entries(emoteData)
      .filter(([_, data]) => data.type === '7tv')
      .map(([alias]) => alias);

    if (sevenTvEmotes.length === 0) {
      return text;
    }

    // Add word boundaries to ensure exact matches only
    const emotePattern = new RegExp(`\\b(${sevenTvEmotes.map(escapeRegExp).join('|')})\\b`, 'g');
    let match;

    while ((match = emotePattern.exec(text)) !== null) {
      // Add any text before the emote
      if (match.index > currentPosition) {
        result.push(text.slice(currentPosition, match.index));
      }

      // Add the 7TV emote
      const emote = emoteData[match[0]];
      if (emote && emote.type === '7tv') {
        result.push(
          <SeventvEmote
            key={`7tv-${emote.id}-${match.index}`}
            emoteId={emote.id}
            text={match[0]}
          />
        );
      }

      currentPosition = match.index + match[0].length;
    }

    // Add any remaining text
    if (currentPosition < text.length) {
      result.push(text.slice(currentPosition));
    }

    return result;
  };

  // Helper function to escape special characters in regex
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  return <span>{processMessage()}</span>;
};