import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnnualMetric } from '../lib/contracts'
import styles from './TrendChart.module.css'

export function TrendChart({ annual, pulseKey }: { annual: AnnualMetric[]; pulseKey: number }) {
  return (
    <div className={styles.chart} role="img" aria-label="Annual trend chart. Blue area shows collision count. Cyan line shows total severity burden.">
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.collisionSwatch}/>Collisions</span>
        <span><i className={styles.severitySwatch}/>Severity burden</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={annual} margin={{ top: 14, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#203247" vertical={false}/>
          <XAxis dataKey="year" stroke="#7890a8" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis stroke="#7890a8" tickLine={false} axisLine={false} tick={{ fontSize: 11 }}/>
          <Tooltip contentStyle={{ background: '#0b1927', border: '1px solid #36506a', borderRadius: 0 }} labelStyle={{ color: '#f2f7fb' }}/>
          <Area type="linear" dataKey="collisionCount" name="Collisions" stroke="#2f84ff" fill="#123c6a" fillOpacity={0.45} isAnimationActive={false}/>
          <Line type="linear" dataKey="totalSeverity" name="Severity burden" stroke="#27d1df" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false}/>
        </ComposedChart>
      </ResponsiveContainer>
      {pulseKey > 0 && <i key={pulseKey} className={styles.selectionMarker} aria-hidden="true"/>}
      {annual.some((item) => item.isPartial) && <div className={styles.partialMarker}>2026 PARTIAL</div>}
    </div>
  )
}
