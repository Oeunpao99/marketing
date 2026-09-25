import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, tokenStore } from './api/client'
import { applyPreferences } from './lib/theme'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false)
      return
    }
    let cancelled = false
    const loadMe = () =>
      api
        .get('/auth/me')
        .then((u) => {
          if (cancelled) return
          setUser(u)
          setLoading(false)
        })
        .catch((e) => {
          if (cancelled) return
          // Server updating: keep the sign-in — the "updating" screen is up
          // and we try again once it's back (dispatch:back-online). Only a
          // real rejection signs the person out.
          if (e.maintenance) return
          tokenStore.set(null)
          setUser(null)
          setLoading(false)
        })
    loadMe()
    window.addEventListener('dispatch:back-online', loadMe)
    return () => {
      cancelled = true
      window.removeEventListener('dispatch:back-online', loadMe)
    }
  }, [])

  // Apply the person's saved accent colour / motion setting whenever we learn
  // who they are (or they change it in Settings).
  useEffect(() => {
    if (user) applyPreferences(user.preferences || {})
  }, [user])

  useEffect(() => {
    const onSignedOut = () => setUser(null)
    window.addEventListener('dispatch:signed-out', onSignedOut)
    return () => window.removeEventListener('dispatch:signed-out', onSignedOut)
  }, [])

  const finish = ({ token, user: u }) => {
    tokenStore.set(token)
    setUser(u)
    return u
  }

  const login = useCallback(
    (email, password) => api.post('/auth/login', { email, password }).then(finish),
    [],
  )
  const register = useCallback(
    (name, email, password, workspaceName = '') =>
      api
        .post('/auth/register', { name, email, password, workspace_name: workspaceName })
        .then(finish),
    [],
  )
  const logout = useCallback(() => {
    navigator.clearAppBadge?.().catch?.(() => {})
    tokenStore.set(null)
    setUser(null)
  }, [])

  const renameWorkspace = useCallback(
    (name) => api.patch('/auth/workspace', { name }).then((u) => (setUser(u), u)),
    [],
  )

  const updateMe = useCallback(
    (patch) => api.patch('/auth/me', patch).then((u) => (setUser(u), u)),
    [],
  )

  // Save part of the preferences (merged server-side). Applied optimistically
  // so a colour swatch click feels instant.
  const updatePrefs = useCallback((patch) => {
    setUser((u) => (u ? { ...u, preferences: { ...(u.preferences || {}), ...patch } } : u))
    return api.patch('/auth/me', { preferences: patch }).then((u) => (setUser(u), u))
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, renameWorkspace, updateMe, updatePrefs }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
