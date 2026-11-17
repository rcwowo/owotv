import { Box, Text, useWindowSize } from 'ink'
import Spinner from 'ink-spinner'
import TextInput from 'ink-text-input'
import { useEffect, useState, type ReactNode } from 'react'
import { useApp, useKeys, useScreenActive } from './context'
import type { TaskState } from './hooks'

export const ACCENT = '#ed5fa6'

export function Frame({
  title,
  hints,
  children,
}: {
  title?: string
  hints?: string
  children: ReactNode
}) {
  const { config, me, meError } = useApp()
  const { rows } = useWindowSize()
  const host = config.url
    ? (URL.parse(config.url)?.host ?? config.url)
    : 'not connected'
  const where =
    config.instance && config.instance !== host
      ? `${config.instance} (${host})`
      : host
  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Box justifyContent="space-between" gap={2}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">
            <Text bold color={ACCENT}>
              owoTV
            </Text>
            {title ? <Text dimColor> › {title}</Text> : null}
          </Text>
        </Box>
        <Box flexShrink={0}>
          <Text dimColor>
            {where}
            {me
              ? ` · ${me.name} (${me.role}${me.channel ? `, ${me.channel}` : ''})`
              : ''}
            {meError ? <Text color="red"> · sign-in failed</Text> : null}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={1} overflow="hidden">
        {children}
      </Box>
      {hints ? (
        <Text dimColor wrap="truncate-end">
          {hints}
        </Text>
      ) : null}
    </Box>
  )
}

export function useBodyHeight(reserved = 0) {
  const { rows } = useWindowSize()
  return Math.max(3, rows - 4 - reserved)
}

export interface ListItem<T> {
  key: string
  label: string
  detail?: string
  value: T
  dim?: boolean
}

export function SelectList<T>({
  items,
  onSelect,
  height,
  isActive = true,
  empty = 'Nothing here yet.',
  onKey,
}: {
  items: ListItem<T>[]
  onSelect: (item: ListItem<T>) => void
  /** Other keys pressed while an item is highlighted */
  onKey?: (input: string, item: ListItem<T>) => void
  height: number
  isActive?: boolean
  empty?: string
}) {
  const [index, setIndex] = useState(0)
  const max = items.length - 1

  useEffect(() => {
    if (index > max || index < 0) setIndex(Math.max(0, Math.min(index, max)))
  }, [index, max])

  useKeys(
    (input, key) => {
      const move = (to: number) => setIndex(Math.max(0, Math.min(max, to)))
      if (key.upArrow || input === 'k') move(index - 1)
      else if (key.downArrow || input === 'j') move(index + 1)
      else if (key.pageUp) move(index - height)
      else if (key.pageDown) move(index + height)
      else if (key.home || input === 'g') move(0)
      else if (key.end || input === 'G') move(max)
      else if (key.return && items[index]) onSelect(items[index])
      else if (onKey && input && items[index]) onKey(input, items[index])
    },
    { isActive },
  )

  if (!items.length) return <Text dimColor>{empty}</Text>

  const rows = Math.min(height, items.length)
  const start = Math.max(
    0,
    Math.min(index - Math.floor(rows / 2), items.length - rows),
  )
  const visible = items.slice(start, start + rows)

  return (
    <Box flexDirection="column">
      {visible.map((item, i) => {
        const selected = start + i === index
        return (
          <Box key={item.key} gap={1}>
            <Text color={ACCENT}>{selected ? '›' : ' '}</Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text
                wrap="truncate-end"
                bold={selected}
                dimColor={item.dim && !selected}
                color={selected ? ACCENT : undefined}
              >
                {item.label}
              </Text>
            </Box>
            {item.detail ? (
              <Box flexShrink={0}>
                <Text dimColor>{item.detail}</Text>
              </Box>
            ) : null}
          </Box>
        )
      })}
      {items.length > rows ? (
        <Text dimColor>
          {'  '}
          {index + 1}/{items.length}
        </Text>
      ) : null}
    </Box>
  )
}

