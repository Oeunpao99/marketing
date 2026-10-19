import { useEffect, useState } from 'react'
import { aiModelStore, api } from '../../api/client'
import ModelLogo from '../ui/ModelLogo'
import Select from '../ui/Select'

// The AI that writes (captions, ideas, storyboards, the Khmer narration) —
// backend app/ai_models.py. The pick is kept on this device and sent with every
// request (X-AI-Model); "Workspace default" sends nothing and the server uses
// the default set in Settings → AI model. Only models the workspace may use
// are listed, each with its cost tier ($ cheapest … $$$ priciest).

let cached = null // one fetch per page load

/** The workspace default changed (the Autopilot page): fetch the list again next time. */
export function forgetWriterModels() {
  cached = null
}

export function useWriterModels() {
  const [data, setData] = useState(cached)
  useEffect(() => {
    if (cached) return
    let alive = true
    api
      .get('/ai-models')
      .then((d) => {
        cached = d
        if (alive) setData(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return data
}

export default function WriterModelSelect({ size = 'sm', className = 'min-w-0 flex-1', align = 'right', onPick = () => {} }) {
  const data = useWriterModels()
  const [value, setValue] = useState(aiModelStore.get())
  const models = data?.models || []
  // a pick that's no longer allowed falls back to the workspace default
  useEffect(() => {
    if (data && value && !models.some((m) => m.key === value)) {
      aiModelStore.set('')
      setValue('')
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || models.length < 2) return null
  const fallback = models.find((m) => m.key === (data.default || data.platform_default))
  const options = [
    {
      value: '',
      label: `Workspace default${fallback ? ` · ${fallback.label}` : ''}`,
      hint: 'Set in Settings → AI model',
      icon: fallback && <ModelLogo model={fallback.key} vendor={fallback.vendor} size={14} />,
    },
    ...models.map((m) => ({
      value: m.key,
      label: `${m.label}  ${m.tier}`,
      hint: m.blurb,
      icon: <ModelLogo model={m.key} vendor={m.vendor} size={14} />,
    })),
  ]
  return (
    <Select
      size={size}
      align={align}
      className={className}
      value={value}
      onChange={(v) => {
        aiModelStore.set(v)
        setValue(v)
        onPick(v)
      }}
      options={options}
    />
  )
}

/** The hint under the row: what the pick is good at and what it costs. */
export function writerHint(data, value) {
  const models = data?.models || []
  const m = models.find((x) => x.key === (value || data?.default || data?.platform_default))
  if (!m) return 'The AI that writes your captions, ideas and video stories'
  return `${m.blurb} · $${m.price_in} in / $${m.price_out} out per 1M tokens`
}
