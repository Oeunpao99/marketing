import { useRef, useState } from 'react'
import { FiPause, FiPlay } from 'react-icons/fi'
import { api } from '../../api/client'
import Select from '../ui/Select'
import { useStore } from '../../store'

// KiriTTS's Khmer voices, picked by name under Female / Male (GET
// /ai/motion/voice-status "kiri"). The setting is "female" / "male" for the
// default voice, "kiri:Neary" for one picked — app/voice_clone.py narrator_for.
// ▶ reads a short line in that voice (POST /ai/motion/say — a few credits).

const SAMPLE = 'សួស្តី! នេះជាសំឡេងរបស់ខ្ញុំ សម្រាប់វីដេអូរបស់អ្នក។'

/** female / male for a Voice setting — "kiri:Dara" is male. */
export function kiriGender(setting, status) {
  if (!String(setting || '').startsWith('kiri:')) return setting
  const name = setting.slice(5)
  return status?.kiri?.find((v) => v.name === name)?.gender || 'female'
}

export default function KiriVoicePicker({ status, value, onChange, brandId, style }) {
  const { showToast } = useStore()
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const audio = useRef(null)
  const gender = kiriGender(value, status)
  const voices = (status?.kiri || []).filter((v) => v.gender === gender)
  if (!voices.length || !['female', 'male'].includes(gender)) return null

  const fallback = status?.kiri_default?.[gender] || ''
  const options = [
    { value: gender, label: fallback || (gender === 'female' ? 'Kore' : 'Charon'), hint: fallback ? 'KiriTTS · the default' : 'Gemini · the default' },
    ...voices.filter((v) => v.name !== fallback).map((v) => ({ value: `kiri:${v.name}`, label: v.name, hint: 'KiriTTS' })),
  ]

  const listen = async () => {
    audio.current?.pause()
    if (playing) return setPlaying(false)
    if (!brandId) return showToast('Pick a brand first')
    setLoading(true)
    try {
      const blob = await api.blob('/ai/motion/say', { brand_id: brandId, text: SAMPLE, language: 'Khmer', voice: value, style: style || '' })
      const a = new Audio(URL.createObjectURL(blob))
      a.onended = () => setPlaying(false)
      await a.play()
      audio.current = a
      setPlaying(true)
    } catch (e) {
      showToast(e.message || 'Could not play the voice — try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <Select size="sm" className="min-w-0 flex-1" value={value} options={options} onChange={onChange} aria-label="Voice" />
      <button
        type="button"
        onClick={listen}
        disabled={loading}
        title="Hear this voice"
        className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-ink-200 text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
      >
        {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand/30 border-t-brand" /> : playing ? <FiPause size={13} /> : <FiPlay size={13} />}
      </button>
    </div>
  )
}
