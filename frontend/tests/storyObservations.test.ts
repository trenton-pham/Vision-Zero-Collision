import { describe, expect, it } from 'vitest'
import type { NeighborhoodMetricSet, SpatialShiftResponse, TrendComparison } from '../src/lib/contracts'
import { storyObservations } from '../src/lib/storyObservations'

const metrics = (id: string, name: string, totalSeverity: number, collisionCount: number): NeighborhoodMetricSet => ({
  id, name, totalSeverity, collisionCount, injuries: 0, seriousInjuries: 0, fatalities: 0, meanSeverity: null, pedestrianCollisions: 0, intersectionShare: null, nightShare: null, weekendShare: null,
})
const available: TrendComparison = {
  status: 'available', message: '',
  firstPeriod: { years: [2015, 2016, 2017], averageCollisions: 10, averageSeverityBurden: 5 },
  lastPeriod: { years: [2023, 2024, 2025], averageCollisions: 8, averageSeverityBurden: 4 },
  collisionChangePercent: -20, severityChangePercent: -12.5,
}
const shift: SpatialShiftResponse = {
  status: 'available', shiftMeters: 309, excludedYears: [2026],
  before: { label: 'Before', years: [2015, 2019], collisionCount: 1, centroidLat: 47.6, centroidLng: -122.3 },
  after: { label: 'After', years: [2020, 2025], collisionCount: 1, centroidLat: 47.6, centroidLng: -122.3 },
}

describe('story observations', () => {
  const cards = storyObservations({ comparison: available, neighborhoods: [metrics('a', 'Alki', 40, 90), metrics('b', 'Belltown', 120, 300)], shift, startYear: 2015, endYear: 2026 })

  it('leads with the complete-year change as the one featured card', () => {
    expect(cards.map((card) => card.id)).toEqual(['trend', 'top-burden', 'shift'])
    expect(cards.filter((card) => card.featured).map((card) => card.id)).toEqual(['trend'])
    expect(cards[0]?.value).toBe('-20.0%')
    expect(cards[0]?.body).toContain('2015–2017 compared with 2023–2025')
  })

  it('names the neighborhood with the highest burden and links into the explorer', () => {
    expect(cards[1]?.value).toBe('Belltown')
    expect(cards[1]?.href).toBe('/neighborhoods?neighborhood=b&start=2015&end=2026')
  })

  it('names a single-year range once', () => {
    const [, top] = storyObservations({ comparison: available, neighborhoods: [metrics('a', 'Alki', 40, 90)], shift, startYear: 2024, endYear: 2024 })
    expect(top?.body).toMatch(/collisions, 2024\.$/)
  })

  it('never uses causal or risk language', () => {
    const text = cards.map((card) => `${card.label} ${card.value} ${card.body}`).join(' ').toLowerCase()
    expect(text).not.toMatch(/caus|because|risk|danger|safe|predict|likely|due to/)
  })

  it('falls back to the release message when complete years are insufficient', () => {
    const insufficient: TrendComparison = { status: 'insufficient_years', message: 'Needs six complete years.', firstPeriod: null, lastPeriod: null, collisionChangePercent: null, severityChangePercent: null }
    const [trend] = storyObservations({ comparison: insufficient, neighborhoods: [], shift, startYear: 2024, endYear: 2025 })
    expect(trend?.value).toBe('—')
    expect(trend?.body).toBe('Needs six complete years.')
  })
})
