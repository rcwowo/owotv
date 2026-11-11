#!/usr/bin/env -S npx tsx
import { ApiRequestError } from '@owotv/core'
import { channel } from './commands/channel'
import { chat } from './commands/chat'
import { login, whoami } from './commands/login'
import { migrate, usage as migrateUsage } from './commands/migrate'
import { token } from './commands/token'
import { vod } from './commands/vod'

const commands = {
  login,
  whoami,
  vod,
  chat,
  channel,
  token,
  migrate: {
    summary: 'One-time import from Baserow',
    usage: migrateUsage,
    run: migrate,
  },
}

const usage = `owotv <command>

${Object.entries(commands)
  .map(([name, c]) => `  ${name.padEnd(10)} ${c.summary}`)
  .join('\n')}

Run \`owotv <command> --help\` for details.`

const [name, ...rest] = process.argv.slice(2)
const command = name ? commands[name as keyof typeof commands] : undefined

if (!command) {
  console.log(usage)
  process.exit(name && name !== '--help' && name !== '-h' ? 1 : 0)
}

try {
  process.exit(await command.run(rest))
} catch (err) {
  const message =
    err instanceof ApiRequestError
      ? `${err.message} (HTTP ${err.status})`
      : (err as Error).message
  if (rest.includes('--json')) {
    console.log(JSON.stringify({ error: message }))
  } else {
    console.error(`error: ${message}`)
  }
  process.exit(1)
}
