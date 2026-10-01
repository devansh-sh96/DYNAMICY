import { useAppStore } from '../../stores/appStore'

export const SystemGauges = () => {
  const { cpu, ramUsed, ramTotal } = useAppStore((state) => state.systemStats)

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap font-mono text-[10px] tabular-nums text-white/85" aria-label={`System usage: ${Math.round(cpu)} percent CPU, ${ramUsed.toFixed(1)} gigabytes RAM used`}>
      <span><b className="font-medium text-white">{Math.round(cpu)}%</b> CPU</span>
      <span className="text-white/35" aria-hidden="true">·</span>
      <span><b className="font-medium text-white">{ramUsed.toFixed(1)} GB</b></span>
    </div>
  )
}