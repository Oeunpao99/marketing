import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  FiAward,
  FiBookOpen,
  FiGlobe,
  FiMessageCircle,
  FiPlus,
  FiDownload,
  FiRefreshCw,
  FiShield,
  FiSun,
  FiTarget,
  FiUserPlus,
  FiZap,
  FiBarChart2,
} from 'react-icons/fi'
import { api } from '../../api/client'
import { useStore } from '../../store'
import Select from '../ui/Select'
import PlanLock from '../billing/PlanLock'
import BoostCard from './BoostCard'
import { AdAccountPicker, BoostDrawer, BoostList } from './BoostControls'
import BoostInsights from './BoostInsights'
import BoostPlan from './BoostPlan'
import { fmtNum } from './Overview'
import { useAuth } from '../../auth'
import { has, NEEDS, usePlanFeatures } from '../../lib/planFeatures'
import { downloadCsv, insightsCsv } from '../../lib/insightsCsv'
import { useBrandMarks } from '../../lib/brandMarks'

// The 9 goals in 3 stages corresponding to backend app/goals.py and src/lib/goals.js
const GOAL_SPECS = [
  {
    id: 'reach',
    label: 'Increase Reach',
    stage: 'Attract',
    stageKey: 'attract',
    kpi: 'Reach, Impressions',
    icon: FiSun,
    iconBg: 'bg-sky-100 text-sky-600',
  },
  {
    id: 'followers',
    label: 'Increase Followers',
    stage: 'Attract',
    stageKey: 'attract',
    kpi: 'Follower growth',
    icon: FiUserPlus,
    iconBg: 'bg-sky-100 text-sky-600',
  },
  {
    id: 'awareness',
    label: 'Awareness',
    stage: 'Attract',
    stageKey: 'attract',
    kpi: 'Reach, Views',
    icon: FiGlobe,
    iconBg: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'engagement',
    label: 'Engagement',
    stage: 'Attract',
    stageKey: 'attract',
    kpi: 'Comments, Reactions',
    icon: FiMessageCircle,
    iconBg: 'bg-blue-100 text-blue-600',
  },
  {
    id: 'education',
    label: 'Education',
    stage: 'Nurture',
    stageKey: 'nurture',
    kpi: 'Saves, Shares',
    icon: FiBookOpen,
    iconBg: 'bg-violet-100 text-violet-600',
  },
  {
    id: 'trust',
    label: 'Trust',
    stage: 'Nurture',
    stageKey: 'nurture',
    kpi: 'Engagement rate',
    icon: FiShield,
    iconBg: 'bg-violet-100 text-violet-600',
  },
  {
    id: 'authority',
    label: 'Authority',
    stage: 'Nurture',
    stageKey: 'nurture',
    kpi: 'Shares, Mentions',
    icon: FiAward,
    iconBg: 'bg-violet-100 text-violet-600',
  },
  {
    id: 'solution',
    label: 'Solution',
    stage: 'Convert',
    stageKey: 'convert',
    kpi: 'Website clicks',
    icon: FiZap,
    iconBg: 'bg-orange-100 text-orange-600',
  },
  {
    id: 'conversion',
    label: 'Conversion',
    stage: 'Convert',
    stageKey: 'convert',
    kpi: 'Leads generated',
    icon: FiTarget,
    iconBg: 'bg-amber-100 text-amber-700',
  },
]

const TIME_RANGES = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
]

