import React from 'react'
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

// =============================================================
// Design tokens — mirror the site's design system
// =============================================================
const TOKENS = {
  ink: '#0A0A0E',
  ink2: '#111117',
  ink3: '#181820',
  accent: '#D15B2C',
  text: '#E8E8EE',
  textDim: '#9D9DA8',
  textMuted: '#6C6C78',
  line: 'rgba(232,232,238,0.12)',
  serif: "'Fraunces', Georgia, serif",
  sans: "'Outfit', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace"
}

// Ease curves
const ease = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// =============================================================
// ACT 1 — Opening: brand reveal + thesis statement (0-6s)
// =============================================================
const Act1_Hero: React.FC = () => {
  const frame = useCurrentFrame()
  const fpsSpring = spring({ frame, fps: 30, config: { damping: 14, mass: 0.6 } })
  const textY = interpolate(fpsSpring, [0, 1], [40, 0])
  const textOpacity = interpolate(fpsSpring, [0, 1], [0, 1])

  const subOpacity = interpolate(frame, [40, 70], [0, 1], { extrapolateRight: 'clamp' })
  const subY = interpolate(frame, [40, 70], [20, 0], { extrapolateRight: 'clamp' })

  const metaOpacity = interpolate(frame, [100, 140], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ background: TOKENS.ink, padding: '120px 140px', justifyContent: 'flex-end' }}>
      {/* Grain texture */}
      <AbsoluteFill style={{
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>")`,
        opacity: 0.03,
        pointerEvents: 'none'
      }} />

      {/* Accent tick + label */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40,
        opacity: metaOpacity
      }}>
        <div style={{ width: 40, height: 2, background: TOKENS.accent }} />
        <span style={{
          fontFamily: TOKENS.mono, fontSize: 18,
          color: TOKENS.textDim, letterSpacing: '0.24em',
          textTransform: 'uppercase'
        }}>
          VOL. 01 · 2026 EDITION · <span style={{ color: TOKENS.accent, fontWeight: 500 }}>OPEN ACCESS</span>
        </span>
      </div>

      {/* Hero headline */}
      <h1 style={{
        fontFamily: TOKENS.serif,
        fontSize: 220,
        fontWeight: 300,
        lineHeight: 0.92,
        letterSpacing: '-0.02em',
        color: TOKENS.text,
        margin: 0,
        transform: `translateY(${textY}px)`,
        opacity: textOpacity
      }}>
        AI engineering,<br />
        <span style={{
          opacity: subOpacity,
          transform: `translateY(${subY}px)`,
          display: 'inline-block'
        }}>
          <em style={{ fontWeight: 400 }}>made</em>{' '}
          <span style={{ color: TOKENS.accent, fontStyle: 'italic' }}>interactive.</span>
        </span>
      </h1>
    </AbsoluteFill>
  )
}