export interface FormField {
  key: string
  label: string
  placeholder?: string
  mask?: boolean
}

export function Form({
  fields,
  values,
  onChange,
  onSubmit,
  onCancel,
  isActive = true,
}: {
  fields: FormField[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  onSubmit: () => void
  onCancel: () => void
  isActive?: boolean
}) {
  const screenActive = useScreenActive()
  isActive = isActive && screenActive
  const [focus, setFocus] = useState(0)
  const width = Math.max(...fields.map((f) => f.label.length)) + 2

  useKeys(
    (_, key) => {
      if (key.escape) onCancel()
      else if (key.upArrow || (key.tab && key.shift))
        setFocus((f) => Math.max(0, f - 1))
      else if (key.downArrow || key.tab)
        setFocus((f) => Math.min(fields.length - 1, f + 1))
    },
    { isActive },
  )

  return (
    <Box flexDirection="column">
      {fields.map((field, i) => (
        <Box key={field.key}>
          <Box width={width} flexShrink={0}>
            <Text color={i === focus ? ACCENT : undefined}>{field.label}</Text>
          </Box>
          <TextInput
            value={values[field.key] ?? ''}
            placeholder={field.placeholder}
            mask={field.mask ? '•' : undefined}
            focus={isActive && i === focus}
            showCursor={isActive && i === focus}
            onChange={(v) => onChange({ ...values, [field.key]: v })}
            onSubmit={() =>
              i === fields.length - 1 ? onSubmit() : setFocus(i + 1)
            }
          />
        </Box>
      ))}
    </Box>
  )
}

export function Confirm({
  message,
  onYes,
  onNo,
}: {
  message: string
  onYes: () => void
  onNo: () => void
}) {
  useKeys((input, key) => {
    if (input === 'y' || input === 'Y') onYes()
    else if (input === 'n' || input === 'N' || key.escape || key.return) onNo()
  })
  return (
    <Text>
      <Text color="yellow">{message}</Text> <Text dimColor>(y/N)</Text>
    </Text>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <Text>
      <Text color={ACCENT}>
        <Spinner type="dots" />
      </Text>{' '}
      {label}
    </Text>
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <Text color="red">✗ {children}</Text>
}

export function ProgressBar({
  label,
  done,
  total,
  unit,
}: {
  label: string
  done: number
  total: number
  unit?: '%'
}) {
  const width = 30
  const ratio = total ? Math.min(1, done / total) : 0
  const filled = Math.round(ratio * width)
  return (
    <Text>
      <Text color={ACCENT}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(width - filled)}</Text> {label}{' '}
      <Text dimColor>{unit === '%' ? `${done}%` : `${done}/${total}`}</Text>
    </Text>
  )
}

export function TaskView({ task }: { task: TaskState }) {
  const current = task.steps.findLastIndex((s) => s.kind === 'step')
  const shown = task.steps
    .map((step, i) => ({ step, i }))
    .filter(({ step, i }) => step.kind === 'step' || i >= task.steps.length - 3)
  return (
    <Box flexDirection="column">
      {shown.map(({ step, i }) => {
        const last = i === current
        if (step.kind === 'warn') {
          return (
            <Text key={i} color="yellow">
              ! {step.text}
            </Text>
          )
        }
        if (last && task.status === 'running') {
          return <Loading key={i} label={step.text} />
        }
        return (
          <Text key={i}>
            <Text color={last && task.status === 'error' ? 'red' : 'green'}>
              {last && task.status === 'error' ? '✗' : '✓'}
            </Text>{' '}
            {step.text}
          </Text>
        )
      })}
      {task.progress ? <ProgressBar {...task.progress} /> : null}
      {task.error ? <ErrorText>{task.error}</ErrorText> : null}
    </Box>
  )
}
