import type { IngestEvent } from '@owotv/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../output'

export function useAsync<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
) {
  const [state, setState] = useState<{
    data?: T
    error?: string
    loading: boolean
  }>({ loading: true })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => ({ data: s.data, loading: true }))
    fn(ctrl.signal).then(
      (data) => !ctrl.signal.aborted && setState({ data, loading: false }),
      (err) =>
        !ctrl.signal.aborted &&
        setState((s) => ({
          data: s.data,
          error: errorMessage(err),
          loading: false,
        })),
    )
    return () => ctrl.abort()
  }, [...deps, attempt])

  return { ...state, reload: () => setAttempt((n) => n + 1) }
}

export interface TaskStep {
  text: string
  kind: 'step' | 'warn'
}

export interface TaskState {
  status: 'idle' | 'running' | 'done' | 'error'
  steps: TaskStep[]
  progress?: { label: string; done: number; total: number; unit?: '%' }
  error?: string
}

export function useTask() {
  const [state, setState] = useState<TaskState>({ status: 'idle', steps: [] })
  const running = useRef<AbortController | null>(null)

  const onEvent = useCallback((e: IngestEvent) => {
    setState((s) => {
      if (e.type === 'progress') return { ...s, progress: e }
      return {
        ...s,
        progress: undefined,
        steps: [...s.steps, { text: e.message, kind: e.type }],
      }
    })
  }, [])

  const run = useCallback(
    async <T>(
      fn: (
        onEvent: (e: IngestEvent) => void,
        signal: AbortSignal,
      ) => Promise<T>,
    ): Promise<T | undefined> => {
      if (running.current) return undefined
      const ctrl = new AbortController()
      running.current = ctrl
      setState({ status: 'running', steps: [] })
      try {
        const result = await fn(onEvent, ctrl.signal)
        setState((s) => ({ ...s, status: 'done', progress: undefined }))
        return result
      } catch (err) {
        setState((s) => ({
          ...s,
          status: 'error',
          progress: undefined,
          error: ctrl.signal.aborted ? 'Cancelled' : errorMessage(err),
        }))
        return undefined
      } finally {
        running.current = null
      }
    },
    [onEvent],
  )

  const reset = useCallback(() => setState({ status: 'idle', steps: [] }), [])
  const cancel = useCallback(() => running.current?.abort(), [])

  return { ...state, run, reset, cancel }
}
