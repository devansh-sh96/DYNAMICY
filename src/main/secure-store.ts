import { createRequire } from 'module'

type StoreValue = {
  clipboardHistory: ClipboardSnippet[]
}

export type ClipboardSnippet = {
  id: string
  text: string
  copiedAt: number
}

const require = createRequire(__filename)
const Store = require('electron-store') as typeof import('electron-store')

const store = new Store<StoreValue>({
  name: 'icy-bear-secure',
  encryptionKey: 'icy-bear-local-vault',
  defaults: { clipboardHistory: [] }
})

export const getSecureStore = () => store
