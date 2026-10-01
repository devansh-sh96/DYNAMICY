import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { Delete, Equal } from 'lucide-react'
import { evaluateExpression, formatNumber, type AngleMode } from '../../../lib/mathEval'
import { useAppStore } from '../../../stores/appStore'

type HistoryEntry = { id: number; expression: string; result: string }
type KeyKind = 'digit' | 'operator' | 'action'

const KEYS: { label: string; kind: KeyKind }[] = [
  { label: 'C', kind: 'action' },
  { label: '(', kind: 'operator' },
  { label: ')', kind: 'operator' },
  { label: '%', kind: 'operator' },
  { label: '÷', kind: 'operator' },

  { label: '7', kind: 'digit' },
  { label: '8', kind: 'digit' },
  { label: '9', kind: 'digit' },
  { label: '×', kind: 'operator' },
  { label: '⌫', kind: 'action' },

  { label: '4', kind: 'digit' },
  { label: '5', kind: 'digit' },
  { label: '6', kind: 'digit' },
  { label: '−', kind: 'operator' },
  { label: 'x²', kind: 'action' },

  { label: '1', kind: 'digit' },
  { label: '2', kind: 'digit' },
  { label: '3', kind: 'digit' },
  { label: '+', kind: 'operator' },
  { label: '^', kind: 'operator' },

  { label: '0', kind: 'digit' },
  { label: '.', kind: 'digit' },
  { label: '√', kind: 'action' },
  { label: '±', kind: 'action' },
  { label: '=', kind: 'action' }
]

const DISPLAY_KEYS: Record<string, string> = { '÷': '/', '×': '*', '−': '-' }

// Twenty extra keys that appear in scientific mode, listed row by row. Scientific mode
// is a side-by-side 10×5 grid: the standard pad keeps columns 1-5, these fill columns
// 6-10, and the wide DEG/RAD key spans the free row-5 slot. `π` and `e` insert as-is.
const SCIENTIFIC_KEYS: { label: string; kind: KeyKind }[] = [
  { label: 'sin', kind: 'operator' },
  { label: 'cos', kind: 'operator' },
  { label: 'tan', kind: 'operator' },
  { label: 'ln', kind: 'operator' },
  { label: 'log', kind: 'operator' },

  { label: 'asin', kind: 'operator' },
  { label: 'acos', kind: 'operator' },
  { label: 'atan', kind: 'operator' },
  { label: 'sinh', kind: 'operator' },
  { label: 'cosh', kind: 'operator' },

  { label: '|x|', kind: 'action' },
  { label: '∛', kind: 'action' },
  { label: 'log₂', kind: 'operator' },
  { label: '10ˣ', kind: 'action' },
  { label: 'eˣ', kind: 'action' },

  { label: 'π', kind: 'operator' },
  { label: 'e', kind: 'operator' },
  { label: 'x!', kind: 'action' },
  { label: '1/x', kind: 'action' },
  { label: 'x³', kind: 'action' }
]

/** Tapped like iOS: the name inserts with an opening paren, ready for the argument. */
const FUNCTION_LABELS = new Set(['sin', 'cos', 'tan', 'ln', 'log', 'asin', 'acos', 'atan', 'sinh', 'cosh'])

/**
 * Keys that wrap the whole current entry into a complete, self-contained expression
 * (`√(9)`), like `=` does. After one of these the entry is "done": a digit or a new
 * function has to start over, or `√(9)3` comes out and the parser rightly errors.
 */
const IMMEDIATE_LABELS = new Set(['√', '∛', '|x|', 'x²', 'x³', 'x!', '1/x', '10ˣ', 'eˣ'])

/** Grid slot for a standard key in scientific mode (columns 1-5). */
const standardKeyPlacement = (index: number): CSSProperties => ({
  gridColumn: `${(index % 5) + 1}`,
  gridRow: `${Math.floor(index / 5) + 1}`
})

/** Grid slot for a scientific key (columns 6-10). */
const sciKeyPlacement = (index: number): CSSProperties => ({
  gridColumn: `${6 + (index % 5)}`,
  gridRow: `${Math.floor(index / 5) + 1}`
})

let historyId = 0

