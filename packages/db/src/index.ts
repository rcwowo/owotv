import { drizzle } from 'drizzle-orm/d1'
import { customAlphabet } from 'nanoid'
import * as schema from './schema'

export * from './schema'
export { schema }

export function createDb(d1: Parameters<typeof drizzle>[0]) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>

const slugAlphabet = '0123456789abcdefghijklmnopqrstuvwxyz'

export const newSlug = customAlphabet(slugAlphabet, 10)

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
