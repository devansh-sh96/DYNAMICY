import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { useAppStore } from '../../../stores/appStore'

type CoreSample = Record<string, number | string>

const screenTimeSample = [
  { name: 'Work', value: 46 },
  { name: 'Creative', value: 24 },
  { name: 'Communication', value: 18 },
  { name: 'Other', value: 12 }
]
const chartColors = ['#f1f3f1', '#c0c6c2', '#8a928d', '#555d58']

const formatRate = (rate: number) => rate >= 1000 ? `${(rate / 1000).toFixed(1)} MB/s` : `${rate.toFixed(0)} KB/s`

const CapacityBar = ({
  label,
  value,
  valueLabel,
  detail
}: {
  label: string
  value: number
  valueLabel: string
  detail: string
}) => (
  <div className="capacity-item">
    <div className="capacity-label-row"><span>{label}</span><strong>{valueLabel}</strong></div>
    <div className="capacity-track" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span className="capacity-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
    <small>{detail}</small>
  </div>
)

const DiagnosticsTab = () => {
  const stats = useAppStore((state) => state.systemStats)
  const [history, setHistory] = useState<CoreSample[]>([])
  const activeCores = stats.cores.slice(0, 8)

  useEffect(() => {
    const sample: CoreSample = {
      time: new Date().toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })
    }
    activeCores.forEach((load, index) => {
      sample[`core${index + 1}`] = load
    })

    setHistory((current) => [...current, sample].slice(-30))
    // The samples are appended from the live stats stream rather than derived during render,
    // so the effect keys off the stats object identity the store replaces on every update.
  }, [stats])

  const memoryPercent = stats.ramTotal > 0 ? (stats.ramUsed / stats.ramTotal) * 100 : 0
  const networkTotal = stats.networkRxKbps + stats.networkTxKbps
  const networkPercent = (networkTotal / 10000) * 100

  return (
    <div className="diagnostics-dashboard">
      <div className="capacity-grid">
        <CapacityBar label="CPU" value={stats.cpu} valueLabel={`${Math.round(stats.cpu)}%`} detail="Processor utilization" />
        <CapacityBar label="Memory" value={memoryPercent} valueLabel={`${Math.round(memoryPercent)}%`} detail={`${stats.ramUsed.toFixed(1)} / ${stats.ramTotal.toFixed(1)} GB`} />
        <CapacityBar label="GPU" value={stats.gpuLoad ?? 0} valueLabel={stats.gpuLoad === null ? 'N/A' : `${Math.round(stats.gpuLoad)}%`} detail={stats.gpuName} />
        <CapacityBar label="Network" value={networkPercent} valueLabel={formatRate(networkTotal)} detail={`↓ ${formatRate(stats.networkRxKbps)}  ↑ ${formatRate(stats.networkTxKbps)}`} />
      </div>

      <div className="diagnostics-panels">
        <section className="screen-time-panel" aria-label="Screen time overview sample">
          <div className="diagnostics-panel-heading">
            <div><h2>Screen Time</h2><p>Usage overview</p></div>
            <span>SAMPLE</span>
          </div>
          <div className="screen-time-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={screenTimeSample} dataKey="value" nameKey="name" innerRadius="67%" outerRadius="88%" paddingAngle={3} stroke="none">
                  {screenTimeSample.map((item, index) => <Cell key={item.name} fill={chartColors[index]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#191a1d', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 11 }}
                  formatter={(value) => [`${value}%`, 'Usage']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="screen-time-total"><strong>5h 48m</strong><span>today</span></div>
          </div>
          <div className="screen-time-legend">
            {screenTimeSample.map((item, index) => (
              <span key={item.name}><i style={{ backgroundColor: chartColors[index] }} />{item.name}</span>
            ))}
          </div>
        </section>

        <section className="core-chart-panel" aria-label="Live per-core activity">
          <div className="diagnostics-panel-heading">
            <div><h2>Core activity</h2><p>Live utilization · first {activeCores.length} cores</p></div>
            <span className="live-label"><i />LIVE</span>
          </div>
          <div className="core-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="coreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dfe5e1" stopOpacity={0.23} />
                    <stop offset="95%" stopColor="#dfe5e1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fill: '#777d79', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis domain={[0, 100]} tick={{ fill: '#777d79', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`} />
                <Tooltip
                  contentStyle={{ background: '#191a1d', border: '1px solid #ffffff20', borderRadius: 8, fontSize: 10 }}
                  formatter={(value, name) => [`${Number(value).toFixed(1)}%`, String(name).replace('core', 'Core ')]}
                  labelStyle={{ color: '#c4c8c5' }}
                />
                {activeCores.map((_, index) => (
                  <Area
                    key={index}
                    type="monotone"
                    dataKey={`core${index + 1}`}
                    stroke={chartColors[index % chartColors.length]}
                    strokeOpacity={index > 3 ? 0.55 : 0.9}
                    strokeWidth={index === 0 ? 1.8 : 1.1}
                    fill={index === 0 ? 'url(#coreFill)' : 'transparent'}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}

export default DiagnosticsTab