import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { api } from '../api/client'
import MakingNow from './admin/AdminMaking'

// Content studio → Making now (backend GET /views/making): the videos and pictures everyone on
// this workspace's team is making right now, who started each, the step it's on and how far
// along — so a teammate's video in progress isn't a surprise. The admin portal's live list,
// for one workspace.
export default function MakingNowPage() {
  const get = useCallback((_method, path) => api.get(`/views${path}`), [])
  const { user } = useAuth() || {}
  const navigate = useNavigate()
  // "Open" on one of your own: Quick content opens the chat holding it, at its progress card
  const openJob = useCallback((id) => navigate('/ai?tab=images', { state: { openJob: id } }), [navigate])
  return (
    <div className="w-full px-5 py-8 lg:px-10">
      <MakingNow api={get} team meId={user?.id ?? null} onOpenJob={openJob} />
    </div>
  )
}
