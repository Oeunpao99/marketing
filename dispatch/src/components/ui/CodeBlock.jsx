import { useState } from 'react'
import { FiCheck, FiCopy } from 'react-icons/fi'

// A dark code box with its words coloured like an editor — the API & MCP page's
// Quick Start and the public /developers docs. The box is dark in both themes,
// so the token colours are fixed palette shades, not theme tokens.

const KEYWORDS =
  'import|from|export|default|const|let|var|function|return|async|await|if|else|for|while|new|try|catch|throw|class|public|private|static|void|final|def|print|with|as|echo|require|use|package|elif|in|of|true|false|null|None|True|False'

// comment | string | number | flag | keyword | $variable — a comment or a flag only
// after a space or a line start, so "https://…" and "smart-marketing" stay plain
const TOKENS = new RegExp(
  [
    String.raw`((?:^|(?<=\s))(?:#|\/\/)[^\n]*)`,
    String.raw`("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|` + '`' + String.raw`(?:\\.|[^` + '`' + String.raw`\\])*` + '`)',
    String.raw`((?<![\w:/.$-])\d+(?:\.\d+)?\b)`,
    String.raw`((?<=\s)--?[a-zA-Z][\w-]*)`,
    String.raw`\b(` + KEYWORDS + String.raw`)\b`,
    String.raw`(\$[a-zA-Z_]\w*)`,
  ].join('|'),
  'gm',
)

const PAINT = ['text-white/40 italic', 'text-emerald-300', 'text-amber-300', 'text-sky-300', 'text-fuchsia-300', 'text-sky-200']

/** The code as coloured spans; a string just before ":" is a JSON key (light blue). */
export function highlight(code) {
  const out = []
  let at = 0
  let n = 0
  for (const m of code.matchAll(TOKENS)) {
    if (m.index > at) out.push(code.slice(at, m.index))
    const kind = m.slice(1).findIndex((g) => g !== undefined)
    const key = kind === 1 && /^\s*:/.test(code.slice(m.index + m[0].length))
    out.push(
      <span key={n++} className={key ? 'text-sky-200' : PAINT[kind]}>
        {m[0]}
      </span>,
    )
    at = m.index + m[0].length
  }
  if (at < code.length) out.push(code.slice(at))
  return out
}

export function CopyButton({ text, dark = false }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        })
      }
      className={`inline-flex flex-none items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold transition-colors ${dark ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'border border-ink-200 bg-white text-ink-700 hover:bg-ink-50'}`}
    >
      {done ? <FiCheck size={12} /> : <FiCopy size={12} />} {done ? 'Copied' : 'Copy'}
    </button>
  )
}

/** ``copy``: what the Copy button copies, when it differs from what's shown. */
export default function CodeBlock({ code, label, copy, wrap = false }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-night-950 shadow-card">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-[11.5px] text-white/50">
          <span className="flex gap-1">
            <i className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <i className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
            <i className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </span>
          {label}
        </span>
        <CopyButton text={copy ?? code} dark />
      </div>
      <pre className={`px-4 py-3.5 font-mono text-[12px] leading-relaxed text-white/90 ${wrap ? 'whitespace-pre-wrap break-all' : 'overflow-x-auto'}`}>
        <code>{highlight(code)}</code>
      </pre>
    </div>
  )
}
