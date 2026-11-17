import { expect, test } from 'bun:test'
import { newSlug, slugify } from './index'

test('slugify', () => {
  expect(slugify("Riley's Morning Show")).toBe('rileys-morning-show')
  expect(slugify('Pokémon: Let’s Go!')).toBe('pokemon-lets-go')
  expect(slugify('  BETON BRUTAL  ')).toBe('beton-brutal')
})

test('newSlug', () => {
  expect(newSlug()).toMatch(/^[0-9a-z]{10}$/)
})
