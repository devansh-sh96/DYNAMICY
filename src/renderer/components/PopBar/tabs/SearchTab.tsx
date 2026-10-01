import { useEffect, useState } from 'react'
import { File, FolderOpen, Search } from 'lucide-react'
import type { FileSearchResult } from '../../../../shared/ipc'

const SearchTab = () => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const needle = query.trim()
    if (!needle) {
      setResults([])
      setSearching(false)
      setError('')
      return
    }

    let cancelled = false
    setSearching(true)
    if (!window.electronAPI) {
      setError('File search is available in the desktop app.')
      setSearching(false)
      return () => { cancelled = true }
    }

    const timer = window.setTimeout(() => {
      void window.electronAPI.searchFiles(needle)
        .then((files) => {
          if (!cancelled) {
            setResults(files)
            setError('')
          }
        })
        .catch(() => {
          if (!cancelled) setError('Search could not read the selected folders.')
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  const openFile = async (file: FileSearchResult) => {
    try {
      await window.electronAPI.openFile(file.path)
    } catch {
      setError(`Could not open ${file.name}.`)
    }
  }

  return (
    <section className="file-search-tab" aria-label="Instant file search">
      <label className="file-search-input">
        <Search size={16} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Desktop, Documents, Downloads..." autoComplete="off" />
        {searching && <span className="searching-indicator" />}
      </label>
      <div className="file-search-results" aria-live="polite">
        {error && <p className="file-search-empty">{error}</p>}
        {!error && !query.trim() && <p className="file-search-empty">Type to search your desktop folders.</p>}
        {!error && query.trim() && !searching && !results.length && <p className="file-search-empty">No matching files.</p>}
        {results.map((result) => (
          <button className="file-search-result" type="button" key={result.path} onClick={() => void openFile(result)}>
            <span className="file-search-icon"><File size={15} /></span>
            <span className="file-search-label"><strong>{result.name}</strong><small>{result.path}</small></span>
            <FolderOpen className="file-search-open" size={15} />
          </button>
        ))}
      </div>
    </section>
  )
}

export default SearchTab