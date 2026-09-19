/* Renders the small subset of markdown the product descriptions use:
   headings, **bold**, "- / * / •" bullet lists, and paragraphs. Everything
   else falls through as plain text — safe since we never inject HTML. */

function inlineParts(text) {
  return text.split(/(\*\*[^*]+\*\*)/g)
}

function Inline({ text }) {
  return inlineParts(text).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? (
      <strong key={i} className="font-bold text-ink-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

export default function MarkdownText({ text }) {
  if (!text) return null

  const blocks = []
  let bullets = []
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push({ type: 'ul', items: bullets })
      bullets = []
    }
  }

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/)
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/)
    if (heading) {
      flushBullets()
      blocks.push({ type: 'h', level: heading[1].length, text: heading[2] })
    } else if (bullet) {
      bullets.push(bullet[1])
    } else {
      flushBullets()
      if (trimmed) blocks.push({ type: 'p', text: trimmed })
    }
  }
  flushBullets()

  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          return (
            <div
              key={i}
              className={
                b.level === 1
                  ? 'text-[15px] font-bold text-ink-900 leading-snug'
                  : b.level === 2
                    ? 'text-[13.5px] font-bold text-ink-900 leading-snug'
                    : 'text-[12.5px] font-bold text-ink-800 leading-snug'
              }
            >
              <Inline text={b.text} />
            </div>
          )
        }
        if (b.type === 'ul') {
          return (
            <ul key={i} className="space-y-1">
              {b.items.map((item, j) => (
                <li key={j} className="flex items-start gap-2 text-[13px] text-ink-600 leading-relaxed">
                  <span className="mt-[8px] h-1 w-1 rounded-full bg-brand flex-none" />
                  <span>
                    <Inline text={item} />
                  </span>
                </li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-[13px] text-ink-600 leading-relaxed">
            <Inline text={b.text} />
          </p>
        )
      })}
    </div>
  )
}