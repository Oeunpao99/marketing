import {
  FiArrowRight,
  FiCheck,
  FiClock,
  FiDatabase,
  FiLock,
  FiShield,
  FiStar,
  FiTrendingUp,
  FiUsers,
  FiZap,
} from 'react-icons/fi'
import { SiFacebook, SiTelegram } from 'react-icons/si'
import { useNavigate } from 'react-router-dom'
import { FEATURE_NAMES, has, NEEDS, usePlanFeatures } from '../../lib/planFeatures'
import LiveAvatar from '../ui/LiveAvatar'

// what each locked page says it does, so the lock sells the feature
const PAGE_TEXT = {
  leads:
    'Collect leads from your chatbot and your posts, and hand each one to the right sales rep by Telegram — 3 reps on Growth, 10 on Business. Leads your chatbot sends now are kept for you.',
  api:
    'Let Claude, ChatGPT or your own systems use Smart Marketing — plan posts, make videos and read results through an API key or the MCP connector.',
}

/** A whole page the plan doesn't include: the lock in its place (the server refuses it anyway). */
export function PlanGate({ feature, children }) {
  const features = usePlanFeatures()
  return has(features, feature) ? children : <PlanLock page feature={feature} text={PAGE_TEXT[feature]} />
}

/** Full-width creative showcase specifically for the Leads & hand-off feature */
function LeadsPlanPage({ onUpgrade }) {
  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein space-y-7">
      {/* Top Hero Banner */}
      <div className="relative w-full overflow-hidden rounded-3xl border border-brand-line/70 bg-gradient-to-br from-white via-brand-soft/30 to-brand-soft/60 p-6 sm:p-9 lg:p-10 shadow-pop">
        {/* Ambient background glows */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 h-64 w-64 rounded-full bg-brand-light/15 blur-3xl" />

        <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0 flex-1 space-y-4.5">
            {/* Plan Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white/90 px-3.5 py-1.5 shadow-sm backdrop-blur">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white">
                <FiZap size={11} />
              </span>
              <span className="text-[12px] font-bold tracking-wide uppercase text-brand">
                Growth &amp; Business Plan
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            {/* Headline */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-ink-900 leading-tight">
              Leads &amp; hand-off is on the Growth plan
            </h1>

            {/* Subtitle */}
            <p className="text-[14.5px] sm:text-[15.5px] text-ink-600 leading-relaxed">
              Collect leads from your chatbot and your posts, and hand each one to the right sales rep by Telegram —{' '}
              <strong className="text-ink-900 font-semibold">3 reps on Growth</strong>,{' '}
              <strong className="text-ink-900 font-semibold">10 on Business</strong>. Leads your chatbot sends now are kept for you.
            </p>

            {/* Quick value badges */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1 text-[12.5px] text-ink-700">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 border border-ink-200/60 px-3 py-1.5 font-medium shadow-xs">
                <SiTelegram className="text-[#229ED9]" size={14} /> Telegram Instant Alerts
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/80 border border-ink-200/60 px-3 py-1.5 font-medium shadow-xs">
                <FiUsers className="text-brand" size={14} /> 3 to 10 Sales Reps
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-3 py-1.5 font-medium shadow-xs">
                <FiShield size={14} className="text-emerald-600" /> Leads Safely Retained
              </span>
            </div>

            {/* CTA action buttons */}
            <div className="flex flex-wrap items-center gap-3.5 pt-3">
              <button
                type="button"
                onClick={() => onUpgrade('pro')}
                className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-[14px] font-semibold shadow-glow hover:shadow-glow-lg transition-all"
              >
                <span>Upgrade to Growth — $79/mo</span>
                <FiArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => onUpgrade()}
                className="btn-ghost inline-flex items-center gap-1.5 px-4 py-3 text-[13.5px] font-medium border border-ink-200 bg-white/80 hover:bg-white text-ink-700"
              >
                See all plans
              </button>
            </div>
          </div>

          {/* Avatar Character & Creative Speech Bubble */}
          <div className="relative flex flex-col items-center justify-center lg:pl-6">
            <div className="relative">
              {/* Floating speech bubble */}
              <div className="absolute -top-12 -left-8 sm:-left-16 z-20 w-52 sm:w-60 rounded-2xl border border-brand-line bg-white p-3 text-left shadow-pop animate-float">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand uppercase tracking-wider">
                  <FiZap size={12} /> Smart Assistant
                </div>
                <p className="mt-1 text-[12px] text-ink-700 leading-snug">
                  I route every chatbot inquiry straight to your sales team's Telegram!
                </p>
                {/* Speech tail */}
                <div className="absolute -bottom-2 right-12 h-3 w-3 rotate-45 border-b border-r border-brand-line bg-white" />
              </div>

              {/* Glowing ring under avatar */}
              <div className="absolute inset-0 m-auto h-36 w-36 rounded-full bg-gradient-to-tr from-brand/20 to-brand-light/30 blur-xl" />

              {/* The Mascot */}
              <div className="relative z-10 pt-6">
                <LiveAvatar size={155} wave={true} />
              </div>
            </div>

            {/* Status indicator pill */}
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11.5px] font-medium text-emerald-800 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Lead capture engine ready
            </div>
          </div>
        </div>
      </div>

      {/* Visual Workflow: How Leads & Hand-off Works */}
      <div className="rounded-3xl border border-ink-200/70 bg-white p-6 sm:p-8 shadow-card">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-wider text-brand">The Live Workflow</div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink-900 mt-1">
              From Customer Message to Telegram Hand-Off
            </h2>
            <p className="text-[13.5px] text-ink-500 mt-1">
              Zero manual copying. The chatbot qualifies buyers and hands them to the best available rep.
            </p>
          </div>
          <span className="rounded-full bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand">
            Automated Routing
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Step 1: Customer inquiry */}
          <div className="relative rounded-2xl border border-ink-200/70 bg-canvas-soft p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-ink-500">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white text-[10px]">1</span>
                Inbound Lead
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-[#1877F2]/10 px-2 py-0.5 text-[11px] font-medium text-[#1877F2]">
                <SiFacebook size={12} /> Chatbot / Post
              </span>
            </div>

            <div className="rounded-xl border border-ink-200/60 bg-white p-3 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[13px] text-ink-900">Sokha Meng</span>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Hot Lead</span>
              </div>
              <p className="text-[12px] text-ink-600 line-clamp-2">
                "Hello! We need 50 units by next Tuesday. Can someone contact me on Telegram?"
              </p>
              <div className="pt-1 flex items-center justify-between text-[11px] text-ink-400">
                <span>Phone: 012 998 776</span>
                <span>Just now</span>
              </div>
            </div>
          </div>

          {/* Step 2: Intelligent Routing */}
          <div className="relative rounded-2xl border border-brand-line/80 bg-brand-soft/40 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-brand">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white text-[10px]">2</span>
                Smart Matching
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-brand shadow-xs">
                <FiZap size={12} /> AI Rules
              </span>
            </div>

            <div className="rounded-xl border border-brand-line/60 bg-white p-3 shadow-xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand">
                  <FiClock size={14} />
                </span>
                <div>
                  <div className="text-[12.5px] font-bold text-ink-900">Round Robin &amp; SLA</div>
                  <div className="text-[11px] text-ink-500">Checking rep capacity &amp; industry...</div>
                </div>
              </div>
              <div className="space-y-1 pt-1 text-[11px]">
                <div className="flex justify-between text-ink-600">
                  <span>Dara (Wholesale Specialist)</span>
                  <span className="font-semibold text-emerald-600">Available</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-ink-100 overflow-hidden">
                  <div className="h-full rounded-full bg-brand w-2/3" />
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Telegram Hand-Off */}
          <div className="relative rounded-2xl border border-[#229ED9]/30 bg-[#229ED9]/5 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wider text-[#0088cc]">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#229ED9] text-white text-[10px]">3</span>
                Instant Hand-Off
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-[#229ED9] px-2 py-0.5 text-[11px] font-semibold text-white">
                <SiTelegram size={12} /> Telegram
              </span>
            </div>

            <div className="rounded-xl border border-[#229ED9]/30 bg-white p-3 shadow-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-[#0088cc]">
                <span>🔔 New Lead Assigned to Dara</span>
              </div>
              <p className="text-[11.5px] text-ink-600 leading-tight">
                Alert sent to <strong>@dara_sales</strong> with full conversation history &amp; contact info.
              </p>
              <div className="pt-1 flex items-center justify-between text-[10.5px] text-ink-400">
                <span className="font-medium text-emerald-600">✓ Handed over in 2.4s</span>
                <span>Target SLA: 15m</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plan Quotas & Comparison Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Growth Plan Card */}
        <div className="relative rounded-3xl border-2 border-brand bg-white p-6 sm:p-7 shadow-pop flex flex-col justify-between">
          <div className="absolute -top-3.5 right-6 rounded-full bg-brand px-3.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
            Most Popular
          </div>
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-ink-900">Growth Plan</h3>
                <p className="text-[13px] text-ink-500">For growing businesses selling online</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-ink-900">$79</div>
                <div className="text-[11px] text-ink-400">per month (325,000 ៛)</div>
              </div>
            </div>

            <div className="my-5 rounded-2xl bg-brand-soft/50 border border-brand-line/60 p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand text-white shadow-xs">
                  <FiUsers size={18} />
                </span>
                <div>
                  <div className="text-[14px] font-bold text-ink-900">3 Sales Reps on Telegram</div>
                  <div className="text-[12px] text-ink-600">Assign leads automatically to 3 individual reps</div>
                </div>
              </div>
            </div>

            <ul className="space-y-2.5 text-[13px] text-ink-700">
              <li className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span>Collect leads from chatbot &amp; post comments</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span>Instant routing &amp; notification by Telegram</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span>Insights: leads, deals, response time &amp; revenue</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span>All leads currently collected are stored &amp; ready</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onUpgrade('pro')}
            className="btn-primary mt-6 w-full py-3 text-[14px] font-semibold flex items-center justify-center gap-2"
          >
            Upgrade to Growth <FiArrowRight size={15} />
          </button>
        </div>

        {/* Business Plan Card */}
        <div className="relative rounded-3xl border border-ink-200/80 bg-white p-6 sm:p-7 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-ink-900">Business Plan</h3>
                <p className="text-[13px] text-ink-500">For companies with a dedicated sales team</p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-ink-900">$199</div>
                <div className="text-[11px] text-ink-400">per month (819,000 ៛)</div>
              </div>
            </div>

            <div className="my-5 rounded-2xl bg-canvas border border-ink-200/60 p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-night-900 text-white shadow-xs">
                  <FiUsers size={18} />
                </span>
                <div>
                  <div className="text-[14px] font-bold text-ink-900">10 Sales Reps on Telegram</div>
                  <div className="text-[12px] text-ink-600">Full sales department routing with capacity limits</div>
                </div>
              </div>
            </div>

            <ul className="space-y-2.5 text-[13px] text-ink-700">
              <li className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span>Everything in Growth, scaled for large volume</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span>Up to 10 sales reps with custom routing rules</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span>Export leads &amp; performance to Excel / CSV</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <FiCheck size={12} strokeWidth={3} />
                </span>
                <span>3 brands with separate routing &amp; API / MCP access</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onUpgrade('business')}
            className="btn-ghost mt-6 w-full py-3 text-[14px] font-semibold border border-ink-200 hover:bg-canvas text-ink-900 flex items-center justify-center gap-2"
          >
            Upgrade to Business <FiArrowRight size={15} />
          </button>
        </div>
      </div>

      {/* Safety & Lead Retention Reassurance Card */}
      <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/60 p-5 sm:p-6 shadow-xs">
        <div className="flex items-start gap-4">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-emerald-600 text-white shadow-xs">
            <FiDatabase size={18} />
          </span>
          <div className="space-y-1">
            <h4 className="text-[15px] font-bold text-emerald-950">
              Leads your chatbot sends right now are kept safe for you
            </h4>
            <p className="text-[13px] text-emerald-900/80 leading-relaxed">
              Don't worry about missing customer inquiries while deciding. Your marketing agent securely records and saves every
              lead your chatbot receives. Once you activate Growth or Business, all queued leads will be ready to hand off immediately!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/** General full-width showcase for other gated pages like API */
