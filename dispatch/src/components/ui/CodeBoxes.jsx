import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

/** Six boxes for an emailed code (sign-up confirmation, "Forgot password").
 *  Typing, pasting or a phone's code autofill fills them; ``onChange(code)`` gets
 *  the code once every box is filled ("" while one is empty), and
 *  ``onComplete(code)`` runs then. The ref's ``clear()`` empties them and puts the
 *  cursor in the first box. */
const CodeBoxes = forwardRef(function CodeBoxes({ onChange, onComplete, disabled, autoFocus = true, length = 6 }, ref) {
  const [digits, setDigits] = useState(() => Array(length).fill(''))
  const boxes = useRef([])

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus()
  }, [autoFocus])

  useImperativeHandle(ref, () => ({
    clear: () => {
      setDigits(Array(length).fill(''))
      onChange?.('')
      setTimeout(() => boxes.current[0]?.focus(), 0)
    },
  }))

  const set = (next) => {
    setDigits(next)
    const full = next.every(Boolean)
    onChange?.(full ? next.join('') : '')
    if (full) onComplete?.(next.join(''))
  }

  const fill = (from, text) => {
    const clean = text.replace(/\D/g, '')
    if (!clean) return
    const next = [...digits]
    for (let i = 0; i < clean.length && from + i < length; i++) next[from + i] = clean[i]
    boxes.current[Math.min(length - 1, from + clean.length)]?.focus()
    set(next)
  }

  const empty = (i) => {
    const next = [...digits]
    next[i] = ''
    set(next)
  }

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (boxes.current[i] = el)}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          maxLength={length}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            if (!v) return empty(i)
            // a phone's code autofill puts the whole code in one box; typing over a digit keeps the new one
            fill(i, v.length > 2 ? v : v.slice(-1))
          }}
          onPaste={(e) => {
            e.preventDefault()
            fill(i, e.clipboardData.getData('text'))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) {
              e.preventDefault()
              empty(i - 1)
              boxes.current[i - 1]?.focus()
            }
          }}
          className="h-12 w-11 rounded-xl border border-ink-200 bg-white text-center text-[20px] font-bold text-ink-900 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60"
        />
      ))}
    </div>
  )
})

export default CodeBoxes
