import { FiArrowRight, FiCheck, FiDatabase, FiLock, FiUsers, FiZap } from 'react-icons/fi'
import { SiTelegram } from 'react-icons/si'
import { useNavigate } from 'react-router-dom'
import { FEATURE_NAMES, has, NEEDS, usePlanFeatures } from '../../lib/planFeatures'
import LiveAvatar from '../ui/LiveAvatar'

// what each locked page says it does, so the lock sells the feature
const PAGE_TEXT = {
  leads:
    'Send each lead to the right sales rep on Telegram — 3 reps on Growth, 10 on Business.',
  api:
    'Let Claude, ChatGPT or your own systems use Smart Marketing — plan posts, make videos and read results through an API key or the MCP connector.',
}

/** A whole page the plan doesn't include: the lock in its place (the server refuses it anyway). */
export function PlanGate({ feature, children }) {
  const features = usePlanFeatures()
  return has(features, feature) ? children : <PlanLock page feature={feature} text={PAGE_TEXT[feature]} />
}

/** Full-width showcase for the Leads & hand-off feature: short lines, the picture does the explaining */
const Tick = ({ children }) => (
  <li className="flex items-start gap-2.5">
    <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-emerald-100 text-emerald-700">
      <FiCheck size={12} strokeWidth={3} />
    </span>
    <span>{children}</span>
  </li>
)

function LeadsPlanPage({ onUpgrade }) {
  return (
    <div className="w-full px-5 lg:px-8 py-7 animate-fadein space-y-7">
      <div className="relative w-full overflow-hidden rounded-3xl border border-brand-line/70 bg-gradient-to-br from-white via-brand-soft/30 to-brand-soft/60 p-6 sm:p-9 lg:p-10 shadow-pop">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white/90 px-3.5 py-1.5 shadow-sm">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white">
                <FiZap size={11} />
              </span>
              <span className="text-[12px] font-bold tracking-wide uppercase text-brand">Growth &amp; Business</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-ink-900 leading-tight">
              Send every lead to the right sales rep
            </h1>
            <p className="text-[14.5px] sm:text-[15.5px] text-ink-600 leading-relaxed">
              Leads from your chatbot and posts reach your team on Telegram.
            </p>
            <p className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200/60 bg-white/80 px-3 py-1.5 text-[13px] font-medium text-ink-700 shadow-xs">
              <FiCheck size={14} className="text-emerald-600" /> Included in <b className="text-ink-900">Growth</b> and <b className="text-ink-900">Business</b>
            </p>
            <div className="flex flex-wrap items-center gap-3.5 pt-2">
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
          <div className="relative hidden flex-col items-center justify-center lg:flex lg:pl-6">
            <div className="absolute inset-0 m-auto h-36 w-36 rounded-full bg-gradient-to-tr from-brand/20 to-brand-light/30 blur-xl" />
            <div className="relative z-10">
              <LiveAvatar size={150} wave={true} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-ink-200/70 bg-white p-6 sm:p-8 shadow-card">
        <h2 className="mb-5 text-xl sm:text-2xl font-bold text-ink-900">How it works</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-ink-200/70 bg-canvas-soft p-5 space-y-3">
            <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-ink-500">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white text-[10px]">1</span>
              Customer asks
            </span>
            <div className="rounded-xl border border-ink-200/60 bg-white p-3 shadow-xs">
              <div className="text-[13px] font-bold text-ink-900">Sokha Meng</div>
              <p className="mt-1 text-[12px] text-ink-600">"I need 50 units. Please contact me."</p>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-line/80 bg-brand-soft/40 p-5 space-y-3">
            <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-brand">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white text-[10px]">2</span>
              We pick a rep
            </span>
            <div className="rounded-xl border border-brand-line/60 bg-white p-3 shadow-xs">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-bold text-ink-900">Dara</span>
                <span className="text-[11.5px] font-semibold text-emerald-600">Available</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                <div className="h-full w-2/3 rounded-full bg-brand" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#229ED9]/30 bg-[#229ED9]/5 p-5 space-y-3">
            <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[#0088cc]">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#229ED9] text-white text-[10px]">3</span>
              Rep gets it
            </span>
            <div className="rounded-xl border border-[#229ED9]/30 bg-white p-3 shadow-xs">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#0088cc]">
                <SiTelegram size={14} /> New lead for Dara
              </div>
              <p className="mt-1 text-[12px] text-ink-500">Sent in seconds</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="relative flex flex-col justify-between rounded-3xl border-2 border-brand bg-white p-6 sm:p-7 shadow-pop">
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
            <div className="my-5 flex items-center gap-2.5 rounded-2xl border border-brand-line/60 bg-brand-soft/50 p-4">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-brand text-white shadow-xs">
                <FiUsers size={18} />
              </span>
              <div>
                <div className="text-[14px] font-bold text-ink-900">3 Sales Reps on Telegram</div>
                <div className="text-[12px] text-ink-600">Assign leads automatically to 3 individual reps</div>
              </div>
            </div>
            <ul className="space-y-2.5 text-[13px] text-ink-700">
              <Tick>Collect leads from chatbot &amp; post comments</Tick>
              <Tick>Instant routing &amp; notification by Telegram</Tick>
              <Tick>Insights: leads, deals, response time &amp; revenue</Tick>
              <Tick>All leads currently collected are stored &amp; ready</Tick>
            </ul>
          </div>
          <button type="button" onClick={() => onUpgrade('pro')} className="btn-primary mt-6 flex w-full items-center justify-center gap-2 py-3 text-[14px] font-semibold">
            Upgrade to Growth <FiArrowRight size={15} />
          </button>
        </div>

        <div className="relative flex flex-col justify-between rounded-3xl border border-ink-200/80 bg-white p-6 sm:p-7 shadow-card">
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
            <div className="my-5 flex items-center gap-2.5 rounded-2xl border border-ink-200/60 bg-canvas p-4">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-night-900 text-white shadow-xs">
                <FiUsers size={18} />
              </span>
              <div>
                <div className="text-[14px] font-bold text-ink-900">10 Sales Reps on Telegram</div>
                <div className="text-[12px] text-ink-600">Full sales department routing with capacity limits</div>
              </div>
            </div>
            <ul className="space-y-2.5 text-[13px] text-ink-700">
              <Tick>Everything in Growth, scaled for large volume</Tick>
              <Tick>Up to 10 sales reps with custom routing rules</Tick>
              <Tick>Export leads &amp; performance to Excel / CSV</Tick>
              <Tick>3 brands with separate routing &amp; API / MCP access</Tick>
            </ul>
          </div>
          <button type="button" onClick={() => onUpgrade('business')} className="btn-ghost mt-6 flex w-full items-center justify-center gap-2 border border-ink-200 py-3 text-[14px] font-semibold text-ink-900 hover:bg-canvas">
            Upgrade to Business <FiArrowRight size={15} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-ink-200/80 bg-ink-50 p-4 sm:p-5">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-emerald-600 text-white shadow-xs">
          <FiDatabase size={16} />
        </span>
        <p className="text-[13.5px] text-ink-700">
          <b className="text-ink-900">Nothing is lost.</b> Leads your chatbot sends now are saved until you upgrade.
        </p>
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

