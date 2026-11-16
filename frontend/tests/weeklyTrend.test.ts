import { expect, it } from 'vitest'
import { weeklyTrend } from '../src/lib/weeklyTrend'
import type { WeeklySeries } from '../src/lib/contracts'

it('merges selected incident years and scopes before clipping and zero-filling weeks', () => {
  const december = { weekStart: '2025-12-29', year: 2025, collisionCount: 2, totalSeverity: 5 }
  const january = { weekStart: '2025-12-29', year: 2026, collisionCount: 3, totalSeverity: 11 }
  const series: WeeklySeries = {
    snapshotDate: '2026-09-13',
    citywide: [december, { ...january, collisionCount: 4 }, { ...january, weekStart: '2026-01-12', collisionCount: 1, totalSeverity: 0 }],
    neighborhoods: { ballard: [december], fremont: [january] },
  }
  const asOf = '2026-01-13'
  const combined = weeklyTrend(series, ['ballard', 'fremont', 'ballard'], 2025, 2026, asOf)
  expect(combined.slice(-3)).toEqual([
    { weekStart: '2025-12-29', coverageStart: '2025-12-29', coverageEnd: '2026-01-04', collisionCount: 5, totalSeverity: 16, isClipped: false, isProvisional: false },
    { weekStart: '2026-01-05', coverageStart: '2026-01-05', coverageEnd: '2026-01-11', collisionCount: 0, totalSeverity: 0, isClipped: false, isProvisional: true },
    { weekStart: '2026-01-12', coverageStart: '2026-01-12', coverageEnd: '2026-01-13', collisionCount: 0, totalSeverity: 0, isClipped: true, isProvisional: true },
  ])
  expect(weeklyTrend(series, [], 2026, 2026, asOf)[0]).toMatchObject({
    coverageStart: '2026-01-01', coverageEnd: '2026-01-04', collisionCount: 4, totalSeverity: 11, isClipped: true,
  })
  expect(weeklyTrend(series, ['ballard', 'fremont'], 2025, 2025, asOf).at(-1)).toMatchObject({
    coverageStart: '2025-12-29', coverageEnd: '2025-12-31', collisionCount: 2, totalSeverity: 5, isClipped: true,
  })
})
