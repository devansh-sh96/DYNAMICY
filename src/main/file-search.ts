import { app, ipcMain, shell } from 'electron'
import { fdir } from 'fdir'
import uFuzzy from '@leeoniya/ufuzzy'
import { basename, isAbsolute, resolve, sep } from 'path'
import type { FileSearchResult } from '../shared/ipc'

export type { FileSearchResult } from '../shared/ipc'

const fuzzy = new uFuzzy()
const excludedDirectories = new Set(['node_modules', 'appdata', '.git'])
let indexedPaths: string[] = []
let indexPromise: Promise<void> | undefined

const createIndex = async () => {
  const roots = ['desktop', 'documents', 'downloads']
    .map((name) => app.getPath(name as 'desktop' | 'documents' | 'downloads'))
    .filter((path, index, all) => all.indexOf(path) === index)

  const groups = await Promise.all(roots.map(async (root) => {
    try {
      return await new fdir()
        .withFullPaths()
        .withMaxDepth(5)
        .exclude((directory) => excludedDirectories.has(directory.toLowerCase()))
        .crawl(root)
        .withPromise()
    } catch {
      return []
    }
  }))

  indexedPaths = groups.flat().filter((path) => !path.split(sep).some((part) => excludedDirectories.has(part.toLowerCase())))
}

const ensureIndex = () => {
  if (!indexPromise) {
    indexPromise = createIndex().catch((error) => {
      indexPromise = undefined
      throw error
    })
  }
  return indexPromise
}

export const searchIndexedFiles = async (query: string): Promise<FileSearchResult[]> => {
  await ensureIndex()
  const needle = query.trim()
  if (!needle) return []

  const [indices, info, order] = fuzzy.search(indexedPaths, needle, 2, 1000)
  if (!indices) return []

  const resultIndices = info && order
    ? order.map((orderedIndex) => info.idx[orderedIndex])
    : indices

  return resultIndices.slice(0, 80).map((index) => ({
    path: indexedPaths[index],
    name: basename(indexedPaths[index])
  }))
}

export const openIndexedFile = async (filePath: string) => {
  await ensureIndex()
  const target = resolve(filePath)
  const isIndexed = indexedPaths.some((indexedPath) => resolve(indexedPath) === target)
  if (!isAbsolute(filePath) || !isIndexed) throw new Error('File is not in the search index')

  const error = await shell.openPath(target)
  if (error) throw new Error(error)
  return true
}

export const registerFileSearchHandlers = () => {
  ipcMain.handle('files:search', (_event, value: unknown) => {
    if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid search query')
    return searchIndexedFiles(value)
  })
  ipcMain.handle('files:open', (_event, value: unknown) => {
    if (typeof value !== 'string') throw new Error('Invalid file path')
    return openIndexedFile(value)
  })
}