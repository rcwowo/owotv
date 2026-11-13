import { ApiClient } from '@owotv/core'
import { Box, Text } from 'ink'
import { useState } from 'react'
import { chatCacheDir } from '../../chat-source'
import {
  configPath,
  instanceNameFor,
  loadConfigFile,
  normalizeUrl,
  resolveConfig,
  updateConfigFile,
  type ConfigFile,
} from '../../config'
import { errorMessage } from '../../output'
import {
  Confirm,
  ErrorText,
  Form,
  Frame,
  Loading,
  SelectList,
  useBodyHeight,
  type ListItem,
} from '../components'
import { useApp, useKeys } from '../context'
import { useAsync } from '../hooks'

/** Resolves the config after a change made in the TUI. */
function resolveFromTui(file: ConfigFile) {
  // A --instance flag only picks the instance the TUI starts on.
  delete process.env.OWOTV_INSTANCE
  return resolveConfig(file)
}

const hostOf = (url: string) => URL.parse(url)?.host ?? url

export function Instances() {
  const { config, connect, push, pop, revision, changed } = useApp()
  const file = useAsync(() => loadConfigFile(), [revision])
  const [confirmDelete, setConfirmDelete] = useState<string>()
  const [error, setError] = useState<string>()
  const height = useBodyHeight(6)

  useKeys(
    (_, key) => {
      if (key.escape) pop()
    },
    { isActive: !confirmDelete },
  )

  const use = async (name: string) => {
    try {
      const next = await updateConfigFile((f) => {
        f.current = name
      })
      connect(resolveFromTui(next))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const remove = async (name: string) => {
    setConfirmDelete(undefined)
    try {
      const next = await updateConfigFile((f) => {
        delete f.instances[name]
        if (!f.current) f.current = Object.keys(f.instances)[0]
      })
      changed()
      if (name === config.instance) connect(resolveFromTui(next))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const instances = Object.entries(file.data?.instances ?? {})
  const items: ListItem<string | null>[] = [
    ...instances.map(([name, i]) => ({
      key: name,
      label: `${name === config.instance ? '● ' : '  '}${name}`,
      detail: [hostOf(i.url) !== name && hostOf(i.url), !i.token && 'read-only']
        .filter(Boolean)
        .join(' · '),
      value: name,
    })),
    { key: '+', label: '+ Add an instance', value: null },
  ]

  return (
    <Frame
      title="Instances"
      hints={
        confirmDelete
          ? ''
          : '↑↓ move · enter switch · e edit · d delete · esc back'
      }
    >
      {config.envOverride ? (
        <Box marginBottom={1}>
          <Text color="yellow">
            OWOTV_URL or OWOTV_TOKEN is set, so it overrides the instance you
            pick here.
          </Text>
        </Box>
      ) : null}
      {file.error ? <ErrorText>{file.error}</ErrorText> : null}
      {file.loading && !file.data ? <Loading /> : null}

      {file.data ? (
        <SelectList
          items={items}
          height={height}
          isActive={!confirmDelete}
          onSelect={({ value }) =>
            value ? void use(value) : push({ name: 'instance' })
          }
          onKey={(input, { value }) => {
            if (!value) return
            setError(undefined)
            if (input === 'e') push({ name: 'instance', edit: value })
            else if (input === 'd') setConfirmDelete(value)
          }}
        />
      ) : null}

      {confirmDelete ? (
        <Box marginTop={1}>
          <Confirm
            message={`Forget "${confirmDelete}" and its token?`}
            onYes={() => void remove(confirmDelete)}
            onNo={() => setConfirmDelete(undefined)}
          />
        </Box>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Config: {configPath}</Text>
        <Text dimColor>Chat cache: {chatCacheDir}</Text>
        <Text dimColor>Create tokens with `owotv token create --remote`.</Text>
      </Box>
    </Frame>
  )
}

export function InstanceForm({ edit }: { edit?: string }) {
  const { connect, pop, changed } = useApp()
  const file = useAsync(() => loadConfigFile(), [])
  const [values, setValues] = useState<Record<string, string>>()
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({})

  const existing = edit ? file.data?.instances[edit] : undefined
  if (file.data && !values) {
    setValues({
      name: edit ?? '',
      url: existing?.url ?? '',
      token: existing?.token ?? '',
    })
  }

  const save = async () => {
    if (!values || !file.data) return
    setState({ busy: true })
    try {
      const url = values.url?.trim()
      if (!url) throw new Error('Enter the site URL.')
      const baseUrl = normalizeUrl(url)
      const name = values.name?.trim() || instanceNameFor(baseUrl)
      if (name !== edit && file.data.instances[name]) {
        throw new Error(`An instance called "${name}" already exists.`)
      }
      const token = values.token?.trim() || undefined
      const client = new ApiClient(baseUrl, token)
      if (token) await client.whoami()
      else await client.listChannels()

      const next = await updateConfigFile((f) => {
        if (edit && edit !== name) delete f.instances[edit]
        f.instances[name] = { url: client.baseUrl, token }
        if (!edit || f.current === edit || !f.current) f.current = name
      })
      changed()
      // New instances become current; edits to the current one reconnect.
      if (next.current === name) {
        connect(resolveFromTui(next))
      } else {
        pop()
      }
    } catch (err) {
      setState({ error: errorMessage(err) })
    }
  }

  const title = edit ? `Edit ${edit}` : 'Add an instance'
  if (!values) {
    return (
      <Frame title={title} hints="esc back">
        {file.error ? <ErrorText>{file.error}</ErrorText> : <Loading />}
      </Frame>
    )
  }

  return (
    <Frame title={title} hints="↑↓/tab move · enter next/save · esc back">
      <Form
        fields={[
          {
            key: 'name',
            label: 'Name',
            placeholder: 'defaults to the site’s host',
          },
          {
            key: 'url',
            label: 'Site URL',
            placeholder: 'https://owo.example.com',
          },
          {
            key: 'token',
            label: 'API token',
            placeholder: 'owotv_… (blank for read-only)',
            mask: true,
          },
        ]}
        values={values}
        isActive={!state.busy}
        onChange={setValues}
        onSubmit={() => void save()}
        onCancel={pop}
      />
      <Box marginTop={1} flexDirection="column">
        {state.busy ? <Loading label="Checking connection" /> : null}
        {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      </Box>
    </Frame>
  )
}
