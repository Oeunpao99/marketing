/**
 * Slides · Presentation — a deck written from a prompt or a pasted text,
 * drawn like the video templates: clean light pages, the brand's colour and
 * logo, every slide animating in and settled by SETTLE. The same slides play
 * three ways: the video (MotionPost style "deck", one scene a slide), the
 * presenter in the app (pages/PresentPage.jsx — DeckSlide, one slide at a time)
 * and the PDF (DeckPages: frame n = slide n at rest; app/motion.py deck_pdf).
 * Imports only remotion, react and lucide — it also runs inside the app.
 *
 * Slides (app/motion.py DECK_PROMPT):
 *   hook      { text, sub? }                                    the cover
 *   agenda    { title, entries: [text] }                        what's coming, numbered
 *   keypoints { title, blocks: [{ title, text, icon }] }        2-4 cards
 *   bignum    { value, prefix?, suffix?, label, text? }         one number, counting up
 *   barchart  { title, data: [{ label, value }], suffix? }      bars rising
 *   twocol    { title, cols: [{ label, items: [text] }] }       two columns side by side
 *   pullquote { text, author?, role? }                          a quote
 *   picture   { title, text, image? }                           a picture beside the words
 *   roadmap   { title, stages: [{ title, text }] }              steps along a line
 *   statement { text, sub? }                                    one big sentence
 *   cta       { text, button? }                                 the close
 */
// only the icons the AI may pick (app/motion.py ICONS) — the presenter in the app stays light
import {
  AlarmClock,
  Award,
  Baby,
  BadgePercent,
  Banknote,
  Bell,
  BellRing,
  Bike,
  BookOpen,
  Bot,
  BotMessageSquare,
  BrainCircuit,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  Car,
  ChartColumn,
  ChartLine,
  CircleCheck,
  CircleX,
  Clock,
  Cloud,
  Code,
  Coffee,
  Cpu,
  CreditCard,
  Crown,
  Database,
  Droplet,
  Dumbbell,
  FileText,
  Flame,
  Flower2,
  Frown,
  Gauge,
  Gift,
  Globe,
  GraduationCap,
  Hand,
  HandHeart,
  Handshake,
  Headphones,
  Heart,
  Hourglass,
  House,
  Image,
  Inbox,
  Infinity,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Leaf,
  Lightbulb,
  ListChecks,
  Lock,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Moon,
  MousePointerClick,
  Newspaper,
  Package,
  Percent,
  Phone,
  Plug,
  RefreshCw,
  Rocket,
  Scissors,
  Search,
  Send,
  Server,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Store,
  Sun,
  Tag,
  Target,
  ThumbsUp,
  Timer,
  TrendingUp,
  TriangleAlert,
  Truck,
  UserCheck,
  Users,
  Utensils,
  Video,
  Wallet,
  WandSparkles,
  Workflow,
  Zap,
} from 'lucide-react'
import { AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, useFonts } from './fonts'

export const DECK_SETTLE = 60 // every slide is at rest by this frame (2 s)
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const C = { bg: '#F6F7FB', card: '#FFFFFF', ink: '#0F172A', sub: '#526077', line: '#E3E7EF', soft: '#EEF1F7' }
const SHADOW = '0 18px 44px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.05)'

