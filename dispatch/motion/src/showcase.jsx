/**
 * Showcase — a bright SaaS promo on saas.jsx's "airy" background (lavender,
 * soft colour blobs, thin orbit lines), after two promos the user liked
 * (2026-10-14): app icons floating in white bubbles, the product's table view
 * in a window, a word that rolls like a slot machine and lands.
 *
 * Its own scenes (app/motion.py SHOWCASE_PROMPT):
 *
 *   { type: "hook",  text, apps?: [{ name, icon? }] }                bubbles float round the line
 *   { type: "apps",  title?, apps: [{ name, icon? }] }                the tools it works with, joined to the brand
 *   { type: "table", title?, columns: [], rows: [[]], groups?: [] }  the product's table view: rows land, then sort
 *   { type: "board", title?, columns: [{ name, cards: [] }] }        a board: a card is dragged to the last column
 *   { type: "roll",  lead, words: [], icon?, text? }                 "Your ☑ Product / App / Agency" — the last word lands
 *
 * The rest (list, stat, reveal, step, screen, dashboard, flow, cta) are
 * saas.jsx's scenes in this palette. Every scene lays itself out for 9:16
 * and 16:9 (width > height).
 */
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, Words, clean, fitSize, srcOf, tint } from './shared'

// Known apps → their icon and colour, so "Excel" is a green sheet without the AI saying so.
const APPS = [
  [/excel/, 'Sheet', '#107C41'],
  [/sheet/, 'Sheet', '#0F9D58'],
  [/\bword\b|docs?\b|document/, 'FileText', '#2B579A'],
  [/drive/, 'HardDrive', '#F4B400'],
  [/calendar/, 'CalendarDays', '#4285F4'],
  [/dropbox/, 'Box', '#0061FF'],
  [/gmail/, 'Mail', '#EA4335'],
  [/outlook|mail/, 'Mail', '#0078D4'],
  [/teams/, 'Users', '#5059C9'],
  [/slack/, 'Hash', '#611F69'],
  [/telegram/, 'Send', '#229ED9'],
  [/messenger|facebook/, 'MessageCircle', '#1877F2'],
  [/whatsapp/, 'Phone', '#25D366'],
  [/tiktok/, 'Music2', '#111827'],
  [/sharepoint/, 'Share2', '#038387'],
  [/power ?(apps|automate|bi)/, 'Zap', '#742774'],
  [/zoom/, 'Video', '#2D8CFF'],
  [/shop|store/, 'ShoppingBag', '#16A34A'],
  [/notion/, 'NotebookPen', '#111827'],
  [/trello|kanban|board/, 'SquareKanban', '#0079BF'],
  [/bank|aba|pay/, 'CreditCard', '#0B6E99'],
  [/crm|dynamics|salesforce|contact/, 'Contact', '#0EA5E9'],
  [/chat|bot|\bai\b/, 'Bot', '#7C3AED'],
]
const SPARE = ['#2563EB', '#16A34A', '#F59E0B', '#DB2777', '#0EA5E9', '#7C3AED', '#DC2626', '#0D9488']
const DEFAULT_APPS = ['Sheets', 'Calendar', 'Drive', 'Docs', 'Mail', 'Dropbox', 'Messenger', 'Kanban'].map((name) => ({ name }))
// tag pills: [background, text]
const TAGS = [
  ['#FDE68A', '#92400E'],
  ['#BBF7D0', '#166534'],
  ['#BFDBFE', '#1E40AF'],
  ['#FBCFE8', '#9D174D'],
  ['#DDD6FE', '#5B21B6'],
  ['#A5F3FC', '#155E75'],
]
const LANES = ['#F59E0B', '#3B82F6', '#10B981'] // a board's columns: to do → doing → done

const hash = (t) => [...clean(t)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7)
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const BUBBLE_SHADOW = (size) => `0 ${Math.round(size * 0.14)}px ${Math.round(size * 0.34)}px rgba(76,61,160,0.16)`

export function appLook(app, i = 0) {
  const name = clean(app?.name).toLowerCase()
  const hit = APPS.find(([re]) => re.test(name))
  return { icon: hit?.[1] || app?.icon || 'AppWindow', color: hit?.[2] || SPARE[i % SPARE.length] }
}

