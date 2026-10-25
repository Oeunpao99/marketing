/**
 * SaaS Hub · Connect & Automate — modern cloud platform and workflow automation template:
 * Disconnected tool chaos, the central cloud hub, automated trigger workflows,
 * live SaaS metrics dashboard, subscription plans, and high-converting CTA.
 *
 * Palette: Deep obsidian/slate (#070A14), electric cyan (#00F0FF), indigo glow (#6366F1),
 * emerald success (#10B981), and clean white text.
 * Responsive for both 9:16 (vertical Reels/TikTok) and 16:9 (horizontal presentation/YouTube).
 *
 * Scenes (app/motion.py SAASHUB_PROMPT):
 *   { type: "hook", text, badge?, sub?, icon? }
 *   { type: "chaos", text, tools: [name] }
 *   { type: "hub", text, apps: [{ name, icon, desc }] }
 *   { type: "trigger", text, event: { label, icon }, actions: [{ label, icon }] }
 *   { type: "metrics", text, stats: [{ label, value, prefix?, suffix?, note? }] }
 *   { type: "plans", text, tiers: [{ name, price, note?, badge? }], pick? }
 *   { type: "cta", text, button?, sub? }
 */

import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, Icon, NeatGrid, Words, clean, fitSize, tint } from './shared'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }

const PALETTE = {
  bg: '#070A14',
  bg2: '#0C1222',
  card: 'rgba(16, 24, 48, 0.72)',
  cardSolid: '#101830',
  cardBorder: 'rgba(56, 189, 248, 0.22)',
  cardBorderSubtle: 'rgba(255, 255, 255, 0.08)',
  ink: '#FFFFFF',
  sub: '#94A3B8',
  cyan: '#00F0FF',
  indigo: '#6366F1',
  emerald: '#10B981',
  rose: '#F43F5E',
  amber: '#F59E0B',
}

function useLayout() {
  const { width, height, fps } = useVideoConfig()
  const wide = width > height
  return { wide, width, height, fps }
}