const srcOf = (src) => (!src ? null : /^(https?:|data:|blob:|\/media\/)/.test(src) ? src : staticFile(src))
const plain = (t) => String(t || '').replace(/[⟦⟧]/g, '')
const ICONS = { AlarmClock, Award, Baby, BadgePercent, Banknote, Bell, BellRing, Bike, BookOpen, Bot, BotMessageSquare, BrainCircuit, Briefcase, Building2, Calendar, Camera, Car, ChartColumn, ChartLine, CircleCheck, CircleX, Clock, Cloud, Code, Coffee, Cpu, CreditCard, Crown, Database, Droplet, Dumbbell, FileText, Flame, Flower2, Frown, Gauge, Gift, Globe, GraduationCap, Hand, HandHeart, Handshake, Headphones, Heart, Hourglass, House, Image, Inbox, Infinity, KeyRound, Laptop, LayoutDashboard, Leaf, Lightbulb, ListChecks, Lock, Mail, MapPin, Megaphone, MessageCircle, MessagesSquare, Moon, MousePointerClick, Newspaper, Package, Percent, Phone, Plug, RefreshCw, Rocket, Scissors, Search, Send, Server, ShieldCheck, Shirt, ShoppingBag, ShoppingCart, Smartphone, Smile, Sparkles, Sprout, Star, Store, Sun, Tag, Target, ThumbsUp, Timer, TrendingUp, TriangleAlert, Truck, UserCheck, Users, Utensils, Video, Wallet, WandSparkles, Workflow, Zap }
function Icon({ name, size = 40, color = '#fff', stroke = 2 }) {
  const I = ICONS[name] || Sparkles
  return <I size={size} color={color} strokeWidth={stroke} />
}
function tint(hex, a) {
  const h = String(hex || '#2563EB').replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** Text with ⟦highlights⟧ in the brand colour (Khmer word breaks are zero-width spaces — the browser wraps there). */
function Hl({ text, color }) {
  const parts = String(text || '').split(/([⟦⟧])/)
  let on = false
  return parts.map((p, i) => {
    if (p === '⟦') {
      on = true
      return null
    }
    if (p === '⟧') {
      on = false
      return null
    }
    return on ? (
      <span key={i} style={{ color }}>
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    )
  })
}

const useIn = (delay = 0, damping = 16) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping } })
}
const rise = (s, px = 40) => ({ opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * px}px)` })

/** The page: soft background, the brand's colour in a large faint circle, the logo top-left, the slide's number. */
function Page({ brand, n, children, plainBg = false, noLogo = false }) {
  const frame = useCurrentFrame()
  const drift = Math.sin(frame / 60) * 10
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, color: C.ink, overflow: 'hidden' }}>
      {!plainBg && (
        <>
          <div style={{ position: 'absolute', right: -260 + drift, top: -300, width: 900, height: 900, borderRadius: '50%', background: tint(brand.color, 0.07) }} />
          <div style={{ position: 'absolute', right: 120 - drift, top: 160, width: 260, height: 260, borderRadius: '50%', border: `3px solid ${tint(brand.color, 0.12)}` }} />
        </>
      )}
      <div style={{ position: 'absolute', left: 110, top: 64, height: 56, display: noLogo ? 'none' : 'flex', alignItems: 'center', gap: 14 }}>
        {brand.logo ? (
          <Img src={srcOf(brand.logo)} style={{ height: 52, maxWidth: 260, objectFit: 'contain' }} />
        ) : (
          <>
            <span style={{ width: 18, height: 18, borderRadius: 9, background: brand.color }} />
            <span style={{ fontWeight: 700, fontSize: 28 }}>{plain(brand.name)}</span>
          </>
        )}
      </div>
      {n ? <div style={{ position: 'absolute', right: 110, bottom: 56, fontSize: 24, fontWeight: 600, color: '#94A0B4' }}>{n}</div> : null}
      {children}
    </AbsoluteFill>
  )
}

/** A slide's title: a short brand bar, then the words. */
function Title({ text, brand, top = 190, size = 68, delay = 0 }) {
  const s = useIn(delay)
  if (!text) return null
  return (
    <div style={{ position: 'absolute', left: 110, right: 160, top, ...rise(s, 30) }}>
      <div style={{ width: 90 * s, height: 8, borderRadius: 4, background: brand.color, marginBottom: 26 }} />
      <div style={{ fontSize: size, fontWeight: 800, lineHeight: 1.18, letterSpacing: '-0.015em' }}>
        <Hl text={text} color={brand.color} />
      </div>
    </div>
  )
}

// ── the slides ─────────────────────────────────────────────────────────────
function Cover({ scene, brand }) {
  const s = useIn(4)
  const sub = useIn(16)
  const ring = useIn(0, 20)
  return (
    <Page brand={brand} plainBg>
      <div style={{ position: 'absolute', right: -180, top: 140, width: 900, height: 900, borderRadius: '50%', background: `linear-gradient(135deg, ${tint(brand.color, 0.95)}, ${tint(brand.color, 0.7)})`, transform: `scale(${0.6 + ring * 0.4})`, opacity: ring }} />
      <div style={{ position: 'absolute', right: 40, top: 330, width: 520, height: 520, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.35)', transform: `scale(${ring})` }} />
      <div style={{ position: 'absolute', left: 110, top: 330, width: 1000, ...rise(s, 50) }}>
        <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em' }}>
          <Hl text={scene.text} color={brand.color} />
        </div>
        {scene.sub && <div style={{ marginTop: 34, fontSize: 40, lineHeight: 1.4, color: C.sub, ...rise(sub, 20) }}>{plain(scene.sub)}</div>}
      </div>
    </Page>
  )
}

function Agenda({ scene, brand, n }) {
  const items = (scene.entries || []).slice(0, 6)
  const two = items.length > 3
  return (
    <Page brand={brand} n={n}>
      <Title text={scene.title} brand={brand} />
      <div style={{ position: 'absolute', left: 110, right: 160, top: 420, display: 'grid', gridTemplateColumns: two ? '1fr 1fr' : '1fr', columnGap: 60, rowGap: 34 }}>
        {items.map((t, i) => (
          <AgendaRow key={i} i={i} text={t} brand={brand} />
        ))}
      </div>
    </Page>
  )
}
function AgendaRow({ i, text, brand }) {
  const s = useIn(10 + i * 5)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 30, ...rise(s, 24) }}>
      <span style={{ flex: 'none', fontSize: 64, fontWeight: 800, color: brand.color, width: 110, letterSpacing: '-0.03em' }}>{String(i + 1).padStart(2, '0')}</span>
      <span style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.3 }}>{plain(text)}</span>
    </div>
  )
}

function KeyPoints({ scene, brand, n }) {
  const blocks = (scene.blocks || []).slice(0, 4)
  return (
    <Page brand={brand} n={n}>
      <Title text={scene.title} brand={brand} />
      <div style={{ position: 'absolute', left: 110, right: 110, top: 440, display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, blocks.length)}, 1fr)`, gap: 32 }}>
        {blocks.map((b, i) => (
          <Block key={i} b={b} i={i} brand={brand} count={blocks.length} />
        ))}
      </div>
    </Page>
  )
}
function Block({ b, i, brand, count }) {
  const s = useIn(10 + i * 6)
  return (
    <div style={{ background: C.card, borderRadius: 30, boxShadow: SHADOW, padding: '44px 40px', minHeight: 420, ...rise(s, 50) }}>
      <div style={{ width: 92, height: 92, borderRadius: 24, background: brand.color, display: 'grid', placeItems: 'center' }}>
        <Icon name={b.icon} size={46} />
      </div>
      <div style={{ marginTop: 34, fontSize: count > 3 ? 36 : 42, fontWeight: 800, lineHeight: 1.2 }}>{plain(b.title)}</div>
      {b.text && <div style={{ marginTop: 16, fontSize: count > 3 ? 27 : 30, lineHeight: 1.45, color: C.sub }}>{plain(b.text)}</div>}
    </div>
  )
}

