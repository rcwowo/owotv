import { channel } from './commands/channel'
import { chat } from './commands/chat'
import { instance } from './commands/instance'
import { login, whoami } from './commands/login'
import { episode, season, show } from './commands/show'
import { token } from './commands/token'
import { vod } from './commands/vod'
import { errorMessage } from './output'

const commands = {
  login,
  whoami,
  instance,
  vod,
  chat,
  channel,
  show,
  season,
  episode,
  token,
}

const usage = `owotv <command>

${Object.entries(commands)
  .map(([name, c]) => `  ${name.padEnd(10)} ${c.summary}`)
  .join('\n')}

Run \`owotv\` with no command (or \`owotv tui\`) for the interactive TUI.
Run \`owotv <command> --help\` for details.
Add \`--instance <name>\` to any command to use a saved instance other than the current one.`

/** Pulls `--instance <name>` out of the arguments, wherever it appears. */
function takeInstanceFlag(args: string[]) {
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--instance') {
      const value = args[++i]
      if (!value) {
        console.error('error: --instance needs a name')
        process.exit(1)
      }
      process.env.OWOTV_INSTANCE = value
    } else if (arg.startsWith('--instance=')) {
      process.env.OWOTV_INSTANCE = arg.slice('--instance='.length)
    } else rest.push(arg)
  }
  return rest
}

const [name, ...rest] = takeInstanceFlag(process.argv.slice(2))
const command = name ? commands[name as keyof typeof commands] : undefined

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

if (name === 'tui' || (!name && interactive)) {
  try {
    if (!interactive) throw new Error('The TUI needs an interactive terminal.')
    const { runTui } = await import('./tui')
    process.exit(await runTui())
  } catch (err) {
    console.error(`error: ${errorMessage(err)}`)
    process.exit(1)
  }
}

if (!command) {
  console.log(usage)
  process.exit(name && name !== '--help' && name !== '-h' ? 1 : 0)
}

try {
  process.exit(await command.run(rest))
} catch (err) {
  const message = errorMessage(err)
  if (rest.includes('--json')) {
    console.log(JSON.stringify({ error: message }))
  } else {
    console.error(`error: ${message}`)
  }
  process.exit(1)
}
