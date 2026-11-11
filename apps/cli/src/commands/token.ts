import { createToken, findChannel, listTokens, revokeToken } from '@owotv/core'
import { tokenRoles, type TokenRole } from '@owotv/db'
import { parseArgs } from 'node:util'
import { output, table } from '../output'
import { openStore } from '../store'
import { runGroup, type CommandGroup } from './types'

const remoteOption = {
  remote: { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
} as const

async function withStore<T>(
  remote: boolean,
  fn: (store: Awaited<ReturnType<typeof openStore>>) => Promise<T>,
) {
  const store = await openStore({ remote })
  try {
    return await fn(store)
  } finally {
    await store.dispose()
  }
}

const commands: CommandGroup = {
  create: {
    summary: 'Create an API token (shown once)',
    usage: `owotv token create --name <name> [--role read|write|admin] [--channel <slug>] [--remote]

Talks to D1 directly through wrangler, so it works before any token exists.
--remote targets the deployed database; without it, local dev state.`,
    async run(argv) {
      const { values } = parseArgs({
        args: argv,
        options: {
          ...remoteOption,
          name: { type: 'string' },
          role: { type: 'string', default: 'write' },
          channel: { type: 'string' },
        },
      })
      const out = output(values.json)
      if (!values.name) throw new Error('Pass --name <name>.')
      if (!tokenRoles.includes(values.role as TokenRole)) {
        throw new Error(`--role must be one of: ${tokenRoles.join(', ')}`)
      }
      const token = await withStore(values.remote, async ({ db }) => {
        let channelId: number | null = null
        if (values.channel) {
          const channel = await findChannel(db, values.channel)
          if (!channel) throw new Error(`No channel "${values.channel}"`)
          channelId = channel.id
        }
        return createToken(db, {
          name: values.name!,
          role: values.role as TokenRole,
          channelId,
        })
      })
      out.result({ name: values.name, role: values.role, token }, () => {
        out.log(
          `Created "${values.name}" (${values.role}). It won't be shown again:`,
        )
        console.log(token)
      })
      return 0
    },
  },
  list: {
    summary: 'List API tokens',
    usage: 'owotv token list [--remote] [--json]',
    async run(argv) {
      const { values } = parseArgs({ args: argv, options: remoteOption })
      const out = output(values.json)
      const tokens = await withStore(values.remote, ({ db }) => listTokens(db))
      out.result(tokens, () =>
        table(
          tokens.map((t) => ({
            ...t,
            channelId: t.channelId ?? 'all',
            lastUsedAt: t.lastUsedAt?.toISOString().slice(0, 16) ?? 'never',
            status: t.revokedAt ? 'revoked' : 'active',
          })),
          ['id', 'name', 'role', 'channelId', 'lastUsedAt', 'status'],
        ),
      )
      return 0
    },
  },
  revoke: {
    summary: 'Revoke an API token',
    usage: 'owotv token revoke <id> --yes [--remote]',
    async run(argv) {
      const { values, positionals } = parseArgs({
        args: argv,
        options: { ...remoteOption, yes: { type: 'boolean', default: false } },
        allowPositionals: true,
      })
      const out = output(values.json)
      if (!/^\d+$/.test(positionals[0] ?? '')) {
        throw new Error('Pass the token id.')
      }
      const id = Number(positionals[0])
      if (!values.yes) throw new Error('Pass --yes to confirm.')
      const revoked = await withStore(values.remote, ({ db }) =>
        revokeToken(db, id),
      )
      if (!revoked) throw new Error(`No active token with id ${id}`)
      out.result({ id, revoked: true }, () => out.log(`Revoked token ${id}.`))
      return 0
    },
  },
}

export const token = {
  summary: 'Manage API tokens (direct D1 access)',
  usage: 'owotv token <create|list|revoke>',
  run: (argv: string[]) => runGroup(commands, 'token', argv),
}
