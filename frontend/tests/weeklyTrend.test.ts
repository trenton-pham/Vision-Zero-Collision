import { expect, it } from 'vitest'
import { weeklyTrend } from '../src/lib/weeklyTrend'
import { weeklySeriesSchema, type WeeklySeries } from '../src/lib/contracts'

it('merges selected incident years and scopes before clipping and zero-filling weeks', () => {
  const december = { weekStart: '2025-12-29', year: 2025, collisionCount: 2, totalSeverity: 5 }
  const january = { weekStart: '2025-12-29', year: 2026, collisionCount: 3, totalSeverity: 11 }
  const series: WeeklySeries = {
    snapshotDate: '2026-09-13',
    citywide: [december, { ...january, collisionCount: 4 }, { ...january, weekStart: '2026-01-12', collisionCount: 1, totalSeverity: 0 }],
    neighborhoods: { ballard: [december], fremont: [january] },
  }
  const asOf = '2026-01-13'
  const combined = weeklyTrend(series, { ids: ['ballard', 'fremont', 'ballard'], startYear: 2025, endYear: 2026, dataAsOf: asOf })
  expect(combined.slice(-3)).toEqual([
    { weekStart: '2025-12-29', coverageStart: '2025-12-29', coverageEnd: '2026-01-04', collisionCount: 5, totalSeverity: 16, isClipped: false, isProvisional: false },
    { weekStart: '2026-01-05', coverageStart: '2026-01-05', coverageEnd: '2026-01-11', collisionCount: 0, totalSeverity: 0, isClipped: false, isProvisional: true },
    { weekStart: '2026-01-12', coverageStart: '2026-01-12', coverageEnd: '2026-01-13', collisionCount: 0, totalSeverity: 0, isClipped: true, isProvisional: true },
  ])
  expect(weeklyTrend(series, { ids: [], startYear: 2026, endYear: 2026, dataAsOf: asOf })[0]).toMatchObject({
    coverageStart: '2026-01-01', coverageEnd: '2026-01-04', collisionCount: 4, totalSeverity: 11, isClipped: true,
  })
  expect(weeklyTrend(series, { ids: ['ballard', 'fremont'], startYear: 2025, endYear: 2025, dataAsOf: asOf }).at(-1)).toMatchObject({
    coverageStart: '2025-12-29', coverageEnd: '2025-12-31', collisionCount: 2, totalSeverity: 5, isClipped: true,
  })
})

it('uses only the selected incident month for weeks crossing the month bounds', () => {
  const march = { weekStart: '2025-03-31', year: 2025, month: 3, collisionCount: 16, totalSeverity: 4 }
  const april = { ...march, month: 4, collisionCount: 83, totalSeverity: 62 }
  const may = { ...march, weekStart: '2025-04-28', month: 5, collisionCount: 45 }
  const series = weeklySeriesSchema.parse({
    snapshotDate: '2025-05-05', citywide: [march, april, may], neighborhoods: { ballard: [march, april] },
  })
  const range = { from: '2025-04', through: '2025-04' }
  const weeks = weeklyTrend(series, { ids: [], startYear: 2025, endYear: 2025, dataAsOf: '2025-05-04', monthRange: range })
  expect(weeks[0]).toMatchObject({ coverageStart: '2025-04-01', coverageEnd: '2025-04-06', collisionCount: 83, totalSeverity: 62, isClipped: true })
  expect(weeks.at(-1)).toMatchObject({ coverageEnd: '2025-04-30', collisionCount: 0, totalSeverity: 0, isClipped: true })
  expect(weeklySeriesSchema.safeParse({
    ...series, neighborhoods: { ballard: [{ ...april, month: undefined }] },
  }).success).toBe(false)
})