const fmt = (v) => {
  const n = Number(v) || 0
  return n.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(n) ? 0 : 1, minimumFractionDigits: Number.isInteger(n) ? 0 : 1 })
}

function BigNum({ scene, brand, n }) {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [8, 48], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const value = Number(scene.value) || 0
  const s = useIn(4)
  const words = useIn(20)
  const pct = String(scene.suffix || '').trim() === '%' && value > 0 && value <= 100
  return (
    <Page brand={brand} n={n}>
      <div style={{ position: 'absolute', left: 110, top: 300, width: pct ? 1000 : 1500, ...rise(s, 40) }}>
        <div style={{ fontSize: 250, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.04em', color: brand.color }}>
          {plain(scene.prefix)}
          {fmt(value * p)}
          {plain(scene.suffix)}
        </div>
        <div style={{ marginTop: 34, fontSize: 56, fontWeight: 800, lineHeight: 1.2, ...rise(words, 20) }}>{plain(scene.label)}</div>
        {scene.text && <div style={{ marginTop: 18, fontSize: 34, lineHeight: 1.45, color: C.sub, ...rise(words, 20) }}>{plain(scene.text)}</div>}
      </div>
      {pct && (
        <svg width={520} height={520} style={{ position: 'absolute', right: 160, top: 300 }} viewBox="0 0 100 100">
          <circle cx={50} cy={50} r={42} fill="none" stroke={C.soft} strokeWidth={9} />
          <circle cx={50} cy={50} r={42} fill="none" stroke={brand.color} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${(value / 100) * 264 * p} 264`} transform="rotate(-90 50 50)" />
        </svg>
      )}
    </Page>
  )
}

function BarChart({ scene, brand, n }) {
  const frame = useCurrentFrame()
  const data = (scene.data || []).slice(0, 7)
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0))
  const H = 440
  return (
    <Page brand={brand} n={n}>
      <Title text={scene.title} brand={brand} />
      <div style={{ position: 'absolute', left: 140, right: 140, top: 420, height: H + 110, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 30, borderBottom: `3px solid ${C.line}` }}>
        {data.map((d, i) => {
          const g = interpolate(frame, [10 + i * 4, 40 + i * 4], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
          const v = Number(d.value) || 0
          const h = (v / max) * H * g
          const top = i === data.findIndex((x) => Number(x.value) === max)
          return (
            <div key={i} style={{ flex: 1, maxWidth: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 38, fontWeight: 800, opacity: g, color: top ? brand.color : C.ink }}>
                {fmt(v * g)}
                {plain(scene.suffix)}
              </div>
              <div style={{ width: '100%', height: h, borderRadius: '18px 18px 0 0', background: top ? brand.color : tint(brand.color, 0.35) }} />
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', left: 140, right: 140, top: 420 + H + 130, display: 'flex', justifyContent: 'space-around', gap: 30 }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, maxWidth: 200, textAlign: 'center', fontSize: 28, fontWeight: 600, color: C.sub, lineHeight: 1.3 }}>
            {plain(d.label)}
          </div>
        ))}
      </div>
    </Page>
  )
}

function TwoCol({ scene, brand, n }) {
  const cols = (scene.cols || []).slice(0, 2)
  return (
    <Page brand={brand} n={n}>
      <Title text={scene.title} brand={brand} />
      <div style={{ position: 'absolute', left: 110, right: 110, top: 430, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
        {cols.map((c, i) => (
          <Col key={i} c={c} i={i} brand={brand} />
        ))}
      </div>
    </Page>
  )
}
function Col({ c, i, brand }) {
  const s = useIn(10 + i * 8)
  const second = i === 1
  return (
    <div style={{ background: second ? brand.color : C.card, color: second ? '#fff' : C.ink, borderRadius: 30, boxShadow: SHADOW, padding: '44px 48px', minHeight: 440, ...rise(s, 50) }}>
      <div style={{ display: 'inline-block', padding: '10px 22px', borderRadius: 999, background: second ? 'rgba(255,255,255,0.18)' : C.soft, fontSize: 30, fontWeight: 800 }}>{plain(c.label)}</div>
      <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {(c.items || []).slice(0, 5).map((t, k) => (
          <div key={k} style={{ display: 'flex', gap: 18, alignItems: 'flex-start', fontSize: 33, lineHeight: 1.35 }}>
            <span style={{ flex: 'none', marginTop: 14, width: 14, height: 14, borderRadius: 7, background: second ? '#fff' : brand.color }} />
            {plain(t)}
          </div>
        ))}
      </div>
    </div>
  )
}

function PullQuote({ scene, brand, n }) {
  const s = useIn(6)
  const who = useIn(22)
  return (
    <Page brand={brand} n={n}>
      <div style={{ position: 'absolute', left: 150, top: 150, fontSize: 420, lineHeight: 1, fontWeight: 800, color: tint(brand.color, 0.14), fontFamily: 'Georgia, serif' }}>“</div>
      <div style={{ position: 'absolute', left: 220, right: 260, top: 360, ...rise(s, 40) }}>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          <Hl text={scene.text} color={brand.color} />
        </div>
        {(scene.author || scene.role) && (
          <div style={{ marginTop: 48, display: 'flex', alignItems: 'center', gap: 20, ...rise(who, 16) }}>
            <span style={{ width: 60, height: 6, borderRadius: 3, background: brand.color }} />
            <span style={{ fontSize: 34, fontWeight: 800 }}>{plain(scene.author)}</span>
            {scene.role && <span style={{ fontSize: 30, color: C.sub }}>{plain(scene.role)}</span>}
          </div>
        )}
      </div>
    </Page>
  )
}

function Picture({ scene, brand, n }) {
  const pic = useIn(6, 18)
  const words = useIn(14)
  return (
    <Page brand={brand} n={n}>
      <div style={{ position: 'absolute', left: 110, top: 200, width: 900, height: 700, borderRadius: 36, overflow: 'hidden', boxShadow: SHADOW, background: tint(brand.color, 0.12), opacity: Math.min(1, pic * 1.4), transform: `scale(${0.94 + pic * 0.06})` }}>
        {scene.image ? (
          <Img src={srcOf(scene.image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
            <Icon name={scene.icon || 'Image'} size={200} color={brand.color} stroke={1.4} />
          </div>
        )}
      </div>
      <div style={{ position: 'absolute', left: 1100, right: 130, top: 330, ...rise(words, 40) }}>
        <div style={{ width: 90, height: 8, borderRadius: 4, background: brand.color, marginBottom: 26 }} />
        <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.18 }}>
          <Hl text={scene.title} color={brand.color} />
        </div>
        {scene.text && <div style={{ marginTop: 26, fontSize: 34, lineHeight: 1.5, color: C.sub }}>{plain(scene.text)}</div>}
      </div>
    </Page>
  )
}

function Roadmap({ scene, brand, n }) {
  const frame = useCurrentFrame()
  const stages = (scene.stages || []).slice(0, 5)
  const line = interpolate(frame, [8, 44], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 2 })
  return (
    <Page brand={brand} n={n}>
      <Title text={scene.title} brand={brand} />
      <div style={{ position: 'absolute', left: 200, right: 200, top: 520, height: 6, borderRadius: 3, background: C.line }}>
        <div style={{ width: `${line * 100}%`, height: '100%', borderRadius: 3, background: brand.color }} />
      </div>
      <div style={{ position: 'absolute', left: 110, right: 110, top: 470, display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, stages.length)}, 1fr)`, gap: 30 }}>
        {stages.map((st, i) => (
          <Stage key={i} st={st} i={i} brand={brand} reached={line >= (i + 0.5) / stages.length} />
        ))}
      </div>
    </Page>
  )
}
function Stage({ st, i, brand, reached }) {
  const s = useIn(12 + i * 7, 12)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ width: 104, height: 104, borderRadius: '50%', background: reached ? brand.color : C.card, color: reached ? '#fff' : brand.color, border: `5px solid ${brand.color}`, display: 'grid', placeItems: 'center', fontSize: 42, fontWeight: 800, transform: `scale(${s})`, boxShadow: SHADOW }}>{i + 1}</div>
      <div style={{ marginTop: 34, fontSize: 36, fontWeight: 800, lineHeight: 1.25, ...rise(s, 20) }}>{plain(st.title)}</div>
      {st.text && <div style={{ marginTop: 12, fontSize: 27, lineHeight: 1.45, color: C.sub, ...rise(s, 20) }}>{plain(st.text)}</div>}
    </div>
  )
}