function GeneralPlanPage({ feature, text, plan, name, onUpgrade }) {
  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein space-y-7">
      <div className="relative w-full overflow-hidden rounded-3xl border border-brand-line/70 bg-gradient-to-br from-white via-brand-soft/30 to-brand-soft/60 p-8 sm:p-10 shadow-pop">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white/90 px-3.5 py-1.5 shadow-sm">
              <FiLock size={13} className="text-brand" />
              <span className="text-[12px] font-bold uppercase tracking-wider text-brand">
                {plan} Plan Feature
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900">
              {name} is on the {plan} plan
            </h1>
            <p className="text-[15px] text-ink-600 leading-relaxed">
              {text || `Upgrade to ${plan} or higher to unlock this feature for your workspace.`}
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onUpgrade()}
                className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-[14px] font-semibold"
              >
                <span>Upgrade to {plan}</span>
                <FiArrowRight size={15} />
              </button>
            </div>
          </div>
          <div className="flex flex-col items-center">
            <LiveAvatar size={150} wave={true} />
            <div className="mt-2 text-[12px] font-medium text-ink-500">Smart Marketing AI</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A feature the plan doesn't include: what it is, the plan that has it, and Upgrade.
 *  ``page`` = in place of a whole page; else a card inside one. */
export default function PlanLock({ feature, text, page = false }) {
  const navigate = useNavigate()
  const name = FEATURE_NAMES[feature] || feature
  const plan = NEEDS[feature] || 'a higher'

  const handleUpgrade = (selectedPlan) => {
    navigate('/upgrade')
  }

  // Full-width dedicated design when shown as a full page
  if (page) {
    if (feature === 'leads') {
      return <LeadsPlanPage onUpgrade={handleUpgrade} />
    }
    return <GeneralPlanPage feature={feature} text={text} plan={plan} name={name} onUpgrade={handleUpgrade} />
  }

  // Inline card inside another page
  return (
    <div className="rounded-2xl border border-brand-line bg-brand-soft px-5 py-5 shadow-xs">
      <div className="flex items-start gap-3.5">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-brand shadow-xs">
          <FiLock size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink-900">{name} is on the {plan} plan</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{text || `Upgrade to ${plan} or higher to use it.`}</p>
          <button
            type="button"
            onClick={() => handleUpgrade()}
            className="btn-primary mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium"
          >
            See plans <FiArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

