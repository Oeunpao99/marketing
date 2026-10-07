import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FiAlertCircle,
  FiBookmark,
  FiCheckCircle,
  FiGlobe,
  FiHeart,
  FiMessageCircle,
  FiMenu,
  FiMusic,
  FiPlusSquare,
  FiRepeat,
  FiSearch,
  FiSend,
  FiShare2,
  FiThumbsUp,
  FiX,
} from 'react-icons/fi'
import { api } from '../../api/client'
import { kitSrc } from '../brandkit/BrandKit'
import { colorForBrand } from '../../lib/brandColor'
import PlatformIcon, { PLAT_BRAND_CLASS } from '../ui/PlatformIcon'

// "See it before it goes out": the post drawn the way each platform shows it
// in the feed — where the caption is cut ("… See more"), the picture or video,
// the buttons under it — plus checks on how the caption reads on a phone.
// A close mock-up, not the platform itself.

const khmer = (t) => (/[ក-៿]/.test(t || '') ? 'font-khmer' : '')
const URL_RE = /https?:\/\/\S+/g
const URL_ONE = /https?:\/\/\S+/ // no g: .test() keeps no state
const LIST_RE = /^\s*(✓|✔|•|-|\d+[.)])\s/

// How many lines each feed shows before "See more" (phone, with a picture).
const CUT = { Facebook: 3, LinkedIn: 3, Instagram: 2, TikTok: 2 }

