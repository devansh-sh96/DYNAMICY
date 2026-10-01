/**
 * A small, dependency-free arithmetic evaluator.
 *
 * This deliberately avoids `eval` and `new Function`: chat input is untrusted text, and
 * handing it to the JS engine would let a crafted prompt run arbitrary code inside the
 * renderer. Instead the string is tokenised and walked by a recursive-descent parser, so
 * the only thing that can ever happen is arithmetic.
 *
 * Supported: + - * / % ^ ! parentheses, unary sign, `x% of y`, the unicode
 * multiplication/division signs people paste in from calculators, constants (`pi`, `π`,
 * `e`) and scientific functions (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`,
 * `cosh`, `tanh`, `ln`, `log`, `log2`, `sqrt`, `cbrt`, `abs`) — always called with
 * parentheses, as in `sin(30)`. Trig reads the angle mode the caller passes; hyperbolic
 * and logarithmic functions are unit-free.
 */

export type AngleMode = 'deg' | 'rad'

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: string }
  | { kind: 'name'; value: string }

const OPERATOR_CHARS: Record<string, string> = {
  '+': '+',
  '-': '-',
  '*': '*',
  '×': '*',
  '/': '/',
  '÷': '/',
  '%': '%',
  '^': '^',
  '!': '!',
  '√': 'sqrt',
  '(': '(',
  ')': ')',
  ',': ','
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E
}

const toRadians = (value: number, angleMode: AngleMode): number => (angleMode === 'deg' ? (value * Math.PI) / 180 : value)
const fromRadians = (value: number, angleMode: AngleMode): number => (angleMode === 'deg' ? (value * 180) / Math.PI : value)

const FUNCTIONS: Record<string, (value: number, angleMode: AngleMode) => number> = {
  sin: (value, angleMode) => Math.sin(toRadians(value, angleMode)),
  cos: (value, angleMode) => Math.cos(toRadians(value, angleMode)),
  // tan(90°) is a pole; without this guard floating point answers 1.6e16 instead of erroring.
  tan: (value, angleMode) => (angleMode === 'deg' && Math.abs(value % 180) === 90 ? Number.NaN : Math.tan(toRadians(value, angleMode))),
  asin: (value, angleMode) => (value < -1 || value > 1 ? Number.NaN : fromRadians(Math.asin(value), angleMode)),
  acos: (value, angleMode) => (value < -1 || value > 1 ? Number.NaN : fromRadians(Math.acos(value), angleMode)),
  atan: (value, angleMode) => fromRadians(Math.atan(value), angleMode),
  sinh: (value) => Math.sinh(value),
  cosh: (value) => Math.cosh(value),
  tanh: (value) => Math.tanh(value),
  ln: (value) => (value <= 0 ? Number.NaN : Math.log(value)),
  log: (value) => (value <= 0 ? Number.NaN : Math.log10(value)),
  log2: (value) => (value <= 0 ? Number.NaN : Math.log2(value)),
  sqrt: (value) => (value < 0 ? Number.NaN : Math.sqrt(value)),
  // Unlike sqrt, the real cube root is defined for negatives: cbrt(-27) === -3.
  cbrt: (value) => Math.cbrt(value),
  abs: (value) => Math.abs(value)
}

/** Whole numbers up to 170! — beyond that a double cannot hold the result. */
const factorial = (value: number): number => {
  if (!Number.isInteger(value) || value < 0 || value > 170) return Number.NaN
  let result = 1
  for (let factor = 2; factor <= value; factor += 1) result *= factor
  return result
}

