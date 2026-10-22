// Stored files as the editor shows them. On the Vite dev server (port 5173)
// /media is fetched from the API directly, like the other video pages do.
const mediaBase = typeof window !== 'undefined' && window.location.port === '5173' ? 'http://localhost:8000' : ''

export const abs = (u) => (u && u.startsWith('/media/') ? `${mediaBase}${u}` : u || '')

/** A small still of a stored picture or video (GET /media/thumb/<name>). */
export const thumbOf = (u) => (u && u.startsWith('/media/') ? `${mediaBase}/media/thumb/${u.slice('/media/'.length)}` : '')
