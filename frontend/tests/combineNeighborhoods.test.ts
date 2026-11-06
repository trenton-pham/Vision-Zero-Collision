import { describe, expect, it } from 'vitest'
import { combineNeighborhoods } from '../src/lib/combineNeighborhoods'
import type { NeighborhoodMonth, NeighborhoodSeries } from '../src/lib/contracts'
import { datasetMeta } from './fixtures'

const zero: NeighborhoodMonth = { period: '2025-01', collisionCount: 0, injuries: 0, seriousInjuries: 0, fatalities: 0, totalSeverity: 0, pedestrianCollisions: 0, intersectionCollisions: 0, nightCollisions: 0, weekendCollisions: 0, knownTimeCollisions: 0 }
const series: NeighborhoodSeries = { neighborhoods: {
  small: { monthly: [{ ...zero, collisionCount: 1, injuries: 1, totalSeverity: 1, intersectionCollisions: 1, nightCollisions: 1, knownTimeCollisions: 1 }] },
  large: { monthly: [{ ...zero, collisionCount: 9, injuries: 2, seriousInjuries: 1, totalSeverity: 5, pedestrianCollisions: 2, intersectionCollisions: 2, nightCollisions: 1, weekendCollisions: 3, knownTimeCollisions: 3 }] },
  empty: { monthly: [zero] },
} }

describe('combined neighborhood statistics', () => {
  it('sums counts once and calculates weighted shares from their own denominators', () => {
    const result = combineNeighborhoods(series, ['small', 'large', 'small'], 2025, 2025, datasetMeta)
    expect(result.metrics).toMatchObject({ collisionCount: 10, injuries: 3, seriousInjuries: 1, totalSeverity: 6, meanSeverity: 0.6, pedestrianCollisions: 2, intersectionShare: 0.3, nightShare: 0.5, weekendShare: 0.3 })
    expect(result.annual).toEqual([{ year: 2025, collisionCount: 10, injuries: 3, seriousInjuries: 1, fatalities: 0, totalSeverity: 6, meanSeverity: 0.6, isPartial: false }])
    expect(result.monthly[0]).toMatchObject({ period: '2025-01', month: 1, collisionCount: 10, totalSeverity: 6 })
  })

  it('preserves null ratios for zero collisions and unavailable recorded times', () => {
    const empty = combineNeighborhoods(series, ['empty'], 2025, 2025, datasetMeta)
    expect(empty.metrics).toMatchObject({ collisionCount: 0, meanSeverity: null, intersectionShare: null, nightShare: null, weekendShare: null })
    const legacy = { neighborhoods: { legacy: { monthly: [{ ...zero, collisionCount: 4, nightCollisions: 2, knownTimeCollisions: null }] } } }
    expect(combineNeighborhoods(legacy, ['legacy'], 2025, 2025, datasetMeta).metrics.nightShare).toBeNull()
  })

  it('matches Python rounding at exactly representable half-even ties', () => {
    const ties = { neighborhoods: { tie: { monthly: [
      { ...zero, collisionCount: 16, totalSeverity: 9 },
      { ...zero, period: '2025-02', collisionCount: 16, totalSeverity: 3 },
    ] } } }
    const result = combineNeighborhoods(ties, ['tie'], 2025, 2025, datasetMeta)
    expect(result.monthly.map((row) => row.meanSeverity)).toEqual([0.562, 0.188])
    const shares = { neighborhoods: { tie: { monthly: [{ ...zero, collisionCount: 32, intersectionCollisions: 1 }] } } }
    expect(combineNeighborhoods(shares, ['tie'], 2025, 2025, datasetMeta).metrics.intersectionShare).toBe(0.0312)
  })

  it('groups years and excludes partial years from first/last three-year comparisons', () => {
    const history = { neighborhoods: { area: { monthly: Array.from({ length: 8 }, (_, index) => ({ ...zero, period: `${2019 + index}-01`, collisionCount: index < 3 ? 2 : 4, totalSeverity: index < 3 ? 1 : 3 })) } } }
    const result = combineNeighborhoods(history, ['area'], 2019, 2026, datasetMeta)
    expect(result.metrics.collisionCount).toBe(26)
    expect(result.comparison).toMatchObject({ status: 'available', firstPeriod: { years: [2019, 2020, 2021], averageCollisions: 2 }, lastPeriod: { years: [2023, 2024, 2025], averageCollisions: 4 }, collisionChangePercent: 100, severityChangePercent: 200 })
    expect(result.annual.at(-1)?.isPartial).toBe(true)
    expect(result.warnings).toEqual(['2026 partial · records received through August 31, 2026'])
    expect(combineNeighborhoods(history, ['area'], 2021, 2026, datasetMeta).comparison.status).toBe('insufficient_years')
  })

  it('keeps zero-baseline changes unavailable and rejects missing neighborhoods', () => {
    const history = { neighborhoods: { area: { monthly: Array.from({ length: 6 }, (_, index) => ({ ...zero, period: `${2019 + index}-01`, collisionCount: index < 3 ? 0 : 2 })) } } }
    expect(combineNeighborhoods(history, ['area'], 2019, 2024, datasetMeta).comparison).toMatchObject({ status: 'available', collisionChangePercent: null, severityChangePercent: null })
    expect(() => combineNeighborhoods(series, ['small', 'missing'], 2025, 2025, datasetMeta)).toThrow('Statistics are unavailable')
  })
})
