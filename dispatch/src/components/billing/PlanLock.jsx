import { FiArrowRight, FiLock } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { FEATURE_NAMES, has, NEEDS, usePlanFeatures } from '../../lib/planFeatures'

// what each locked page says it does, so the lock sells the feature
const PAGE_TEXT = {
  leads: 'Collect leads from your chatbot and your posts, and hand each one to the right sales rep by Telegram — 3 reps on Growth, 10 on Business. Leads your chatbot sends now are kept for you.',
  api: 'Let Claude, ChatGPT or your own systems use Smart Marketing — plan posts, make videos and read results through an API key or the MCP connector.',
}

/** A whole page the plan doesn't include: the lock in its place (the server refuses it anyway). */
export function PlanGate({ feature, children }) {
  const features = usePlanFeatures()
  return has(features, feature) ? children : <PlanLock page feature={feature} text={PAGE_TEXT[feature]} />
}

/** A feature the plan doesn't include: what it is, the plan that has it, and Upgrade.
 *  ``page`` = in place of a whole page; else a card inside one. */
export default function PlanLock({ feature, text, page = false }) {
  const navigate = useNavigate()
  const name = FEATURE_NAMES[feature] || feature
  const plan = NEEDS[feature] || 'a higher'
  const card = (
    <div className="rounded-2xl border border-brand-line bg-brand-soft px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white text-brand">
          <FiLock size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-ink-900">{name} is on the {plan} plan</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{text || `Upgrade to ${plan} or higher to use it.`}</p>
          <button type="button" onClick={() => navigate('/upgrade')} className="btn-primary mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px]">
            See plans <FiArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  )
  if (!page) return card
  return (
    <div className="w-full px-5 py-8 lg:px-10 lg:py-10 animate-fadein">
      <div className="mx-auto max-w-[620px] pt-6">{card}</div>
    </div>
  )
}
