import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'

type BaserowListResponse<T> = {
  next: string | null
  results: T[]
}

async function fetchAllBaserowRows<T>(path: string): Promise<T[]> {
  const results: T[] = []
  let nextUrl: string | null = new URL(path, 'https://db.lab.rcw.lol').toString()

  while (nextUrl) {
    console.log(`Fetching Baserow rows from: ${nextUrl}`)

    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Token ${import.meta.env.BASEROW_DB_TOKEN}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch Baserow rows: ${response.status}`)
    }

    const data: BaserowListResponse<T> = await response.json()
    results.push(...data.results)
    // baserow might return http URLs but they no work
    nextUrl = data.next ? data.next.replace(/^http:/, 'https:') : null
  }

  return results
}

const vods = defineCollection({
  loader: async () => {
    const data = await fetchAllBaserowRows<any>(
      '/api/database/rows/table/773/?user_field_names=true&view_id=3413',
    )

    return data.map((item: any) => ({
      ...item,
      'id': item['UUID'],
    }))
  },
  schema: z.object({
    'Title': z.string(),
    'Stream Date': z.coerce.date(),
    'Duration': z.string(),
    'Game': z.string(),
    'Game Cover URL': z.url(),
    'VOD URL': z.url(),
    'Thumbnail URL': z.url(),
    'Chat Replay Path': z.preprocess(
      (val) => (val === '' ? undefined : val),
      z.string().optional(),
    ),
  }),
})

const shows = defineCollection({
  loader: async () => {
    const data = await fetchAllBaserowRows<any>(
      '/api/database/rows/table/774/?user_field_names=true',
    )

    return data.map((item: any) => ({
      ...item,
      'id': String(item.id),
    }))
  },
  schema: z.object({
    'order': z.string(),
    'Name': z.string(),
    'Description': z.string(),
    'Cover URL': z.url(),
    'Logo URL': z.url(),
    'Episodes': z.array(
      z.object({
        id: z.number(),
        value: z.string(),
        order: z.string(),
      }),
    ),
  }),
})

const episodes = defineCollection({
  loader: async () => {
    const data = await fetchAllBaserowRows<any>(
      '/api/database/rows/table/779/?user_field_names=true',
    )

    return data.map((item: any) => ({
      ...item,
      'id': String(item.id),
    }))
  },
  schema: z.object({
    'order': z.string(),
    'Title': z.string(),
    'Duration': z.string(),
    'Air Date': z.coerce.date(),
    'Thumbnail URL': z.url(),
    'Video URL': z.url(),
    'Season': z.string(),
    'Shows': z.array(
      z.object({
        id: z.number(),
        value: z.string(),
        order: z.string(),
      }),
    ),
  }),
})

export const collections = { vods, shows, episodes }
