export interface Command {
  summary: string
  usage: string
  run: (argv: string[]) => Promise<number>
}

export type CommandGroup = Record<string, Command>

export function runGroup(group: CommandGroup, name: string, argv: string[]) {
  const [sub, ...rest] = argv
  const command = sub ? group[sub] : undefined
  if (!command) {
    if (sub && sub !== '--help' && sub !== '-h') {
      throw new Error(
        `Unknown command "${name} ${sub}". Run \`owotv ${name} --help\`.`,
      )
    }
    const lines = Object.values(group).map((c) => c.usage.split('\n')[0]!)
    const width = Math.max(...lines.map((l) => l.length))
    const help = `owotv ${name} <command>\n\n${Object.values(group)
      .map((c, i) => `  ${lines[i]!.padEnd(width)}  ${c.summary}`)
      .join('\n')}`
    if (sub) console.log(help)
    else console.error(help)
    return Promise.resolve(sub ? 0 : 1)
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(command.usage)
    return Promise.resolve(0)
  }
  return command.run(rest)
}
