import { apiTokens, type Db, type TokenRole } from '@owotv/db'
import { and, eq, isNull } from 'drizzle-orm'
import { sha256Hex } from './emotes'

const ROLE_RANK: Record<TokenRole, number> = { read: 0, write: 1, admin: 2 }
const TOKEN_PREFIX = 'owotv_'
const LAST_USED_RESOLUTION_MS = 60 * 60 * 1000

export const roleAllows = (have: TokenRole, need: TokenRole) =>
  ROLE_RANK[have] >= ROLE_RANK[need]

export const hashToken = sha256Hex

function generateToken() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return TOKEN_PREFIX + [...bytes].map((b) => alphabet[b & 31]).join('')
}

export async function createToken(
  db: Db,
  opts: { name: string; role: TokenRole; channelId?: number | null },
) {
  const token = generateToken()
  await db.insert(apiTokens).values({
    name: opts.name,
    role: opts.role,
    channelId: opts.channelId ?? null,
    tokenHash: await hashToken(token),
  })
  return token
}

export interface TokenIdentity {
  id: number
  name: string
  role: TokenRole
  channelId: number | null
}

export async function verifyToken(
  db: Db,
  token: string,
): Promise<TokenIdentity | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null
  const row = await db.query.apiTokens.findFirst({
    where: and(
      eq(apiTokens.tokenHash, await hashToken(token)),
      isNull(apiTokens.revokedAt),
    ),
  })
  if (!row) return null

  const now = new Date()
  if (
    !row.lastUsedAt ||
    now.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
  ) {
    await db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(eq(apiTokens.id, row.id))
  }
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    channelId: row.channelId,
  }
}

export async function listTokens(db: Db) {
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      role: apiTokens.role,
      channelId: apiTokens.channelId,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
}

export async function revokeToken(db: Db, id: number) {
  const rows = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id })
  return rows.length > 0
}
