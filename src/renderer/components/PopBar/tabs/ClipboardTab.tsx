import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import type { ClipboardSnippet } from '../../../electron-env'

const ClipboardTab = () => {
  const [items, setItems] = useState<ClipboardSnippet[]>([])
  const [preview, setPreview] = useState<ClipboardSnippet | null>(null)

  useEffect(() => {
    void window.electronAPI?.listClipboard().then(setItems).catch(() => setItems([]))
    return window.electronAPI?.onClipboardUpdate(setItems)
  }, [])

  const pasteBack = (item: ClipboardSnippet) => {
    void window.electronAPI?.writeClipboard(item.text)
    setPreview(item)
  }

  return (
    <section className="clipboard-shelf" aria-label="Clipboard shelf">
      <div className="clipboard-list">
        {items.map((item) => (
          <button type="button" key={item.id} className={`clipboard-snippet ${preview?.id === item.id ? 'is-active' : ''}`} onClick={() => pasteBack(item)}>
            <Copy size={13} />
            <span>{item.text}</span>
            <small>{new Date(item.copiedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small>
          </button>
        ))}
        {!items.length && <p className="clipboard-empty">Copied text will land here, last 10 snippets.</p>}
      </div>
      <aside className="clipboard-preview">
        <h2>Preview</h2>
        <p>{preview?.text ?? 'Select a snippet to preview or copy it back instantly.'}</p>
      </aside>
    </section>
  )
}

export default ClipboardTab
