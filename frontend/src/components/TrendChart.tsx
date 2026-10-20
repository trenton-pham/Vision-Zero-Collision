import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AnnualMetric, MonthlyMetric } from '../lib/contracts'
import { useDatasetMeta } from '../lib/dataset'
import { receivedThrough } from '../lib/format'
import styles from './TrendChart.module.css'

type Props = {
  annual: AnnualMetric[]
  monthly: MonthlyMetric[]
  grain: 'annual' | 'monthly'
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

export function TrendChart({ annual, monthly, grain }: Props) {
  const meta = useDatasetMeta()
  const data = grain === 'monthly' ? monthly : annual
  const xKey = grain === 'monthly' ? 'period' : 'year'
  const partial = data.some((item) => item.isPartial)
  const partialYear = data.find((item) => item.isPartial)?.year
  const partialMonths = monthly.filter((item) => item.isPartial)
  const partialStart = partialMonths.at(0)?.period
  const partialEnd = partialMonths.at(-1)?.period
  const lastCompleteYear = annual.filter((item) => !item.isPartial).at(-1)?.year ?? -Infinity
  const receivedThroughDate = receivedThrough(meta.dataAsOf)
  const monthlyTicks = monthly.filter((item) => item.month === 1).map((item) => item.period)
  const finalMonth = monthly.at(-1)?.period
  if (finalMonth && !monthlyTicks.includes(finalMonth)) monthlyTicks.push(finalMonth)
  return (
    <div>
      <div className={styles.chart} role="img" aria-label={`${grain === 'monthly' ? 'Monthly' : 'Annual'} trend chart. Blue area shows collision count. Teal line shows total severity burden. ${partial ? `The ${partialYear} observations are partial. ${grain === 'annual' ? 'Dashed segments distinguish incomplete annual observations.' : ''}` : ''}`}>
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
              minTickGap={grain === 'monthly' ? 34 : 12}
              ticks={grain === 'monthly' ? monthlyTicks : undefined}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => grain === 'monthly' ? monthTick(value) : String(value)}
            />
            <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} tickFormatter={(value: number) => value >= 1000 ? `${value / 1000}k` : String(value)}/>
            <Tooltip
              payloadUniqBy={(entry) => entry.name}
              contentStyle={{ background: 'var(--panel-raised)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', borderRadius: 0 }}
              labelStyle={{ color: 'var(--text-primary)' }}
              labelFormatter={(value) => grain === 'monthly' ? monthLabel(value) : String(value)}
            />
            {grain === 'monthly' && partialStart && partialEnd && <ReferenceArea x1={partialStart} x2={partialEnd} fill="var(--caution)" fillOpacity={0.09} strokeOpacity={0}/>}
            <Area type="linear" dataKey={(row: AnnualMetric) => grain === 'annual' && row.isPartial ? null : row.collisionCount} name="Collisions" stroke="var(--selection)" fill="var(--selection)" fillOpacity={0.1} isAnimationActive={false}/>
            <Line type="linear" dataKey={(row: AnnualMetric) => grain === 'annual' && row.isPartial ? null : row.totalSeverity} name="Severity burden" stroke="var(--support)" strokeWidth={2} dot={false} isAnimationActive={false}/>
            {grain === 'annual' && partial && <>
              <Line type="linear" dataKey={(row: AnnualMetric) => row.year >= lastCompleteYear ? row.collisionCount : null} name="Collisions" stroke="var(--selection)" strokeDasharray="5 4" dot={{ r: 3, fill: 'var(--panel)' }} isAnimationActive={false}/>
              <Line type="linear" dataKey={(row: AnnualMetric) => row.year >= lastCompleteYear ? row.totalSeverity : null} name="Severity burden" stroke="var(--support)" strokeDasharray="5 4" dot={{ r: 3, fill: 'var(--panel)' }} isAnimationActive={false}/>
            </>}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {partial && <p className={styles.partialMarker}>{partialYear} partial · received through {receivedThroughDate}{grain === 'annual' ? '. Dashed segments show the incomplete year.' : '.'}</p>}
      <details className={styles.dataTable}>
        <summary>View {grain} chart data</summary>
        <div className={styles.tableScroll}><table>
          <caption>{grain === 'annual' ? 'Annual' : 'Monthly'} collisions and weighted severity totals</caption>
          <thead><tr><th scope="col">Period</th><th scope="col">Collisions</th><th scope="col">Severity burden</th><th scope="col">Coverage</th></tr></thead>
          <tbody>{data.map((row) => <tr key={'period' in row ? String(row.period) : row.year}>
            <th scope="row">{'period' in row ? String(row.period) : row.year}</th><td>{row.collisionCount.toLocaleString()}</td><td>{row.totalSeverity.toLocaleString()}</td><td>{row.isPartial ? 'Partial year' : 'Complete year'}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </div>
  )
}
