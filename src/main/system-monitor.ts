import { execFile } from 'child_process'
import { promisify } from 'util'
import * as systeminformation from 'systeminformation'

type Telemetry = {
  type: 'system:stats-update'
  stats: {
    cpu: number
    ramUsed: number
    ramTotal: number
    cores: number[]
    gpuLoad: number | null
    gpuName: string
    networkRxKbps: number
    networkTxKbps: number
    diskUsedGb: number
    diskTotalGb: number
  }
}

type MediaState = {
  type: 'media:update'
  media: {
    title: string
    artist: string
    app: string
    playback: 'Playing' | 'Paused' | 'Stopped' | 'Unknown'
    positionSeconds: number
    durationSeconds: number
  } | null
}

let polling = false
let stopped = false
let mediaPolling = false
let latestMedia: MediaState['media'] = null
const executeFile = promisify(execFile)

/**
 * `systeminformation.graphics()` shells out to WMI on Windows and `fsSize()` walks every
 * mounted volume. Neither the GPU model nor the disk capacities change while the app runs,
 * so they are sampled on a slow cadence instead of on every 2 s poll.
 */
const SLOW_SAMPLE_INTERVAL_MS = 60_000

type SlowSample = {
  gpuName: string
  gpuLoad: number | null
  diskUsedGb: number
  diskTotalGb: number
}

const emptySlowSample: SlowSample = {
  gpuName: 'GPU data unavailable',
  gpuLoad: null,
  diskUsedGb: 0,
  diskTotalGb: 0
}

let slowCache: SlowSample | null = null
let lastSlowSampleAt = 0

const mediaScript = (action?: string) => `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetGenericArguments().Count -eq 1 -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
function Wait-Result($operation, $resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait()
  return $task.Result
}
$manager = Wait-Result $managerType::RequestAsync() $managerType
$session = $manager.GetCurrentSession()
if (-not $session) { '{"media":null}'; exit 0 }
${action ? `$playback = $session.GetPlaybackInfo().PlaybackStatus.ToString(); switch ('${action}') { 'playPause' { if ($playback -eq 'Playing') { $session.TryPauseAsync() | Out-Null } else { $session.TryPlayAsync() | Out-Null } }; 'next' { $session.TrySkipNextAsync() | Out-Null }; 'previous' { $session.TrySkipPreviousAsync() | Out-Null } }; Start-Sleep -Milliseconds 150` : ''}
$properties = Wait-Result $session.TryGetMediaPropertiesAsync() $propertiesType
$timeline = $session.GetTimelineProperties()
$status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
$media = @{
  title = $properties.Title
  artist = $properties.Artist
  app = $session.SourceAppUserModelId
  playback = $status
  positionSeconds = [Math]::Max(0, $timeline.Position.TotalSeconds)
  durationSeconds = [Math]::Max(0, ($timeline.EndTime - $timeline.StartTime).TotalSeconds)
}
@{ media = $media } | ConvertTo-Json -Compress -Depth 4
`

const getWindowsMedia = async (action?: string): Promise<MediaState['media']> => {
  if (process.platform !== 'win32') return null
  const encodedScript = Buffer.from(mediaScript(action), 'utf16le').toString('base64')
  const { stdout } = await executeFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedScript], {
    windowsHide: true,
    timeout: 5000,
    maxBuffer: 1024 * 1024
  })
  const parsed = JSON.parse(stdout.trim()) as { media: MediaState['media'] }
  return parsed.media
}

const pollMedia = async () => {
  if (mediaPolling || stopped) return
  mediaPolling = true
  try {
    const media = await getWindowsMedia()
    if (JSON.stringify(media) !== JSON.stringify(latestMedia)) {
      latestMedia = media
      const message: MediaState = { type: 'media:update', media }
      process.parentPort.postMessage(message)
    }
  } catch {
    // Media session access is optional and can fail while apps are switching tracks.
  } finally {
    mediaPolling = false
  }
}

const refreshSlowSample = async () => {
  const [disks, graphics] = await Promise.all([
    systeminformation.fsSize().catch(() => []),
    systeminformation.graphics().catch(() => ({ controllers: [], displays: [] }))
  ])

  const controllers = graphics.controllers
  const gpuLoads = controllers
    .map((controller) => controller.utilizationGpu)
    .filter((load): load is number => typeof load === 'number' && Number.isFinite(load))

  slowCache = {
    gpuName: controllers.map((controller) => controller.model).filter(Boolean).join(', ') || 'GPU data unavailable',
    gpuLoad: gpuLoads.length ? gpuLoads.reduce((sum, value) => sum + value, 0) / gpuLoads.length : null,
    diskUsedGb: disks.reduce((total, disk) => total + disk.used, 0) / 1024 ** 3,
    diskTotalGb: disks.reduce((total, disk) => total + disk.size, 0) / 1024 ** 3
  }
  lastSlowSampleAt = Date.now()
  return slowCache
}

const poll = async () => {
  if (polling || stopped) return
  polling = true

  try {
    const slowIsStale = !slowCache || Date.now() - lastSlowSampleAt >= SLOW_SAMPLE_INTERVAL_MS
    // The slow sample is refreshed alongside the fast one; `Promise.all` keeps the
    // fast-path latency unchanged while the first run populates the cache.
    const [load, memory, network, slow] = await Promise.all([
      systeminformation.currentLoad(),
      systeminformation.mem(),
      systeminformation.networkStats().catch(() => []),
      slowIsStale ? refreshSlowSample() : Promise.resolve(slowCache ?? emptySlowSample)
    ])

    const networkRx = network.reduce((total, adapter) => total + (adapter.rx_sec ?? 0), 0)
    const networkTx = network.reduce((total, adapter) => total + (adapter.tx_sec ?? 0), 0)
    const sample: SlowSample = slow ?? emptySlowSample

    const message: Telemetry = {
      type: 'system:stats-update',
      stats: {
        cpu: load.currentLoad,
        ramUsed: memory.used / 1024 ** 3,
        ramTotal: memory.total / 1024 ** 3,
        cores: load.cpus.map((core) => core.load),
        gpuLoad: sample.gpuLoad,
        gpuName: sample.gpuName,
        networkRxKbps: networkRx / 1000,
        networkTxKbps: networkTx / 1000,
        diskUsedGb: sample.diskUsedGb,
        diskTotalGb: sample.diskTotalGb
      }
    }

    process.parentPort.postMessage(message)
  } catch (error) {
    process.parentPort.postMessage({
      type: 'system:monitor-error',
      message: error instanceof Error ? error.message : 'System telemetry failed'
    })
  } finally {
    polling = false
  }
}

const pollTimer = setInterval(() => void poll(), 2000)
const mediaTimer = setInterval(() => void pollMedia(), 4000)
void poll()
void pollMedia()

process.parentPort.on('message', (event) => {
  if (event.data?.type === 'media:control' && ['playPause', 'next', 'previous'].includes(event.data.action)) {
    void getWindowsMedia(event.data.action as string).then((media) => {
      latestMedia = media
      process.parentPort.postMessage({ type: 'media:update', media } satisfies MediaState)
    }).catch(() => undefined)
  }

  if (event.data?.type === 'system:monitor-stop') {
    stopped = true
    clearInterval(pollTimer)
    clearInterval(mediaTimer)
  }
})