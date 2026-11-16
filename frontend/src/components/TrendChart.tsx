import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnnualMetric, MonthlyMetric } from '../lib/contracts'
import { useDatasetMeta } from '../lib/dataset'
import { receivedThrough } from '../lib/format'
import { provisionalWeeks, type WeeklyMetric } from '../lib/weeklyTrend'
import type { Ref } from 'react'
import styles from './TrendChart.module.css'

type Props = { chartRef?: Ref<HTMLDivElement> } & ({
  annual: AnnualMetric[]
  monthly: MonthlyMetric[]
  grain: 'annual' | 'monthly'
} | { grain: 'weekly'; weekly: WeeklyMetric[] })
type ChartRow = AnnualMetric | MonthlyMetric | WeeklyMetric

const weekDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function weekLabel(row: WeeklyMetric) {
  return weekDate.formatRange(new Date(row.coverageStart), new Date(row.coverageEnd))
}

function weekCoverage(row: WeeklyMetric) {
  if (row.isClipped) return row.isProvisional ? 'Partial week · Provisional' : 'Partial week'
  return row.isProvisional ? 'Provisional' : 'Full week'
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

export function TrendChart(props: Props) {
  const meta = useDatasetMeta()
  const { grain, chartRef } = props
  const data: ChartRow[] = props.grain === 'weekly' ? props.weekly : props.grain === 'monthly' ? props.monthly : props.annual
  const xKey = grain === 'weekly' ? 'weekStart' : grain === 'monthly' ? 'period' : 'year'
  const grainLabel = grain.charAt(0).toUpperCase() + grain.slice(1)
  const partial = data.find((row) => 'isPartial' in row && row.isPartial)
  const partialYear = partial && 'year' in partial ? partial.year : undefined
  const monthly = props.grain === 'monthly' ? props.monthly : []
  const partialMonths = monthly.filter((item) => item.isPartial)
  const provisional = props.grain === 'weekly' ? props.weekly.filter((row) => row.isProvisional) : []
  const highlightStart = provisional.at(0)?.weekStart ?? partialMonths.at(0)?.period
  const highlightEnd = provisional.at(-1)?.weekStart ?? partialMonths.at(-1)?.period
  const lastCompleteYear = props.grain === 'annual' ? props.annual.filter((item) => !item.isPartial).at(-1)?.year ?? -Infinity : -Infinity
  const receivedThroughDate = receivedThrough(meta.dataAsOf)
  const monthlyTicks = monthly.filter((item) => item.month === 1).map((item) => item.period)
  const finalMonth = monthly.at(-1)?.period
  if (finalMonth && !monthlyTicks.includes(finalMonth)) monthlyTicks.push(finalMonth)
  const weeklyByStart = new Map(props.grain === 'weekly' ? props.weekly.map((row) => [row.weekStart, row]) : [])
  const hasProvisionalWeeks = provisional.length > 0
  const coverageNote = partialYear
    ? `The ${partialYear} observations are partial.${grain === 'annual' ? ' Dashed segments distinguish incomplete annual observations.' : ''}`
    : hasProvisionalWeeks ? 'Provisional weeks may gain reports or be revised.' : ''
  return (
    <div>
      <div ref={chartRef} className={styles.chart} role="img" aria-label={`${grainLabel} trend chart. Blue area shows collision count. Teal line shows total severity burden. ${coverageNote}`}>
        <div className={styles.legend} aria-hidden="true">
          <span><i className={styles.collisionSwatch}/>Collisions</span>
          <span><i className={styles.severitySwatch}/>Severity burden</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 42, right: 16, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false}/>
            <XAxis
              dataKey={xKey}
              stroke="var(--text-secondary)"
              tickLine={false}
              axisLine={false}
              minTickGap={grain === 'annual' ? 12 : 34}
              ticks={grain === 'monthly' ? monthlyTicks : undefined}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => grain === 'weekly' ? weekDate.format(new Date(value)) : grain === 'monthly' ? monthTick(value) : String(value)}
            />
            <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(value: number) => value >= 1000 ? `${value / 1000}k` : String(value)}/>
            <Tooltip
              payloadUniqBy={(entry) => entry.name}
              contentStyle={{ background: 'var(--panel-raised)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', borderRadius: 0 }}
              labelStyle={{ color: 'var(--text-primary)' }}
              labelFormatter={(value) => {
                const week = weeklyByStart.get(String(value))
                if (week) return `${weekLabel(week)} · ${weekCoverage(week)}`
                return grain === 'monthly' ? monthLabel(value) : String(value)
              }}
            />
            {highlightStart && highlightEnd && (grain === 'weekly' && highlightStart === highlightEnd
              ? <ReferenceLine x={highlightStart} stroke="var(--caution)" strokeWidth={2} strokeDasharray="4 4"/>
              : <ReferenceArea x1={highlightStart} x2={highlightEnd} fill="var(--caution)" fillOpacity={0.09} strokeOpacity={0}/>)}
            <Area type="linear" dataKey={(row: ChartRow) => grain === 'annual' && 'isPartial' in row && row.isPartial ? null : row.collisionCount} name="Collisions" stroke="var(--selection)" fill="var(--selection)" fillOpacity={0.1} isAnimationActive={false}/>
            <Line type="linear" dataKey={(row: ChartRow) => grain === 'annual' && 'isPartial' in row && row.isPartial ? null : row.totalSeverity} name="Severity burden" stroke="var(--support)" strokeWidth={2} dot={false} isAnimationActive={false}/>
            {grain === 'annual' && partialYear && <>
              <Line type="linear" dataKey={(row: AnnualMetric) => row.year >= lastCompleteYear ? row.collisionCount : null} name="Collisions" stroke="var(--selection)" strokeDasharray="5 4" dot={{ r: 3, fill: 'var(--panel)' }} isAnimationActive={false}/>
              <Line type="linear" dataKey={(row: AnnualMetric) => row.year >= lastCompleteYear ? row.totalSeverity : null} name="Severity burden" stroke="var(--support)" strokeDasharray="5 4" dot={{ r: 3, fill: 'var(--panel)' }} isAnimationActive={false}/>
            </>}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {partialYear && <p className={styles.partialMarker}>{partialYear} partial · received through {receivedThroughDate}{grain === 'annual' ? '. Dashed segments show the incomplete year.' : '.'}</p>}
      {grain === 'weekly' && <p className={styles.partialMarker}>Latest incident in this snapshot: {weekDate.format(new Date(meta.dataAsOf))}.{hasProvisionalWeeks && ` Weeks that ended less than ${provisionalWeeks} weeks before the snapshot are provisional. Counts and severity can change as reports arrive or are revised.`}</p>}
      <details className={styles.dataTable}>
        <summary>View {grain} chart data</summary>
        <div className={styles.tableScroll}><table>
          <caption>{grainLabel} collisions and weighted severity totals</caption>
          <thead><tr><th scope="col">Period</th><th scope="col">Collisions</th><th scope="col">Severity burden</th><th scope="col">Coverage</th></tr></thead>
          <tbody>{data.map((row) => <tr key={'weekStart' in row ? row.weekStart : 'period' in row ? row.period : row.year}>
            <th scope="row">{'weekStart' in row ? weekLabel(row) : 'period' in row ? row.period : row.year}</th><td>{row.collisionCount.toLocaleString()}</td><td>{row.totalSeverity.toLocaleString()}</td><td>{'weekStart' in row ? weekCoverage(row) : row.isPartial ? 'Partial year' : 'Complete year'}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </div>
  )
}