function Bg({ brand }) {
  const frame = useCurrentFrame()
  const { wide, width, height } = useLayout()
  const brandCol = brand?.color || PALETTE.indigo
  return (
    <AbsoluteFill style={{ backgroundColor: PALETTE.bg, overflow: 'hidden' }}>
      {/* Dynamic ambient radial glows */}
      <div
        style={{
          position: 'absolute',
          left: width * 0.15,
          top: height * 0.1,
          width: wide ? 800 : 600,
          height: wide ? 800 : 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${tint(brandCol, 0.18)} 0%, transparent 70%)`,
          filter: 'blur(70px)',
          opacity: 0.8,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: width * 0.1,
          bottom: height * 0.15,
          width: wide ? 700 : 500,
          height: wide ? 700 : 500,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${tint(PALETTE.cyan, 0.14)} 0%, transparent 70%)`,
          filter: 'blur(80px)',
          opacity: 0.7,
        }}
      />
      <NeatGrid color="rgba(255, 255, 255, 0.05)" size={wide ? 72 : 56} />
      {/* Top subtle glow line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${PALETTE.cyan}, ${brandCol}, transparent)`,
          opacity: 0.6,
        }}
      />
    </AbsoluteFill>
  )
}

function Title({ text, badge, top = 180 }) {
  const { wide } = useLayout()
  const frame = useCurrentFrame()
  return (
    <div style={{ position: 'absolute', left: wide ? 160 : 56, right: wide ? 160 : 56, top, zIndex: 10 }}>
      {badge && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '6px 18px',
            borderRadius: 999,
            background: 'rgba(0, 240, 255, 0.12)',
            border: '1px solid rgba(0, 240, 255, 0.35)',
            marginBottom: 20,
            opacity: interpolate(frame, [0, 12], [0, 1], clamp),
            transform: `translateY(${interpolate(frame, [0, 12], [-10, 0], clamp)}px)`,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: 4, background: PALETTE.cyan, boxShadow: `0 0 10px ${PALETTE.cyan}` }} />
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: wide ? 20 : 26, color: PALETTE.cyan, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            {clean(badge)}
          </span>
        </div>
      )}
      <Words
        text={text}
        delay={4}
        align={wide ? 'center' : 'left'}
        color={PALETTE.ink}
        style={{
          fontSize: fitSize(text, wide ? 68 : 76),
          fontWeight: 800,
          lineHeight: 1.22,
          textAlign: wide ? 'center' : 'left',
          textShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}
      />
    </div>
  )
}

function PointerTap({ x, y, at, size = 70 }) {
  const frame = useCurrentFrame()
  const come = interpolate(frame, [at - 14, at - 2], [0, 1], { ...clamp, easing: (t) => 1 - (1 - t) ** 3 })
  const press = frame >= at && frame < at + 6 ? 0.85 : 1
  const gone = interpolate(frame, [at + 22, at + 32], [1, 0], clamp)
  if (frame < at - 14) return null
  return (
    <div
      style={{
        position: 'absolute',
        left: x + (1 - come) * 120,
        top: y + (1 - come) * 160,
        opacity: Math.min(come * 1.3, gone),
        transform: `scale(${press})`,
        filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.6))',
        zIndex: 40,
      }}
    >
      <Icon name="Pointer" size={size} color="#FFFFFF" stroke={2} />
    </div>
  )
}

// ── 1. Hook Scene: Central Core with Orbiting SaaS Capabilities ────────────────
function Hook({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, height, fps } = useLayout()
  const brandCol = brand?.color || PALETTE.indigo
  const coreScale = spring({ frame: frame - 4, fps, config: { damping: 12, mass: 0.8 } })
  const cx = width / 2
  const cy = wide ? height * 0.48 : height * 0.44

  const satellites = [
    { label: 'Auto Sync', icon: 'RefreshCw', angle: 0 },
    { label: 'Cloud API', icon: 'Cpu', angle: Math.PI * 0.4 },
    { label: 'Live Data', icon: 'Activity', angle: Math.PI * 0.8 },
    { label: 'Smart CRM', icon: 'Users', angle: Math.PI * 1.2 },
    { label: 'Workflows', icon: 'Zap', angle: Math.PI * 1.6 },
  ]

  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      {/* Central Hub Core */}
      <div style={{ position: 'absolute', left: cx, top: cy, transform: `scale(${coreScale})` }}>
        {/* Pulsing radar rings */}
        {[0, 1, 2].map((k) => {
          const prog = ((frame + k * 25) % 75) / 75
          return (
            <div
              key={k}
              style={{
                position: 'absolute',
                left: -120 - prog * 90,
                top: -120 - prog * 90,
                width: (120 + prog * 90) * 2,
                height: (120 + prog * 90) * 2,
                borderRadius: '50%',
                border: `2px solid ${tint(PALETTE.cyan, (1 - prog) * 0.4)}`,
                pointerEvents: 'none',
              }}
            />
          )
        })}

        {/* Orbiting Satellite badges */}
        {satellites.map((s, i) => {
          const orbitRadius = wide ? 230 : 250
          const rot = s.angle + frame * 0.015
          const sx = Math.cos(rot) * orbitRadius
          const sy = Math.sin(rot) * (orbitRadius * 0.65)
          const pop = spring({ frame: frame - 10 - i * 4, fps, config: { damping: 11 } })
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: sx - 60,
                top: sy - 24,
                padding: '8px 16px',
                borderRadius: 20,
                background: 'rgba(12, 18, 36, 0.92)',
                border: `1px solid ${tint(PALETTE.cyan, 0.4)}`,
                boxShadow: `0 8px 24px rgba(0,0,0,0.5), 0 0 16px ${tint(PALETTE.cyan, 0.2)}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transform: `scale(${pop})`,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon name={s.icon} size={wide ? 18 : 22} color={PALETTE.cyan} stroke={2.2} />
              <span style={{ fontFamily: FONT, fontSize: wide ? 16 : 20, fontWeight: 700, color: PALETTE.ink }}>{s.label}</span>
            </div>
          )
        })}

        {/* Center Glass Hexagon / Circle Core */}
        <div
          style={{
            position: 'absolute',
            left: -85,
            top: -85,
            width: 170,
            height: 170,
            borderRadius: 44,
            background: `linear-gradient(135deg, ${brandCol}, #1E1B4B)`,
            border: `3px solid ${PALETTE.cyan}`,
            boxShadow: `0 0 40px ${tint(PALETTE.cyan, 0.45)}, 0 20px 50px rgba(0,0,0,0.7)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={scene.icon || 'Layers'} size={80} color="#FFFFFF" stroke={2.2} />
        </div>
      </div>

      {/* Main Title & Subtitle */}
      <div style={{ position: 'absolute', left: wide ? 160 : 56, right: wide ? 160 : 56, top: wide ? height * 0.72 : height * 0.68 }}>
        <Title text={scene.text} badge={scene.badge || 'SaaS Cloud Platform'} top={0} />
        {scene.sub && (
          <div
            style={{
              marginTop: 20,
              fontFamily: FONT,
              fontSize: wide ? 28 : 34,
              color: PALETTE.sub,
              textAlign: wide ? 'center' : 'left',
              opacity: interpolate(frame, [18, 30], [0, 1], clamp),
            }}
          >
            {clean(scene.sub)}
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

// ── 2. Chaos Scene: Disconnected Spreadsheets & Apps Before ──────────────────
function Chaos({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, height, fps } = useLayout()
  const tools = (scene.tools && scene.tools.length > 0 ? scene.tools : ['Manual Spreadsheets', 'Scattered WhatsApp DMs', 'Paper Invoices', 'Lost Customer Inquiries']).slice(0, 4)

  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} badge="The Problem" top={wide ? 100 : 200} />

      <div
        style={{
          position: 'absolute',
          left: wide ? 160 : 56,
          right: wide ? 160 : 56,
          top: wide ? 280 : 540,
          display: 'grid',
          gridTemplateColumns: wide ? 'repeat(2, 1fr)' : '1fr',
          gap: wide ? 24 : 20,
        }}
      >
        {tools.map((tool, i) => {
          const pop = spring({ frame: frame - 10 - i * 6, fps, config: { damping: 11 } })
          const wobble = Math.sin((frame + i * 20) * 0.08) * 3
          return (
            <div
              key={i}
              style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1.5px dashed rgba(244, 63, 94, 0.35)',
                borderRadius: 24,
                padding: wide ? '22px 28px' : '26px 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transform: `scale(${pop}) translateY(${wobble}px)`,
                boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    width: wide ? 48 : 56,
                    height: wide ? 48 : 56,
                    borderRadius: 16,
                    background: 'rgba(244, 63, 94, 0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="AlertTriangle" size={wide ? 26 : 30} color={PALETTE.rose} stroke={2} />
                </div>
                <span style={{ fontFamily: FONT, fontSize: wide ? 26 : 32, fontWeight: 700, color: PALETTE.ink }}>
                  {clean(tool)}
                </span>
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: wide ? 16 : 20,
                  fontWeight: 700,
                  color: PALETTE.rose,
                  background: 'rgba(244, 63, 94, 0.15)',
                  padding: '4px 12px',
                  borderRadius: 12,
                }}
              >
                DISCONNECTED
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ── 3. Hub Scene: The Unified Platform with Inflowing Connections ────────────
function Hub({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, height, fps } = useLayout()
  const brandCol = brand?.color || PALETTE.indigo
  const apps = (scene.apps && scene.apps.length > 0
    ? scene.apps
    : [
        { name: 'Messenger & Telegram', icon: 'MessageSquare', desc: 'Auto inquiries' },
        { name: 'Bakong & Stripe', icon: 'CreditCard', desc: 'Instant payments' },
        { name: 'Smart CRM', icon: 'Users', desc: 'Customer history' },
        { name: 'Inventory & ERP', icon: 'Package', desc: 'Real-time stock' },
      ]).slice(0, 4)

  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} badge="Central Hub" top={wide ? 90 : 180} />

      {/* Grid of connected apps feeding into center */}
      <div
        style={{
          position: 'absolute',
          left: wide ? 140 : 50,
          right: wide ? 140 : 50,
          top: wide ? 260 : 500,
          display: 'grid',
          gridTemplateColumns: wide ? 'repeat(2, 1fr)' : '1fr',
          gap: wide ? 24 : 20,
        }}
      >
        {apps.map((app, i) => {
          const pop = spring({ frame: frame - 8 - i * 6, fps, config: { damping: 12 } })
          const activeGlow = frame > 20 + i * 6
          return (
            <div
              key={i}
              style={{
                background: PALETTE.card,
                backdropFilter: 'blur(16px)',
                border: `1.5px solid ${activeGlow ? PALETTE.cyan : PALETTE.cardBorderSubtle}`,
                borderRadius: 24,
                padding: wide ? '24px 28px' : '26px 30px',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                transform: `scale(${pop})`,
                boxShadow: activeGlow ? `0 12px 36px rgba(0,0,0,0.4), 0 0 20px ${tint(PALETTE.cyan, 0.2)}` : '0 12px 30px rgba(0,0,0,0.3)',
                transition: 'all 0.3s ease',
              }}
            >
              <div
                style={{
                  width: wide ? 60 : 70,
                  height: wide ? 60 : 70,
                  borderRadius: 18,
                  background: `linear-gradient(135deg, ${tint(brandCol, 0.3)}, ${tint(PALETTE.cyan, 0.15)})`,
                  border: `1px solid ${tint(PALETTE.cyan, 0.4)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon name={app.icon || 'CheckCircle'} size={wide ? 32 : 38} color="#FFFFFF" stroke={2.2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: wide ? 26 : 32, fontWeight: 800, color: PALETTE.ink }}>{clean(app.name)}</div>
                {app.desc && (
                  <div style={{ fontFamily: FONT, fontSize: wide ? 18 : 22, color: PALETTE.sub, marginTop: 4 }}>{clean(app.desc)}</div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 16,
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 4, background: PALETTE.emerald }} />
                <span style={{ fontFamily: FONT, fontSize: wide ? 15 : 18, fontWeight: 700, color: PALETTE.emerald }}>CONNECTED</span>
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ── 4. Trigger Scene: Automated Workflow Steps ────────────────────────────────
function Trigger({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, height, fps } = useLayout()
  const brandCol = brand?.color || PALETTE.indigo

  const event = scene.event || { label: 'New Customer Order Placed', icon: 'ShoppingCart' }
  const actions = (scene.actions && scene.actions.length > 0
    ? scene.actions
    : [
        { label: 'Auto-generate Tax Invoice & PDF', icon: 'FileText' },
        { label: 'Push Telegram alert to sales team', icon: 'Send' },
        { label: 'Sync contact & deal status to CRM', icon: 'UserCheck' },
      ]).slice(0, 3)

  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} badge="Instant Automation" top={wide ? 90 : 180} />

      <div style={{ position: 'absolute', left: wide ? 180 : 56, right: wide ? 180 : 56, top: wide ? 260 : 500 }}>
        {/* Trigger Node */}
        <div
          style={{
            background: `linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(16, 24, 48, 0.85))`,
            border: `2px solid ${brandCol}`,
            borderRadius: 24,
            padding: wide ? '22px 28px' : '26px 30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: `0 12px 30px rgba(0,0,0,0.4), 0 0 24px ${tint(brandCol, 0.3)}`,
            transform: `scale(${spring({ frame: frame - 4, fps, config: { damping: 12 } })})`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div
              style={{
                width: wide ? 52 : 62,
                height: wide ? 52 : 62,
                borderRadius: 16,
                background: brandCol,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={event.icon || 'Zap'} size={wide ? 28 : 34} color="#FFFFFF" stroke={2.2} />
            </div>
            <div>
              <div style={{ fontFamily: FONT, fontSize: wide ? 16 : 20, fontWeight: 700, color: PALETTE.cyan, textTransform: 'uppercase' }}>WHEN EVENT FIRES</div>
              <div style={{ fontFamily: FONT, fontSize: wide ? 28 : 34, fontWeight: 800, color: PALETTE.ink }}>{clean(event.label)}</div>
            </div>
          </div>
          <Icon name="ArrowDown" size={wide ? 32 : 38} color={PALETTE.cyan} stroke={2.4} />
        </div>

        {/* Action Steps */}
        <div style={{ marginTop: wide ? 24 : 26, display: 'flex', flexDirection: 'column', gap: wide ? 16 : 18 }}>
          {actions.map((act, i) => {
            const stepAt = 18 + i * 14
            const isDone = frame >= stepAt
            const pop = spring({ frame: frame - stepAt, fps, config: { damping: 11 } })
            return (
              <div
                key={i}
                style={{
                  background: PALETTE.card,
                  backdropFilter: 'blur(16px)',
                  border: `1.5px solid ${isDone ? 'rgba(16, 185, 129, 0.5)' : PALETTE.cardBorderSubtle}`,
                  borderRadius: 20,
                  padding: wide ? '18px 24px' : '22px 26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transform: `scale(${pop})`,
                  boxShadow: isDone ? '0 10px 24px rgba(0,0,0,0.3), 0 0 16px rgba(16, 185, 129, 0.15)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div
                    style={{
                      width: wide ? 42 : 50,
                      height: wide ? 42 : 50,
                      borderRadius: 14,
                      background: isDone ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name={act.icon || 'Check'} size={wide ? 24 : 28} color={isDone ? PALETTE.emerald : PALETTE.sub} stroke={2.2} />
                  </div>
                  <span style={{ fontFamily: FONT, fontSize: wide ? 24 : 30, fontWeight: 700, color: isDone ? PALETTE.ink : PALETTE.sub }}>
                    {clean(act.label)}
                  </span>
                </div>
                {isDone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="CheckCircle" size={wide ? 24 : 28} color={PALETTE.emerald} stroke={2.4} />
                    <span style={{ fontFamily: FONT, fontSize: wide ? 16 : 20, fontWeight: 700, color: PALETTE.emerald }}>EXECUTED</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ── 5. Metrics Scene: Real-Time Growth & ROI Dashboard ─────────────────────────
function Metrics({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, height, fps } = useLayout()
  const brandCol = brand?.color || PALETTE.indigo

  const stats = (scene.stats && scene.stats.length > 0
    ? scene.stats
    : [
        { label: 'Time Saved per Week', value: '25', suffix: ' hrs', note: '85% manual work cut' },
        { label: 'Response Time', value: '1.2', suffix: 's', note: 'Instant automated reply' },
        { label: 'Cloud Uptime', value: '99.9', suffix: '%', note: 'Bank-grade reliability' },
      ]).slice(0, 3)

  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} badge="Proven Impact" top={wide ? 90 : 180} />

      <div
        style={{
          position: 'absolute',
          left: wide ? 140 : 50,
          right: wide ? 140 : 50,
          top: wide ? 260 : 490,
          display: 'grid',
          gridTemplateColumns: wide ? 'repeat(3, 1fr)' : '1fr',
          gap: wide ? 24 : 24,
        }}
      >
        {stats.map((st, i) => {
          const pop = spring({ frame: frame - 10 - i * 6, fps, config: { damping: 12 } })
          const countProg = interpolate(frame, [14 + i * 6, 42 + i * 6], [0, 1], clamp)
          const numVal = parseFloat(st.value) || 0
          const displayVal = isNaN(numVal) ? st.value : (numVal * countProg).toFixed(st.value.includes('.') ? 1 : 0)

          return (
            <div
              key={i}
              style={{
                background: PALETTE.card,
                backdropFilter: 'blur(20px)',
                border: `2px solid ${tint(PALETTE.cyan, 0.3)}`,
                borderRadius: 28,
                padding: wide ? '36px 30px' : '36px 36px',
                textAlign: 'center',
                boxShadow: `0 16px 40px rgba(0,0,0,0.4), 0 0 20px ${tint(PALETTE.cyan, 0.12)}`,
                transform: `scale(${pop})`,
              }}
            >
              <div style={{ fontFamily: FONT, fontSize: wide ? 22 : 26, fontWeight: 700, color: PALETTE.sub, marginBottom: 12 }}>
                {clean(st.label)}
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: wide ? 64 : 76,
                  fontWeight: 900,
                  color: PALETTE.cyan,
                  lineHeight: 1,
                  textShadow: `0 0 20px ${tint(PALETTE.cyan, 0.5)}`,
                }}
              >
                {st.prefix || ''}
                {displayVal}
                {st.suffix || ''}
              </div>
              {st.note && (
                <div style={{ fontFamily: FONT, fontSize: wide ? 18 : 22, color: PALETTE.emerald, marginTop: 16, fontWeight: 600 }}>
                  ✓ {clean(st.note)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ── 6. Plans Scene: Subscription Tiers ───────────────────────────────────────
function Plans({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, height, fps } = useLayout()
  const brandCol = brand?.color || PALETTE.indigo
  const pick = scene.pick ?? 1

  const tiers = (scene.tiers && scene.tiers.length > 0
    ? scene.tiers
    : [
        { name: 'Starter', price: '$29/mo', note: 'Up to 5 apps, 2k tasks' },
        { name: 'Pro', price: '$79/mo', note: 'Unlimited apps, real-time sync', badge: 'Most Popular' },
        { name: 'Enterprise', price: '$199/mo', note: 'Dedicated server & SLA' },
      ]).slice(0, 3)

  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <Title text={scene.text} badge="Simple Pricing" top={wide ? 90 : 180} />

      <div
        style={{
          position: 'absolute',
          left: wide ? 140 : 50,
          right: wide ? 140 : 50,
          top: wide ? 270 : 490,
          display: 'grid',
          gridTemplateColumns: wide ? `repeat(${tiers.length}, 1fr)` : '1fr',
          gap: wide ? 24 : 20,
        }}
      >
        {tiers.map((tr, i) => {
          const pop = spring({ frame: frame - 10 - i * 6, fps, config: { damping: 11 } })
          const isSelected = i === pick

          return (
            <div
              key={i}
              style={{
                background: isSelected ? `linear-gradient(135deg, rgba(99, 102, 241, 0.35), rgba(16, 24, 48, 0.95))` : PALETTE.card,
                backdropFilter: 'blur(16px)',
                border: `${isSelected ? '3px' : '1.5px'} solid ${isSelected ? PALETTE.cyan : PALETTE.cardBorderSubtle}`,
                borderRadius: 28,
                padding: wide ? '32px 28px' : '28px 30px',
                textAlign: 'center',
                transform: `scale(${pop * (isSelected ? 1.04 : 1)})`,
                boxShadow: isSelected ? `0 20px 48px rgba(0,0,0,0.5), 0 0 28px ${tint(PALETTE.cyan, 0.25)}` : '0 12px 30px rgba(0,0,0,0.3)',
                position: 'relative',
              }}
            >
              {tr.badge && (
                <div
                  style={{
                    position: 'absolute',
                    top: -16,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: PALETTE.cyan,
                    color: '#000000',
                    fontFamily: FONT,
                    fontWeight: 800,
                    fontSize: wide ? 15 : 18,
                    padding: '4px 18px',
                    borderRadius: 12,
                    boxShadow: `0 4px 14px ${tint(PALETTE.cyan, 0.5)}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {clean(tr.badge)}
                </div>
              )}
              <div style={{ fontFamily: FONT, fontSize: wide ? 26 : 32, fontWeight: 800, color: PALETTE.ink }}>{clean(tr.name)}</div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: wide ? 48 : 56,
                  fontWeight: 900,
                  color: isSelected ? PALETTE.cyan : PALETTE.ink,
                  marginTop: 10,
                }}
              >
                {clean(tr.price)}
              </div>
              {tr.note && (
                <div style={{ fontFamily: FONT, fontSize: wide ? 18 : 22, color: PALETTE.sub, marginTop: 12 }}>
                  {clean(tr.note)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ── 7. CTA Scene: High-Converting Call to Action ──────────────────────────────
function Cta({ scene, brand }) {
  const frame = useCurrentFrame()
  const { wide, width, height, fps } = useLayout()
  const brandCol = brand?.color || PALETTE.indigo
  const btnPop = spring({ frame: frame - 18, fps, config: { damping: 11 } })
  const btnPulse = 1 + Math.sin(frame * 0.1) * 0.03
  const bw = wide ? 520 : 660
  const bh = wide ? 92 : 110

  return (
    <AbsoluteFill>
      <Bg brand={brand} />
      <div
        style={{
          position: 'absolute',
          left: wide ? 160 : 56,
          right: wide ? 160 : 56,
          top: wide ? height * 0.3 : height * 0.32,
          textAlign: 'center',
        }}
      >
        {/* Brand Icon / Logo */}
        <div
          style={{
            width: wide ? 100 : 120,
            height: wide ? 100 : 120,
            borderRadius: 36,
            background: `linear-gradient(135deg, ${brandCol}, ${PALETTE.cyan})`,
            margin: '0 auto 30px auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 40px ${tint(PALETTE.cyan, 0.4)}`,
            transform: `scale(${spring({ frame: frame - 4, fps, config: { damping: 11 } })})`,
          }}
        >
          <Icon name="Zap" size={wide ? 56 : 68} color="#FFFFFF" stroke={2.4} />
        </div>

        <Words
          text={scene.text}
          delay={8}
          align="center"
          color={PALETTE.ink}
          style={{
            fontSize: fitSize(scene.text, wide ? 72 : 82),
            fontWeight: 800,
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        />

        {scene.button && (
          <div style={{ marginTop: wide ? 40 : 50, display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: bw,
                height: bh,
                borderRadius: bh / 2,
                background: `linear-gradient(135deg, ${brandCol}, ${PALETTE.cyan})`,
                boxShadow: `0 16px 40px rgba(0,0,0,0.5), 0 0 30px ${tint(PALETTE.cyan, 0.35)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                transform: `scale(${btnPop * btnPulse})`,
              }}
            >
              <span style={{ fontFamily: FONT, fontSize: wide ? 36 : 44, fontWeight: 800, color: '#FFFFFF' }}>
                {clean(scene.button)}
              </span>
              <Icon name="ArrowRight" size={wide ? 36 : 44} color="#FFFFFF" stroke={2.6} />
            </div>
            <PointerTap x={width / 2 + bw * 0.16} y={wide ? height * 0.3 + 240 : height * 0.32 + 300} at={42} />
          </div>
        )}

        {scene.sub && (
          <div style={{ marginTop: 28, fontFamily: FONT, fontSize: wide ? 22 : 28, color: PALETTE.sub }}>
            {clean(scene.sub)}
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

// Sound effects cue mapping
export function saashubCues(scene) {
  switch (scene.type) {
    case 'hook':
      return [[6, 'whoosh']]
    case 'chaos':
      return [[10, 'pop'], [18, 'pop'], [26, 'pop'], [34, 'pop']]
    case 'hub':
      return [[8, 'whoosh'], [20, 'ding'], [28, 'ding'], [36, 'ding']]
    case 'trigger':
      return [[8, 'pop'], [22, 'click'], [34, 'ding'], [46, 'ding']]
    case 'metrics':
      return [[10, 'whoosh'], [40, 'ding']]
    case 'plans':
      return [[10, 'pop'], [18, 'pop'], [26, 'pop']]
    case 'cta':
      return scene.button ? [[16, 'pop'], [42, 'click']] : [[16, 'pop']]
    default:
      return []
  }
}

export const SAASHUB = {
  scenes: { hook: Hook, chaos: Chaos, hub: Hub, trigger: Trigger, metrics: Metrics, plans: Plans, cta: Cta },
  root: { backgroundColor: PALETTE.bg },
  captionTop: (h) => (h < 1200 ? h - 140 : 1560),
}
