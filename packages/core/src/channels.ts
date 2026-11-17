import {
  channels,
  channelSlugAliases,
  shows,
  vods,
  type Channel,
  type Db,
} from '@owotv/db'
import {
  channelInput,
  updateChannelInput,
  type ApiChannel,
  type ApiShowSummary,
  type ApiVod,
  type ChannelInput,
  type ChannelLink,
  type UpdateChannelInput,
} from '@owotv/shared'
import { and, asc, count, eq, max, ne, sql } from 'drizzle-orm'
import type { ApiClient } from './client'
import { ChannelNotEmptyError, ConflictError, NotFoundError } from './errors'
import type { IngestEvent } from './ingest'

export function toApiChannel(row: Channel): ApiChannel {
  return {
    slug: row.slug,
    displayName: row.displayName,
    twitchId: row.twitchId,
    avatarUrl: row.avatarUrl,
    bannerUrl: row.bannerUrl,
    description: row.description,
    links: row.links as ChannelLink[],
  }
}

export async function listChannels(db: Db): Promise<ApiChannel[]> {
  const rows = await db.select().from(channels).orderBy(asc(channels.id))
  return rows.map(toApiChannel)
}

/** Finds a channel by its current slug, or by a slug it used before a rename. */
export async function findChannel(db: Db, slug: string) {
  const current = await db.query.channels.findFirst({
    where: eq(channels.slug, slug),
  })
  if (current) return current
  const [row] = await db
    .select({ channel: channels })
    .from(channelSlugAliases)
    .innerJoin(channels, eq(channelSlugAliases.channelId, channels.id))
    .where(eq(channelSlugAliases.slug, slug))
    .limit(1)
  return row?.channel
}

async function assertSlugFree(db: Db, slug: string, exceptId?: number) {
  const taken = await db.query.channels.findFirst({
    where: exceptId
      ? and(eq(channels.slug, slug), ne(channels.id, exceptId))
      : eq(channels.slug, slug),
    columns: { slug: true },
  })
  if (taken) throw new ConflictError(`Channel "${slug}" already exists`, slug)
}

async function assertTwitchIdFree(db: Db, twitchId: string, exceptId?: number) {
  const taken = await db.query.channels.findFirst({
    where: exceptId
      ? and(eq(channels.twitchId, twitchId), ne(channels.id, exceptId))
      : eq(channels.twitchId, twitchId),
    columns: { slug: true },
  })
  if (taken) {
    throw new ConflictError(
      `Twitch user ${twitchId} is already channel "${taken.slug}"`,
      taken.slug,
    )
  }
}

export async function createChannel(
  db: Db,
  raw: ChannelInput,
): Promise<ApiChannel> {
  const input = channelInput.parse(raw)
  await assertSlugFree(db, input.slug)
  if (input.twitchId) await assertTwitchIdFree(db, input.twitchId)
  const [, [row]] = await db.batch([
    // A new channel can claim a login another channel left behind.
    db
      .delete(channelSlugAliases)
      .where(eq(channelSlugAliases.slug, input.slug)),
    db
      .insert(channels)
      .values({
        slug: input.slug,
        displayName: input.displayName,
        twitchId: input.twitchId ?? null,
        avatarUrl: input.avatarUrl ?? null,
        bannerUrl: input.bannerUrl ?? null,
        description: input.description ?? '',
        links: input.links ?? [],
      })
      .returning(),
  ])
  return toApiChannel(row!)
}

/**
 * Edits a channel. Renaming the slug keeps the old one as an alias, so
 * `/channels/<old>` redirects and API calls with the old slug still work.
 */
export async function updateChannel(
  db: Db,
  channel: Channel,
  raw: UpdateChannelInput,
): Promise<ApiChannel> {
  const input = updateChannelInput.parse(raw)
  const patch: Partial<typeof channels.$inferInsert> = {}
  if (input.displayName !== undefined) patch.displayName = input.displayName
  if (input.twitchId !== undefined) patch.twitchId = input.twitchId
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl
  if (input.bannerUrl !== undefined) patch.bannerUrl = input.bannerUrl
  if (input.description !== undefined) patch.description = input.description
  if (input.links !== undefined) patch.links = input.links

  const renamed = input.slug !== undefined && input.slug !== channel.slug
  if (renamed) {
    await assertSlugFree(db, input.slug!, channel.id)
    patch.slug = input.slug
  }
  if (patch.twitchId) await assertTwitchIdFree(db, patch.twitchId, channel.id)

  if (!Object.keys(patch).length) return toApiChannel(channel)

  const update = db
    .update(channels)
    .set(patch)
    .where(eq(channels.id, channel.id))
    .returning()
  if (!renamed) {
    const [row] = await update
    if (!row) throw new NotFoundError(`No channel "${channel.slug}"`)
    return toApiChannel(row)
  }

  const [, , row] = await db.batch([
    // The new slug can't also be an alias, whoever it pointed at.
    db
      .delete(channelSlugAliases)
      .where(eq(channelSlugAliases.slug, input.slug!)),
    db
      .insert(channelSlugAliases)
      .values({ slug: channel.slug, channelId: channel.id })
      .onConflictDoUpdate({
        target: channelSlugAliases.slug,
        set: { channelId: channel.id },
      }),
    update,
  ])
  if (!row[0]) throw new NotFoundError(`No channel "${channel.slug}"`)
  return toApiChannel(row[0])
}

