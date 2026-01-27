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

export const collections = { vods }
