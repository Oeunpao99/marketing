const BASE = '/api'
const TOKEN_KEY = 'tipsa_token'

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY) || null
    } catch {
      return null
    }
  },
  set: (t) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

async function request(method, path, body) {
  // Accept both "/views/x" and "/api/views/x" — BASE is added once either way.
  if (path.startsWith('/api/')) path = path.slice(4)

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
      tokenStore.set(null)
      window.dispatchEvent(new Event('dispatch:signed-out'))
    }
    const detail = data?.detail
    const message =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
        ? detail.map((d) => d.msg).join(', ')
        : !data
        ? `Can’t reach the API (${res.status}). Is the dev server / backend running?`
        : `Request failed (${res.status})`
    throw new Error(message)
  }
  return data
}

async function upload(path, formData) {
  if (path.startsWith('/api/')) path = path.slice(4)
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, { method: 'POST', headers, body: formData })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    throw new Error(data?.detail || `Upload failed (${res.status})`)
  }
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  del: (path) => request('DELETE', path),
  upload,
}
