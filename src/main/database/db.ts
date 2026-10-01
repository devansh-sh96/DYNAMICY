import { app, ipcMain } from 'electron'
import { createRequire } from 'module'
import { join } from 'path'

export type SqliteDatabase = import('better-sqlite3').Database
const require = createRequire(__filename)

export type TaskRecord = {
  id: number
  title: string
  completed: boolean
  createdAt: number
  updatedAt: number
}

export type FocusSessionRecord = {
  id: number
  startedAt: number
  endedAt: number | null
  durationSeconds: number
  completed: boolean
  notes: string
}

export type CalendarEventRecord = {
  id: string
  title: string
  startsAt: number
  endsAt: number | null
  notes: string
  source: 'local'
}

let database: SqliteDatabase | undefined
let dbLoadAttempted = false

const dbAvailable = (): boolean => {
  if (database) return true
  if (dbLoadAttempted) return false
  dbLoadAttempted = true
  try {
    const Database = require('better-sqlite3') as typeof import('better-sqlite3')
    database = new Database(join(app.getPath('userData'), 'icy-bear.sqlite'))
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')
    database.exec(`
    CREATE TABLE IF NOT EXISTS focus_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS daily_analytics (
      day TEXT PRIMARY KEY,
      focus_seconds INTEGER NOT NULL DEFAULT 0,
      completed_sessions INTEGER NOT NULL DEFAULT 0,
      screen_time_minutes INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
    return true
  } catch (error) {
    try {
      console.warn('[db] better-sqlite3 unavailable:', (error as Error)?.message ?? error)
    } catch { /* ignore */ }
    return false
  }
}

export const getDatabase = (): SqliteDatabase => {
  if (database) return database
  dbAvailable()
  if (database) return database
  const stmt = { all: () => [], get: () => undefined, run: () => ({ changes: 0, lastInsertRowid: 0 }) }
  return { prepare: () => stmt, pragma: () => undefined, exec: () => undefined } as unknown as SqliteDatabase
}

const safeDb = (): SqliteDatabase => getDatabase()
const requireDb = (): SqliteDatabase => safeDb()

const requireId = (value: unknown) => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('A valid record ID is required')
  return id
}

const mapTask = (row: Record<string, unknown>): TaskRecord => ({
  id: Number(row.id),
  title: String(row.title),
  completed: Boolean(row.completed),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at)
})

const mapCalendarEvent = (row: Record<string, unknown>): CalendarEventRecord => ({
  id: `local:${Number(row.id)}`,
  title: String(row.title),
  startsAt: Number(row.starts_at),
  endsAt: row.ends_at === null || row.ends_at === undefined ? null : Number(row.ends_at),
  notes: String(row.notes ?? ''),
  source: 'local'
})

const mapFocusSession = (row: Record<string, unknown>): FocusSessionRecord => ({
  id: Number(row.id),
  startedAt: Number(row.started_at),
  endedAt: row.ended_at === null ? null : Number(row.ended_at),
  durationSeconds: Number(row.duration_seconds),
  completed: Boolean(row.completed),
  notes: String(row.notes)
})

export const registerDatabaseHandlers = () => {
  ipcMain.handle('tasks:list', () => {
    const db = requireDb()
    const rows = db.prepare('SELECT * FROM tasks ORDER BY completed ASC, created_at DESC').all() as Record<string, unknown>[]
    return rows.map(mapTask)
  })

  ipcMain.handle('tasks:create', (_event, title: unknown) => {
    const db = requireDb()
    if (typeof title !== 'string' || !title.trim() || title.length > 500) {
      throw new Error('Task title must be between 1 and 500 characters')
    }

    const now = Date.now()
    const result = db.prepare('INSERT INTO tasks (title, created_at, updated_at) VALUES (?, ?, ?)').run(title.trim(), now, now)
    return mapTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>)
  })

  ipcMain.handle('tasks:update', (_event, input: { id: unknown; title?: unknown; completed?: unknown }) => {
    const db = requireDb()
    const id = requireId(input?.id)
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!task) return null

    const title = input.title === undefined ? String(task.title) : input.title
    const completed = input.completed === undefined ? Boolean(task.completed) : input.completed
    if (typeof title !== 'string' || !title.trim() || title.length > 500 || typeof completed !== 'boolean') {
      throw new Error('Invalid task update')
    }

    db.prepare('UPDATE tasks SET title = ?, completed = ?, updated_at = ? WHERE id = ?')
      .run(title.trim(), Number(completed), Date.now(), id)
    return mapTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown>)
  })

  ipcMain.handle('tasks:delete', (_event, value: unknown) => {
    const db = requireDb()
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(requireId(value))
    return result.changes > 0
  })

  ipcMain.handle('focus-sessions:list', () => {
    const db = requireDb()
    const rows = db.prepare('SELECT * FROM focus_sessions ORDER BY started_at DESC LIMIT 100').all() as Record<string, unknown>[]
    return rows.map(mapFocusSession)
  })

  ipcMain.handle('focus-sessions:create', (_event, input: { startedAt?: unknown; durationSeconds?: unknown; notes?: unknown }) => {
    const db = requireDb()
    const startedAt = input?.startedAt === undefined ? Date.now() : Number(input.startedAt)
    const durationSeconds = input?.durationSeconds === undefined ? 0 : Number(input.durationSeconds)
    const notes = input?.notes === undefined ? '' : input.notes
    if (!Number.isFinite(startedAt) || !Number.isFinite(durationSeconds) || durationSeconds < 0 || typeof notes !== 'string') {
      throw new Error('Invalid focus session')
    }

    const result = db.prepare('INSERT INTO focus_sessions (started_at, duration_seconds, notes) VALUES (?, ?, ?)')
      .run(startedAt, durationSeconds, notes.slice(0, 2000))
    return mapFocusSession(db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>)
  })

  ipcMain.handle('focus-sessions:update', (_event, input: { id: unknown; endedAt?: unknown; durationSeconds?: unknown; completed?: unknown; notes?: unknown }) => {
    const db = requireDb()
    const id = requireId(input?.id)
    const existing = db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!existing) return null

    const endedAt = input.endedAt === undefined ? existing.ended_at : input.endedAt
    const durationSeconds = input.durationSeconds === undefined ? Number(existing.duration_seconds) : Number(input.durationSeconds)
    const completed = input.completed === undefined ? Boolean(existing.completed) : input.completed
    const notes = input.notes === undefined ? String(existing.notes) : input.notes
    if ((endedAt !== null && !Number.isFinite(Number(endedAt))) || !Number.isFinite(durationSeconds) || durationSeconds < 0 || typeof completed !== 'boolean' || typeof notes !== 'string') {
      throw new Error('Invalid focus session update')
    }

    db.prepare('UPDATE focus_sessions SET ended_at = ?, duration_seconds = ?, completed = ?, notes = ? WHERE id = ?')
      .run(endedAt, durationSeconds, Number(completed), notes.slice(0, 2000), id)
    return mapFocusSession(db.prepare('SELECT * FROM focus_sessions WHERE id = ?').get(id) as Record<string, unknown>)
  })

  ipcMain.handle('focus-sessions:delete', (_event, value: unknown) => {
    const db = requireDb()
    const result = db.prepare('DELETE FROM focus_sessions WHERE id = ?').run(requireId(value))
    return result.changes > 0
  })

  ipcMain.handle('calendar:list', () => {
    const db = requireDb()
    const rows = db.prepare('SELECT * FROM calendar_events ORDER BY starts_at ASC').all() as Record<string, unknown>[]
    return rows.map(mapCalendarEvent)
  })

  ipcMain.handle('calendar:create', (_event, input: { title?: unknown; startsAt?: unknown; endsAt?: unknown; notes?: unknown }) => {
    const db = requireDb()
    const title = typeof input?.title === 'string' ? input.title.trim() : ''
    const startsAt = Number(input?.startsAt)
    const endsAt = input?.endsAt === undefined || input?.endsAt === null ? null : Number(input.endsAt)
    const notes = typeof input?.notes === 'string' ? input.notes : ''
    if (!title || title.length > 200 || !Number.isFinite(startsAt)) throw new Error('A title and start time are required')
    if (endsAt !== null && !Number.isFinite(endsAt)) throw new Error('Invalid end time')
    const now = Date.now()
    const result = db.prepare('INSERT INTO calendar_events (title, starts_at, ends_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(title, startsAt, endsAt, notes.slice(0, 2000), now, now)
    return mapCalendarEvent(db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(result.lastInsertRowid) as Record<string, unknown>)
  })

  ipcMain.handle('calendar:delete', (_event, value: unknown) => {
    const raw = String(value ?? '')
    const id = requireId(raw.startsWith('local:') ? raw.slice(6) : raw)
    const db = requireDb()
    return db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id).changes > 0
  })
}

export const closeDatabase = () => {
  database?.close()
  database = undefined
}