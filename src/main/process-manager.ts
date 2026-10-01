import { execFile } from 'child_process'
import { ipcMain } from 'electron'
import { promisify } from 'util'
import treeKill from 'tree-kill'
import * as systeminformation from 'systeminformation'
import type { ProcessEntry } from '../shared/ipc'

export type { ProcessEntry } from '../shared/ipc'

const executeFile = promisify(execFile)

const killProcessTree = (pid: number, signal: string) =>
  new Promise<void>((resolve, reject) => {
    treeKill(pid, signal, (error) => (error ? reject(error) : resolve()))
  })

/**
 * Per-process CPU comes straight from `systeminformation`, which shells out to WMI.
 * The project previously also pulled in `@vscode/windows-process-tree` as a faster
 * native sampler, but its `binding.gyp` requires Spectre-mitigated MSVC libraries that
 * are not part of a default C++ toolchain install — which made `npm run rebuild` fail
 * outright. `systeminformation` covers the same data, so the native sampler was dropped
 * rather than leaving the project unable to build.
 */
export const listActiveProcesses = async (): Promise<ProcessEntry[]> => {
  const { list } = await systeminformation.processes()

  return list
    .filter((item) => item.pid > 0)
    .map((item) => ({
      pid: item.pid,
      name: item.name,
      cpu: item.cpu ?? 0,
      memoryMb: item.memRss / 1024,
      path: item.path || item.command || ''
    }))
    .sort((left, right) => right.cpu - left.cpu)
}

export const focusProcess = async (pid: number) => {
  if (process.platform !== 'win32') throw new Error('App focus is only available on Windows')
  if (!Number.isSafeInteger(pid) || pid < 100) throw new Error('Invalid process ID')

  const script = `$shell = New-Object -ComObject WScript.Shell; exit ([int](-not $shell.AppActivate(${pid})))`
  await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
  return true
}

export const terminateProcess = async (pid: number) => {
  if (process.platform !== 'win32') throw new Error('Process termination is only available on Windows')
  if (!Number.isSafeInteger(pid) || pid < 100 || pid === process.pid) throw new Error('Invalid or protected process ID')

  await killProcessTree(pid, 'SIGTERM')
  return true
}

export const registerProcessHandlers = () => {
  ipcMain.handle('process:list', () => listActiveProcesses())
  ipcMain.handle('process:focus', (_event, value: unknown) => focusProcess(Number(value)))
  ipcMain.handle('process:kill', (_event, value: unknown) => terminateProcess(Number(value)))
}