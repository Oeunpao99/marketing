import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, tokenStore } from './api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false)
      return
    }
    api
      .get('/auth/me')
      .then(setUser)
      .catch(() => {
        tokenStore.set(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

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
    tokenStore.set(null)
    setUser(null)
  }, [])

  const renameWorkspace = useCallback(
    (name) => api.patch('/auth/workspace', { name }).then((u) => (setUser(u), u)),
    [],
  )

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, renameWorkspace }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
