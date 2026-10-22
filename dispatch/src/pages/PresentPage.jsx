import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Player } from '@remotion/player'
import { FiChevronLeft, FiChevronRight, FiDownload, FiFilm, FiMaximize, FiX } from 'react-icons/fi'
import { api } from '../api/client'
import { DECK_SETTLE, DeckSlide } from '../../motion/src/deck'
import { useStore } from '../store'

// Slides · Presentation: present a deck in the app (GET /ai/motion/deck/{id}).
// One slide at a time, each animating in like the video (motion/src/deck.jsx —
// the same slides as the PDF and the video). ← → / Space / click to move,
// F for full screen, Esc to leave. "PDF" makes the deck's PDF once (POST
// /ai/motion/deck/{id}/pdf, drawn in the background), then downloads it.

const mediaBase = window.location.port === '5173' ? 'http://localhost:8000' : ''
const abs = (u) => (u && u.startsWith('/media/') ? `${mediaBase}${u}` : u || '')
const W = 1920
const H = 1080

export default function PresentPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { showToast } = useStore()
  const [deck, setDeck] = useState(null)
  const [error, setError] = useState('')
  const [at, setAt] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [pdfWait, setPdfWait] = useState(false)
  const stage = useRef(null)
  const root = useRef(null)

  useEffect(() => {
    api
      .get(`/ai/motion/deck/${id}`)
      .then((d) => {
        setDeck(d)
        setPdfWait(!!d.pdf_making)
      })
      .catch((e) => setError(e.message || 'This deck can’t be opened.'))
  }, [id])

  // the slide, as big as the screen allows (16:9)
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return undefined
    const fit = () => {
      const k = Math.min(el.clientWidth / W, el.clientHeight / H)
      setSize({ w: Math.floor(W * k), h: Math.floor(H * k) })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [deck])

  const count = deck?.slides.length || 0
  const go = useCallback((d) => setAt((n) => Math.max(0, Math.min(count - 1, n + d))), [count])
  const full = () => {
    const el = root.current
    if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.()
  }

  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault()
        go(1)
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'Home') setAt(0)
      else if (e.key === 'End') setAt(count - 1)
      else if (e.key.toLowerCase() === 'f') full()
      else if (e.key === 'Escape' && !document.fullscreenElement) navigate(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, count, navigate])

  // the PDF: drawn once in the background, then downloaded
  useEffect(() => {
    if (!pdfWait) return undefined
    const timer = setInterval(async () => {
      try {
        const d = await api.get(`/ai/motion/deck/${id}`)
        if (d.pdf) {
          setDeck((x) => ({ ...x, pdf: d.pdf }))
          setPdfWait(false)
          window.open(abs(d.pdf), '_blank')
        } else if (!d.pdf_making) {
          setPdfWait(false)
          showToast('Could not make the PDF — try again')
        }
      } catch {
        // a missed poll — the next one tries again
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [pdfWait, id]) // eslint-disable-line react-hooks/exhaustive-deps
  const pdf = async () => {
    if (deck.pdf) return window.open(abs(deck.pdf), '_blank')
    try {
      const r = await api.post(`/ai/motion/deck/${id}/pdf`)
      if (r.pdf) {
        setDeck((x) => ({ ...x, pdf: r.pdf }))
        window.open(abs(r.pdf), '_blank')
      } else setPdfWait(true)
    } catch (e) {
      showToast(e.message || 'Could not make the PDF — try again')
    }
    return null
  }

  if (error) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-5 text-center">
        <div>
          <p className="text-[14px] text-ink-700">{error}</p>
          <button type="button" onClick={() => navigate('/library')} className="btn-outline mt-4">
            Open Library
          </button>
        </div>
      </div>
    )
  }
  if (!deck) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      </div>
    )
  }

  const slide = deck.slides[at]
  const brand = { ...deck.brand, logo: abs(deck.brand?.logo) }
  const scene = { ...slide, image: slide?.image ? abs(slide.image) : slide?.image }
  const btn = 'grid h-10 w-10 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-30'

  return (
    <div ref={root} className="fixed inset-0 z-[120] flex flex-col bg-night-950">
      {/* the slide: click its left third to go back, anywhere else to go on */}
      <div
        ref={stage}
        className="relative flex min-h-0 flex-1 cursor-pointer items-center justify-center p-4 sm:p-8"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          go(e.clientX - box.left < box.width / 3 ? -1 : 1)
        }}
      >
        {size.w > 0 && slide && (
          <div style={{ width: size.w, height: size.h }} className="overflow-hidden rounded-lg shadow-2xl">
            <Player
              key={at}
              component={DeckSlide}
              inputProps={{ scene, brand, n: `${at + 1} / ${count}` }}
              durationInFrames={DECK_SETTLE + 1}
              compositionWidth={W}
              compositionHeight={H}
              fps={30}
              style={{ width: size.w, height: size.h }}
              autoPlay
              controls={false}
              clickToPlay={false}
              moveToBeginningWhenEnded={false}
            />
          </div>
        )}
      </div>

      {/* the bar */}
      <div className="flex flex-none items-center gap-2 border-t border-white/10 px-4 py-2 text-white">
        <button type="button" onClick={() => navigate(-1)} className={btn} title="Leave (Esc)">
          <FiX size={18} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/80">{deck.title}</span>
        <button type="button" onClick={() => go(-1)} disabled={at === 0} className={btn} title="Back (←)">
          <FiChevronLeft size={20} />
        </button>
        <span className="w-16 text-center text-[13px] tabular-nums text-white/70">
          {at + 1} / {count}
        </span>
        <button type="button" onClick={() => go(1)} disabled={at === count - 1} className={btn} title="Next (→ or Space)">
          <FiChevronRight size={20} />
        </button>
        <div className="ml-auto flex flex-1 items-center justify-end gap-1">
          <button type="button" onClick={pdf} disabled={pdfWait} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-semibold text-white/85 hover:bg-white/10 disabled:opacity-60" title="Download the slides as a PDF">
            {pdfWait ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <FiDownload size={14} />}
            {pdfWait ? 'Making PDF…' : 'PDF'}
          </button>
          {deck.video && (
            <a href={abs(deck.video)} download className="flex items-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-semibold text-white/85 hover:bg-white/10" title="Download the slides as a video">
              <FiFilm size={14} /> Video
            </a>
          )}
          <button type="button" onClick={full} className={btn} title="Full screen (F)">
            <FiMaximize size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
