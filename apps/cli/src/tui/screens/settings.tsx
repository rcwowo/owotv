import { ApiClient } from '@owotv/core'
import { Box, Text } from 'ink'
import { useState } from 'react'
import { chatCacheDir } from '../../chat-source'
import { configPath, saveConfig } from '../../config'
import { errorMessage } from '../../output'
import { ErrorText, Form, Frame, Loading } from '../components'
import { useApp } from '../context'

export function Settings() {
  const { config, setConfig, pop } = useApp()
  const [values, setValues] = useState<Record<string, string>>({
    url: config.url ?? '',
    token: config.token ?? '',
  })
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({})

  const save = async () => {
    setState({ busy: true })
    try {
      const url = values.url?.trim()
      const token = values.token?.trim() || undefined
      if (!url) throw new Error('Enter the site URL.')
      if (!/^https?:\/\/[^/]/.test(url)) {
        throw new Error('The URL must start with http:// or https://')
      }
      const client = new ApiClient(url, token)
      if (token) await client.whoami()
      else await client.listChannels()
      const next = { url: client.baseUrl, token }
      await saveConfig(next)
      setConfig(next)
      pop()
    } catch (err) {
      setState({ error: errorMessage(err) })
    }
  }

  return (
    <Frame title="Settings" hints="↑↓/tab move · enter next/save · esc back">
      <Form
        fields={[
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
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Config: {configPath}</Text>
        <Text dimColor>Chat cache: {chatCacheDir}</Text>
        <Text dimColor>Create tokens with `owotv token create --remote`.</Text>
      </Box>
    </Frame>
  )
}
