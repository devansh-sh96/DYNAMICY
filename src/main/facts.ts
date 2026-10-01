import { ipcMain } from 'electron'

/**
 * Free, key-less fact lookup.
 *
 * DuckDuckGo's Instant Answer API is tried first because it returns a single tidy
 * abstract; Wikipedia's REST summary endpoint is the fallback for anything it does not
 * cover. Both are public and need no API key, which keeps the app free to run.
 *
 * This lives in the main process because the renderer's Content-Security-Policy only
 * allows `connect-src 'self'`, and because the responses should be cached there rather
 * than re-fetched on every keystroke of a question.
 */
const DUCKDUCKGO = 'https://api.duckduckgo.com/'
const WIKIPEDIA = 'https://en.wikipedia.org/api/rest_v1/page/summary/'

const TIMEOUT_MS = 6000
const CACHE_MS = 30 * 60 * 1000
const MAX_CACHE = 60

const cache = new Map<string, { answer: string; at: number }>()

/** Wikipedia titles are case-sensitive and reject most punctuation. */
const toWikiTitle = (query: string): string =>
  query
    .replace(/[?!.,;:'"`]/g, '')
    .replace(/\b(who|what|where|when|why|how|is|are|the|a|an|of|does|do|did|was|were|about)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const fetchJson = async (url: string): Promise<Record<string, unknown> | null> => {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'IcyBear/1.0 (desktop companion)' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!response.ok) return null
    return await response.json() as Record<string, unknown>
  } catch {
    return null
  }
}

const firstString = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : ''

const extractDuckDuckGo = (data: Record<string, unknown> | null): string => {
  if (!data) return ''
  const abstract = firstString(data.AbstractText)
  if (abstract) return abstract

  const heading = firstString(data.Heading)
  const answer = firstString(data.Answer)
  if (answer) return answer
  if (heading) {
    const url = firstString(data.AbstractURL)
    return url ? `${heading} — ${url}` : heading
  }
  return ''
}

const extractWikipedia = (data: Record<string, unknown> | null): string => {
  if (!data) return ''
  const extract = firstString(data.extract)
  if (!extract) return ''
  const title = firstString(data.title)
  // Lead sentences carry the answer; the full extract is too long for a compact HUD.
  const sentence = extract.split(/(?<=[.!?])\s/)[0] ?? extract
  const trimmed = sentence.length > 320 ? `${sentence.slice(0, 320).trimEnd()}…` : sentence
  return title ? `${title}: ${trimmed}` : trimmed
}

const lookupFact = async (query: string): Promise<string | null> => {
  const text = query.trim()
  if (!text) return null

  const hit = cache.get(text.toLowerCase())
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.answer

  const ddgUrl = `${DUCKDUCKGO}?q=${encodeURIComponent(text)}&format=json&no_html=1&skip_disambig=1`
  const duck = extractDuckDuckGo(await fetchJson(ddgUrl))

  let answer = duck
  if (!answer) {
    const title = toWikiTitle(text)
    if (title) {
      answer = extractWikipedia(await fetchJson(`${WIKIPEDIA}${encodeURIComponent(title)}`))
    }
  }

  if (!answer) return null

  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(text.toLowerCase(), { answer, at: Date.now() })
  return answer
}

export const registerFactsHandlers = () => {
  ipcMain.handle('facts:lookup', (_event, value: unknown) => {
    if (typeof value !== 'string' || value.length > 200) return null
    return lookupFact(value)
  })
}
