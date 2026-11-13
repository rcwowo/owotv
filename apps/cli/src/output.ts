import { ApiRequestError, type IngestEvent } from '@owotv/core'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'

export interface Output {
  json: boolean
  log: (message: string) => void
  result: (data: unknown, human?: () => void) => void
  onEvent: (event: IngestEvent) => void
}

export async function confirm(question: string, yes: boolean) {
  if (yes) return
  if (!process.stdin.isTTY) {
    throw new Error(`${question} Pass --yes to confirm.`)
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = await rl.question(`${question} (y/N) `)
    if (!/^y(es)?$/i.test(answer.trim())) throw new Error('Cancelled.')
  } finally {
    rl.close()
  }
}

/** Asks a yes/no question. Returns false without a terminal to ask on. */
export async function askYesNo(question: string) {
  if (!process.stdin.isTTY) return false
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  try {
    const answer = await rl.question(`${question} (y/N) `)
    return /^y(es)?$/i.test(answer.trim())
  } finally {
    rl.close()
  }
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiRequestError) {
    const issue = err.body.issues?.[0] as
      { path?: unknown[]; message?: string } | undefined
    const detail = issue?.message
      ? `: ${issue.path?.length ? `${issue.path.join('.')} ` : ''}${issue.message}`
      : ''
    return `${err.message}${detail} (HTTP ${err.status})`
  }
  return err instanceof Error ? err.message : String(err)
}

export function output(json: boolean): Output {
  const log = json ? () => {} : (message: string) => console.error(message)
  let lastLabel = ''
  let lastStep = -1
  return {
    json,
    log,
    result(data, human) {
      if (json || !human) console.log(JSON.stringify(data, null, 2))
      else human()
    },
    onEvent(e) {
      if (e.type === 'step') log(`→ ${e.message}`)
      else if (e.type === 'warn') log(`  ! ${e.message}`)
      else {
        const step = Math.floor((e.done / e.total) * 10)
        if (e.label !== lastLabel || step > lastStep) {
          lastLabel = e.label
          lastStep = step
          log(
            `  ${e.label} ${e.unit === '%' ? `${e.done}%` : `${e.done}/${e.total}`}`,
          )
        }
      }
    },
  }
}

const cell = (row: object, key: string) =>
  String((row as Record<string, unknown>)[key] ?? '')

export function table<T extends object>(rows: T[], columns: string[]) {
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => cell(r, c).length)),
  )
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]!))
      .join('  ')
      .trimEnd()
  console.log(line(columns.map((c) => c.toUpperCase())))
  for (const r of rows) console.log(line(columns.map((c) => cell(r, c))))
}

export async function readJsonFile<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch (err) {
    throw new Error(`Could not read ${path}: ${(err as Error).message}`)
  }
}

export async function readStdin() {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8').trim()
}
