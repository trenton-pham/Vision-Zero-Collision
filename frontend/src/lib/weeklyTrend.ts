import type { WeeklySeries } from './contracts'

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

export function weeklyTrend(series: WeeklySeries, ids: string[], startYear: number, endYear: number, dataAsOf: string): WeeklyMetric[] {
  const start = Date.UTC(startYear, 0, 1)
  const end = Math.min(Date.UTC(endYear, 11, 31), Date.parse(dataAsOf))
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