/** An app in a white bubble with a soft lilac shadow. */
function Bubble({ app, i, size }) {
  const { icon, color } = appLook(app, i)
  return (
    <div style={{ width: size, height: size, borderRadius: size / 2, background: '#FFFFFF', display: 'grid', placeItems: 'center', boxShadow: BUBBLE_SHADOW(size) }}>
      <Icon name={icon} size={Math.round(size * 0.46)} color={color} stroke={2.2} />
    </div>
  )
}

/** The pointer — white with a shadow, like a real cursor on a light screen. */
function Pointer({ x, y, press = 1, opacity = 1, size = 72 }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${press})`, opacity, filter: 'drop-shadow(0 4px 10px rgba(15,23,42,0.35))' }}>
      <Icon name="MousePointer2" size={size} color="#0F172A" stroke={1.6} />
    </div>
  )
}

function Title({ P, text, wide, top }) {
  if (!text) return null
  return (
    <div style={{ position: 'absolute', top: top ?? (wide ? 150 : 250), left: wide ? 200 : 64, right: wide ? 200 : 64 }}>
      <Words text={text} align="center" color={P.ink} style={{ fontSize: fitSize(text, wide ? 64 : 70), fontWeight: 700, textAlign: 'center', lineHeight: 1.25 }} />
    </div>
  )
}

// ── hook: the line, app bubbles floating round it ──────────────────────────
const SPOTS_TALL = [
  [0.18, 0.17, 130], [0.5, 0.14, 96], [0.82, 0.2, 150], [0.12, 0.33, 110],
  [0.88, 0.35, 118], [0.2, 0.62, 140], [0.55, 0.67, 100], [0.84, 0.61, 128],
]
const SPOTS_WIDE = [
  [0.12, 0.26, 120], [0.29, 0.17, 88], [0.1, 0.62, 130], [0.26, 0.74, 96],
  [0.71, 0.18, 98], [0.88, 0.3, 128], [0.75, 0.73, 108], [0.9, 0.62, 88],
]

function makeShowHook(P, Bg) {
  return function ShowHook({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const apps = scene.apps?.length ? scene.apps : DEFAULT_APPS
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {(wide ? SPOTS_WIDE : SPOTS_TALL).map(([x, y, size], i) => {
          const s = spring({ frame: frame - 2 - i * 3, fps, config: { damping: 12 } })
          const bob = Math.sin((frame + i * 17) / 20) * 12
          return (
            <div key={i} style={{ position: 'absolute', left: x * width - size / 2, top: y * height - size / 2 + bob, transform: `scale(${s})`, opacity: Math.min(1, s * 1.4) }}>
              <Bubble app={apps[i % apps.length]} i={i} size={size} />
            </div>
          )
        })}
        <div style={{ position: 'absolute', left: wide ? 480 : 70, right: wide ? 480 : 70, top: wide ? 300 : 760, height: wide ? 420 : 330, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Words text={scene.text} delay={6} align="center" color={P.ink} style={{ fontSize: fitSize(scene.text, wide ? 92 : 100), fontWeight: 700, textAlign: 'center', lineHeight: 1.25 }} />
        </div>
      </AbsoluteFill>
    )
  }
}

// ── apps: the tools it works with, each joined to the brand ────────────────
function makeShowApps(P, Bg) {
  return function ShowApps({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const apps = (scene.apps || []).slice(0, 8)
    const n = Math.max(1, apps.length)
    const hub = wide ? { x: 960, y: 560 } : { x: 540, y: 920 }
    const [rx, ry] = wide ? [600, 230] : [370, 400]
    const size = wide ? 116 : 146
    const H = wide ? 190 : 230
    const hubS = spring({ frame, fps, config: { damping: 13 } })
    const ring = (frame % 45) / 45
    const spots = apps.map((_, i) => {
      const a = ((-90 + (i * 360) / n) * Math.PI) / 180
      return { x: hub.x + rx * Math.cos(a), y: hub.y + ry * Math.sin(a) }
    })
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <Title P={P} text={scene.title} wide={wide} />
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
          {spots.map((p, i) => {
            const draw = interpolate(frame, [10 + i * 4, 26 + i * 4], [0, 1], clamp)
            const t = frame > 34 + i * 6 ? ((frame - 34 - i * 6) / 40) % 1 : -1
            return (
              <g key={i}>
                <line x1={hub.x} y1={hub.y} x2={hub.x + (p.x - hub.x) * draw} y2={hub.y + (p.y - hub.y) * draw} stroke={tint(P.a, 0.4)} strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" />
                {t >= 0 && <circle cx={p.x + (hub.x - p.x) * t} cy={p.y + (hub.y - p.y) * t} r="7" fill={P.a} opacity={1 - Math.abs(t - 0.5)} />}
              </g>
            )
          })}
        </svg>
        {/* the brand in the middle, a ring pulsing out of it */}
        <div style={{ position: 'absolute', left: hub.x - H / 2, top: hub.y - H / 2, width: H, height: H, transform: `scale(${hubS})` }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: H / 2, border: `3px solid ${tint(P.a, 0.5)}`, transform: `scale(${1 + ring * 0.55})`, opacity: 1 - ring }} />
          <div style={{ position: 'absolute', inset: 0, borderRadius: H / 2, background: brand.logo ? '#FFFFFF' : `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center', boxShadow: `${BUBBLE_SHADOW(H)}, 0 0 0 10px rgba(255,255,255,0.55)` }}>
            {brand.logo ? <Img src={srcOf(brand.logo)} style={{ width: H * 0.62, height: H * 0.62, objectFit: 'contain' }} /> : <Icon name={P.icon} size={H * 0.44} color="#FFFFFF" stroke={2.2} />}
          </div>
        </div>
        {apps.map((app, i) => {
          const s = spring({ frame: frame - 8 - i * 4, fps, config: { damping: 12 } })
          const bob = Math.sin((frame + i * 23) / 22) * 6
          return (
            <div key={i} style={{ position: 'absolute', left: spots[i].x - 160, top: spots[i].y - size / 2 + bob, width: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transform: `scale(${s})`, opacity: Math.min(1, s * 1.4) }}>
              <Bubble app={app} i={i} size={size} />
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 26 : 30, color: P.ink, whiteSpace: 'nowrap' }}>{clean(app.name)}</div>
            </div>
          )
        })}
      </AbsoluteFill>
    )
  }
}

