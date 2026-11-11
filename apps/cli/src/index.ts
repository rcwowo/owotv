#!/usr/bin/env -S npx tsx
import { migrate, usage as migrateUsage } from './commands/migrate'

const commands: Record<string, (argv: string[]) => Promise<number>> = {
  migrate,
}

const usage = `owotv <command>

Commands:
${migrateUsage.split('\n')[0]}`

const [name, ...rest] = process.argv.slice(2)
const command = name ? commands[name] : undefined

if (!command) {
  console.log(usage)
  process.exit(name && name !== '--help' && name !== '-h' ? 1 : 0)
}

try {
  process.exit(await command(rest))
} catch (err) {
  console.error(`error: ${(err as Error).message}`)
  process.exit(1)
}
