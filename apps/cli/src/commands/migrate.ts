import { migrateFromBaserow, type MigrateEvent } from '@owotv/core'
import { parseArgs } from 'node:util'
import { openStore } from '../store'

export const usage = `owotv migrate baserow [options]

Copy VODs, shows and chat logs from Baserow + S3 into D1 + R2.

Options:
  --remote     Write to the deployed D1/R2 instead of local dev state
  --reset      Delete existing data first
  --no-emotes  Skip the 7TV emote snapshot
  --json       Print only the result as JSON

Env: BASEROW_DB_TOKEN, S3_BASE_URL, BASEROW_URL (default https://db.lab.rcw.lol)`

export async function migrate(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      remote: { type: 'boolean', default: false },
      reset: { type: 'boolean', default: false },
      'no-emotes': { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })

  if (values.help || positionals[0] !== 'baserow') {
    console.log(usage)
    return values.help ? 0 : 1
  }

  const token = process.env.BASEROW_DB_TOKEN
  const chatBaseUrl = process.env.S3_BASE_URL
  if (!token || !chatBaseUrl) {
    throw new Error('BASEROW_DB_TOKEN and S3_BASE_URL must be set.')
  }

  const log = values.json ? () => {} : (msg: string) => console.error(msg)
  let lastLabel = ''
  const onEvent = (e: MigrateEvent) => {
    if (e.type === 'step') log(`→ ${e.message}`)
    else if (e.type === 'warn') log(`  ! ${e.message}`)
    else if (e.done === e.total || e.label !== lastLabel || e.done % 10 === 0) {
      lastLabel = e.label
      log(`  ${e.label} ${e.done}/${e.total}`)
    }
  }

  log(`Target: ${values.remote ? 'REMOTE D1/R2' : 'local dev state'}`)
  const store = await openStore({ remote: values.remote })
  try {
    const result = await migrateFromBaserow(
      store,
      {
        baseUrl: process.env.BASEROW_URL ?? 'https://db.lab.rcw.lol',
        token,
        chatBaseUrl,
        vodsPath:
          '/api/database/rows/table/773/?user_field_names=true&view_id=3413',
        showsPath: '/api/database/rows/table/774/?user_field_names=true',
        episodesPath: '/api/database/rows/table/779/?user_field_names=true',
      },
      { reset: values.reset, emotes: !values['no-emotes'], onEvent },
    )

    if (values.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      const { warnings, ...counts } = result
      log('\nDone.')
      for (const [k, v] of Object.entries(counts)) log(`  ${k}: ${v}`)
      if (warnings.length) log(`  warnings: ${warnings.length} (listed above)`)
    }
    return 0
  } finally {
    await store.dispose()
  }
}
