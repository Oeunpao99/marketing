import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FiAward,
  FiBookOpen,
  FiCheck,
  FiGlobe,
  FiMessageCircle,
  FiPlus,
  FiMinus,
  FiPrinter,
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
import { colorForBrand } from '../../lib/brandColor'
import Select from '../ui/Select'

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
  const { brands, showToast } = useStore()
  const [rangeId, setRangeId] = useState('today')
  const [brandId, setBrandId] = useState(0) // 0 = all brands
  const [realData, setRealData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Interactive state for Boost Recommendations
  const [boosts, setBoosts] = useState({ items: [], baseline_posts: 0, untagged: 0, what_works: [] })
  const [tagging, setTagging] = useState(false)
  const [boostAmounts, setBoostAmounts] = useState({}) // post id → chosen budget
  const [skippedBoosts, setSkippedBoosts] = useState({})

  // Interactive state for Budget plan & ROI
  const [selectedBudgetTier, setSelectedBudgetTier] = useState(1000)
  const [selectedMargin, setSelectedMargin] = useState(40) // 30, 40, 60
  const [channelBudgets, setChannelBudgets] = useState({
    facebook: 350,
    tiktok: 500,
    instagram: 150,
    youtube: 0,
    telegram: 0,
  })
  const [budgetPlanApproved, setBudgetPlanApproved] = useState(false)

  // Load real records from the backend endpoint
  const loadRealData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const qs = `?period=${rangeId}${brandId ? `&brand_id=${brandId}` : ''}`
      const res = await api.get(`/views/insights/sales${qs}`)
      setRealData(res)
    } catch (e) {
      setError(e.message)
      showToast?.(`Could not load sales data: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [rangeId, brandId, showToast])

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

  // The AI reads the latest untagged posts (costs AI credit) so the picks can
  // say what each post is about.
  const tagPosts = async () => {
    setTagging(true)
    try {
      const qs = brandId ? `?brand_id=${brandId}` : ''
      const r = await api.post(`/views/insights/tag-posts${qs}`)
      showToast?.(`The AI read ${r.tagged} post${r.tagged === 1 ? '' : 's'}${r.remaining ? ` — ${r.remaining} more to go` : ''}`)
      await loadBoosts()
    } catch (e) {
      showToast?.(`Could not read the posts — ${e.message}`)
    } finally {
      setTagging(false)
    }
  }

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

  // Print / PDF Export Handler
  const handleExportPdf = () => {
    window.print()
  }

  // Ads aren't connected yet, so nothing is sent or spent from here.
  const approveBoost = () => {
    showToast?.("Ad accounts aren't connected yet — nothing was sent.")
  }

  // Handlers for Budget Plan & ROI
  const handleSelectBudgetTier = (tier) => {
    setSelectedBudgetTier(tier)
    if (tier === 500) {
      setChannelBudgets({ facebook: 175, tiktok: 250, instagram: 75, youtube: 0, telegram: 0 })
    } else if (tier === 1000) {
      setChannelBudgets({ facebook: 350, tiktok: 500, instagram: 150, youtube: 0, telegram: 0 })
    } else if (tier === 2000) {
      setChannelBudgets({ facebook: 700, tiktok: 1000, instagram: 300, youtube: 0, telegram: 0 })
    } else if (tier === 3000) {
      setChannelBudgets({ facebook: 1050, tiktok: 1500, instagram: 450, youtube: 0, telegram: 0 })
    }
    setBudgetPlanApproved(false)
  }

  const handleResetAiSplit = () => {
    handleSelectBudgetTier(selectedBudgetTier)
    showToast?.('Reset channel allocations to AI optimal profit split.')
  }

  const handleApproveBudgetPlan = () => {
    showToast?.("Ad accounts aren't connected yet — nothing was sent. This is a preview.")
  }

  const updateChannelBudget = (channelKey, delta) => {
    setChannelBudgets((prev) => {
      const current = prev[channelKey] || 0
      const next = Math.max(0, current + delta)
      return { ...prev, [channelKey]: next }
    })
    setBudgetPlanApproved(false)
  }

  const marginDecimal = selectedMargin / 100

  // Facebook calculations: CPL = $14, close = 6.6%, avg deal = $4.2k
  const planFacebook = useMemo(() => {
    const budget = channelBudgets.facebook
    if (budget <= 0) return { budget: 0, leads: 0, cpl: 14, deals: 0, revenue: 0, roi: 0 }
    const leads = Math.round(budget / 14)
    const deals = Number((leads * 0.066).toFixed(1))
    const revenue = Math.round((deals * 4180) / 100) * 100
    const grossProfit = revenue * marginDecimal
    const roi = Math.round(((grossProfit - budget) / budget) * 100)
    return { budget, leads, cpl: 14, deals, revenue, roi }
  }, [channelBudgets.facebook, marginDecimal])

  // TikTok calculations: CPL = $13.3, close = 6.3%, avg deal = $3.7k
  const planTikTok = useMemo(() => {
    const budget = channelBudgets.tiktok
    if (budget <= 0) return { budget: 0, leads: 0, cpl: 13.3, deals: 0, revenue: 0, roi: 0 }
    const leads = Math.round(budget / 13.16)
    const deals = Number((leads * 0.063).toFixed(1))
    const revenue = Math.round((deals * 3750) / 100) * 100
    const grossProfit = revenue * marginDecimal
    const roi = Math.round(((grossProfit - budget) / budget) * 100)
    return { budget, leads, cpl: 13.3, deals, revenue, roi }
  }, [channelBudgets.tiktok, marginDecimal])

  // Instagram calculations: CPL = $14, close = 5%, avg deal = $4.2k
  const planInstagram = useMemo(() => {
    const budget = channelBudgets.instagram
    if (budget <= 0) return { budget: 0, leads: 0, cpl: 14, deals: 0, revenue: 0, roi: 0 }
    const leads = Math.round(budget / 13.64)
    const deals = Number((leads * 0.05).toFixed(1))
    const revenue = Math.round((deals * 4600) / 100) * 100
    const grossProfit = revenue * marginDecimal
    const roi = Math.round(((grossProfit - budget) / budget) * 100)
    return { budget, leads, cpl: 14, deals, revenue, roi }
  }, [channelBudgets.instagram, marginDecimal])

  // YouTube calculations: CPL = $20, close = 3.5%, avg deal = $3.5k
  const planYouTube = useMemo(() => {
    const budget = channelBudgets.youtube
    if (budget <= 0) return { budget: 0, leads: 0, cpl: null, deals: 0, revenue: 0, roi: 0 }
    const leads = Math.round(budget / 20)
    const deals = Number((leads * 0.035).toFixed(1))
    const revenue = Math.round(deals * 3500)
    const grossProfit = revenue * marginDecimal
    const roi = Math.round(((grossProfit - budget) / budget) * 100)
    return { budget, leads, cpl: 20, deals, revenue, roi }
  }, [channelBudgets.youtube, marginDecimal])

  const totalPlannedSpend =
    channelBudgets.facebook + channelBudgets.tiktok + channelBudgets.instagram + channelBudgets.youtube
  const totalEstPaidLeads =
    planFacebook.leads + planTikTok.leads + planInstagram.leads + planYouTube.leads
  const blendedCostPerLead =
    totalEstPaidLeads > 0 ? (totalPlannedSpend / totalEstPaidLeads).toFixed(1) : '0.0'
  const totalEstDeals = Number(
    (planFacebook.deals + planTikTok.deals + planInstagram.deals + planYouTube.deals).toFixed(1)
  )
  const totalEstRevenue =
    planFacebook.revenue + planTikTok.revenue + planInstagram.revenue + planYouTube.revenue
  const blendedRoas =
    totalPlannedSpend > 0 ? (totalEstRevenue / totalPlannedSpend).toFixed(1) : '0.0'
  const totalGrossProfit = totalEstRevenue * marginDecimal
  const totalRoi =
    totalPlannedSpend > 0
      ? Math.round(((totalGrossProfit - totalPlannedSpend) / totalPlannedSpend) * 100)
      : 0

  const fbShare = totalPlannedSpend > 0 ? Math.round((channelBudgets.facebook / totalPlannedSpend) * 100) : 0
  const ttShare = totalPlannedSpend > 0 ? Math.round((channelBudgets.tiktok / totalPlannedSpend) * 100) : 0
  const igShare = totalPlannedSpend > 0 ? Math.round((channelBudgets.instagram / totalPlannedSpend) * 100) : 0
  const ytShare = totalPlannedSpend > 0 ? Math.round((channelBudgets.youtube / totalPlannedSpend) * 100) : 0

  const plannedSpendSub = useMemo(() => {
    if (totalPlannedSpend === selectedBudgetTier) return 'matches budget'
    if (totalPlannedSpend < selectedBudgetTier) return `$${selectedBudgetTier - totalPlannedSpend} remaining`
    return `$${totalPlannedSpend - selectedBudgetTier} over budget`
  }, [totalPlannedSpend, selectedBudgetTier])

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
                  ? 'bg-ink-900 text-white shadow-xs'
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
                  ? 'bg-ink-900 text-white shadow-xs'
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
                  color: colorForBrand(b.slug),
                })),
              ]}
            />
          )}
        </div>

        {/* PDF Export Button */}
        <button
          type="button"
          onClick={handleExportPdf}
          className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-700 shadow-xs hover:bg-ink-50 transition-colors"
        >
          <FiPrinter size={14} className="text-ink-400" />
          Export insight report (PDF)
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
            {loading ? '…' : period.reach?.value ?? '0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.reach?.sub ?? ''}
          </div>
        </div>

        {/* 2. New followers */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">New followers</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading ? '…' : period.followers?.value ?? '+0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.followers?.sub ?? ''}
          </div>
        </div>

        {/* 3. Engagement rate */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Engagement rate</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading ? '…' : period.engagementRate?.value ?? '0.0%'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.engagementRate?.sub ?? ''}
          </div>
        </div>

        {/* 4. Leads */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Leads</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading ? '…' : period.leads?.value ?? '0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.leads?.sub ?? ''}
          </div>
        </div>

        {/* 5. Deals won */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Deals won</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading ? '…' : period.dealsWon?.value ?? '0'}
          </div>
          <div className="mt-1 text-[11px] text-ink-400 truncate">
            {period.dealsWon?.sub ?? ''}
          </div>
        </div>

        {/* 6. Revenue from social */}
        <div className="rounded-2xl border border-ink-200/60 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="text-[12px] font-medium text-ink-500">Revenue from social</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight text-ink-900 tabular-nums">
            {loading ? '…' : period.revenue?.value ?? '$0'}
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
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-800">
          The picks below come from your own posts and leads. Ad accounts aren’t connected yet, so approving can’t send a boost.
        </div>

        {boosts.untagged > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200/60 bg-white px-4 py-3">
            <p className="text-[12.5px] text-ink-600">
              {boosts.tagged > 0
                ? `${boosts.untagged} recent post${boosts.untagged === 1 ? ' hasn’t' : 's haven’t'} been read by the AI yet.`
                : 'The AI hasn’t read your posts yet. It reads each caption once to learn the topic, who it speaks to and what it asks for — then shows which kind of content brings leads.'}
            </p>
            <button type="button" onClick={tagPosts} disabled={tagging} className="btn-outline whitespace-nowrap disabled:opacity-60">
              {tagging ? 'Reading…' : `Let the AI read ${Math.min(boosts.untagged, 10)} post${Math.min(boosts.untagged, 10) === 1 ? '' : 's'}`}
            </button>
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
            {boosts.items.map((it) => {
              const skipped = !!skippedBoosts[it.post_id]
              const amount = boostAmounts[it.post_id] ?? it.budget
              const chip =
                it.kind === 'boost'
                  ? { text: `Boost · suggested $${it.budget}`, cls: 'bg-emerald-50 border-emerald-200/60 text-emerald-700' }
                  : it.kind === 'skip'
                  ? { text: "Don't boost", cls: 'bg-ink-100 border-ink-200/60 text-ink-600' }
                  : { text: 'Link leads to decide', cls: 'bg-amber-50 border-amber-200/60 text-amber-800' }
              return (
                <div key={it.post_id} className="flex flex-col justify-between rounded-2xl border border-ink-200/60 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[14.5px] font-bold leading-snug text-ink-900">{it.title}</h3>
                      <span className={`flex-none whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chip.cls}`}>
                        {chip.text}
                      </span>
                    </div>
                    <div className="mt-1 text-[11.5px] capitalize text-ink-400">
                      {it.channel} · posted {new Date(it.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                    {it.summary && <p className="mt-2.5 text-[12px] italic leading-relaxed text-ink-500">“{it.summary}”</p>}
                    {it.tags && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[it.tags.audience, it.tags.topic, it.tags.pain_point].filter(Boolean).map((t) => (
                          <span key={t} className="rounded-full bg-ink-100 px-2 py-0.5 text-[10.5px] font-medium text-ink-600">{t}</span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2.5 text-[12px] leading-relaxed text-ink-700">{it.reason}</p>
                    <div className="mt-3 flex gap-4 text-[11.5px] text-ink-500">
                      <span>Engagement <b className="text-ink-800">{it.ratio}×</b> average</span>
                      <span>Leads <b className="text-ink-800">{it.leads}</b></span>
                      {it.reach > 0 && <span>Reach <b className="text-ink-800">{it.reach.toLocaleString()}</b></span>}
                    </div>

                    {it.kind === 'boost' && (
                      <div className="mt-3.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Budget</div>
                        <div className="mt-1.5 grid grid-cols-3 gap-2">
                          {it.tiers.map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setBoostAmounts((m) => ({ ...m, [it.post_id]: amt }))}
                              className={`relative rounded-xl border p-2 text-left transition-all ${
                                amount === amt ? 'border-brand bg-brand-soft/30 shadow-xs' : 'border-ink-200 hover:bg-ink-50/70'
                              }`}
                            >
                              {amt === it.budget && (
                                <span className="absolute -top-2 right-1.5 rounded-full bg-brand px-1.5 py-px text-[8.5px] font-bold uppercase tracking-wider text-white">
                                  Suggested
                                </span>
                              )}
                              <div className="text-[13px] font-bold text-ink-900">${amt}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {it.kind === 'boost' && (
                    <div className="mt-4 flex items-center gap-3 border-t border-ink-100 pt-3">
                      {skipped ? (
                        <span className="text-[12px] italic text-ink-400">Skipped</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={approveBoost}
                            className="rounded-xl bg-ink-900 px-4 py-2 text-[12.5px] font-semibold text-white shadow-xs transition-colors hover:bg-ink-800"
                          >
                            Approve boost · ${amount}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSkippedBoosts((m) => ({ ...m, [it.post_id]: true }))}
                            className="text-[12px] font-medium text-ink-500 transition-colors hover:text-ink-800"
                          >
                            Skip
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
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

      {/* ── Budget plan & ROI Section ──────────────────────── */}
      <div className="mt-8 rounded-2xl border border-ink-200/60 bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-800">
          Preview — example numbers, not your data. Connecting ad accounts is coming; nothing here is sent or spent yet.
        </div>
        {/* Header row: Title + Subtitle on left; Monthly Budget & Gross Margin selectors on right */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-ink-100">
          <div>
            <h2 className="text-[17px] font-bold text-ink-900 tracking-tight">
              Budget plan & ROI · October
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-500 max-w-2xl leading-relaxed">
              Pick a monthly boost budget. The AI splits it $50 at a time to whichever channel earns the most profit from the next $50. Adjust any channel yourself.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 flex-none">
            {/* Monthly Budget Selector */}
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
                Monthly Budget
              </div>
              <div className="inline-flex items-center rounded-xl border border-ink-200/80 bg-ink-50/70 p-1 gap-1">
                {[500, 1000, 2000, 3000].map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => handleSelectBudgetTier(tier)}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-all ${
                      selectedBudgetTier === tier
                        ? 'bg-white text-ink-900 shadow-xs border border-ink-200/60 font-bold'
                        : 'text-ink-600 hover:text-ink-900 hover:bg-white/50'
                    }`}
                  >
                    ${tier.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* Gross Margin Selector */}
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400 mb-1.5">
                Gross Margin
              </div>
              <div className="inline-flex items-center rounded-xl border border-ink-200/80 bg-ink-50/70 p-1 gap-1">
                {[30, 40, 60].map((margin) => (
                  <button
                    key={margin}
                    type="button"
                    onClick={() => setSelectedMargin(margin)}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-all ${
                      selectedMargin === margin
                        ? 'bg-white text-ink-900 shadow-xs border border-ink-200/60 font-bold'
                        : 'text-ink-600 hover:text-ink-900 hover:bg-white/50'
                    }`}
                  >
                    {margin}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 6 Summary KPI Cards */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
          <div className="rounded-xl border border-ink-200/60 bg-ink-50/30 p-3.5">
            <div className="text-[11.5px] font-medium text-ink-500">Planned spend</div>
            <div className="mt-1 text-[20px] font-bold text-ink-900 tracking-tight tabular-nums">
              ${totalPlannedSpend.toLocaleString()}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-400">
              {plannedSpendSub}
            </div>
          </div>

          <div className="rounded-xl border border-ink-200/60 bg-ink-50/30 p-3.5">
            <div className="text-[11.5px] font-medium text-ink-500">Est. paid leads</div>
            <div className="mt-1 text-[20px] font-bold text-ink-900 tracking-tight tabular-nums">
              {totalEstPaidLeads}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-400">
              on top of organic leads
            </div>
          </div>

          <div className="rounded-xl border border-ink-200/60 bg-ink-50/30 p-3.5">
            <div className="text-[11.5px] font-medium text-ink-500">Blended cost / lead</div>
            <div className="mt-1 text-[20px] font-bold text-ink-900 tracking-tight tabular-nums">
              ${blendedCostPerLead}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-400">
              all channels
            </div>
          </div>

          <div className="rounded-xl border border-ink-200/60 bg-ink-50/30 p-3.5">
            <div className="text-[11.5px] font-medium text-ink-500">Est. deals</div>
            <div className="mt-1 text-[20px] font-bold text-ink-900 tracking-tight tabular-nums">
              {totalEstDeals}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-400">
              closing ~21 days later
            </div>
          </div>

          <div className="rounded-xl border border-ink-200/60 bg-ink-50/30 p-3.5">
            <div className="text-[11.5px] font-medium text-ink-500">Est. revenue</div>
            <div className="mt-1 text-[20px] font-bold text-ink-900 tracking-tight tabular-nums">
              ${totalEstRevenue.toLocaleString()}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-400">
              ROAS {blendedRoas}×
            </div>
          </div>

          {/* 6th Card: ROI on gross profit (highlighted with emerald accent) */}
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/30 p-3.5">
            <div className="text-[11.5px] font-medium text-emerald-900">ROI on gross profit</div>
            <div className="mt-1 text-[20px] font-bold text-emerald-700 tracking-tight tabular-nums">
              {totalRoi}%
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-600/90 font-medium">
              at {selectedMargin}% margin
            </div>
          </div>
        </div>

        {/* Channel Budget Allocation Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-[12.5px] border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-ink-100 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">
                <th className="py-2.5 pr-4 pl-1">Channel</th>
                <th className="py-2.5 px-3 text-center">Budget</th>
                <th className="py-2.5 px-3">Share</th>
                <th className="py-2.5 px-3 text-right">Est. Leads</th>
                <th className="py-2.5 px-3 text-right">Cost / Lead</th>
                <th className="py-2.5 px-3 text-right">Est. Deals</th>
                <th className="py-2.5 px-3 text-right">Est. Revenue</th>
                <th className="py-2.5 pl-3 pr-1 text-right">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {/* Facebook */}
              <tr className="hover:bg-ink-50/50 transition-colors">
                <td className="py-3.5 pr-4 pl-1">
                  <div className="font-bold text-ink-900">Facebook</div>
                  <div className="text-[11px] text-ink-400 mt-0.5">
                    Past saturation ($300) · close 6.6% · avg deal $4.2k
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <div className="inline-flex items-center gap-1 rounded-lg border border-ink-200/80 bg-white px-1.5 py-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => updateChannelBudget('facebook', -50)}
                      className="w-6 h-6 rounded flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors text-[13px] font-bold"
                    >
                      −
                    </button>
                    <span className="w-12 text-center font-bold text-ink-900 tabular-nums">
                      ${channelBudgets.facebook}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateChannelBudget('facebook', 50)}
                      className="w-6 h-6 rounded flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors text-[13px] font-bold"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="py-3.5 px-3">
                  <div className="h-2 w-28 rounded-full bg-ink-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-900 rounded-full transition-all duration-300"
                      style={{ width: `${fbShare}%` }}
                    />
                  </div>
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-medium">
                  {planFacebook.leads || '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-700">
                  {planFacebook.budget > 0 ? '$14' : '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-medium">
                  {planFacebook.deals || '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-semibold">
                  {planFacebook.budget > 0 ? `$${planFacebook.revenue.toLocaleString()}` : '—'}
                </td>
                <td className="py-3.5 pl-3 pr-1 text-right tabular-nums text-emerald-700 font-bold">
                  {planFacebook.budget > 0 ? `${planFacebook.roi}%` : '—'}
                </td>
              </tr>

              {/* TikTok */}
              <tr className="hover:bg-ink-50/50 transition-colors">
                <td className="py-3.5 pr-4 pl-1">
                  <div className="font-bold text-ink-900">TikTok</div>
                  <div className="text-[11px] text-ink-400 mt-0.5">
                    Past saturation ($250) · close 6.3% · avg deal $3.7k
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <div className="inline-flex items-center gap-1 rounded-lg border border-ink-200/80 bg-white px-1.5 py-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => updateChannelBudget('tiktok', -50)}
                      className="w-6 h-6 rounded flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors text-[13px] font-bold"
                    >
                      −
                    </button>
                    <span className="w-12 text-center font-bold text-ink-900 tabular-nums">
                      ${channelBudgets.tiktok}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateChannelBudget('tiktok', 50)}
                      className="w-6 h-6 rounded flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors text-[13px] font-bold"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="py-3.5 px-3">
                  <div className="h-2 w-28 rounded-full bg-ink-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-900 rounded-full transition-all duration-300"
                      style={{ width: `${ttShare}%` }}
                    />
                  </div>
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-medium">
                  {planTikTok.leads || '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-700">
                  {planTikTok.budget > 0 ? '$13.3' : '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-medium">
                  {planTikTok.deals || '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-semibold">
                  {planTikTok.budget > 0 ? `$${planTikTok.revenue.toLocaleString()}` : '—'}
                </td>
                <td className="py-3.5 pl-3 pr-1 text-right tabular-nums text-emerald-700 font-bold">
                  {planTikTok.budget > 0 ? `${planTikTok.roi}%` : '—'}
                </td>
              </tr>

              {/* Instagram */}
              <tr className="hover:bg-ink-50/50 transition-colors">
                <td className="py-3.5 pr-4 pl-1">
                  <div className="font-bold text-ink-900">Instagram</div>
                  <div className="text-[11px] text-ink-400 mt-0.5">
                    close 5% · avg deal $4.2k
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <div className="inline-flex items-center gap-1 rounded-lg border border-ink-200/80 bg-white px-1.5 py-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => updateChannelBudget('instagram', -50)}
                      className="w-6 h-6 rounded flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors text-[13px] font-bold"
                    >
                      −
                    </button>
                    <span className="w-12 text-center font-bold text-ink-900 tabular-nums">
                      ${channelBudgets.instagram}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateChannelBudget('instagram', 50)}
                      className="w-6 h-6 rounded flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors text-[13px] font-bold"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="py-3.5 px-3">
                  <div className="h-2 w-28 rounded-full bg-ink-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-900 rounded-full transition-all duration-300"
                      style={{ width: `${igShare}%` }}
                    />
                  </div>
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-medium">
                  {planInstagram.leads || '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-700">
                  {planInstagram.budget > 0 ? '$14' : '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-medium">
                  {planInstagram.deals || '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-900 font-semibold">
                  {planInstagram.budget > 0 ? `$${planInstagram.revenue.toLocaleString()}` : '—'}
                </td>
                <td className="py-3.5 pl-3 pr-1 text-right tabular-nums text-emerald-700 font-bold">
                  {planInstagram.budget > 0 ? `${planInstagram.roi}%` : '—'}
                </td>
              </tr>

              {/* YouTube */}
              <tr className="hover:bg-ink-50/50 transition-colors">
                <td className="py-3.5 pr-4 pl-1">
                  <div className="font-bold text-ink-900">YouTube</div>
                  <div className="text-[11px] text-ink-400 mt-0.5">
                    close 3.5% (early data) · avg deal $3.5k
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <div className="inline-flex items-center gap-1 rounded-lg border border-ink-200/80 bg-white px-1.5 py-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => updateChannelBudget('youtube', -50)}
                      className="w-6 h-6 rounded flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors text-[13px] font-bold"
                    >
                      −
                    </button>
                    <span className="w-12 text-center font-bold text-ink-900 tabular-nums">
                      ${channelBudgets.youtube}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateChannelBudget('youtube', 50)}
                      className="w-6 h-6 rounded flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors text-[13px] font-bold"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="py-3.5 px-3">
                  <div className="h-2 w-28 rounded-full bg-ink-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-900 rounded-full transition-all duration-300"
                      style={{ width: `${ytShare}%` }}
                    />
                  </div>
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-500">
                  {planYouTube.budget > 0 ? planYouTube.leads : '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-500">
                  {planYouTube.budget > 0 ? `$${planYouTube.cpl}` : '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-500">
                  {planYouTube.budget > 0 ? planYouTube.deals : '—'}
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-500">
                  {planYouTube.budget > 0 ? `$${planYouTube.revenue.toLocaleString()}` : '—'}
                </td>
                <td className="py-3.5 pl-3 pr-1 text-right tabular-nums text-ink-500">
                  {planYouTube.budget > 0 ? `${planYouTube.roi}%` : '—'}
                </td>
              </tr>

              {/* Telegram */}
              <tr className="hover:bg-ink-50/50 transition-colors">
                <td className="py-3.5 pr-4 pl-1">
                  <div className="font-bold text-ink-900">Telegram</div>
                  <div className="text-[11px] text-ink-400 mt-0.5">
                    Telegram Ads not set up · grows through channel + bot
                  </div>
                </td>
                <td className="py-3.5 px-3 text-center">
                  <span className="text-[12px] font-medium text-ink-400 italic">
                    Organic only
                  </span>
                </td>
                <td className="py-3.5 px-3">
                  <div className="h-2 w-28 rounded-full bg-ink-100/60" />
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-400">
                  —
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-400">
                  —
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-400">
                  —
                </td>
                <td className="py-3.5 px-3 text-right tabular-nums text-ink-400">
                  —
                </td>
                <td className="py-3.5 pl-3 pr-1 text-right tabular-nums text-ink-400">
                  —
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Calculation footnote & Action buttons */}
        <div className="mt-5 pt-4 border-t border-ink-100 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <p className="text-[11px] leading-relaxed text-ink-500 max-w-3xl">
            How it's calculated: est. leads = budget ÷ cost per lead from the last 90 days of boosts (cost per lead doubles past each channel's saturation point, then keeps rising). Est. deals = leads × close rate from Dynamics 365. Revenue = deals × average deal size. ROI = (revenue × gross margin − budget) ÷ budget. Deals close ~21 days after the lead, so most revenue lands the following month.
          </p>

          <div className="flex items-center gap-2.5 flex-none w-full lg:w-auto justify-end">
            <button
              type="button"
              onClick={handleResetAiSplit}
              className="rounded-xl border border-ink-200 bg-white hover:bg-ink-50 px-3.5 py-2 text-[12.5px] font-semibold text-ink-700 transition-colors shadow-2xs"
            >
              Reset to AI split
            </button>
            <button
              type="button"
              onClick={handleApproveBudgetPlan}
              className={`rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-all shadow-xs flex items-center gap-1.5 ${
                budgetPlanApproved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#1e3a8a] hover:bg-[#172554] text-white'
              }`}
            >
              {budgetPlanApproved ? (
                <>
                  <FiCheck className="w-4 h-4" />
                  Budget plan approved
                </>
              ) : (
                'Approve budget plan'
              )}
            </button>
          </div>
        </div>
      </div>

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

