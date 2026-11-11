import type { IngestEvent } from '@owotv/core'
import { readFile } from 'node:fs/promises'

export interface Output {
  json: boolean
  log: (message: string) => void
  result: (data: unknown, human?: () => void) => void
  onEvent: (event: IngestEvent) => void
}

export function output(json: boolean): Output {
  const log = json ? () => {} : (message: string) => console.error(message)
  let lastLabel = ''
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
      else if (
        e.done === e.total ||
        e.label !== lastLabel ||
        e.done % 10 === 0
      ) {
        lastLabel = e.label
        log(`  ${e.label} ${e.done}/${e.total}`)
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
