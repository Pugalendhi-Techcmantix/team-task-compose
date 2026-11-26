import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../api/errors'

/**
 * Load data for a page. `fetcher` is called whenever `deps` change; stale responses
 * from earlier calls are ignored. Previous data stays visible while refetching.
 *
 * @returns {{ data, status: 'loading'|'ready'|'error', error: string|null,
 *             errorStatus: number|null, reload: () => Promise<void>, setData }}
 */
export function useFetch(fetcher, deps) {
  const [state, setState] = useState({ data: null, status: 'loading', error: null, errorStatus: null })
  const callId = useRef(0)
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const run = useCallback(async () => {
    const id = ++callId.current
    try {
      const data = await fetcherRef.current()
      if (id === callId.current) setState({ data, status: 'ready', error: null, errorStatus: null })
    } catch (err) {
      if (id === callId.current) {
        setState((s) => ({ ...s, status: 'error', error: getErrorMessage(err), errorStatus: err?.response?.status ?? null }))
      }
    }
  }, [])

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls refetch via deps
  }, deps)

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }, [])

  return { ...state, reload: run, setData }
}
