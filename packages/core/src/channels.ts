import { channels, type Db } from '@owotv/db'
import { channelInput, type ApiChannel, type ChannelInput } from '@owotv/shared'
import { asc, eq } from 'drizzle-orm'
import { ConflictError } from './errors'

const apiChannelColumns = {
  slug: channels.slug,
  displayName: channels.displayName,
  twitchId: channels.twitchId,
  avatarUrl: channels.avatarUrl,
}

export async function listChannels(db: Db): Promise<ApiChannel[]> {
  return db.select(apiChannelColumns).from(channels).orderBy(asc(channels.id))
}

export async function findChannel(db: Db, slug: string) {
  return db.query.channels.findFirst({ where: eq(channels.slug, slug) })
}

export async function createChannel(
  db: Db,
  raw: ChannelInput,
): Promise<ApiChannel> {
  const input = channelInput.parse(raw)
  if (await findChannel(db, input.slug)) {
    throw new ConflictError(
      `Channel "${input.slug}" already exists`,
      input.slug,
    )
  }
  const [row] = await db
    .insert(channels)
    .values({
      slug: input.slug,
      displayName: input.displayName,
      twitchId: input.twitchId ?? null,
      avatarUrl: input.avatarUrl ?? null,
    })
    .returning(apiChannelColumns)
  return row!
}
