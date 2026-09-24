// Images/videos the person started in the AI Agent that are still rendering.
// Rendering happens on the server (app/video.py) and a phone push says when
// it's done; this keeps an eye on them from anywhere in the app too, so if
// they've wandered off to another page they get a toast when it's ready.
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { useStore } from '../store'

const KEY = 'contentflow.genJobs'
let jobs = load()

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(jobs))
  } catch {
    /* private mode */
  }
}

export function trackJob(id, kind) {
  if (!id || jobs.some((j) => j.id === id)) return
  jobs = [...jobs, { id, kind, since: Date.now() }]
  save()
}

export function untrackJob(id) {
  jobs = jobs.filter((j) => j.id !== id)
  save()
}

/** Mounted once (Shell). */
export function useGenJobWatcher() {
  const { showToast, refreshCounts } = useStore()
  const { pathname } = useLocation()
  const where = useRef(pathname)
  where.current = pathname

  useEffect(() => {
    const tick = async () => {
      // forget anything older than 3h — the server gives up on those too
      jobs = jobs.filter((j) => Date.now() - j.since < 3 * 3600 * 1000)
      for (const j of [...jobs]) {
        try {
          const res = await api.get(`/ai/video/${j.id}`)
          if (res.status !== 'succeeded' && res.status !== 'failed') continue
          untrackJob(j.id)
          refreshCounts?.()
          // On the AI Agent page the chat itself shows it — no toast needed.
          if (where.current === '/ai') continue
          const what = j.kind === 'video' ? 'video' : 'image'
          showToast(
            res.status === 'succeeded'
              ? `Your ${what} is ready ✨ — open AI Agent or Library to see it`
              : `Your ${what} couldn’t be made — ${res.error || 'try again in AI Agent'}`,
          )
        } catch (e) {
          if (String(e.message).includes('not found')) untrackJob(j.id)
        }
      }
      save()
    }
    const id = setInterval(() => jobs.length && tick(), 5000)
    return () => clearInterval(id)
  }, [showToast, refreshCounts])
}