export async function countChannelContent(db: Db, channelId: number) {
  const [[v], [s]] = await db.batch([
    db.select({ n: count() }).from(vods).where(eq(vods.channelId, channelId)),
    db.select({ n: count() }).from(shows).where(eq(shows.channelId, channelId)),
  ])
  return { vodCount: v?.n ?? 0, showCount: s?.n ?? 0 }
}

/**
 * Deletes a channel. Its slug aliases and the API tokens limited to it go
 * with it. A channel that still has VODs or shows is only deleted when
 * `moveToId` is given, and they are moved there first.
 */
export async function deleteChannel(
  db: Db,
  channel: Channel,
  opts: { moveToId?: number } = {},
) {
  const { vodCount, showCount } = await countChannelContent(db, channel.id)
  const deleteRow = db.delete(channels).where(eq(channels.id, channel.id))
  if (!vodCount && !showCount) {
    await deleteRow
    return { movedVods: 0, movedShows: 0 }
  }
  if (opts.moveToId === undefined) {
    throw new ChannelNotEmptyError(channel.slug, vodCount, showCount)
  }
  if (opts.moveToId === channel.id) {
    throw new ConflictError('Can’t move content to the channel being deleted')
  }
  // Moved shows go after the ones the other channel already has.
  const [last] = await db
    .select({ sort: max(shows.sort) })
    .from(shows)
    .where(eq(shows.channelId, opts.moveToId))
  const offset = (last?.sort ?? -1) + 1
  await db.batch([
    db
      .update(vods)
      .set({ channelId: opts.moveToId })
      .where(eq(vods.channelId, channel.id)),
    db
      .update(shows)
      .set({ channelId: opts.moveToId, sort: sql`${shows.sort} + ${offset}` })
      .where(eq(shows.channelId, channel.id)),
    deleteRow,
  ])
  return { movedVods: vodCount, movedShows: showCount }
}

/** Every VOD and show a channel has, fetched through the API. */
export async function listChannelContent(client: ApiClient, slug: string) {
  const channelVods: ApiVod[] = []
  for (;;) {
    const page = await client.listVods({
      channel: slug,
      limit: 500,
      offset: channelVods.length,
    })
    channelVods.push(...page)
    if (page.length < 500) break
  }
  const channelShows: ApiShowSummary[] = await client.listShows({
    channel: slug,
  })
  return { vods: channelVods, shows: channelShows }
}

/**
 * Deletes a channel's VODs (with their chat) and shows one at a time, so
 * each request stays small, then the channel itself.
 */
export async function deleteChannelWithContent(
  client: ApiClient,
  slug: string,
  opts: { onEvent?: (e: IngestEvent) => void; signal?: AbortSignal } = {},
) {
  const emit = opts.onEvent ?? (() => {})
  const { vods: channelVods, shows: channelShows } = await listChannelContent(
    client,
    slug,
  )
  if (channelVods.length) {
    emit({ type: 'step', message: `Deleting ${channelVods.length} VODs` })
    for (const [i, vod] of channelVods.entries()) {
      opts.signal?.throwIfAborted()
      emit({
        type: 'progress',
        label: 'VODs',
        done: i,
        total: channelVods.length,
      })
      await client.deleteVod(vod.slug)
    }
    emit({
      type: 'progress',
      label: 'VODs',
      done: channelVods.length,
      total: channelVods.length,
    })
  }
  if (channelShows.length) {
    emit({ type: 'step', message: `Deleting ${channelShows.length} shows` })
    for (const show of channelShows) {
      opts.signal?.throwIfAborted()
      await client.deleteShow(show.slug)
    }
  }
  opts.signal?.throwIfAborted()
  emit({ type: 'step', message: `Deleting channel ${slug}` })
  await client.deleteChannel(slug)
  return { deletedVods: channelVods.length, deletedShows: channelShows.length }
}