function Statement({ scene, brand, n }) {
  const s = useIn(6)
  const sub = useIn(20)
  return (
    <Page brand={brand} n={n}>
      <div style={{ position: 'absolute', left: 200, right: 200, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.015em', ...rise(s, 40) }}>
          <Hl text={scene.text} color={brand.color} />
        </div>
        {scene.sub && <div style={{ marginTop: 34, fontSize: 38, lineHeight: 1.45, color: C.sub, ...rise(sub, 20) }}>{plain(scene.sub)}</div>}
      </div>
    </Page>
  )
}

function Closing({ scene, brand }) {
  const s = useIn(4)
  const b = useIn(18, 12)
  return (
    <Page brand={brand} plainBg noLogo>
      <AbsoluteFill style={{ background: `linear-gradient(135deg, ${brand.color}, ${tint(brand.color, 0.82)})` }} />
      <div style={{ position: 'absolute', left: -200, bottom: -300, width: 800, height: 800, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.18)' }} />
      <div style={{ position: 'absolute', left: 200, right: 200, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', color: '#fff' }}>
        {brand.logo && (
          <div style={{ width: 170, height: 170, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', marginBottom: 50, transform: `scale(${s})`, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <Img src={srcOf(brand.logo)} style={{ width: '68%', height: '68%', objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1.15, ...rise(s, 40) }}>{plain(scene.text)}</div>
        {scene.button && (
          <div style={{ marginTop: 56, padding: '28px 64px', borderRadius: 999, background: '#fff', color: brand.color, fontSize: 42, fontWeight: 800, transform: `scale(${b})`, boxShadow: '0 18px 40px rgba(0,0,0,0.2)' }}>{plain(scene.button)}</div>
        )}
      </div>
    </Page>
  )
}

const SLIDES = { hook: Cover, agenda: Agenda, keypoints: KeyPoints, bignum: BigNum, barchart: BarChart, twocol: TwoCol, pullquote: PullQuote, picture: Picture, roadmap: Roadmap, statement: Statement, cta: Closing }

/** One slide — for the presenter in the app and the PDF. ``n`` = its page number. */
export function DeckSlide({ scene, brand, n }) {
  useFonts()
  const S = SLIDES[scene?.type] || Statement
  return <S scene={scene || {}} brand={brand || { color: '#2563EB', name: '' }} n={n} />
}

/** The PDF's pages: frame n is slide n, at rest. */
export function DeckPages({ brand, scenes }) {
  const frame = useCurrentFrame()
  const list = scenes || []
  const scene = list[Math.min(frame, list.length - 1)]
  // the slide's own clock is shifted so it always sees DECK_SETTLE — every animation done
  return (
    <Sequence from={frame - DECK_SETTLE} layout="none">
      <DeckSlide scene={scene} brand={brand} n={`${Math.min(frame, list.length - 1) + 1} / ${list.length}`} />
    </Sequence>
  )
}

// the video template (MotionPost style "deck"): each slide a scene; the slides
// draw their own logo, so no corner chip over them
const wrap = (S) =>
  function DeckScene({ scene, brand }) {
    return <S scene={scene} brand={brand} />
  }
export const DECK = {
  scenes: Object.fromEntries(Object.entries(SLIDES).map(([k, S]) => [k, wrap(S)])),
  root: { backgroundColor: C.bg },
  chrome: () => null,
  noCaption: Object.keys(SLIDES), // the slide already shows the words — no subtitles over it
  captionTop: (h) => (h < 1200 ? h - 150 : 1560),
}

export const deckCues = (scene) => (scene.type === 'bignum' || scene.type === 'barchart' ? [[48, 'ding']] : [[6, 'whoosh']])
