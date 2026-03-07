import { defineCollection, z } from 'astro:content'

const vods = defineCollection({
  loader: async () => {
    const response = await fetch(
      'https://db.lab.rcw.lol/api/database/rows/table/773/?user_field_names=true&view_id=3413',
      {
        headers: {
          Authorization: `Token ${import.meta.env.BASEROW_DB_TOKEN}`,
        },
      },
    )
    const data = await response.json()

    return data.results.map((item: any) => ({
      ...item,
      'id': item['UUID'],
    }))
  },
  schema: z.object({
    'Title': z.string(),
    'Stream Date': z.coerce.date(),
    'Duration': z.string(),
    'Game': z.string(),
    'Game Cover URL': z.string().url(),
    'VOD URL': z.string().url(),
    'Thumbnail URL': z.string().url(),
    'Chat Replay Path': z.preprocess(
      (val) => (val === '' ? undefined : val),
      z.string().optional(),
    ),
  }),
})

const shows = defineCollection({
  loader: async () => {
    const response = await fetch(
      'https://db.lab.rcw.lol/api/database/rows/table/774/?user_field_names=true',
      {
        headers: {
          Authorization: `Token ${import.meta.env.BASEROW_DB_TOKEN}`,
        },
      },
    )
    const data = await response.json()

    return data.results.map((item: any) => ({
      ...item,
      'id': String(item.id),
    }))
  },
  schema: z.object({
    'order': z.string(),
    'Name': z.string(),
    'Description': z.string(),
    'Cover URL': z.string().url(),
    'Logo URL': z.string().url(),
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
    const response = await fetch(
      'https://db.lab.rcw.lol/api/database/rows/table/779/?user_field_names=true',
      {
        headers: {
          Authorization: `Token ${import.meta.env.BASEROW_DB_TOKEN}`,
        },
      },
    )
    const data = await response.json()

    return data.results.map((item: any) => ({
      ...item,
      'id': String(item.id),
    }))
  },
  schema: z.object({
    'order': z.string(),
    'Title': z.string(),
    'Duration': z.string(),
    'Air Date': z.coerce.date(),
    'Thumbnail URL': z.string().url(),
    'Video URL': z.string().url(),
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
