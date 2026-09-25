import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnnualMetric, MonthlyMetric } from '../lib/contracts'
import { useDatasetMeta } from '../lib/dataset'
import styles from './TrendChart.module.css'

type Props = {
  annual: AnnualMetric[]
  monthly: MonthlyMetric[]
  grain: 'annual' | 'monthly'
  pulseKey: number
}

function monthLabel(value: unknown) {
  const [year, month] = String(value).split('-').map(Number)
  if (!year || !month) return String(value)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
}

function monthTick(value: unknown) {
  const [year, month] = String(value).split('-').map(Number)
  if (!year || !month) return ''
  if (month === 1) return String(year)
  const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
  return `${shortMonth} '${String(year).slice(-2)}`
}

export function TrendChart({ annual, monthly, grain, pulseKey }: Props) {
  const meta = useDatasetMeta()
  const data = grain === 'monthly' ? monthly : annual
  const xKey = grain === 'monthly' ? 'period' : 'year'
  const partial = data.some((item) => item.isPartial)
  const partialYear = data.find((item) => item.isPartial)?.year
  const partialMonths = monthly.filter((item) => item.isPartial)
  const partialStart = partialMonths.at(0)?.period
  const partialEnd = partialMonths.at(-1)?.period
  const receivedThrough = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${meta.dataAsOf}T00:00:00Z`)).toUpperCase()
  const monthlyTicks = monthly.filter((item) => item.month === 1).map((item) => item.period)
  const finalMonth = monthly.at(-1)?.period
  if (finalMonth && !monthlyTicks.includes(finalMonth)) monthlyTicks.push(finalMonth)
  return (
    <div className={styles.chart} role="img" aria-label={`${grain === 'monthly' ? 'Monthly' : 'Annual'} trend chart. Blue area shows collision count. Cyan line shows total severity burden. ${partial ? `The ${partialYear} observations are partial.` : ''}`}>
      <div className={styles.legend} aria-hidden="true">
        <span><i className={styles.collisionSwatch}/>Collisions</span>
        <span><i className={styles.severitySwatch}/>Severity burden</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 14, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#203247" vertical={false}/>
          <XAxis
            dataKey={xKey}
            stroke="#7890a8"
            tickLine={false}
            axisLine={false}
            minTickGap={grain === 'monthly' ? 34 : 12}
            ticks={grain === 'monthly' ? monthlyTicks : undefined}
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => grain === 'monthly' ? monthTick(value) : String(value)}
          />
          <YAxis stroke="#7890a8" tickLine={false} axisLine={false} tick={{ fontSize: 11 }}/>
          <Tooltip
            contentStyle={{ background: '#0b1927', border: '1px solid #36506a', borderRadius: 0 }}
            labelStyle={{ color: '#f2f7fb' }}
            labelFormatter={(value) => grain === 'monthly' ? monthLabel(value) : String(value)}
          />
          {grain === 'monthly' && partialStart && partialEnd && <ReferenceArea x1={partialStart} x2={partialEnd} fill="#f3a52b" fillOpacity={0.09} strokeOpacity={0}/>}
          <Area type="linear" dataKey="collisionCount" name="Collisions" stroke="#2f84ff" fill="#123c6a" fillOpacity={0.45} isAnimationActive={false}/>
          <Line type="linear" dataKey="totalSeverity" name="Severity burden" stroke="#27d1df" strokeWidth={2} dot={grain === 'annual' ? { r: 2 } : false} isAnimationActive={false}/>
        </ComposedChart>
      </ResponsiveContainer>
      {pulseKey > 0 && <i key={pulseKey} className={styles.selectionMarker} aria-hidden="true"/>}
      {partial && <div className={styles.partialMarker}>{partialYear} PARTIAL · RECEIVED THROUGH {receivedThrough}</div>}
    </div>
  )
}
