import type { Store } from '@owotv/core'
import { createDb } from '@owotv/db'
import { parse } from 'jsonc-parser'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPlatformProxy } from 'wrangler'

const configPath = fileURLToPath(
  new URL('../../web/wrangler.jsonc', import.meta.url),
)
const webDir = dirname(configPath)

export async function openStore(
  opts: { remote?: boolean } = {},
): Promise<Store & { dispose: () => Promise<void> }> {
  let path = configPath
  if (opts.remote) {
    const config = parse(await readFile(configPath, 'utf8')) as {
      d1_databases?: Array<{ remote?: boolean; migrations_dir?: string }>
      r2_buckets?: Array<{ remote?: boolean }>
    }
    for (const b of [
      ...(config.d1_databases ?? []),
      ...(config.r2_buckets ?? []),
    ]) {
      b.remote = true
    }
    for (const d of config.d1_databases ?? []) delete d.migrations_dir
    path = join(webDir, '.wrangler', 'owotv-remote.json')
    await writeFile(path, JSON.stringify(config))
  }

  const cleanup = () =>
    path !== configPath ? rm(path, { force: true }) : Promise.resolve()
  const proxy = await getPlatformProxy<{
    DB: unknown
    BUCKET: Store['bucket']
  }>({
    configPath: path,
    envFiles: [],
    persist: { path: join(webDir, '.wrangler', 'state', 'v3') },
  }).catch(async (err) => {
    await cleanup()
    throw err
  })

  return {
    db: createDb(proxy.env.DB as Parameters<typeof createDb>[0]),
    bucket: proxy.env.BUCKET,
    dispose: async () => {
      await proxy.dispose()
      await cleanup()
    },
  }
}
