import { ICY_PERSONA } from './icy-persona'
import { ICY_TOOL_DECLARATIONS, type IcyToolName } from './icy-tools'
import type { IcyTurn } from '../../shared/ipc'

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_TOOL_ROUNDS = 4
const MAX_OUTPUT_TOKENS = 256
const MAX_HISTORY_TURNS = 12

type ActiveRequest = { aborted: boolean; awaiting: Map<string, (result: string) => void> }
type ChatMessage = { role: 'user' | 'assistant' | 'tool'; content: string; toolCall?: { id: string; name: string; args: Record<string, unknown>; thoughtSignature?: string } }
type GeminiPart = { text?: string; thoughtSignature?: string; functionCall?: { name?: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: { output: string } } }
type GeminiResponse = { candidates?: { content?: { parts?: GeminiPart[] } }[]; error?: { message?: string } }

const active = new Map<number, ActiveRequest>()
const post = (message: unknown) => process.parentPort.postMessage(message)

const parseError = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => '')
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    return parsed.error?.message || `Gemini request failed (${response.status})`
  } catch {
    return body || `Gemini request failed (${response.status})`
  }
}

const toContents = (messages: ChatMessage[]) => messages.map((message) => ({
  role: message.role === 'assistant' ? 'model' : 'user',
  parts: message.toolCall
    ? [{ functionCall: { name: message.toolCall.name, args: message.toolCall.args }, ...(message.toolCall.thoughtSignature ? { thoughtSignature: message.toolCall.thoughtSignature } : {}) }]
    : message.role === 'tool'
      ? [{ functionResponse: { name: message.content.split(':', 1)[0], response: { output: message.content.slice(message.content.indexOf(':') + 1).trim() } } }]
      : [{ text: message.content }]
}))

const toHistory = (turns: IcyTurn[]): ChatMessage[] => turns.filter((turn): turn is IcyTurn & { role: 'user' | 'assistant' } => turn.role !== 'system').slice(-MAX_HISTORY_TURNS).map((turn) => ({
  role: turn.role,
  content: turn.content.trim()
})).filter((turn) => Boolean(turn.content))

const waitForTool = (request: ActiveRequest, callId: string): Promise<string> => new Promise((resolve) => {
  request.awaiting.set(callId, resolve)
})

const runTool = async (request: ActiveRequest, requestId: number, call: { id: string; name: string; args: Record<string, unknown> }) => {
  post({ type: 'icy:tool-call', requestId, callId: call.id, name: call.name as IcyToolName, args: call.args })
  const result = await waitForTool(request, call.id)
  return { role: 'tool' as const, content: `${call.name}: ${result}` }
}

const requestCompletion = async (requestId: number, request: ActiveRequest, apiKey: string, messages: ChatMessage[], context: string) => {
  const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: context ? `${ICY_PERSONA}\n\n${context}` : ICY_PERSONA }] },
      contents: toContents(messages),
      tools: [{ functionDeclarations: ICY_TOOL_DECLARATIONS }],
      generationConfig: { temperature: 0.5, maxOutputTokens: MAX_OUTPUT_TOKENS }
    })
  })
  if (!response.ok) throw new Error(await parseError(response))
  const data = await response.json() as GeminiResponse
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const text = parts.map((part) => part.text ?? '').join('')
  if (text) post({ type: 'icy:delta', requestId, chunk: text })
  const toolCalls = parts.flatMap((part, index) => part.functionCall?.name ? [{
    id: `${requestId}-${index}-${part.functionCall.name}`,
    name: part.functionCall.name,
    args: part.functionCall.args ?? {},
    ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {})
  }] : [])
  return { text, toolCalls }
}

const ollamaFallback = async (requestId: number, request: ActiveRequest, messages: ChatMessage[]) => {
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3.2', prompt: messages.map((message) => `${message.role}: ${message.content}`).join('\n'), stream: true })
  })
  if (!response.ok || !response.body) throw new Error('Gemini is unavailable and Ollama is not running.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  const consume = (line: string) => {
    if (!line.trim()) return
    const value = (JSON.parse(line) as { response?: string }).response ?? ''
    text += value
    if (value) post({ type: 'icy:delta', requestId, chunk: value })
  }
  while (!request.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    lines.forEach(consume)
  }
  if (buffer) consume(buffer)
  return text
}

const runRequest = async (requestId: number, apiKey: string, turns: IcyTurn[]) => {
  const request: ActiveRequest = { aborted: false, awaiting: new Map() }
  active.set(requestId, request)
  try {
    const messages: ChatMessage[] = toHistory(turns)
    const context = turns.find((turn) => turn.role === 'system')?.content ?? ''
    let finalText = ''
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      let result: Awaited<ReturnType<typeof requestCompletion>>
      try {
        result = await requestCompletion(requestId, request, apiKey, messages, context)
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!(error instanceof TypeError || /fetch failed|econnrefused|enotfound|network/i.test(message))) throw error
        const fallbackText = await ollamaFallback(requestId, request, messages)
        post({ type: 'icy:done', requestId, text: fallbackText })
        return
      }
      if (request.aborted) return post({ type: 'icy:aborted', requestId })
      if (result.text.trim()) finalText = result.text
      if (!result.toolCalls.length) return post({ type: 'icy:done', requestId, text: finalText })
      messages.push(...result.toolCalls.map((call) => ({ role: 'assistant' as const, content: '', toolCall: call })))
      messages.push(...await Promise.all(result.toolCalls.map((call) => runTool(request, requestId, call))))
    }
    post({ type: 'icy:done', requestId, text: finalText })
  } catch (error) {
    post({ type: 'icy:error', requestId, message: error instanceof Error ? error.message : 'The request to Gemini failed.' })
  } finally {
    active.delete(requestId)
  }
}

const runKeyTest = async (apiKey: string) => {
  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }], generationConfig: { maxOutputTokens: 8 } })
    })
    if (!response.ok) throw new Error(await parseError(response))
    post({ type: 'icy:test-result', ok: true })
  } catch (error) {
    post({ type: 'icy:test-result', ok: false, message: error instanceof Error ? error.message : 'Gemini rejected the key.' })
  }
}

process.parentPort.on('message', (event) => {
  const data = event.data as { type?: string; requestId?: number; apiKey?: string; turns?: IcyTurn[]; callId?: string; ok?: boolean; result?: string }
  if (data?.type === 'icy:test' && typeof data.apiKey === 'string') return void runKeyTest(data.apiKey)
  if (data?.type === 'icy:prompt' && typeof data.requestId === 'number' && typeof data.apiKey === 'string') return void runRequest(data.requestId, data.apiKey, Array.isArray(data.turns) ? data.turns : [])
  if (data?.type === 'icy:tool-result' && typeof data.requestId === 'number' && typeof data.callId === 'string') {
    const request = active.get(data.requestId)
    const settle = request?.awaiting.get(data.callId)
    if (request && settle) { request.awaiting.delete(data.callId); settle(typeof data.result === 'string' ? data.result : '') }
    return
  }
  if (data?.type === 'icy:abort' && typeof data.requestId === 'number') {
    const request = active.get(data.requestId)
    if (!request) return
    request.aborted = true
    for (const settle of request.awaiting.values()) settle('Cancelled.')
    request.awaiting.clear()
  }
})
