import { useEffect, useState } from 'react'
import { Focus, RefreshCw, Square } from 'lucide-react'
import type { ProcessEntry } from '../../../../shared/ipc'

const ProcessesTab = () => {
  const [processes, setProcesses] = useState<ProcessEntry[]>([])
  const [error, setError] = useState('')
  const [workingPid, setWorkingPid] = useState<number | null>(null)

  const refresh = async () => {
    try {
      setProcesses(await window.electronAPI.listProcesses())
      setError('')
    } catch {
      setError('Process information is only available on Windows.')
    }
  }

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [])

  const focus = async (process: ProcessEntry) => {
    setWorkingPid(process.pid)
    try {
      await window.electronAPI.focusProcess(process.pid)
      setError('')
    } catch {
      setError(`Could not focus ${process.name}. It may not have a visible window.`)
    } finally {
      setWorkingPid(null)
    }
  }

  const terminate = async (process: ProcessEntry) => {
    const confirmed = window.confirm(`Terminate ${process.name} and its child processes? Unsaved work may be lost.`)
    if (!confirmed) return

    setWorkingPid(process.pid)
    try {
      await window.electronAPI.killProcess(process.pid)
      await refresh()
    } catch {
      setError(`Could not terminate ${process.name}.`)
    } finally {
      setWorkingPid(null)
    }
  }

  return (
    <section className="processes-dashboard" aria-label="Active processes">
      <div className="processes-toolbar">
        <div><strong>{processes.length}</strong><span> active processes</span></div>
        <button type="button" aria-label="Refresh processes" onClick={() => void refresh()}><RefreshCw size={14} /></button>
      </div>
      {error && <p className="processes-error" role="status">{error}</p>}
      <div className="processes-table-wrap">
        <table className="processes-table">
          <thead><tr><th>Process</th><th>PID</th><th>CPU</th><th>Memory</th><th>Actions</th></tr></thead>
          <tbody>
            {processes.slice(0, 100).map((process) => (
              <tr key={process.pid}>
                <td title={process.path || process.name}>{process.name}</td>
                <td>{process.pid}</td>
                <td>{process.cpu.toFixed(1)}%</td>
                <td>{process.memoryMb.toFixed(0)} MB</td>
                <td>
                  <div className="process-actions">
                    <button type="button" aria-label={`Focus ${process.name}`} title="Focus window" disabled={workingPid === process.pid} onClick={() => void focus(process)}><Focus size={13} /></button>
                    <button type="button" aria-label={`Terminate ${process.name}`} title="Terminate process tree" disabled={workingPid === process.pid} onClick={() => void terminate(process)}><Square size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!processes.length && !error && <p className="processes-empty">Scanning active processes...</p>}
      </div>
    </section>
  )
}

export default ProcessesTab