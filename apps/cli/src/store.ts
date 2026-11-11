import type { Store } from '@owotv/core'
import { createDb } from '@owotv/db'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'

const configPath = resolve(import.meta.dir, '../../web/wrangler.jsonc')
const webDir = dirname(configPath)

export async function openStore(
  opts: { remote?: boolean } = {},
): Promise<Store & { dispose: () => Promise<void> }> {
  let path = configPath
  if (opts.remote) {
    const config = Bun.JSONC.parse(await Bun.file(configPath).text()) as {
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
    await Bun.write(path, JSON.stringify(config))
  }

  const proxy = await getPlatformProxy<{
    DB: unknown
    BUCKET: Store['bucket']
  }>({
    configPath: path,
    persist: { path: join(webDir, '.wrangler', 'state', 'v3') },
  })

  return {
    db: createDb(proxy.env.DB as Parameters<typeof createDb>[0]),
    bucket: proxy.env.BUCKET,
    dispose: async () => {
      await proxy.dispose()
      if (path !== configPath) await rm(path, { force: true })
    },
  }
}
