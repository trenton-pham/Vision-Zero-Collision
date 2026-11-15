import type { AnnualMetric, DatasetMeta, MonthlyMetric, NeighborhoodMonth, NeighborhoodSeries, NeighborhoodMetricSet, TrendComparison } from './contracts'

type Counts = Omit<NeighborhoodMonth, 'period'>
const countKeys = ['collisionCount', 'injuries', 'seriousInjuries', 'fatalities', 'totalSeverity', 'pedestrianCollisions', 'intersectionCollisions', 'nightCollisions', 'weekendCollisions'] as const

function emptyCounts(): Counts {
  return { collisionCount: 0, injuries: 0, seriousInjuries: 0, fatalities: 0, totalSeverity: 0, pedestrianCollisions: 0, intersectionCollisions: 0, nightCollisions: 0, weekendCollisions: 0, knownTimeCollisions: 0 }
}

function add(target: Counts, source: Counts) {
  countKeys.forEach((key) => { target[key] += source[key] })
  target.knownTimeCollisions = target.knownTimeCollisions === null || source.knownTimeCollisions === null ? null : target.knownTimeCollisions + source.knownTimeCollisions
}

function round(value: number, digits: number) {
  const scale = 10 ** digits
  const scaled = value * scale
  if (Math.abs(scaled % 1) === 0.5 && Number.isInteger(value * 2 ** (digits + 1))) {
    const lower = Math.floor(scaled)
    return (lower + Math.abs(lower % 2)) / scale
  }
  return Number(value.toFixed(digits))
}

function ratio(numerator: number, denominator: number, digits: number) {
  return denominator ? round(numerator / denominator, digits) : null
}

function trendMetrics(counts: Counts) {
  return {
    collisionCount: counts.collisionCount, injuries: counts.injuries, seriousInjuries: counts.seriousInjuries,
    fatalities: counts.fatalities, totalSeverity: counts.totalSeverity,
    meanSeverity: ratio(counts.totalSeverity, counts.collisionCount, 3),
  }
}

function comparison(annual: AnnualMetric[]): TrendComparison {
  const complete = annual.filter((row) => !row.isPartial)
  if (complete.length < 6) return {
    status: 'insufficient_years', firstPeriod: null, lastPeriod: null,
    collisionChangePercent: null, severityChangePercent: null,
    message: 'At least six complete years are required for non-overlapping three-year comparison periods.',
  }
  const first = complete.slice(0, 3)
  const last = complete.slice(-3)
  const average = (rows: AnnualMetric[], key: 'collisionCount' | 'totalSeverity') => rows.reduce((sum, row) => sum + row[key], 0) / rows.length
  const period = (rows: AnnualMetric[]) => ({ years: rows.map((row) => row.year), averageCollisions: round(average(rows, 'collisionCount'), 1), averageSeverityBurden: round(average(rows, 'totalSeverity'), 1) })
  const change = (key: 'collisionCount' | 'totalSeverity') => {
    const baseline = average(first, key)
    return baseline ? round((average(last, key) - baseline) / baseline * 100, 1) : null
  }
  return { status: 'available', firstPeriod: period(first), lastPeriod: period(last), collisionChangePercent: change('collisionCount'), severityChangePercent: change('totalSeverity'), message: 'Compares non-overlapping first and last three-year averages, excluding partial years.' }
}

export function combineNeighborhoods(series: NeighborhoodSeries, ids: string[], startYear: number, endYear: number, meta: DatasetMeta) {
  const months = new Map<string, Counts>()
  for (const id of new Set(ids)) {
    const neighborhood = series.neighborhoods[id]
    if (!neighborhood) throw new Error('Statistics are unavailable for a selected neighborhood.')
    for (const row of neighborhood.monthly) {
      const year = Number(row.period.slice(0, 4))
      if (year < startYear || year > endYear) continue
      const counts = months.get(row.period) ?? emptyCounts()
      add(counts, row)
      months.set(row.period, counts)
    }
  }
  const totals = emptyCounts()
  const years = new Map<number, Counts>()
  const monthly: MonthlyMetric[] = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([period, counts]) => {
    const year = Number(period.slice(0, 4))
    const annual = years.get(year) ?? emptyCounts()
    add(annual, counts)
    years.set(year, annual)
    add(totals, counts)
    return { period, year, month: Number(period.slice(5)), ...trendMetrics(counts), isPartial: meta.partialYears.includes(year) }
  })
  const annual = [...years].map(([year, counts]) => ({ year, ...trendMetrics(counts), isPartial: meta.partialYears.includes(year) }))
  const metrics: NeighborhoodMetricSet = {
    id: 'selection', name: `${new Set(ids).size} neighborhoods combined`, ...trendMetrics(totals),
    pedestrianCollisions: totals.pedestrianCollisions,
    intersectionShare: ratio(totals.intersectionCollisions, totals.collisionCount, 4),
    nightShare: totals.knownTimeCollisions === null ? null : ratio(totals.nightCollisions, totals.knownTimeCollisions, 4),
    weekendShare: ratio(totals.weekendCollisions, totals.collisionCount, 4),
  }
  const received = new Date(`${meta.dataAsOf}T00:00:00Z`)
  const month = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(received)
  const warnings = meta.partialYears.some((year) => year >= startYear && year <= endYear)
    ? [`${received.getUTCFullYear()} partial · records received through ${month} ${received.getUTCDate()}, ${received.getUTCFullYear()}`] : []
  return { selectedYears: [startYear, endYear], metrics, annual, monthly, comparison: comparison(annual), warnings }
}
