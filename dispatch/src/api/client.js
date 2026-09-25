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

// Server updating / in maintenance: a 503 marked `maintenance` (backend
// MAINTENANCE_MODE, or nginx while the backend restarts) or no answer at all.
// Tell the app to show its "updating" screen (MaintenanceOverlay) and give the
// caller an error it can recognise (`err.maintenance`) instead of a raw one.
const UPDATING = 'We’re installing a new version. This usually takes under a minute.'

function maintenanceError(message) {
  window.dispatchEvent(new CustomEvent('dispatch:maintenance', { detail: { message } }))
  const err = new Error(message)
  err.maintenance = true
  err.status = 503
  return err
}

async function send(url, init) {
  try {
    return await fetch(url, init)
  } catch {
    // No response at all: offline, or the server is mid-restart.
    if (navigator.onLine === false) throw new Error('You’re offline — check your internet connection.')
    throw maintenanceError(UPDATING)
  }
}

function parse(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

function checkMaintenance(res, data) {
  if ((res.status === 503 && data?.maintenance) || (res.status === 502 && !data)) {
    throw maintenanceError(data?.detail || UPDATING)
  }
}

async function request(method, path, body) {
  // Accept both "/views/x" and "/api/views/x" — BASE is added once either way.
  if (path.startsWith('/api/')) path = path.slice(4)

  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await send(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = parse(await res.text())
  checkMaintenance(res, data)
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
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

async function upload(path, formData) {
  if (path.startsWith('/api/')) path = path.slice(4)
  const headers = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await send(BASE + path, { method: 'POST', headers, body: formData })
  const data = parse(await res.text())
  checkMaintenance(res, data)
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
