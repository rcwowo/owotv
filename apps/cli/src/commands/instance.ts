import { parseArgs } from 'node:util'
import { loadConfig, loadConfigFile, updateConfigFile } from '../config'
import { output, table } from '../output'
import { runGroup, type CommandGroup } from './types'

const jsonOnly = (argv: string[]) =>
  parseArgs({
    args: argv,
    allowPositionals: true,
    options: { json: { type: 'boolean', default: false } },
  })

async function requireInstance(name: string | undefined) {
  if (!name) throw new Error('Pass the instance name.')
  const file = await loadConfigFile()
  if (!file.instances[name]) {
    throw new Error(
      `No instance "${name}". Run \`owotv instance list\` to see them.`,
    )
  }
  return file
}

const commands: CommandGroup = {
  list: {
    summary: 'List saved instances',
    usage: 'owotv instance list [--json]',
    async run(argv) {
      const { values } = jsonOnly(argv)
      const out = output(values.json)
      const file = await loadConfigFile()
      const { instance: active } = await loadConfig()
      const rows = Object.entries(file.instances).map(([name, i]) => ({
        current: name === active ? '*' : '',
        name,
        url: i.url,
        token: i.token ? 'yes' : 'no',
      }))
      out.result(rows, () => {
        if (!rows.length) {
          out.log('No instances yet. Run `owotv login --url <url>`.')
        } else {
          table(rows, ['current', 'name', 'url', 'token'])
        }
      })
      return 0
    },
  },
  use: {
    summary: 'Switch to a saved instance',
    usage: `owotv instance use <name> [--json]

To use one for a single command instead, pass --instance <name> or set
OWOTV_INSTANCE.`,
    async run(argv) {
      const { values, positionals } = jsonOnly(argv)
      const out = output(values.json)
      const name = positionals[0]
      await requireInstance(name)
      await updateConfigFile((f) => {
        f.current = name
      })
      out.result({ current: name }, () => out.log(`Now using "${name}".`))
      if (process.env.OWOTV_URL || process.env.OWOTV_TOKEN) {
        out.log(
          'Note: OWOTV_URL / OWOTV_TOKEN are set and still take priority.',
        )
      }
      return 0
    },
  },
  rename: {
    summary: 'Rename a saved instance',
    usage: 'owotv instance rename <name> <new name> [--json]',
    async run(argv) {
      const { values, positionals } = jsonOnly(argv)
      const out = output(values.json)
      const [from, to] = positionals.map((p) => p.trim())
      const file = await requireInstance(from)
      if (!to) throw new Error('Pass the new name.')
      if (to !== from && file.instances[to]) {
        throw new Error(`An instance called "${to}" already exists.`)
      }
      await updateConfigFile((f) => {
        f.instances[to] = f.instances[from!]!
        if (to !== from) delete f.instances[from!]
        if (f.current === from) f.current = to
      })
      out.result({ from, to }, () => out.log(`Renamed "${from}" to "${to}".`))
      return 0
    },
  },
  remove: {
    summary: 'Forget a saved instance and its token',
    usage: 'owotv instance remove <name> [--json]',
    async run(argv) {
      const { values, positionals } = jsonOnly(argv)
      const out = output(values.json)
      const name = positionals[0]
      await requireInstance(name)
      const file = await updateConfigFile((f) => {
        delete f.instances[name!]
      })
      out.result({ removed: name, current: file.current ?? null }, () =>
        out.log(
          `Removed "${name}".${file.current ? '' : ' No instance is selected now; run `owotv instance use <name>`.'}`,
        ),
      )
      return 0
    },
  },
}

export const instance = {
  summary: 'List, switch, rename or remove saved sites',
  usage: 'owotv instance <list|use|rename|remove>',
  run: (argv: string[]) => runGroup(commands, 'instance', argv),
}