const tokenize = (input: string): Token[] | null => {
  const tokens: Token[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    // Numbers may use decimal points, thousands separators and scientific notation.
    if (/[0-9.]/.test(char)) {
      const rest = input.slice(index)
      const match = /^[0-9][0-9,_]*(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?/.exec(rest)
      if (!match) return null
      const value = Number(match[0].replace(/[,_]/g, ''))
      if (!Number.isFinite(value)) return null
      tokens.push({ kind: 'number', value })
      index += match[0].length
      continue
    }

    // `π` is the one word that is not written with latin letters.
    if (char === 'π') {
      tokens.push({ kind: 'name', value: 'pi' })
      index += 1
      continue
    }

    if (/[a-z]/i.test(char)) {
      // Function names may contain digits (`log2`); constants may not.
      const match = /^[a-z][a-z0-9]*/i.exec(input.slice(index))
      const word = (match?.[0] ?? '').toLowerCase()
      // An unknown word means the text was prose, not arithmetic.
      if (!(word in FUNCTIONS) && !(word in CONSTANTS)) return null
      tokens.push({ kind: 'name', value: word })
      index += word.length
      continue
    }

    const operator = OPERATOR_CHARS[char.toLowerCase()]
    if (!operator) return null
    tokens.push({ kind: 'op', value: operator })
    index += 1
  }

  return tokens
}

class Parser {
  private position = 0

  constructor(
    private readonly tokens: Token[],
    private readonly angleMode: AngleMode
  ) {}

  parse(): number {
    const value = this.parseExpression()
    // Trailing junk means the input was not a pure expression.
    return this.position === this.tokens.length ? value : Number.NaN
  }

  private peek(): Token | undefined {
    return this.tokens[this.position]
  }

  private parseExpression(): number {
    let left = this.parseTerm()
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'op' || (token.value !== '+' && token.value !== '-')) return left
      this.position += 1
      const right = this.parseTerm()
      left = token.value === '+' ? left + right : left - right
    }
  }

  private parseTerm(): number {
    let left = this.parseUnary()
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'op' || !['*', '/', '%'].includes(token.value)) return left
      this.position += 1
      const right = this.parseUnary()
      if ((token.value === '/' || token.value === '%') && right === 0) return Number.NaN
      left = token.value === '*' ? left * right : token.value === '/' ? left / right : left % right
    }
  }

  private parseUnary(): number {
    const token = this.peek()
    if (token?.kind === 'op' && (token.value === '-' || token.value === '+')) {
      this.position += 1
      const value = this.parseUnary()
      return token.value === '-' ? -value : value
    }

    if (token?.kind === 'op' && token.value === 'sqrt') {
      this.position += 1
      const value = this.parseUnary()
      return value < 0 ? Number.NaN : Math.sqrt(value)
    }

    return this.parsePower()
  }

  private parsePower(): number {
    const base = this.parsePrimary()
    const token = this.peek()
    if (token?.kind === 'op' && token.value === '^') {
      this.position += 1
      // Right-associative: 2^3^2 === 2^9.
      return Math.pow(base, this.parseUnary())
    }
    return base
  }

  private parsePrimary(): number {
    let value = this.parseAtom()
    // Postfix factorial binds tighter than `^`, so `2^3!` reads as 2^6.
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'op' || token.value !== '!') return value
      this.position += 1
      value = factorial(value)
    }
  }

  private parseAtom(): number {
    const token = this.peek()
    if (!token) return Number.NaN

    if (token.kind === 'number') {
      this.position += 1
      return token.value
    }

    if (token.kind === 'name') {
      this.position += 1

      const constant = CONSTANTS[token.value]
      if (constant !== undefined) return constant

      const fn = FUNCTIONS[token.value]
      if (!fn) return Number.NaN
      // Functions always take a parenthesised argument: `sin(30)`.
      const opening = this.peek()
      if (opening?.kind !== 'op' || opening.value !== '(') return Number.NaN
      this.position += 1
      const argument = this.parseExpression()
      const closing = this.peek()
      if (closing?.kind !== 'op' || closing.value !== ')') return Number.NaN
      this.position += 1
      return fn(argument, this.angleMode)
    }

    if (token.value === '(') {
      this.position += 1
      const value = this.parseExpression()
      const closing = this.peek()
      if (closing?.kind !== 'op' || closing.value !== ')') return Number.NaN
      this.position += 1
      return value
    }

    return Number.NaN
  }
}

/** Formats a result so the HUD shows something readable rather than `40.50000000000001`. */
export const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return 'Error'
  const rounded = Math.round(value * 1e10) / 1e10
  if (Math.abs(rounded) >= 1e15 || (Math.abs(rounded) < 1e-6 && rounded !== 0)) {
    return rounded.toExponential(6)
  }
  return String(rounded)
}

/**
 * Evaluates free-form arithmetic, or returns `null` when the text is not an expression.
 * `14% of 350` and `25 * 4` both resolve here.
 */
export const evaluateExpression = (input: string, options?: { angleMode?: AngleMode }): number | null => {
  const text = input.trim().toLowerCase()
  if (!text) return null

  // "14% of 350" reads naturally but is not valid infix, so it is handled up front.
  const percentOf = /^([0-9][0-9,_]*(?:\.[0-9]+)?)\s*%\s*of\s*([0-9][0-9,_]*(?:\.[0-9]+)?)$/.exec(text)
  if (percentOf) {
    const percentage = Number(percentOf[1].replace(/[,_]/g, ''))
    const total = Number(percentOf[2].replace(/[,_]/g, ''))
    if (!Number.isFinite(percentage) || !Number.isFinite(total)) return null
    return (percentage / 100) * total
  }

  // A bare number, or a "what is" style lead-in wrapped around one.
  const stripped = text
    .replace(/^(?:what(?:'s| is)|calculate|compute|evaluate|solve|how much is)\s+/, '')
    .replace(/[?=]+$/, '')
    .trim()
  if (!stripped) return null

  const tokens = tokenize(stripped)
  if (!tokens || tokens.length === 0) return null

  const value = new Parser(tokens, options?.angleMode ?? 'rad').parse()
  return Number.isFinite(value) ? value : null
}

/** True when the text looks like arithmetic, used to short-circuit the intent engine. */
export const looksLikeMath = (input: string): boolean => {
  const text = input.trim()
  if (!text) return false
  if (/^[0-9][0-9,_]*(?:\.[0-9]+)?\s*%\s*of\s*[0-9]/.test(text.toLowerCase())) return true
  // Needs at least one operator and at least one digit, so "ice bear" is not maths.
  return /[0-9]/.test(text) && /[+\-*/%^×÷]/.test(text)
}
