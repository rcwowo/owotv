import { expect, test } from 'bun:test'
import { channelInput } from './api'

test('channel slugs accept Twitch logins', () => {
  const ok = (slug: string) =>
    channelInput.safeParse({ slug, displayName: slug }).success
  expect(ok('toastercat_')).toBe(true)
  expect(ok('rcwlol')).toBe(true)
  expect(ok('my-show_2')).toBe(true)
  expect(ok('_leading')).toBe(false)
  expect(ok('Upper')).toBe(false)
  expect(ok('has space')).toBe(false)
})