// =============================================================
// ACT 2 — Specimens: the numbers (6-12s)
// =============================================================
const Act2_Specimens: React.FC = () => {
  const frame = useCurrentFrame()

  const specimens = [
    { n: '010', label: 'Topics' },
    { n: '040', label: 'Concepts' },
    { n: '023', label: 'Primitives' },
    { n: '∞',   label: 'Free' }
  ]

  return (
    <AbsoluteFill style={{
      background: TOKENS.ink,
      padding: '0 140px',
      justifyContent: 'center'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 40,
        borderTop: `1px solid ${TOKENS.line}`,
        paddingTop: 40
      }}>
        {specimens.map((s, i) => {
          const start = i * 15
          const op = interpolate(frame, [start, start + 20], [0, 1], { extrapolateRight: 'clamp' })
          const y = interpolate(frame, [start, start + 20], [40, 0], { extrapolateRight: 'clamp' })
          return (
            <div key={s.label} style={{
              opacity: op,
              transform: `translateY(${y}px)`,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <span style={{
                fontFamily: TOKENS.serif,
                fontWeight: 300,
                fontSize: 140,
                color: TOKENS.text,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums'
              }}>
                <em style={{ color: TOKENS.accent, fontStyle: 'italic' }}>{s.n}</em>
              </span>
              <span style={{
                fontFamily: TOKENS.mono,
                fontSize: 22,
                letterSpacing: '0.22em',
                color: TOKENS.textMuted,
                textTransform: 'uppercase'
              }}>
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// =============================================================
// ACT 3 — Topic rail: the ten topics scroll past (12-20s)
// =============================================================
const Act3_Topics: React.FC = () => {
  const frame = useCurrentFrame()

  const topics = [
    'Foundation Models',
    'Prompt Engineering',
    'Evaluation',
    'RAG & Agents',
    'Finetuning',
    'Dataset Engineering',
    'Inference Optimization',
    'System Architecture',
    'User Feedback',
    'Production & Cost'
  ]

  // Scroll from frame 0 to ~180 (6 seconds)
  const totalHeight = 160 // per row
  const scrollTop = interpolate(frame, [0, 180], [220, -(topics.length * totalHeight - 800)])

  return (
    <AbsoluteFill style={{ background: TOKENS.ink, overflow: 'hidden' }}>
      <div style={{ padding: '0 140px', marginTop: 80 }}>
        <span style={{
          fontFamily: TOKENS.mono,
          fontSize: 18,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: TOKENS.accent
        }}>
          § THE CURRICULUM
        </span>
      </div>

      <div style={{ transform: `translateY(${scrollTop}px)`, padding: '0 140px' }}>
        {topics.map((t, i) => (
          <div key={t} style={{
            padding: '40px 0',
            borderBottom: `1px solid ${TOKENS.line}`,
            display: 'grid',
            gridTemplateColumns: '100px 1fr',
            gap: 40,
            alignItems: 'baseline'
          }}>
            <span style={{
              fontFamily: TOKENS.serif,
              fontSize: 72,
              fontWeight: 300,
              color: TOKENS.textMuted,
              fontVariantNumeric: 'tabular-nums'
            }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{
              fontFamily: TOKENS.serif,
              fontSize: 76,
              fontWeight: 400,
              color: TOKENS.text,
              letterSpacing: '-0.015em'
            }}>
              {t}
            </span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  )
}

// =============================================================
// ACT 4 — The primitives: "made interactive" proof (20-27s)
// =============================================================
const Act4_Primitives: React.FC = () => {
  const frame = useCurrentFrame()
  const headerOp = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' })

  const primitives = [
    'Tokenizer',
    'Attention heatmap',
    'Temperature sampler',
    'Vector search',
    'Memory calculator',
    'Prompt diff',
    'Cost calculator'
  ]

  return (
    <AbsoluteFill style={{ background: TOKENS.ink, padding: '140px' }}>
      <h2 style={{
        fontFamily: TOKENS.serif,
        fontWeight: 300,
        fontSize: 120,
        lineHeight: 1,
        color: TOKENS.text,
        margin: 0,
        marginBottom: 60,
        opacity: headerOp,
        letterSpacing: '-0.02em'
      }}>
        <em style={{ fontWeight: 400 }}>Every concept</em><br />
        is <span style={{ color: TOKENS.accent, fontStyle: 'italic' }}>live.</span>
      </h2>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 16
      }}>
        {primitives.map((p, i) => {
          const start = 30 + i * 10
          const op = interpolate(frame, [start, start + 15], [0, 1], { extrapolateRight: 'clamp' })
          const x = interpolate(frame, [start, start + 15], [-30, 0], { extrapolateRight: 'clamp' })
          return (
            <div key={p} style={{
              padding: '24px 32px',
              border: `1px solid ${TOKENS.line}`,
              background: TOKENS.ink2,
              opacity: op,
              transform: `translateX(${x}px)`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{
                fontFamily: TOKENS.serif,
                fontSize: 36,
                color: TOKENS.text,
                fontWeight: 400
              }}>
                {p}
              </span>
              <span style={{
                fontFamily: TOKENS.mono,
                fontSize: 16,
                letterSpacing: '0.24em',
                color: TOKENS.accent,
                padding: '6px 12px',
                border: `1px solid ${TOKENS.accent}`
              }}>
                LIVE
              </span>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// =============================================================
// ACT 5 — Closer: the invitation (27-30s)
// =============================================================
const Act5_Close: React.FC = () => {
  const frame = useCurrentFrame()
  const scale = spring({ frame, fps: 30, config: { damping: 10, mass: 0.8 } })
  const op = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{
      background: TOKENS.ink,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 140
    }}>
      <div style={{
        textAlign: 'center',
        opacity: op,
        transform: `scale(${interpolate(scale, [0, 1], [0.94, 1])})`
      }}>
        <h2 style={{
          fontFamily: TOKENS.serif,
          fontWeight: 300,
          fontStyle: 'italic',
          fontSize: 180,
          lineHeight: 0.95,
          color: TOKENS.text,
          margin: 0,
          letterSpacing: '-0.02em'
        }}>
          Read it.<br />
          Break it.<br />
          Ship <span style={{ color: TOKENS.accent }}>Monday.</span>
        </h2>
        <p style={{
          fontFamily: TOKENS.mono,
          fontSize: 24,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: TOKENS.textMuted,
          marginTop: 60
        }}>
          AI Engineering <span style={{ color: TOKENS.accent }}>Atlas</span> &nbsp;·&nbsp;  Open access
        </p>
      </div>
    </AbsoluteFill>
  )
}

// =============================================================
// Main composition
// =============================================================
export const LaunchVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: TOKENS.ink }}>
      {/* Act 1: 0-6s (0-180f) */}
      <Sequence from={0} durationInFrames={180}>
        <Act1_Hero />
      </Sequence>

      {/* Act 2: 6-12s (180-360f) */}
      <Sequence from={180} durationInFrames={180}>
        <Act2_Specimens />
      </Sequence>

      {/* Act 3: 12-20s (360-600f) */}
      <Sequence from={360} durationInFrames={240}>
        <Act3_Topics />
      </Sequence>

      {/* Act 4: 20-27s (600-810f) */}
      <Sequence from={600} durationInFrames={210}>
        <Act4_Primitives />
      </Sequence>

      {/* Act 5: 27-30s (810-900f) */}
      <Sequence from={810} durationInFrames={90}>
        <Act5_Close />
      </Sequence>
    </AbsoluteFill>
  )
}
