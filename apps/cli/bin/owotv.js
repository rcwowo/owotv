#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { register } from 'tsx/esm/api'

const envFile = fileURLToPath(new URL('../../web/.env', import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)

register({
  tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
})
await import('../src/index.ts')
