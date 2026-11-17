import { describe, expect, test } from 'bun:test'
import { parseDuration, parseYouTubeId } from './parse'

describe('parseDuration', () => {
  test('reads H:MM:SS and MM:SS', () => {
    expect(parseDuration('0:57:34')).toBe(3454)
    expect(parseDuration('4:03:07')).toBe(14587)
    expect(parseDuration('55:12')).toBe(3312)
  })

  test('rejects junk', () => {
    expect(() => parseDuration('')).toThrow()
    expect(() => parseDuration('1:2:3:4')).toThrow()
    expect(() => parseDuration('ab:cd')).toThrow()
  })
})

describe('parseYouTubeId', () => {
  test('reads common URL forms', () => {
    expect(parseYouTubeId('https://youtu.be/dbdy2Fv6CV0')).toBe('dbdy2Fv6CV0')
    expect(parseYouTubeId('https://youtube.com/watch?v=Zl80eLxQCuo')).toBe(
      'Zl80eLxQCuo',
    )
    expect(
      parseYouTubeId('https://www.youtube.com/watch?v=Zl80eLxQCuo&t=30'),
    ).toBe('Zl80eLxQCuo')
    expect(parseYouTubeId('https://www.youtube.com/live/Zl80eLxQCuo')).toBe(
      'Zl80eLxQCuo',
    )
  })

  test('rejects other URLs', () => {
    expect(() => parseYouTubeId('https://vimeo.com/123')).toThrow()
    expect(() => parseYouTubeId('https://youtube.com/watch')).toThrow()
  })
})
