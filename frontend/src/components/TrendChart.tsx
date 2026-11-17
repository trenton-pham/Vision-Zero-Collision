import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonthlyMetric } from '../lib/contracts'
import { useDatasetMeta } from '../lib/dataset'
import { receivedThrough } from '../lib/format'
import { monthLabel as shortMonthLabel, type AnnualTrendPoint } from '../lib/trendRange'
import { provisionalWeeks, type WeeklyMetric } from '../lib/weeklyTrend'
import { useId } from 'react'
import styles from './TrendChart.module.css'

type Props = {
  annual: AnnualTrendPoint[]
  monthly: MonthlyMetric[]
  grain: 'annual' | 'monthly'
} | { grain: 'weekly'; weekly: WeeklyMetric[] }
type ChartRow = AnnualTrendPoint | MonthlyMetric | WeeklyMetric

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

function annualCoverage(row: AnnualTrendPoint) {
  if (!row.isPartial) return 'Complete year'
  if (!row.coverage) return 'Partial year'
  const { from, through } = row.coverage
  const months = from === through ? shortMonthLabel(from) : `${shortMonthLabel(from)} – ${shortMonthLabel(through)}`
  return `Partial year · ${months}`
}

function monthCoverage(row: MonthlyMetric, dataAsOf: string) {
  const lastDay = new Date(Date.UTC(row.year, row.month, 0)).getUTCDate()
  return row.period === dataAsOf.slice(0, 7) && Number(dataAsOf.slice(8)) < lastDay
    ? `Partial month · through ${weekDate.format(new Date(dataAsOf))}`
    : 'Full month'
}