const CalculatorTab = () => {
  const [expression, setExpression] = useState('')
  const [preview, setPreview] = useState('0')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [isScientific, setIsScientific] = useState(false)
  const [angleMode, setAngleMode] = useState<AngleMode>('deg')
  const [freshResult, setFreshResult] = useState(false)
  const setSelectedTab = useAppStore((state) => state.setSelectedTab)

  // Live preview while typing; a full evaluation is only committed on `=`.
  const livePreview = useMemo(() => {
    const value = evaluateExpression(expression, { angleMode })
    return value === null ? '' : formatNumber(value)
  }, [expression, angleMode])

  const press = useCallback((label: string) => {
    // After a completed result, digits, constants and function names start a fresh
    // entry; operators and the immediate-transform keys keep building on the result
    // (√ after √(9) nests: √(√(9))).
    const startsNewEntry =
      freshResult &&
      (/^[0-9.]$/.test(label) || label === '(' || label === 'π' || label === 'e' || FUNCTION_LABELS.has(label))
    const current = startsNewEntry ? '' : expression

    let next: string
    if (label === 'C') next = ''
    else if (label === '⌫') next = current.slice(0, -1)
    else if (FUNCTION_LABELS.has(label)) next = `${current}${label}(`
    else if (label === 'log₂') next = `${current}log2(`
    else if (label === '√') next = `√(${current || '0'})`
    else if (label === '∛') next = `cbrt(${current || '0'})`
    else if (label === '|x|') next = `abs(${current || '0'})`
    else if (label === 'x²') next = `${current || '0'}^2`
    else if (label === 'x³') next = `${current || '0'}^3`
    else if (label === 'x!') next = `${current || '0'}!`
    else if (label === '1/x') next = `1/(${current || '0'})`
    else if (label === '10ˣ') next = `10^(${current || '0'})`
    else if (label === 'eˣ') next = `e^(${current || '0'})`
    else if (label === '±') {
      // Toggles the sign of whatever has been typed so far.
      const body = current.replace(/^-\((.*)\)$/, '$1')
      next = current.startsWith('-(') ? body : `-(${body})`
    } else next = `${current}${DISPLAY_KEYS[label] ?? label}`

    setExpression(next)
    setFreshResult(IMMEDIATE_LABELS.has(label))
  }, [expression, freshResult])

  const commit = useCallback(() => {
    const value = evaluateExpression(expression, { angleMode })
    if (value === null) {
      setPreview('Error')
      return
    }
    const result = formatNumber(value)
    setPreview(result)
    setHistory((current) => [{ id: historyId++, expression: expression || '0', result }, ...current].slice(0, 12))
    setExpression(result)
    setFreshResult(true)
  }, [expression, angleMode])

  return (
    <div className="calculator-tab">
      <div className="calculator-display" role="status" aria-live="polite">
        <div className="calculator-display-top">
          <div className="calculator-mode-toggle" role="group" aria-label="Calculator mode">
            <button
              type="button"
              className={isScientific ? '' : 'is-active'}
              aria-pressed={!isScientific}
              onClick={() => setIsScientific(false)}
            >
              Basic
            </button>
            <button
              type="button"
              className={isScientific ? 'is-active' : ''}
              aria-pressed={isScientific}
              onClick={() => setIsScientific(true)}
            >
              Scientific
            </button>
          </div>
        </div>
        <span className="calculator-expression">{expression || '0'}</span>
        <strong>{livePreview || preview}</strong>
      </div>

      <div className="calculator-body">
        <div className={`calculator-keypad ${isScientific ? 'is-scientific' : ''}`}>
          {isScientific && SCIENTIFIC_KEYS.map((key, index) => (
            <button
              key={`sci-${key.label}`}
              type="button"
              className={`calculator-key is-${key.kind} is-sci`}
              style={sciKeyPlacement(index)}
              onClick={() => press(key.label)}
              aria-label={key.label}
            >
              {key.label}
            </button>
          ))}
          {isScientific && (
            <button
              type="button"
              className="calculator-key is-action is-sci is-angle"
              style={{ gridColumn: '6 / 11', gridRow: 5 }}
              title="Angle unit used by sin, cos and tan"
              aria-pressed={angleMode === 'rad'}
              onClick={() => setAngleMode((current) => (current === 'deg' ? 'rad' : 'deg'))}
            >
              {angleMode === 'deg' ? 'DEG' : 'RAD'}
            </button>
          )}
          {KEYS.map((key, index) => (
            <button
              key={`${key.label}-${key.kind}`}
              type="button"
              className={`calculator-key is-${key.kind}`}
              style={isScientific ? standardKeyPlacement(index) : undefined}
              onClick={() => (key.label === '=' ? commit() : press(key.label))}
              aria-label={key.label}
            >
              {key.label === '⌫' ? <Delete size={13} /> : key.label === '=' ? <Equal size={14} /> : key.label}
            </button>
          ))}
        </div>

        <aside className="calculator-history" aria-label="Calculation history">
          <h2>History</h2>
          {history.length === 0 ? (
            <p className="calculator-history-empty">Results appear here.</p>
          ) : history.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => { setExpression(entry.result); setFreshResult(true) }}
              title="Reuse this result"
            >
              <span>{entry.expression}</span>
              <strong>= {entry.result}</strong>
            </button>
          ))}
        </aside>
      </div>

      <div className="calculator-footer">
        <span>Tip: ask chat “14% of 350”</span>
        <button type="button" onClick={() => { setSelectedTab('chat') }}>Open chat</button>
      </div>
    </div>
  )
}

export default CalculatorTab