export default function InsightsSalesView({
  mode = 'sales',
  onSwitchMode,
}) {
  const markOf = useBrandMarks()
  const { brands, showToast } = useStore()
  const features = usePlanFeatures() // boost picks: Growth and up · the CSV export: Business and up
  // a week by default: "today" showed zeros on most mornings (posts go out every few days)
  const [rangeId, setRangeId] = useState('7d')
  const [brandId, setBrandId] = useState(0) // 0 = all brands
  const [realData, setRealData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Interactive state for Boost Recommendations
  const [boosts, setBoosts] = useState({ items: [], baseline_posts: 0, untagged: 0, what_works: [] })
  const [tagging, setTagging] = useState(false)
  const [boostAmounts, setBoostAmounts] = useState({}) // post id → chosen budget
  const [skippedBoosts, setSkippedBoosts] = useState({})

  // Real boosts (app/boosts.py): the ad accounts, the boosts sent, and the drawers
  const { user } = useAuth() || {}
  const canManage = user?.role === 'owner' || user?.role === 'admin'
  const [searchParams, setSearchParams] = useSearchParams()
  const [adAccounts, setAdAccounts] = useState([])
  const [sent, setSent] = useState([])
  const [pendingAds, setPendingAds] = useState(null)
  const [boostItem, setBoostItem] = useState(null)
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(null)

  // The store's showToast is a new function on every store update; reading it
  // through a ref keeps the loader below stable, so the cards don't reload (and
  // flash "…") whenever something else in the app changes.
  const toastRef = useRef(showToast)
  toastRef.current = showToast

  // Load real records from the backend endpoint. A refresh keeps the current
  // numbers on screen; only the very first load shows "…".
  const loadRealData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = `?period=${rangeId}${brandId ? `&brand_id=${brandId}` : ''}`
      const res = await api.get(`/views/insights/sales${qs}`)
      setRealData(res)
    } catch (e) {
      setError(e.message)
      toastRef.current?.(`Could not load sales data: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [rangeId, brandId])

  useEffect(() => {
    loadRealData()
  }, [loadRealData])

  const loadBoosts = useCallback(() => {
    const qs = brandId ? `?brand_id=${brandId}` : ''
    return api
      .get(`/views/insights/boosts${qs}`)
      .then(setBoosts)
      .catch(() => setBoosts({ items: [], baseline_posts: 0, untagged: 0, what_works: [] }))
  }, [brandId])

  useEffect(() => {
    loadBoosts()
  }, [loadBoosts])

  const loadSent = useCallback(() => {
    if (!has(features, 'boost')) return
    const qs = brandId ? `?brand_id=${brandId}` : ''
    api.get('/boosts/ads').then(setAdAccounts).catch(() => setAdAccounts([]))
    api.get(`/boosts${qs}`).then(setSent).catch(() => setSent([]))
  }, [brandId, features])

  useEffect(() => {
    loadSent()
  }, [loadSent])

  // back from Facebook's login: pick the ad account (or say why it failed)
  useEffect(() => {
    const pid = searchParams.get('ads_pending')
    const failed = searchParams.get('ads') === 'error'
    if (!pid && !failed) return
    if (failed) toastRef.current?.(searchParams.get('message') || 'Facebook didn’t connect — try again.')
    if (pid) {
      api
        .get(`/boosts/ads/pending/${pid}`)
        .then((p) => setPendingAds({ ...p, id: pid }))
        .catch((e) => toastRef.current?.(e.message))
    }
    const next = new URLSearchParams(searchParams)
    ;['ads_pending', 'ads', 'message'].forEach((k) => next.delete(k))
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const accountFor = (bid) => adAccounts.find((a) => a.brand_id === bid)

  const connectAds = async (bid) => {
    if (!bid) return showToast?.('Pick a brand at the top first — each brand has its own ad account.')
    try {
      const r = await api.get(`/boosts/ads/start?brand_id=${bid}`)
      window.location.href = r.url
    } catch (e) {
      showToast?.(e.message)
    }
  }

  const pickAccount = async (accountId) => {
    setBusy(true)
    try {
      await api.post(`/boosts/ads/pending/${pendingAds.id}/confirm`, { account_id: accountId })
      setPendingAds(null)
      showToast?.('Ad account connected — you can boost posts now.')
      loadSent()
    } catch (e) {
      showToast?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  const sendBoost = async (body) => {
    setBusy(true)
    try {
      await api.post('/boosts', body)
      setBoostItem(null)
      showToast?.('Sent to Facebook — it starts once Facebook reviews the ad, usually within an hour.')
      loadSent()
    } catch (e) {
      showToast?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  const stopBoost = async (b) => {
    if (!window.confirm(`Stop boosting “${b.title}”? You pay only what was spent so far.`)) return
    setStopping(b.id)
    try {
      await api.post(`/boosts/${b.id}/stop`)
      showToast?.('Boost stopped.')
      loadSent()
    } catch (e) {
      showToast?.(e.message)
    } finally {
      setStopping(null)
    }
  }

  // The AI reads the latest untagged posts (costs AI credit) so the picks can
  // say what each post is about.
  // All of them, 10 per request (the server's batch) — progress on the button; stops
  // when none are left, a round reads none (posts with no caption) or the AI runs out.
  const tagPosts = async ({ quiet = false } = {}) => {
    const total = boosts.untagged
    let done = 0
    setTagging({ done, total })
    try {
      const qs = brandId ? `?brand_id=${brandId}` : ''
      for (;;) {
        const r = await api.post(`/views/insights/tag-posts${qs}`)
        done += r.tagged
        setTagging({ done, total })
        if (!r.tagged || !r.remaining) break
      }
      if (!quiet) showToast?.(`The AI read ${done} post${done === 1 ? '' : 's'}.`)
    } catch (e) {
      // started by itself: stay quiet (the line shows what is left, with "Read the rest" to try again)
      if (!quiet) showToast?.(done ? `The AI read ${done} posts, then stopped — ${e.message}` : `Could not read the posts — ${e.message}`)
    } finally {
      setTagging(false)
      await loadBoosts()
    }
  }

  // Nobody has to press anything: the first time the page shows unread posts (per brand
  // choice) the AI starts reading them. The server also reads new posts in the background
  // every few hours (app/post_tags.py auto_tag_all), so this only catches the backlog up.
  const autoRead = useRef({})
  useEffect(() => {
    if (!has(features, 'boost') || tagging || !boosts.untagged || autoRead.current[brandId]) return
    autoRead.current[brandId] = true
    tagPosts({ quiet: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boosts.untagged, brandId, features])

  // Current active data set
  const period = useMemo(() => {
    return realData || {}
  }, [realData])

  const channelRows = useMemo(() => {
    return period.by_channel || []
  }, [period])

  // Compute live current date/time formatted: Sat 3 Oct 2026 · 16:20
  const nowDisplay = useMemo(() => {
    const d = new Date()
    const dateStr = d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const timeStr = d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    return `${dateStr} · ${timeStr}`
  }, [])

  // The report as a spreadsheet (CSV, opens in Excel): every table on this
  // page for the chosen period and brand.
  const exportCsv = () => {
    if (!realData) return
    if (!has(features, 'export')) return showToast(`The Excel / CSV export is on the ${NEEDS.export} plan and up — see Plans & usage.`)
    const brand = brands.find((b) => b.id === brandId)
    const period = TIME_RANGES.find((r) => r.id === rangeId)?.label || rangeId
    const csv = insightsCsv(realData, { brand: brand?.name || 'All brands', period, goals: GOAL_SPECS })
    const slug = (brand?.slug || 'all-brands').replace(/[^a-z0-9-]+/gi, '-')
    downloadCsv(csv, `contentflow-insights-${slug}-${rangeId}-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // Every boost needs a person's yes: the drawer shows what it costs before anything is sent.
  const approveBoost = (it) => {
    if (!canManage) return showToast?.('Only a workspace owner or admin can boost — it spends money.')
    if (it.channel !== 'facebook') return showToast?.('Boosting works on Facebook posts for now — Instagram and TikTok come next.')
    if (!accountFor(it.brand_id)) return connectAds(it.brand_id)
    setBoostItem(it)
  }

  const funnelStages = period.funnel || []
  const contentSoldItems = period.content_that_sold || []
  const recommendationsList = period.recommendations || []

  return (
    <div className="w-full px-5 lg:px-8 pt-7 pb-24 animate-fadein print:p-0">
      {/* ── Top Header ─────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-ink-900 tracking-tight leading-tight">
            Insights & sales
          </h1>
          <p className="mt-1 text-[13px] text-ink-500">
            Reach, followers and leads tied to deals won
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          {/* Date & Time display */}
          <span className="text-[12px] tabular-nums text-ink-500">
            {nowDisplay}
          </span>

          {/* Mode Switcher Toggle: Goal view vs Deep analytics */}
          <div className="inline-flex items-center rounded-xl border border-ink-200/80 bg-white p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => onSwitchMode?.('sales')}
              className={`rounded-[9px] px-2.5 py-1 text-[12px] font-semibold transition-all ${
                mode === 'sales'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-ink-50'
              }`}
            >
              Goal view
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode?.('analytics')}
              className={`rounded-[9px] px-2.5 py-1 text-[12px] font-semibold transition-all flex items-center gap-1.5 ${
                mode === 'analytics'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-600 hover:text-ink-900 hover:bg-ink-50'
              }`}
              title="Open full charts and post-level metrics"
            >
              <FiBarChart2 size={13} />
              Deep analytics
            </button>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={loadRealData}
            disabled={loading}
            title="Refresh database records"
            className="grid h-9 w-9 place-items-center rounded-xl border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 transition-colors disabled:opacity-50"
          >
            <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* + New post button */}
          <Link
            to="/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-semibold text-white shadow-xs hover:bg-brand/90 transition-colors"
          >
            <FiPlus size={15} />
            New post
          </Link>
        </div>
      </div>

      {/* ── Brand Filter & Time Tabs & PDF Export ── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Time Tabs */}
          <div
            className="inline-flex rounded-xl border border-ink-200/70 bg-ink-100/60 p-1"
            role="tablist"
            aria-label="Time period"
          >
            {TIME_RANGES.map((r) => {
              const active = rangeId === r.id
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setRangeId(r.id)}
                  className={`rounded-[9px] px-4 py-1.5 text-[12.5px] font-semibold transition-all ${
                    active
                      ? 'bg-white text-ink-900 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  {r.label}
                </button>
              )
            })}
          </div>

          {/* Brand Filter */}
          {brands.length > 1 && (
            <Select
              value={brandId}
              onChange={setBrandId}
              buttonClassName="font-medium text-[12.5px] py-1.5"
              options={[
                { value: 0, label: 'All brands' },
                ...brands.map((b) => ({
                  value: b.id,
                  label: b.name,
                  ...markOf(b),
                })),
              ]}
            />
          )}
        </div>

        {/* Export: the report as a spreadsheet */}
        <button
          type="button"
          onClick={exportCsv}
          disabled={!realData}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-700 shadow-xs hover:bg-ink-50 transition-colors"
        >
          <FiDownload size={14} className="text-ink-400" />
          Export insight report (Excel / CSV)
          {!has(features, 'export') && <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-bold text-brand">{NEEDS.export}</span>}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[12px] text-amber-800">
          Backend notice: {error} 
        </div>
      )}

      {/* ── 6 KPI Cards Ribbon ───────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-6">
        {/* 1. Reach */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Reach</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading && !realData ? '…' : period.reach?.value ?? '0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.reach?.sub ?? ''}
          </div>
        </div>

        {/* 2. New followers */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">New followers</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading && !realData ? '…' : period.followers?.value ?? '+0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.followers?.sub ?? ''}
          </div>
        </div>

        {/* 3. Engagement rate */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Engagement rate</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading && !realData ? '…' : period.engagementRate?.value ?? '0.0%'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.engagementRate?.sub ?? ''}
          </div>
        </div>

        {/* 4. Leads */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Leads</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading && !realData ? '…' : period.leads?.value ?? '0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.leads?.sub ?? ''}
          </div>
        </div>

        {/* 5. Deals won */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Deals won</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading && !realData ? '…' : period.dealsWon?.value ?? '0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.dealsWon?.sub ?? ''}
          </div>
        </div>

        {/* 6. Revenue from social */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Revenue from social</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading && !realData ? '…' : period.revenue?.value ?? '$0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.revenue?.sub ?? ''}
          </div>
        </div>
      </div>

      {/* ── Performance by goal Section ─────────────────────── */}
      <div className="rounded-2xl border border-ink-200/60 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {/* Card Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-bold text-ink-900 tracking-tight">
            Performance by goal
          </h2>
          <span className="text-[11.5px] text-ink-400">
            Each goal judged by its own KPI · change vs previous period
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px] border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                <th className="py-2.5 pr-4 pl-1 font-semibold">Goal</th>
                <th className="py-2.5 px-3 font-semibold">Stage</th>
                <th className="py-2.5 px-3 font-semibold text-center">Posts</th>
                <th className="py-2.5 px-3 font-semibold">KPI</th>
                <th className="py-2.5 px-3 font-semibold">Result</th>
                <th className="py-2.5 px-3 font-semibold text-right">Change</th>
                <th className="py-2.5 pl-3 pr-1 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {GOAL_SPECS.map((g) => {
                const Icon = g.icon
                const row = period.goals?.[g.id] || {
                  posts: '—',
                  result: 'No post yet today',
                  change: '—',
                  status: 'Waiting',
                }
                const isWaiting = row.status === 'Waiting'
                const isOnTrack = row.status === 'On track'

                // Stage badge styling
                const stageColor =
                  g.stageKey === 'attract'
                    ? 'text-sky-700 font-medium'
                    : g.stageKey === 'nurture'
                    ? 'text-violet-700 font-medium'
                    : 'text-amber-800 font-medium'

                return (
                  <tr
                    key={g.id}
                    className="hover:bg-ink-50/50 transition-colors group"
                  >
                    {/* 1. Goal with Icon */}
                    <td className="py-3.5 pr-4 pl-1">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`grid h-7 w-7 flex-none place-items-center rounded-lg ${g.iconBg}`}
                        >
                          <Icon size={14} />
                        </span>
                        <span className="font-semibold text-ink-900 group-hover:text-brand transition-colors">
                          {g.label}
                        </span>
                      </div>
                    </td>

                    {/* 2. Stage */}
                    <td className="py-3.5 px-3">
                      <span className={`text-[12px] ${stageColor}`}>
                        {g.stage}
                      </span>
                    </td>

                    {/* 3. Posts count */}
                    <td className="py-3.5 px-3 text-center tabular-nums text-ink-700 font-medium">
                      {row.posts}
                    </td>

                    {/* 4. KPI */}
                    <td className="py-3.5 px-3 text-ink-500 text-[12px]">
                      {g.kpi}
                    </td>

                    {/* 5. Result */}
                    <td className="py-3.5 px-3">
                      <span
                        className={
                          row.result?.startsWith('No post')
                            ? 'text-ink-400 font-normal italic text-[12px]'
                            : 'text-ink-800 font-semibold text-[12.5px]'
                        }
                      >
                        {row.result}
                      </span>
                    </td>

                    {/* 6. Change */}
                    <td className="py-3.5 px-3 text-right tabular-nums">
                      {row.change !== '—' ? (
                        <span className="inline-flex items-center justify-end gap-0.5 text-emerald-600 font-semibold text-[12px]">
                          {row.change}
                        </span>
                      ) : (
                        <span className="text-ink-300 font-normal">—</span>
                      )}
                    </td>

                    {/* 7. Status */}
                    <td className="py-3.5 pl-3 pr-1 text-right">
                      {isOnTrack ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                          On track
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-ink-100/70 border border-ink-200/50 px-2.5 py-0.5 text-[11px] font-medium text-ink-500">
                          Waiting
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Card Footer / Summary Note */}
        <div className="mt-4 pt-3.5 border-t border-ink-100 text-[12px] text-ink-500 leading-relaxed flex items-center justify-between flex-wrap gap-2">
          <span>{period.note || 'No posts scheduled for today yet.'}</span>
          <button
            type="button"
            onClick={() => onSwitchMode?.('analytics')}
            className="text-[11.5px] font-medium text-brand hover:underline inline-flex items-center gap-1"
          >
            Explore detailed posts & charts →
          </button>
        </div>
      </div>

      {/* ── Boost recommendations Section ───────────────────── */}
      <div className="mt-8">
        <div className="mb-4">
          <h2 className="text-[17px] font-bold text-ink-900 tracking-tight">Boost recommendations</h2>
          <p className="mt-0.5 text-[12px] text-ink-500">
            Posts from the last 7 days that beat their channel’s average. A boost is suggested only when leads came from
            the post, not just likes. Every boost needs your yes.
          </p>
        </div>
        {!has(features, 'boost') ? (
          <PlanLock feature="boost" text="See which of your posts brought leads — not just likes — and what to spend boosting them." />
        ) : (
        <>
        {/* one thin status line: who pays for boosts, and how far the AI has read the posts */}
        {(() => {
          const shown = brandId ? adAccounts.filter((a) => a.brand_id === brandId) : adAccounts
          const brandName = (bid) => brands.find((b) => b.id === bid)?.name || ''
          const readable = boosts.tagged + boosts.untagged
          return (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${shown.length ? 'border-emerald-200/60 bg-emerald-50 text-emerald-700' : 'border-ink-200 bg-white text-ink-600'}`}>
                <span className={`h-2 w-2 rounded-full ${shown.length ? 'bg-emerald-500' : 'bg-ink-300'}`} aria-hidden="true" />
                {shown.length
                  ? `Paid from ${shown.map((a) => `${brandId ? '' : `${brandName(a.brand_id)}: `}${a.name}`).join(' · ')}`
                  : 'No ad account yet — nothing is spent until you approve a boost'}
                <button
                  type="button"
                  disabled={!canManage}
                  title={canManage ? undefined : 'Only the workspace owner or an admin can connect an ad account or boost — it spends money'}
                  onClick={() => connectAds(brandId || (brands.length === 1 ? brands[0].id : 0))}
                  className="font-semibold underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shown.length ? 'Change' : 'Connect ad account'}
                </button>
              </span>
              {readable > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-ink-600">
                  <FiZap size={12} className="text-amber-500" aria-hidden="true" />
                  {tagging ? `AI reading… ${tagging.done} of ${tagging.total}` : `AI read ${boosts.tagged} of ${readable} posts`}
                  {!tagging && boosts.untagged > 0 && (
                    <button type="button" onClick={() => tagPosts()} className="font-semibold text-ink-800 underline-offset-2 hover:underline">
                      Read the rest
                    </button>
                  )}
                </span>
              )}
            </div>
          )
        })()}

        {/* the week's value at a glance, from the picks below */}
        {boosts.items.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Posts above average', boosts.items.length, 'in the last 7 days'],
              ['People reached', fmtNum(boosts.items.reduce((n, i) => n + (i.reach || 0), 0)), 'by these posts'],
              ['Engaged', fmtNum(boosts.items.reduce((n, i) => n + Object.values(i.mix || {}).reduce((a, b) => a + b, 0), 0)), 'reactions, comments, shares'],
              ['Leads from them', boosts.items.reduce((n, i) => n + (i.leads || 0), 0), 'link leads to see which sell'],
            ].map(([k, v, sub]) => (
              <div key={k} className="rounded-2xl border border-ink-200/60 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{k}</div>
                <div className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight text-ink-900">{v}</div>
                <div className="text-[11px] text-ink-400">{sub}</div>
              </div>
            ))}
          </div>
        )}

        {boosts.what_works?.length > 0 && (
          <div className="mb-5 rounded-2xl border border-ink-200/60 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <h3 className="text-[14.5px] font-bold text-ink-900">What brings leads</h3>
            <p className="mt-0.5 text-[11.5px] text-ink-400">Labels the AI found in your posts, compared by leads per post</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {boosts.what_works.map((w) => (
                <li key={`${w.field}-${w.value}`} className="rounded-xl border border-ink-100 px-3.5 py-2.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">{w.label}</div>
                  <div className="mt-0.5 text-[13px] font-semibold text-ink-900">{w.value.replace(/_/g, ' ')}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-500">
                    {w.per_post} leads per post · {w.vs_average}× your average · {w.posts} posts{w.won ? ` · ${w.won} won` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {boosts.items.length === 0 ? (
          <div className="rounded-2xl border border-ink-200/60 bg-white p-5 text-[12.5px] leading-relaxed text-ink-500">
            {boosts.baseline_posts < 8
              ? 'Not enough posts yet to tell what “above average” means — it needs a few weeks of posting on Facebook, Instagram or TikTok.'
              : 'No recent post stands out from your average. Check back after the next posts have had a few hours.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {boosts.items.map((it) => (
              <BoostCard
                key={it.post_id}
                it={it}
                amount={boostAmounts[it.post_id] ?? it.budget}
                skipped={!!skippedBoosts[it.post_id]}
                onAmount={(amt) => setBoostAmounts((m) => ({ ...m, [it.post_id]: amt }))}
                boosting={sent.some((b) => b.post_id === it.post_id && (b.status === 'running' || b.status === 'in_review'))}
                onApprove={() => approveBoost(it)}
                onSkip={() => setSkippedBoosts((m) => ({ ...m, [it.post_id]: true }))}
              />
            ))}
          </div>
        )}
        <BoostInsights boosts={sent} />
        <BoostList boosts={sent} canManage={canManage} stopping={stopping} onStop={stopBoost} />
        </>
        )}
        {pendingAds && <AdAccountPicker pending={pendingAds} saving={busy} onPick={pickAccount} onClose={() => setPendingAds(null)} />}
        {boostItem && (
          <BoostDrawer
            item={{ ...boostItem, budget: boostAmounts[boostItem.post_id] ?? boostItem.budget }}
            account={accountFor(boostItem.brand_id)}
            sending={busy}
            onSend={sendBoost}
            onClose={() => setBoostItem(null)}
          />
        )}
      </div>

      {/* ── By channel Section ──────────────────────────────── */}
      <div className="mt-8 rounded-2xl border border-ink-200/60 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-bold text-ink-900 tracking-tight">
            By channel
          </h2>
          <span className="text-[11.5px] text-ink-400">
            Spend = boosts on this channel · cost per lead counts paid leads only
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px] border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-ink-100 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                <th className="py-2.5 pr-4 pl-1 font-semibold">Channel</th>
                <th className="py-2.5 px-3 font-semibold text-right">Reach</th>
                <th className="py-2.5 px-3 font-semibold text-right">Follows</th>
                <th className="py-2.5 px-3 font-semibold text-right">Leads</th>
                <th className="py-2.5 px-3 font-semibold text-right">Won</th>
                <th className="py-2.5 px-3 font-semibold text-right">Revenue</th>
                <th className="py-2.5 px-3 font-semibold text-right">Spend</th>
                <th className="py-2.5 pl-3 pr-1 font-semibold text-right">Cost / Lead</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {channelRows.map((ch) => (
                <tr key={ch.channel} className="hover:bg-ink-50/50 transition-colors">
                  <td className="py-3.5 pr-4 pl-1 font-semibold text-ink-900">
                    {ch.channel}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-ink-700 font-medium">
                    {ch.reach}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-ink-700 font-medium">
                    {ch.follows}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-semibold">
                    {ch.leads}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-ink-700 font-medium">
                    {ch.won}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-semibold">
                    {ch.revenue}
                  </td>
                  <td className="py-3.5 px-3 text-right tabular-nums text-ink-500">
                    {ch.spend}
                  </td>
                  <td className="py-3.5 pl-3 pr-1 text-right tabular-nums text-ink-500">
                    {ch.cost_per_lead}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Budget plan: what a monthly budget would reach, from the boosts really run ── */}
      {has(features, 'boost') && <BoostPlan boosts={sent} />}

      {/* ── Bottom 3 Cards: Funnel, Content that sold, What to change next ── */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: From post to sale (Funnel) */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-ink-900 tracking-tight">
              From post to sale
            </h3>

            {funnelStages.length === 0 || funnelStages[0].raw === 0 ? (
              <p className="mt-5 text-[12px] leading-relaxed text-ink-500">
                Nothing to show yet — once posts are live and leads come in, you will see how many people reach each step.
              </p>
            ) : null}
            <div className="mt-5 space-y-3">
              {(funnelStages[0]?.raw ? funnelStages : []).map((stage) => (
                <div key={stage.stage} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="w-24 flex-none font-medium text-ink-700">
                    {stage.stage}
                  </span>
                  <div className="flex-1 h-5 flex items-center">
                    <div
                      className={`h-4.5 rounded-[3px] transition-all duration-300 ${
                        stage.is_dark ? 'bg-[#1e3a8a]' : 'bg-[#9cb6d8]'
                      }`}
                      style={{ width: `${stage.width}%` }}
                    />
                  </div>
                  <div className="w-14 flex-none text-right">
                    <div className="font-bold text-ink-900 tabular-nums leading-tight">
                      {stage.count}
                    </div>
                    {stage.pct && (
                      <div className="text-[10px] text-ink-400 tabular-nums leading-tight">
                        {stage.pct}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 2: Content that sold */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col justify-between">
          <div>
            <h3 className="text-[15px] font-bold text-ink-900 tracking-tight">
              Content that sold
            </h3>

            {contentSoldItems.length === 0 && (
              <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
                {period.counts?.leads
                  ? `None of this period's ${period.counts.leads} lead${period.counts.leads === 1 ? '' : 's'} is linked to a post yet. Open a lead in Leads & hand-off and pick the post that brought them in.`
                  : 'No leads in this period yet. When a lead comes in, link it to the post that brought them in and it shows up here.'}
              </p>
            )}
            <div className="mt-4 divide-y divide-ink-100/80">
              {contentSoldItems.map((item, idx) => (
                <div key={idx} className="py-3.5 first:pt-1 last:pb-1 flex items-start justify-between gap-3">
                  <div className="min-w-0 pr-2">
                    <h4 className="text-[13px] font-bold text-ink-900 leading-snug truncate">
                      {item.title}
                    </h4>
                    <p className="mt-1 text-[11.5px] text-ink-400">
                      {item.sub}
                    </p>
                  </div>
                  <div className="flex-none text-right">
                    <span className={`text-[13.5px] tabular-nums font-bold ${item.revenue !== '$0' ? 'text-ink-900' : 'text-ink-500 font-semibold'}`}>
                      {item.revenue}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: What to change next */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex flex-col justify-between">
          <div>
            <div className="flex flex-col">
              <h3 className="text-[15px] font-bold text-ink-900 tracking-tight">
                What to change next
              </h3>
              <p className="mt-0.5 text-[11px] text-ink-400 leading-normal">
                Worked out from your own posts and leads
              </p>
            </div>

            {recommendationsList.length === 0 && (
              <p className="mt-4 text-[12px] leading-relaxed text-ink-500">
                Not enough results yet. Suggestions appear once a few posts per goal or channel have brought in leads.
              </p>
            )}
            <div className="mt-4 space-y-3">
              {recommendationsList.map((rec) => {
                return (
                  <div
                    key={rec.id}
                    className="rounded-xl border border-ink-200/60 p-3.5 bg-white space-y-2 hover:border-ink-300 transition-colors"
                  >
                    <div className="text-[12.5px] font-bold text-ink-900 leading-snug">
                      {rec.title}
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-ink-600">
                      {rec.description}
                    </p>
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-700 px-2.5 py-0.5 text-[11px] font-semibold">
                        {rec.confidence}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