/** What a reader on a phone will trip over — each {ok, text}. */
export function captionChecks(caption) {
  const text = (caption || '').trim()
  const lines = text.split('\n')
  const first = lines.find((l) => l.trim()) || ''
  const out = []
  out.push(
    first.length <= 100
      ? { ok: true, text: 'The hook is short enough to show before “See more”' }
      : { ok: false, text: `The first line is ${first.length} characters — Facebook may hide part of the hook. Keep it under ~100.` },
  )
  const longItems = lines.filter((l) => LIST_RE.test(l) && l.trim().length > 40).length
  if (lines.some((l) => LIST_RE.test(l)))
    out.push(
      longItems
        ? { ok: false, text: `${longItems} list line${longItems === 1 ? '' : 's'} wrap${longItems === 1 ? 's' : ''} on a phone — keep each under ~35 characters` }
        : { ok: true, text: 'Every list line fits on one line' },
    )
  const dense = text.split(/\n\s*\n/).some((block) => block.replace(/\s+/g, ' ').length > 280)
  out.push(dense ? { ok: false, text: 'One block is long — split it with a blank line' } : { ok: true, text: 'Short blocks with space between them' })
  const urls = text.match(URL_RE) || []
  if (urls.length) {
    const alone = lines
      .filter((l) => URL_ONE.test(l))
      .every((l) => l.replace(URL_RE, '').replace(/[👉→:\s]/gu, '').length === 0)
    const long = urls.some((u) => u.length > 35)
    out.push(
      !alone
        ? { ok: false, text: 'Put the link on its own line (after 👉), not inside a sentence' }
        : long
          ? { ok: false, text: 'The link is long and breaks across lines — use a short link or put it in the comments' }
          : { ok: true, text: 'The link sits on its own line' },
    )
  }
  const tags = (text.match(/(^|\s)#[^\s#]+/g) || []).length
  if (tags > 3) out.push({ ok: false, text: `${tags} hashtags — 2-3 look better` })
  return out
}

// Sentence ends, Latin and Khmer (។ ៕).
const SENTENCE_END = /(?<=[.!?។៕])\s+(?=\S)/u

/** A long block as 2+ shorter ones, split between sentences (~160 chars each). */
function splitBlock(block) {
  const parts = block.split(SENTENCE_END)
  if (parts.length < 2) return [block]
  const out = []
  let cur = ''
  for (const part of parts) {
    if (cur && (cur + ' ' + part).length > 160) {
      out.push(cur)
      cur = part
    } else cur = cur ? `${cur} ${part}` : part
  }
  if (cur) out.push(cur)
  return out
}

/**
 * The clean phone layout for a caption that's already written — same words,
 * new layout: no markdown, the hook alone on the first line, short blocks with
 * a blank line between, a list set apart, a link alone on its line after 👉,
 * hashtags together on the last line. List items that are too long need new
 * words, so they're left for a person (the checks still flag them).
 */
export function tidyCaption(text) {
  let t = String(text || '').replace(/\r\n/g, '\n')
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/^#{1,6}\s+(?=\S)/gm, '')
  const tags = []
  const lines = []
  for (const raw of t.split('\n')) {
    let l = raw.replace(/[ \t]+$/g, '')
    // hashtags gather at the end
    if (/^\s*(#[^\s#]+\s*)+$/.test(l)) {
      tags.push(...l.trim().split(/\s+/))
      continue
    }
    const trailing = /((?:\s+#[^\s#]+)+)\s*$/.exec(l)
    if (trailing && l.replace(trailing[0], '').trim()) {
      tags.push(...trailing[1].trim().split(/\s+/))
      l = l.replace(trailing[0], '')
    }
    // a link at the end of a sentence goes on its own line (one in the
    // middle would leave the sentence broken — left for a person)
    const url = URL_ONE.exec(l)
    const after = url ? l.slice(url.index + url[0].length) : ''
    if (url && !after.replace(/[\s.!?,;)]/g, '')) {
      const rest = l.replace(url[0], '').replace(/[\s👉→:]+$/u, '').trimEnd()
      if (rest.replace(/[\s👉→:]/gu, '')) {
        lines.push(rest, '', `👉 ${url[0]}`)
        continue
      }
    }
    lines.push(l)
  }

  // blocks = runs of non-empty lines
  const blocks = []
  let cur = []
  for (const l of lines) {
    if (l.trim()) cur.push(l)
    else if (cur.length) blocks.push(cur), (cur = [])
  }
  if (cur.length) blocks.push(cur)

  const out = []
  blocks.forEach((block, bi) => {
    // a list sits apart from the text around it
    const groups = []
    for (const l of block) {
      const isList = LIST_RE.test(l)
      const last = groups[groups.length - 1]
      if (last && last.list === isList) last.lines.push(l)
      else groups.push({ list: isList, lines: [l] })
    }
    for (const g of groups) {
      if (g.list) {
        out.push(g.lines.join('\n'))
        continue
      }
      // The writer's own line breaks stay; only a very long line is split.
      let keep = []
      const flush = () => {
        if (keep.length) out.push(keep.join('\n'))
        keep = []
      }
      for (const raw of g.lines) {
        let line = raw.replace(/\s+/g, ' ').trim()
        // the hook: the post's first sentence alone on the first line
        if (bi === 0 && out.length === 0 && !keep.length && line.length > 100) {
          const [first, ...more] = line.split(SENTENCE_END)
          if (more.length && first.length <= 140) {
            out.push(first)
            line = more.join(' ')
          }
        }
        if (line.length > 280) {
          flush()
          out.push(...splitBlock(line))
        } else keep.push(line)
      }
      flush()
    }
  })
  let result = out.filter((b) => b.trim()).join('\n\n')
  const seen = new Set()
  const uniq = tags.filter((x) => !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
  if (uniq.length) result += `\n\n${uniq.join(' ')}`
  return result
}

/** The caption cut where the feed cuts it, with a See more / more toggle. */
function Caption({ text, lines, more = '… See more', className = '' }) {
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setCut(el.scrollHeight > el.clientHeight + 1)
  }, [text, lines, open])
  useEffect(() => setOpen(false), [text])
  return (
    <div className={className}>
      <div
        ref={ref}
        className={`whitespace-pre-line break-words ${khmer(text)}`}
        style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {text}
      </div>
      {cut && !open && (
        <button type="button" onClick={() => setOpen(true)} className="font-semibold text-ink-500 hover:underline">
          {more}
        </button>
      )}
    </div>
  )
}

function Avatar({ name, slug, logo, size = 'h-10 w-10' }) {
  if (logo) return <img src={logo} alt="" className={`${size} flex-none rounded-full border border-ink-100 bg-white object-contain`} />
  return (
    <span className={`${size} grid flex-none place-items-center rounded-full text-[13px] font-bold text-white`} style={{ background: colorForBrand(slug) }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

function Media({ media, note, square = false, className = '' }) {
  if (media?.url) {
    // a file picked on this computer (blob:) or a full URL is used as it is
    const src = /^(https?:|blob:|data:)/i.test(media.url) ? media.url : kitSrc(media.url)
    return media.kind === 'video' ? (
      <video src={src} controls playsInline className={`block w-full bg-night-950 ${className}`} />
    ) : (
      <img src={src} alt="" className={`block w-full object-cover ${square ? 'aspect-square' : ''} ${className}`} />
    )
  }
  if (!note) return null
  return (
    <div className={`grid aspect-square w-full place-items-center bg-ink-100 px-8 text-center text-[12px] leading-relaxed text-ink-500 ${className}`}>
      {note}
    </div>
  )
}

const action = 'flex flex-1 items-center justify-center gap-1.5 py-2 text-[12.5px] font-semibold text-ink-500'

function FacebookPost({ brand, caption, media, note }) {
  return (
    <div className="bg-white">
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <Avatar {...brand} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-ink-900">{brand.name}</div>
          <div className="flex items-center gap-1 text-[12px] text-ink-500">
            Just now · <FiGlobe size={11} aria-hidden="true" />
          </div>
        </div>
      </div>
      <Caption text={caption} lines={CUT.Facebook} className="px-3 py-2.5 text-[14.5px] leading-snug text-ink-900" />
      <Media media={media} note={note} />
      <div className="mx-3 flex border-t border-ink-100">
        <span className={action}><FiThumbsUp size={15} /> Like</span>
        <span className={action}><FiMessageCircle size={15} /> Comment</span>
        <span className={action}><FiShare2 size={15} /> Share</span>
      </div>
    </div>
  )
}

function LinkedInPost({ brand, caption, media, note }) {
  return (
    <div className="bg-white">
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <Avatar {...brand} size="h-11 w-11" />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-ink-900">{brand.name}</div>
          <div className="text-[11.5px] text-ink-500">Company page</div>
          <div className="flex items-center gap-1 text-[11.5px] text-ink-500">
            now · <FiGlobe size={10} aria-hidden="true" />
          </div>
        </div>
      </div>
      <Caption text={caption} lines={CUT.LinkedIn} more="…see more" className="px-3 py-2.5 text-[14px] leading-snug text-ink-900" />
      <Media media={media} note={note} />
      <div className="mx-3 flex border-t border-ink-100">
        <span className={action}><FiThumbsUp size={15} /> Like</span>
        <span className={action}><FiMessageCircle size={15} /> Comment</span>
        <span className={action}><FiRepeat size={15} /> Repost</span>
        <span className={action}><FiSend size={15} /> Send</span>
      </div>
    </div>
  )
}

function InstagramPost({ brand, caption, media, note }) {
  const handle = (brand.name || '').toLowerCase().replace(/[^a-z0-9._]/g, '')
  return (
    <div className="bg-white">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Avatar {...brand} size="h-8 w-8" />
        <span className="text-[13.5px] font-semibold text-ink-900">{handle || brand.name}</span>
      </div>
      <Media media={media} note={note} square />
      <div className="flex items-center gap-4 px-3 pt-2.5 text-ink-900">
        <FiHeart size={21} />
        <FiMessageCircle size={21} />
        <FiSend size={21} />
        <FiBookmark size={21} className="ml-auto" />
      </div>
      <div className="px-3 pb-3 pt-2 text-[13.5px] leading-snug text-ink-900">
        <span className="font-semibold">{handle || brand.name}</span>{' '}
        <Caption text={caption} lines={CUT.Instagram} more="… more" className="inline" />
      </div>
    </div>
  )
}

function TikTokPost({ brand, caption, media, note }) {
  const handle = (brand.name || '').toLowerCase().replace(/[^a-z0-9._]/g, '')
  return (
    <div className="relative h-full min-h-[680px] w-full overflow-hidden bg-night-950">
      {media?.url ? (
        <Media media={media} className="h-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center px-10 text-center text-[12px] leading-relaxed text-white/70">{note}</div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-night-950/90 to-transparent px-3 pb-4 pt-16 text-white">
        <div className="text-[14px] font-semibold">@{handle || 'brand'}</div>
        <div className="pointer-events-auto">
          <Caption text={caption} lines={CUT.TikTok} more="more" className="mt-1 text-[13px] leading-snug [&_button]:text-white/80" />
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[12px] text-white/80">
          <FiMusic size={12} /> Original sound — {brand.name}
        </div>
      </div>
    </div>
  )
}

function TelegramPost({ brand, caption, media }) {
  return (
    <div className="bg-canvas p-3">
      <div className="max-w-[92%] overflow-hidden rounded-2xl rounded-bl-md bg-white shadow-card">
        {media?.url && <Media media={media} />}
        <div className="px-3 pb-2 pt-2">
          <div className="mb-0.5 text-[13px] font-semibold text-brand">{brand.name}</div>
          <div className={`whitespace-pre-line break-words text-[14px] leading-snug text-ink-900 ${khmer(caption)}`}>{caption}</div>
          <div className="mt-1 text-right text-[11px] text-ink-400">now</div>
        </div>
      </div>
    </div>
  )
}

// ── the phone around the post ─────────────────────────────────────────────
// A dark bezel (night = dark in both themes) with the Dynamic Island, the
// status bar, the app's own top bar, the feed (scrolls inside the screen) and
// the home bar — so the post is judged at a real phone's width.
function StatusBar({ dark }) {
  const ink = dark ? 'text-white' : 'text-ink-900'
  return (
    <div className={`flex h-11 flex-none items-end justify-between px-7 pb-1.5 text-[13px] font-semibold ${ink}`}>
      <span className="tabular-nums">9:41</span>
      <span className="flex items-center gap-1.5" aria-hidden="true">
        <span className="flex items-end gap-[2px]">
          {[4, 6, 8, 10].map((h) => (
            <span key={h} className={`w-[3px] rounded-sm ${dark ? 'bg-white' : 'bg-ink-900'}`} style={{ height: h }} />
          ))}
        </span>
        <span className="text-[11px] font-bold">5G</span>
        <span className={`relative h-[11px] w-[22px] rounded-[3px] border ${dark ? 'border-white/60' : 'border-ink-900/50'}`}>
          <span className={`absolute inset-[1.5px] right-[5px] rounded-[1px] ${dark ? 'bg-white' : 'bg-ink-900'}`} />
        </span>
      </span>
    </div>
  )
}

function AppBar({ app, brand }) {
  if (app === 'Facebook')
    return (
      <div className="flex flex-none items-center justify-between border-b border-ink-100 bg-white px-4 py-2">
        <span className={`text-[24px] font-extrabold tracking-tight ${PLAT_BRAND_CLASS.Facebook}`}>facebook</span>
        <span className="flex gap-2 text-ink-800">
          {[FiPlusSquare, FiSearch, FiMessageCircle].map((I, n) => (
            <span key={n} className="grid h-8 w-8 place-items-center rounded-full bg-ink-100">
              <I size={15} />
            </span>
          ))}
        </span>
      </div>
    )
  if (app === 'Instagram')
    return (
      <div className="flex flex-none items-center justify-between border-b border-ink-100 bg-white px-4 py-2.5 text-ink-900">
        <span className="font-display text-[22px] italic tracking-tight">Instagram</span>
        <span className="flex gap-4">
          <FiHeart size={21} />
          <FiSend size={21} />
        </span>
      </div>
    )
  if (app === 'LinkedIn')
    return (
      <div className="flex flex-none items-center gap-2.5 border-b border-ink-100 bg-white px-3 py-2">
        <span className="h-7 w-7 flex-none rounded-full bg-ink-200" />
        <span className="flex flex-1 items-center gap-1.5 rounded-md bg-ink-100 px-2.5 py-1.5 text-[12.5px] text-ink-500">
          <FiSearch size={13} /> Search
        </span>
        <FiMessageCircle size={20} className="text-ink-600" />
      </div>
    )
  if (app === 'Telegram')
    return (
      <div className="flex flex-none items-center gap-2.5 border-b border-ink-100 bg-white px-3 py-2">
        <span className="text-[13px] font-semibold text-brand">‹ Back</span>
        <span className="min-w-0 flex-1 text-center">
          <span className="block truncate text-[14px] font-semibold text-ink-900">{brand.name}</span>
          <span className="block text-[11px] text-ink-400">channel</span>
        </span>
        <span className="h-8 w-8 flex-none rounded-full bg-ink-200" />
      </div>
    )
  return null
}

function PhoneFrame({ app, brand, children }) {
  const dark = app === 'TikTok'
  return (
    <div className="mx-auto w-full max-w-[360px] rounded-[52px] bg-night-950 p-[11px] shadow-[0_30px_60px_-20px_rgba(16,24,40,0.45)] ring-1 ring-night-800">
      <div className={`relative flex h-[680px] flex-col overflow-hidden rounded-[42px] ${dark ? 'bg-night-950' : 'bg-white'}`}>
        {/* Dynamic Island */}
        <span className="absolute left-1/2 top-[11px] z-20 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-night-950" aria-hidden="true" />
        {dark ? (
          <div className="absolute inset-x-0 top-0 z-10">
            <StatusBar dark />
            <div className="flex justify-center gap-4 text-[14px] font-semibold text-white/70">
              <span>Following</span>
              <span className="text-white underline decoration-2 underline-offset-8">For You</span>
            </div>
          </div>
        ) : (
          <>
            <StatusBar />
            <AppBar app={app} brand={brand} />
          </>
        )}
        <div className={`min-h-0 flex-1 overflow-y-auto ${dark ? '' : 'bg-canvas'}`}>
          {dark ? (
            children
          ) : (
            <>
              <div className="h-2" />
              {children}
              {/* the next post in the feed, faded */}
              <div className="mt-2 space-y-2 bg-white p-3 opacity-50" aria-hidden="true">
                <div className="flex items-center gap-2">
                  <span className="h-9 w-9 rounded-full bg-ink-200" />
                  <span className="h-3 w-28 rounded bg-ink-200" />
                </div>
                <span className="block h-3 w-4/5 rounded bg-ink-100" />
                <span className="block h-32 rounded bg-ink-100" />
              </div>
            </>
          )}
        </div>
        {/* home bar */}
        <span
          className={`absolute bottom-2 left-1/2 z-20 h-[5px] w-[120px] -translate-x-1/2 rounded-full ${dark ? 'bg-white/80' : 'bg-ink-900/80'}`}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

const RENDER = { Facebook: FacebookPost, LinkedIn: LinkedInPost, Instagram: InstagramPost, TikTok: TikTokPost, Telegram: TelegramPost }

/**
 * The preview drawer.
 * - brand: { id, name, slug }
 * - caption: the text as it will go out
 * - media: { kind: 'image' | 'video', url } or null
 * - note: what to show where the media will be, when there's none yet
 * - platforms: platform names ("Facebook", …) — one tab each
 * - byPlatform: optional { Facebook: { caption, brand } } when each platform
 *   gets its own caption (Compose) — overrides caption / brand for that tab
 * - onFix(caption, platform): optional — shows "Tidy the format", which saves
 *   the cleaned caption through it
 */
export default function SocialPreview({ brand: baseBrand, caption: baseCaption, media, note, platforms, byPlatform, onFix, onClose }) {
  const tabs = (platforms || []).filter((p) => RENDER[p])
  const list = tabs.length ? tabs : ['Facebook']
  const [tab, setTab] = useState(list[0])
  const [logo, setLogo] = useState('')
  // a tidied caption shows here at once, before the page saves it
  const [tidied, setTidied] = useState({})
  const brand = byPlatform?.[tab]?.brand || baseBrand
  const caption = tidied[tab] ?? byPlatform?.[tab]?.caption ?? baseCaption

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The brand kit's logo as the page picture, when there is one.
  useEffect(() => {
    setLogo('')
    if (!brand?.id) return
    let live = true
    api
      .get(`/brand-kit?brand_id=${brand.id}`)
      .then((xs) => {
        const l = (xs || []).find((x) => x.kind === 'logo')
        if (live) setLogo(l ? kitSrc(l.url) : '')
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [brand?.id])

  const Post = RENDER[tab] || FacebookPost
  const checks = captionChecks(caption)
  const issues = checks.filter((c) => !c.ok).length
  const clean = tidyCaption(caption)
  const canTidy = !!onFix && !!caption?.trim() && clean !== caption.trim()
  const tidy = () => {
    // Compose: one caption per platform; elsewhere one caption for every tab
    const next = byPlatform ? { ...tidied, [tab]: clean } : Object.fromEntries(list.map((p) => [p, clean]))
    setTidied(next)
    onFix(clean, tab)
  }

  return createPortal(
    <div className="fixed inset-0 z-[96]">
      <button type="button" aria-label="Close" className="absolute inset-0 glass-overlay animate-fadein cursor-default" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label="Post preview" className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col glass-drawer animate-drawer-in">
        <header className="flex items-center gap-3 border-b border-ink-100 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold tracking-tight text-ink-900">Preview</h2>
            <p className="text-[11.5px] text-ink-500">How it looks in the feed — tap “See more” to open the caption</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100" aria-label="Close">
            <FiX size={18} />
          </button>
        </header>

        {list.length > 1 && (
          <div className="flex gap-1 border-b border-ink-100 px-5 py-2.5" role="tablist">
            {list.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={tab === p}
                onClick={() => setTab(p)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  tab === p ? 'bg-brand-soft text-brand' : 'text-ink-500 hover:bg-ink-50'
                }`}
              >
                <PlatformIcon name={p} />
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-canvas px-5 py-5">
          <PhoneFrame app={tab} brand={brand}>
            <Post brand={{ ...brand, logo }} caption={caption || ''} media={media} note={note} />
          </PhoneFrame>

          <section className="mx-auto mt-5 max-w-[380px]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[.06em] text-ink-400">
                On a phone {issues ? `· ${issues} to look at` : '· looks good'}
              </h3>
              {canTidy && (
                <button
                  type="button"
                  onClick={tidy}
                  className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-brand-dark"
                  title="Same words, clean layout: short blocks, list set apart, link on its own line, hashtags last"
                >
                  Tidy the format
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-1.5">
              {checks.map((c, n) => (
                <li key={n} className="flex items-start gap-2 text-[12.5px] leading-snug">
                  {c.ok ? (
                    <FiCheckCircle size={14} className="mt-0.5 flex-none text-emerald-600" aria-hidden="true" />
                  ) : (
                    <FiAlertCircle size={14} className="mt-0.5 flex-none text-amber-600" aria-hidden="true" />
                  )}
                  <span className={c.ok ? 'text-ink-600' : 'text-ink-800'}>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>,
    document.body,
  )
}
