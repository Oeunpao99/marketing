import { useCallback, useEffect, useState } from 'react'
import { api } from './client'

/** GET `path` on mount; returns { data, loading, error, reload }. */
export function useApi(path, { enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)

  const reload = useCallback(() => {
    if (!path) return Promise.resolve()
    setLoading(true)
    return api
      .get(path)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [path])

  useEffect(() => {
    if (enabled) reload()
  }, [enabled, reload])

  return { data, loading, error, reload, setData }
}