export function TrendChart(props: Props) {
  const meta = useDatasetMeta()
  const { grain } = props
  const hatchId = `partial-hatch${useId().replace(/:/g, '')}`
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
  const annual = props.grain === 'annual' ? props.annual : []
  const receivedThroughDate = receivedThrough(meta.dataAsOf)
  const monthlyTicks = monthly.filter((item, index) => index === 0 || item.month === 1).map((item) => item.period)
  const finalMonth = monthly.at(-1)?.period
  if (finalMonth && !monthlyTicks.includes(finalMonth)) monthlyTicks.push(finalMonth)
  const weeklyByStart = new Map(props.grain === 'weekly' ? props.weekly.map((row) => [row.weekStart, row]) : [])
  const annualByYear = new Map(annual.map((row) => [row.year, row]))
  const hasSlicedYear = annual.some((row) => row.isPartial && row.coverage)
  const hasProvisionalWeeks = provisional.length > 0
  const coverageNote = hasSlicedYear
    ? 'Hollow points mark partial years. The table shows the months included.'
    : partialYear
    ? `The ${partialYear} observations are partial.${grain === 'annual' ? ' Hollow points mark partial years.' : ''}`
    : hasProvisionalWeeks ? 'Provisional weeks may gain reports or be revised.' : ''
  return (
    <div>
      <div className={styles.chart} role="img" aria-label={`${grainLabel} trend chart. Gray area shows collision count. Red line shows total severity burden. ${highlightStart && highlightEnd ? (highlightStart === highlightEnd ? 'A dashed line marks the partial or provisional period. ' : 'Hatched bands mark partial or provisional periods. ') : ''}${coverageNote}`}>
        <div className={styles.legend} aria-hidden="true">
          <span><i className={styles.collisionSwatch}/>Collisions</span>
          <span><i className={styles.severitySwatch}/>Severity burden</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 42, right: 16, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false}/>
            <XAxis
              dataKey={xKey}
              stroke="var(--ink-2)"
              tickLine={false}
              axisLine={false}
              minTickGap={grain === 'annual' ? 12 : 34}
              ticks={grain === 'monthly' && monthly.length > 12 ? monthlyTicks : undefined}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => grain === 'weekly' ? weekDate.format(new Date(value)) : grain === 'monthly' ? monthTick(value) : String(value)}
            />
            <YAxis stroke="var(--ink-2)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(value: number) => value >= 1000 ? `${value / 1000}k` : String(value)}/>
            <Tooltip
              payloadUniqBy={(entry) => entry.name}
              contentStyle={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--rule-strong)', borderRadius: 'var(--radius-control)', boxShadow: 'var(--shadow-float)' }}
              labelStyle={{ color: 'var(--ink)' }}
              labelFormatter={(value) => {
                const week = weeklyByStart.get(String(value))
                if (week) return `${weekLabel(week)} · ${weekCoverage(week)}`
                const year = annualByYear.get(Number(value))
                if (year?.coverage && year.isPartial) return `${year.year} · ${annualCoverage(year)}`
                return grain === 'monthly' ? monthLabel(value) : String(value)
              }}
            />
            <defs>
              <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--rule-strong)" strokeWidth="1.5"/>
              </pattern>
            </defs>
            {highlightStart && highlightEnd && (highlightStart === highlightEnd
              ? <ReferenceLine x={highlightStart} stroke="var(--rule-strong)" strokeWidth={2} strokeDasharray="4 4"/>
              : <ReferenceArea x1={highlightStart} x2={highlightEnd} fill={`url(#${hatchId})`} fillOpacity={0.6} strokeOpacity={0}/>)}
            <Area type="linear" dataKey={(row: ChartRow) => grain === 'annual' && 'isPartial' in row && row.isPartial ? null : row.collisionCount} name="Collisions" stroke="var(--ink-3)" fill="var(--ink-3)" fillOpacity={0.12} isAnimationActive={false}/>
            <Line type="linear" dataKey={(row: ChartRow) => grain === 'annual' && 'isPartial' in row && row.isPartial ? null : row.totalSeverity} name="Severity burden" stroke="var(--ramp-5)" strokeWidth={2} dot={false} isAnimationActive={false}/>
            {grain === 'annual' && <Line type="linear" dataKey={(row: AnnualTrendPoint) => row.isPartial ? row.collisionCount : null} name="Collisions" stroke="none" dot={{ r: 4, strokeWidth: 2, stroke: 'var(--ink-3)', fill: 'var(--surface)' }} isAnimationActive={false}/>}
            {grain === 'annual' && <Line type="linear" dataKey={(row: AnnualTrendPoint) => row.isPartial ? row.totalSeverity : null} name="Severity burden" stroke="none" dot={{ r: 4, strokeWidth: 2, stroke: 'var(--ramp-5)', fill: 'var(--surface)' }} isAnimationActive={false}/>}
            {grain === 'annual' && annual.filter((row) => row.isPartial).map((row) => <ReferenceDot key={`partial-label-${row.year}`} x={row.year} y={row.collisionCount} r={0} ifOverflow="visible" label={{ value: row.coverage ? annualCoverage(row).replace('Partial year · ', '') : row.year === Number(meta.dataAsOf.slice(0, 4)) ? `Jan–${new Date(`${meta.dataAsOf}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}` : 'Partial', position: annual.length > 1 && row.year === annual[0]?.year ? 'right' : 'left', offset: 10, fill: 'var(--ink-2)', fontSize: 11 }}/>)}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hasSlicedYear
        ? <p className={styles.partialMarker}>Hollow points mark partial years. View chart data for the months included.{annualByYear.has(Number(meta.dataAsOf.slice(0, 4))) && ` Latest incident in this snapshot: ${weekDate.format(new Date(meta.dataAsOf))}.`}</p>
        : partialYear && <p className={styles.partialMarker}>{partialYear} partial · received through {receivedThroughDate}{grain === 'annual' ? '. The hollow point marks the partial year.' : '.'}</p>}
      {grain === 'weekly' && <p className={styles.partialMarker}>Latest incident in this snapshot: {weekDate.format(new Date(meta.dataAsOf))}.{hasProvisionalWeeks && ` Weeks that ended less than ${provisionalWeeks} weeks before the snapshot are provisional. Counts and severity can change as reports arrive or are revised.`}</p>}
      <details className={styles.dataTable}>
        <summary>View {grain} chart data</summary>
        <div className={styles.tableScroll}><table>
          <caption>{grainLabel} collisions and weighted severity totals</caption>
          <thead><tr><th scope="col">Period</th><th scope="col">Collisions</th><th scope="col">Severity burden</th><th scope="col">Coverage</th></tr></thead>
          <tbody>{data.map((row) => <tr key={'weekStart' in row ? row.weekStart : 'period' in row ? row.period : row.year}>
            <th scope="row">{'weekStart' in row ? weekLabel(row) : 'period' in row ? row.period : row.year}</th><td>{row.collisionCount.toLocaleString()}</td><td>{row.totalSeverity.toLocaleString()}</td><td>{'weekStart' in row ? weekCoverage(row) : 'period' in row ? monthCoverage(row, meta.dataAsOf) : annualCoverage(row)}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </div>
  )
}
