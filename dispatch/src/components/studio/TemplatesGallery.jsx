import { FiArrowRight, FiClock } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { GOALS, STAGES } from '../../lib/goals'
import { GOAL_TEMPLATE, MOTION_TEMPLATES, templateById } from '../../lib/motionTemplates'

// Content studio → Templates: every Remotion video template, with a preview,
// its story and the content goals that use it — then which template each of
// the 9 goals gets. "Use this template" opens the chat on Remotion with that
// story picked (AIPromptPage reads location.state.motionStory).

const card = 'bg-white rounded-2xl border border-ink-200/60 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

export default function TemplatesGallery() {
  const navigate = useNavigate()
  const use = (t) => navigate('/ai?tab=images', { state: { motionStory: t.story } })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-900">Video templates · {MOTION_TEMPLATES.length}</h2>
        <p className="mt-0.5 max-w-[80ch] text-[12.5px] text-ink-500">
          Animated videos made from your brand — your logo, photos, a Khmer or English voice with subtitles, and music. Each template
          tells a different kind of story. The weekly plan picks one from each post’s goal; here you can pick one yourself.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {MOTION_TEMPLATES.map((t) => (
          <article key={t.id} className={`${card} flex flex-col overflow-hidden`}>
            <div className="aspect-[9/16] max-h-[360px] overflow-hidden bg-night-950">
              <img src={`/templates/${t.id}.jpg`} alt={`${t.name} template preview`} loading="lazy" className="h-full w-full object-cover object-top" />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <h3 className="text-[14.5px] font-semibold text-ink-900">{t.name}</h3>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-500">{t.look}</p>
              <ol className="mt-3 flex flex-wrap items-center gap-1 text-[11px] text-ink-600">
                {t.steps.map((s, i) => (
                  <li key={s} className="flex items-center gap-1">
                    {i > 0 && <span className="text-ink-300">→</span>}
                    <span className="rounded-md bg-ink-50 px-1.5 py-0.5">{s}</span>
                  </li>
                ))}
              </ol>
              {t.note && <p className="mt-2 text-[11px] leading-snug text-ink-400">{t.note}</p>}
              <div className="mt-3 flex flex-wrap gap-1">
                {t.goals.map((g) => (
                  <span key={g} className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STAGES[GOALS[g].stage].chip}`}>
                    {GOALS[g].label}
                  </span>
                ))}
              </div>
              <button type="button" onClick={() => use(t)} className="btn-primary mt-4 justify-center">
                Use this template <FiArrowRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>

      <section className={`${card} p-5`}>
        <h2 className="text-[15px] font-semibold text-ink-900">Which template each goal uses</h2>
        <p className="mt-0.5 text-[12px] text-ink-500">The weekly plan follows this. Goals marked “coming” use Teach until their own template is ready.</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-3">
          {Object.entries(STAGES).map(([key, stage]) => (
            <div key={key}>
              <div className={`border-b-2 pb-1.5 text-[11px] font-bold uppercase tracking-[.08em] ${stage.line} ${stage.text}`}>{stage.label}</div>
              <ul className="mt-2 divide-y divide-ink-100">
                {Object.entries(GOALS)
                  .filter(([, g]) => g.stage === key)
                  .map(([gk, g]) => {
                    const m = GOAL_TEMPLATE[gk]
                    const t = templateById(m?.id)
                    return (
                      <li key={gk} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="text-[13px] font-medium text-ink-800">{g.label}</span>
                        <span className="flex flex-wrap items-center justify-end gap-1.5 text-[12px]">
                          <span className="font-semibold text-ink-900">{t?.name}</span>
                          {m?.planned && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                              <FiClock size={10} aria-hidden="true" /> {m.planned} coming
                            </span>
                          )}
                        </span>
                      </li>
                    )
                  })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
