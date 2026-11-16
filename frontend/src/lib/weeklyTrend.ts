import type { WeeklySeries } from './contracts'
import { monthAt, monthIndex, type MonthRange } from './trendRange'

const DAY = 86_400_000
const WEEK = 7 * DAY
export const provisionalWeeks = 36

type Totals = { collisionCount: number; totalSeverity: number }
export type WeeklyMetric = Totals & {
  weekStart: string
  coverageStart: string
  coverageEnd: string
  isClipped: boolean
  isProvisional: boolean
}

function dateKey(day: number) {
  return new Date(day).toISOString().slice(0, 10)
}

type WeeklyTrendFilters = {
  ids: string[]
  startYear: number
  endYear: number
  dataAsOf: string
  monthRange?: MonthRange
}

export function weeklyTrend(series: WeeklySeries, { ids, startYear, endYear, dataAsOf, monthRange }: WeeklyTrendFilters): WeeklyMetric[] {
  const range = series.citywide[0]?.month === undefined ? undefined : monthRange
  const start = range ? Date.parse(`${range.from}-01`) : Date.UTC(startYear, 0, 1)
  const lastDay = range ? Date.parse(`${monthAt(monthIndex(range.through) + 1)}-01`) - DAY : Date.UTC(endYear, 11, 31)
  const end = Math.min(lastDay, Date.parse(dataAsOf))
  const minimumMonth = range ? monthIndex(range.from) : startYear * 12
  const maximumMonth = range ? monthIndex(range.through) : endYear * 12 + 11
  const snapshot = Date.parse(series.snapshotDate)
  const periods = new Map<string, Totals>()
  const scopes = ids.length ? [...new Set(ids)].map((id) => {
    const rows = series.neighborhoods[id]
    if (!rows || !Object.hasOwn(series.neighborhoods, id)) throw new Error('Weekly data is unavailable for a selected neighborhood.')
    return rows
  }) : [series.citywide]

  for (const rows of scopes) {
    for (const row of rows) {
      if (row.year < startYear || row.year > endYear) continue
      if (row.month !== undefined) {
        const month = row.year * 12 + row.month - 1
        if (month < minimumMonth || month > maximumMonth) continue
      }
      const totals = periods.get(row.weekStart) ?? { collisionCount: 0, totalSeverity: 0 }
      totals.collisionCount += row.collisionCount
      totals.totalSeverity += row.totalSeverity
      periods.set(row.weekStart, totals)
    }
  }

  const firstMonday = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY
  const weeks: WeeklyMetric[] = []
  for (let monday = firstMonday; start <= end && monday <= end; monday += WEEK) {
    const sunday = monday + 6 * DAY
    const weekStart = dateKey(monday)
    weeks.push({
      weekStart,
      coverageStart: dateKey(Math.max(monday, start)),
      coverageEnd: dateKey(Math.min(sunday, end)),
      isClipped: monday < start || sunday > end,
      isProvisional: snapshot - sunday < provisionalWeeks * WEEK,
      ...(periods.get(weekStart) ?? { collisionCount: 0, totalSeverity: 0 }),
    })
  }
  return weeks
}
