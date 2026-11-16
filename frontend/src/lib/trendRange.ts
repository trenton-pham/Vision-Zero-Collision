import type { AnnualMetric, MonthlyMetric } from './contracts'

export type MonthRange = { from: string; through: string }
export type AnnualTrendPoint = Pick<AnnualMetric, 'year' | 'collisionCount' | 'totalSeverity' | 'isPartial'> & {
  coverage?: MonthRange
}

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export function monthLabel(month: string) {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`))
}

export function monthIndex(month: string) {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1
}

export function monthAt(index: number) {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`
}

export function trendMonthRange(from: string | null, through: string | null, bounds: MonthRange): MonthRange {
  const start = from && monthPattern.test(from) ? from : bounds.from
  const end = through && monthPattern.test(through) ? through : bounds.through
  const [first, last] = start <= end ? [start, end] : [end, start]
  if (last < bounds.from || first > bounds.through) return bounds
  return {
    from: first < bounds.from ? bounds.from : first,
    through: last > bounds.through ? bounds.through : last,
  }
}

export function annualTrendFromMonths(monthly: MonthlyMetric[]): AnnualTrendPoint[] {
  const years = new Map<number, AnnualTrendPoint & { coverage: MonthRange }>()
  for (const row of monthly) {
    const point = years.get(row.year) ?? {
      year: row.year,
      collisionCount: 0,
      totalSeverity: 0,
      isPartial: row.month !== 1,
      coverage: { from: row.period, through: row.period },
    }
    point.collisionCount += row.collisionCount
    point.totalSeverity += row.totalSeverity
    point.isPartial ||= row.isPartial
    point.coverage.through = row.period
    years.set(row.year, point)
  }
  return [...years.values()].map((point) => ({
    ...point,
    isPartial: point.isPartial || !point.coverage.through.endsWith('-12'),
  }))
}