// ── table: the product's table view — rows land, the pointer sorts them ────
function makeShowTable(P, Bg) {
  return function ShowTable({ scene, brand }) {
    const frame = useCurrentFrame()
    const { fps, width, height, durationInFrames } = useVideoConfig()
    const wide = width > height
    const L = wide
      ? { left: 180, top: 160, w: 1560, bar: 66, app: 52, tool: 54, head: 48, rowH: 60, font: 25, side: scene.groups?.length ? 270 : 0, maxCols: 4, chip: 150, dock: 84 }
      : { left: 50, top: 400, w: 980, bar: 90, app: 70, tool: 66, head: 60, rowH: 108, font: 32, side: 0, maxCols: 3, chip: 170, dock: 96 }
    // keep the first and the last (tag) column when there are too many
    const all = (scene.columns || []).map(clean)
    const keep = all.length <= L.maxCols ? all.map((_, i) => i) : [0, ...all.slice(1, -1).map((_, i) => i + 1).slice(0, L.maxCols - 2), all.length - 1]
    const cols = keep.map((k) => all[k])
    const rows = (scene.rows || []).slice(0, 6).map((r) => keep.map((k) => clean(r[k])))
    const tagCol = cols.length >= 2 ? cols.length - 1 : -1
    const flex = (c) => (c === 0 ? 1.5 : c === tagCol ? 1 : 1.2)
    const rank = rows.map((_, i) => rows.map((r, j) => [r[0], j]).sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]).findIndex(([, j]) => j === i))
    const win = spring({ frame, fps, config: { damping: 15 } })
    const landed = 10 + rows.length * 5 + 12
    const clickAt = Math.min(Math.round(durationInFrames * 0.62), landed + 16)
    const move = interpolate(frame, [clickAt - 22, clickAt - 4], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
    const press = interpolate(frame, [clickAt - 4, clickAt, clickAt + 6], [1, 0.86, 1], clamp)
    const sorted = spring({ frame: frame - clickAt - 2, fps, config: { damping: 16 } })
    const dockPop = spring({ frame: frame - landed, fps, config: { damping: 10 } })
    const bodyTop = L.bar + L.app + L.tool
    const H = bodyTop + L.head + rows.length * L.rowH + 22
    const sortX = L.side + 24 + 3 * (L.chip + 10) + L.chip / 2
    const sortY = L.bar + L.app + L.tool / 2
    const chips = [['Table', 'Table'], ['ListFilter', 'Filter'], ['Group', 'Group'], ['ArrowUpDown', frame >= clickAt ? '1 Sort' : 'Sort']]
    return (
      <AbsoluteFill>
        <Bg P={P} />
        {!wide && <Title P={P} text={scene.title} wide={wide} />}
        <div style={{ position: 'absolute', left: L.left, top: L.top, width: L.w, height: H, borderRadius: Math.round(30 * P.rad), background: '#FFFFFF', boxShadow: '0 40px 90px rgba(76,61,160,0.18)', overflow: 'hidden', opacity: win, transform: `translateY(${(1 - win) * 70}px) scale(${0.95 + 0.05 * win})` }}>
          {/* title bar: the window dots and the view's name, in the accent */}
          <div style={{ height: L.bar, display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px' }}>
            {['#F87171', '#FBBF24', '#F9A8D4'].map((c) => (
              <span key={c} style={{ width: wide ? 18 : 22, height: wide ? 18 : 22, borderRadius: 11, background: c }} />
            ))}
            <span style={{ marginLeft: 22, fontFamily: FONT, fontWeight: 800, fontSize: wide ? 34 : 42, color: P.a, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clean(wide ? scene.title || 'Table View' : 'Table View')}</span>
          </div>
          {/* the app's own bar */}
          <div style={{ height: L.app, display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px', background: `linear-gradient(90deg, ${P.a}, ${P.b})`, fontFamily: FONT, fontWeight: 600, fontSize: L.font - 3, color: '#FFFFFF' }}>
            <Icon name="LayoutGrid" size={L.font} color="#FFFFFF" stroke={2.2} />
            <span style={{ whiteSpace: 'nowrap' }}>{clean(brand.name)}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="UserPlus" size={L.font - 2} color="#FFFFFF" stroke={2.2} />
              Invite
            </span>
            <Icon name="Bell" size={L.font - 2} color="#FFFFFF" stroke={2.2} />
          </div>
          <div style={{ display: 'flex', height: H - L.bar - L.app }}>
            {L.side > 0 && (
              <div style={{ width: L.side, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 6, borderRight: '2px solid #EEF0F6' }}>
                {scene.groups.slice(0, 5).map((g, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: i === 0 ? tint(P.a, 0.1) : 'transparent', fontFamily: FONT, fontWeight: 600, fontSize: 24, color: i === 0 ? P.a : '#475569', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <Icon name="Folder" size={24} color={i === 0 ? P.a : '#94A3B8'} stroke={2.2} />
                    {clean(g)}
                  </div>
                ))}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* toolbar */}
              <div style={{ height: L.tool, display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px', borderBottom: '2px solid #EEF0F6' }}>
                {chips.map(([icon, label], i) => {
                  const on = i === 3 && frame >= clickAt
                  return (
                    <div key={i} style={{ width: L.chip, height: L.tool - 18, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: on ? tint(P.a, 0.14) : 'transparent', fontFamily: FONT, fontWeight: 600, fontSize: L.font - 4, color: on ? P.a : '#475569', transform: i === 3 ? `scale(${press})` : undefined }}>
                      <Icon name={icon} size={L.font - 4} color={on ? P.a : '#64748B'} stroke={2.2} />
                      {label}
                    </div>
                  )
                })}
              </div>
              {/* the column names */}
              <div style={{ height: L.head, display: 'flex', alignItems: 'center', padding: '0 24px', background: '#F4F5FA', fontFamily: FONT, fontWeight: 600, fontSize: L.font - 5, color: '#64748B' }}>
                <div style={{ width: wide ? 48 : 56 }}>#</div>
                {cols.map((c, k) => (
                  <div key={k} style={{ flex: flex(k), minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 12 }}>{c}</div>
                ))}
              </div>
              {/* the rows: they land one by one, then slide into the sorted order */}
              <div style={{ position: 'relative', height: rows.length * L.rowH }}>
                {rows.map((r, i) => {
                  const s = spring({ frame: frame - 10 - i * 5, fps, config: { damping: 14 } })
                  const at = i + (rank[i] - i) * sorted
                  return (
                    <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: at * L.rowH, height: L.rowH, display: 'flex', alignItems: 'center', padding: '0 24px', borderBottom: '2px solid #F1F2F7', background: '#FFFFFF', fontFamily: FONT, fontWeight: 500, fontSize: L.font, color: '#0F172A', opacity: s, transform: `translateX(${(1 - s) * 60}px)` }}>
                      <div style={{ width: wide ? 48 : 56, color: '#94A3B8', fontWeight: 600 }}>{Math.round(at) + 1}</div>
                      {r.map((cell, k) => {
                        const [bg, fg] = TAGS[hash(cell) % TAGS.length]
                        return (
                          <div key={k} style={{ flex: flex(k), minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, paddingRight: 12 }}>
                            {k === 0 && (
                              <span style={{ flex: 'none', width: L.rowH * 0.56, height: L.rowH * 0.56, borderRadius: '50%', background: SPARE[hash(cell) % SPARE.length], display: 'grid', placeItems: 'center', color: '#FFFFFF', fontWeight: 700, fontSize: L.font * 0.8 }}>{[...cell][0] || '•'}</span>
                            )}
                            {k === tagCol ? (
                              <span style={{ padding: '4px 14px', borderRadius: 999, background: bg, color: fg, fontWeight: 600, fontSize: L.font - 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell}</span>
                            ) : (
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <Pointer x={interpolate(move, [0, 1], [L.w * 0.7, sortX - 8])} y={interpolate(move, [0, 1], [H * 0.95, sortY - 6])} press={press} opacity={interpolate(frame, [clickAt - 24, clickAt - 18], [0, 1], clamp)} size={wide ? 60 : 72} />
        </div>
        {/* the view switcher under the window — Table lit */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: L.top + H - L.dock / 2, display: 'flex', justifyContent: 'center', gap: 22, opacity: win }}>
          {['Table', 'SquareKanban', 'CalendarDays', 'ChartColumn'].map((icon, i) => (
            <div key={icon} style={{ width: L.dock, height: L.dock, borderRadius: L.dock / 2, display: 'grid', placeItems: 'center', background: i === 0 ? `linear-gradient(135deg, ${P.a}, ${P.b})` : '#FFFFFF', boxShadow: BUBBLE_SHADOW(L.dock), transform: i === 0 ? `scale(${1 + 0.18 * dockPop})` : undefined }}>
              <Icon name={icon} size={L.dock * 0.46} color={i === 0 ? '#FFFFFF' : SPARE[i]} stroke={2.2} />
            </div>
          ))}
        </div>
      </AbsoluteFill>
    )
  }
}

// ── board: a card is picked up and dropped in the last column ──────────────
function makeShowBoard(P, Bg) {
  return function ShowBoard({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const wide = width > height
    const lanes = (scene.columns || []).slice(0, 3).map((c) => ({ name: clean(c.name), cards: (c.cards || []).slice(0, 3).map(clean) }))
    const L = wide
      ? { left: 180, top: scene.title ? 260 : 190, w: 1560, pad: 30, gap: 24, head: 60, cardH: 110, cardGap: 14, font: 27 }
      : { left: 50, top: scene.title ? 420 : 330, w: 980, pad: 24, gap: 16, head: 76, cardH: 190, cardGap: 18, font: 32 }
    const colW = (L.w - 2 * L.pad - (lanes.length - 1) * L.gap) / Math.max(1, lanes.length)
    const slot = L.cardH + L.cardGap
    const rowsMax = Math.max(...lanes.map((l) => l.cards.length), 1) + 1
    const H = L.pad + L.head + rowsMax * slot + L.pad
    const last = lanes.length - 1
    const moving = lanes.length >= 2 && lanes[0].cards.length > 0
    const grab = 18
    const lift = interpolate(frame, [grab, grab + 8], [0, 1], clamp)
    const fly = interpolate(frame, [grab + 6, grab + 34], [0, 1], { ...clamp, easing: easeInOut })
    const dropped = frame >= grab + 34
    const drop = spring({ frame: frame - grab - 34, fps, config: { damping: 10 } })
    const shift = interpolate(frame, [grab + 10, grab + 22], [0, 1], clamp) // the cards under it move up
    const panel = spring({ frame, fps, config: { damping: 15 } })
    const xOf = (c) => L.pad + c * (colW + L.gap)
    const yOf = (r) => L.pad + L.head + r * slot
    const from = { x: xOf(0), y: yOf(0) }
    const to = moving ? { x: xOf(last), y: yOf(lanes[last].cards.length) } : from
    const fx = from.x + (to.x - from.x) * fly
    const fy = from.y + (to.y - from.y) * fly - Math.sin(fly * Math.PI) * 40
    const pointerIn = interpolate(frame, [4, grab], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
    const card = (text, lane, extra = {}, done = false) => (
      <div style={{ width: colW, height: L.cardH, borderRadius: Math.round(18 * P.rad), background: '#FFFFFF', borderLeft: `6px solid ${LANES[lane]}`, boxShadow: '0 8px 24px rgba(76,61,160,0.10)', padding: '14px 18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxSizing: 'border-box', ...extra }}>
        <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: L.font, color: '#0F172A', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: wide ? 1 : 2, WebkitBoxOrient: 'vertical' }}>{text}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[0, 1].map((k) => (
            <span key={k} style={{ width: L.font * 0.8, height: L.font * 0.8, borderRadius: '50%', background: SPARE[(hash(text) + k * 3) % SPARE.length], marginLeft: k ? -10 : 0, border: '2px solid #FFFFFF' }} />
          ))}
          {done && (
            <span style={{ marginLeft: 'auto', transform: `scale(${drop})` }}>
              <Icon name="CircleCheck" size={L.font + 6} color="#10B981" stroke={2.6} />
            </span>
          )}
        </div>
      </div>
    )
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <Title P={P} text={scene.title} wide={wide} top={wide ? 150 : 250} />
        <div style={{ position: 'absolute', left: L.left, top: L.top, width: L.w, height: H, borderRadius: Math.round(30 * P.rad), background: 'rgba(255,255,255,0.72)', border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 40px 90px rgba(76,61,160,0.16)', opacity: panel, transform: `translateY(${(1 - panel) * 70}px)` }}>
          {lanes.map((lane, c) => {
            const count = lane.cards.length + (moving && dropped ? (c === last ? 1 : c === 0 ? -1 : 0) : 0)
            return (
              <div key={c} style={{ position: 'absolute', left: xOf(c), top: L.pad, width: colW, height: L.head - 14, display: 'flex', alignItems: 'center', gap: 12, fontFamily: FONT, fontWeight: 700, fontSize: L.font, color: '#0F172A' }}>
                <span style={{ width: 14, height: 14, borderRadius: 7, background: LANES[c] }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lane.name}</span>
                <span style={{ marginLeft: 'auto', minWidth: 40, padding: '2px 12px', borderRadius: 999, background: tint(LANES[c], 0.16), color: LANES[c], fontSize: L.font - 6, textAlign: 'center' }}>{Math.max(0, count)}</span>
              </div>
            )
          })}
          {lanes.map((lane, c) =>
            lane.cards.map((text, r) => {
              if (moving && c === 0 && r === 0) return null
              const s = spring({ frame: frame - 4 - (c * 3 + r) * 3, fps, config: { damping: 14 } })
              const up = moving && c === 0 ? shift : 0
              return (
                <div key={`${c}-${r}`} style={{ position: 'absolute', left: xOf(c), top: yOf(r - up), opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
                  {card(text, c)}
                </div>
              )
            }),
          )}
          {moving && (
            <div style={{ position: 'absolute', left: fx, top: fy, zIndex: 2, transform: `rotate(${(dropped ? 0 : lift) * 3}deg) scale(${1 + (dropped ? 0 : lift) * 0.05})` }}>
              {card(lanes[0].cards[0], dropped ? last : 0, { boxShadow: dropped ? '0 8px 24px rgba(16,185,129,0.25)' : `0 ${10 + 20 * lift}px ${24 + 30 * lift}px rgba(76,61,160,${0.1 + 0.15 * lift})` }, dropped)}
            </div>
          )}
          {moving && (
            <Pointer
              x={dropped ? to.x + colW * 0.6 + (frame - grab - 34) * 2 : interpolate(pointerIn, [0, 1], [L.w * 0.5, from.x + colW * 0.6]) + (fx - from.x)}
              y={dropped ? to.y + L.cardH * 0.5 + (frame - grab - 34) * 2 : interpolate(pointerIn, [0, 1], [H, from.y + L.cardH * 0.5]) + (fy - from.y)}
              press={interpolate(frame, [grab - 3, grab, grab + 4], [1, 0.88, 1], clamp)}
              opacity={interpolate(frame, [4, 10, grab + 44, grab + 52], [0, 1, 1, 0], clamp)}
              size={wide ? 60 : 72}
            />
          )}
        </div>
      </AbsoluteFill>
    )
  }
}

// ── roll: "Your ☑ Product / App / Agency" — the word spins and lands ───────
function makeShowRoll(P, Bg) {
  return function ShowRoll({ scene }) {
    const frame = useCurrentFrame()
    const { fps, width, height, durationInFrames } = useVideoConfig()
    const wide = width > height
    const words = (scene.words || []).slice(0, 5).map(clean)
    const n = Math.max(1, words.length)
    const lead = clean(scene.lead)
    const longest = Math.max(...words.map((w) => [...w].length), 3)
    const leadLen = [...lead].length
    const size = Math.round(wide ? Math.min(150, 1480 / ((leadLen + longest) * 0.6 + 0.8)) : Math.min(140, 960 / (Math.max(leadLen, longest) * 0.62)))
    const lineH = size * 1.18
    const step = Math.max(12, Math.min(28, Math.round((durationInFrames * 0.5) / n)))
    const start = 16
    let pos = 0
    for (let j = 1; j < n; j++) pos += spring({ frame: frame - start - j * step, fps, config: { damping: 18 } })
    const landAt = start + (n - 1) * step + 8
    const land = spring({ frame: frame - landAt, fps, config: { damping: 9 } })
    const leadIn = spring({ frame: frame - 2, fps, config: { damping: 14 } })
    const tile = spring({ frame: frame - 8, fps, config: { damping: 10 } })
    const sub = interpolate(frame, [landAt + 4, landAt + 16], [0, 1], clamp)
    const fade = 'linear-gradient(to bottom, transparent, black 28%, black 72%, transparent)'
    const T = Math.round(size * 0.78)
    return (
      <AbsoluteFill>
        <Bg P={P} />
        <AbsoluteFill style={{ paddingTop: wide ? 170 : 280, paddingBottom: wide ? 220 : 480, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: wide ? 30 : 40 }}>
          <div style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: 'center', gap: wide ? 40 : 34 }}>
            {lead && (
              <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', lineHeight: 1.15, background: `linear-gradient(90deg, ${P.a}, ${P.b} 70%, ${tint(P.b, 0.45)})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', opacity: leadIn, transform: `translateX(${(1 - leadIn) * -60}px)`, whiteSpace: 'nowrap' }}>
                {lead}
              </div>
            )}
            <div style={{ flex: 'none', width: T, height: T, borderRadius: Math.round(T * 0.2), background: `linear-gradient(135deg, ${P.a}, ${P.b})`, display: 'grid', placeItems: 'center', boxShadow: `0 16px 40px ${tint(P.a, 0.35)}`, transform: `scale(${tile * (1 + 0.08 * land)}) rotate(${(1 - tile) * -30}deg)` }}>
              <Icon name={scene.icon || 'Check'} size={T * 0.6} color="#FFFFFF" stroke={3} />
            </div>
            <div style={{ position: 'relative', height: lineH * 3, width: wide ? longest * size * 0.64 + 20 : 1000, overflow: 'hidden', maskImage: fade, WebkitMaskImage: fade }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: lineH - pos * lineH }}>
                {words.map((w, i) => {
                  const d = Math.abs(i - pos)
                  const final = i === n - 1
                  return (
                    <div key={i} style={{ height: lineH, display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', fontFamily: FONT, fontWeight: 800, fontSize: size, letterSpacing: '-0.02em', color: P.ink, whiteSpace: 'nowrap', opacity: interpolate(d, [0, 1, 2], [1, 0.14, 0.06], clamp), transform: final ? `scale(${1 + 0.06 * land * (1 - land) * 4})` : undefined, transformOrigin: wide ? 'left center' : 'center' }}>
                      {w}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          {scene.text && (
            <div style={{ maxWidth: wide ? 1300 : 940, textAlign: 'center', fontFamily: FONT, fontWeight: 500, fontSize: fitSize(scene.text, wide ? 44 : 48), color: P.sub, lineHeight: 1.4, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>
              {clean(scene.text)}
            </div>
          )}
        </AbsoluteFill>
      </AbsoluteFill>
    )
  }
}

/** Showcase's own scenes in palette P, drawn on background Bg (saas.jsx AiBg). */
export function showcaseScenes(P, Bg) {
  return {
    hook: makeShowHook(P, Bg),
    apps: makeShowApps(P, Bg),
    table: makeShowTable(P, Bg),
    board: makeShowBoard(P, Bg),
    roll: makeShowRoll(P, Bg),
  }
}
