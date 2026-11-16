import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDatasetMeta } from './dataset'
import { isCitywideSeverity, type CitywideSeverity } from './severity'
import { parseMapMetric, type MapMetric } from './mapMetrics'
import { snapshotMotion } from './motion'
import type { TrendGrain } from './contracts'
import { trendMonthRange, type MonthRange } from './trendRange'

function toYear(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}

function chartBounds(startYear: number, endYear: number, coverageMonth: string): MonthRange {
  const through = `${endYear}-12`
  return { from: `${startYear}-01`, through: coverageMonth < through ? coverageMonth : through }
}

function chartRangeParams(range: MonthRange, bounds: MonthRange) {
  const full = range.from === bounds.from && range.through === bounds.through
  return { trendFrom: full ? null : range.from, trendThrough: full ? null : range.through }
}

export function useDashboardParams() {
  const meta = useDatasetMeta()
  const minimumYear = Math.min(...meta.availableYears)
  const maximumYear = Math.max(...meta.availableYears)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStart = toYear(searchParams.get('start'), minimumYear, minimumYear, maximumYear)
  const rawEnd = toYear(searchParams.get('end'), maximumYear, minimumYear, maximumYear)
  const startYear = Math.min(rawStart, rawEnd)
  const endYear = Math.max(rawStart, rawEnd)
  const coverageMonth = meta.dataAsOf.slice(0, 7)
  const trendBounds = chartBounds(startYear, endYear, coverageMonth)
  const trendFrom = searchParams.get('trendFrom')
  const trendThrough = searchParams.get('trendThrough')
  const trendRange = trendMonthRange(trendFrom, trendThrough, trendBounds)
  const rawNeighborhoods = JSON.stringify(searchParams.getAll('neighborhood'))
  const neighborhoods = useMemo(() => [...new Set(searchParams.getAll('neighborhood'))].filter(Boolean).sort(), [rawNeighborhoods])
  const canonicalNeighborhoods = JSON.stringify(neighborhoods)
  const rawMetric = searchParams.get('metric')
  const mapMetric = parseMapMetric(rawMetric)
  const rawGrain = searchParams.get('grain')
  const trendGrain: TrendGrain = rawGrain === 'monthly' || rawGrain === 'weekly' ? rawGrain : 'annual'
  const cityLayer: 'kde' | 'heatmap' = searchParams.get('layer') === 'kde' ? 'kde' : 'heatmap'
  const rawSeverity = searchParams.get('severity')
  const severities = useMemo(
    () => [...new Set((rawSeverity ?? '').split(',').filter(isCitywideSeverity))],
    [rawSeverity],
  )
  const canonicalSeverity = severities.join(',')

  useEffect(() => {
    const invalidMetric = rawMetric !== null && rawMetric !== mapMetric
    const invalidSeverity = rawSeverity !== null && rawSeverity !== canonicalSeverity
    const invalidNeighborhoods = rawNeighborhoods !== canonicalNeighborhoods
    if (!invalidMetric && !invalidSeverity && !invalidNeighborhoods) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (invalidNeighborhoods) {
        next.delete('neighborhood')
        neighborhoods.forEach((id) => next.append('neighborhood', id))
      }
      if (invalidMetric) next.delete('metric')
      if (invalidSeverity) {
        if (canonicalSeverity) next.set('severity', canonicalSeverity)
        else next.delete('severity')
      }
      return next
    }, { replace: true })
  }, [rawMetric, mapMetric, rawSeverity, canonicalSeverity, rawNeighborhoods, canonicalNeighborhoods, neighborhoods, setSearchParams])

  const update = useCallback(
    (changes: Record<string, string | number | null>, motion = snapshotMotion()) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        Object.entries(changes).forEach(([key, value]) => {
          if (value === null || value === '') next.delete(key)
          else next.set(key, String(value))
        })
        return next
      }, { replace: false, state: { dashboardMotion: motion } })
    },
    [setSearchParams],
  )

  return {
    startYear,
    endYear,
    neighborhoods,
    mapMetric,
    trendGrain,
    trendBounds,
    trendRange,
    cityLayer,
    severities,
    minimumYear,
    maximumYear,
    setYears: (start: number, end: number) => {
      const bounds = chartBounds(Math.min(start, end), Math.max(start, end), coverageMonth)
      const range = trendMonthRange(trendFrom, trendThrough, bounds)
      update({ start, end, ...chartRangeParams(range, bounds) })
    },
    setNeighborhoods: (ids: string[], motion = snapshotMotion(), { replace = false, search }: { replace?: boolean; search?: string } = {}) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(search ?? current)
        next.delete('neighborhood')
        const selected = [...new Set(ids)].filter(Boolean).sort()
        selected.forEach((id) => next.append('neighborhood', id))
        return next
      }, { replace, state: { dashboardMotion: motion } })
    },
    setMapMetric: (metric: MapMetric) => update({ metric }),
    setTrendGrain: (grain: TrendGrain) => update({ grain: grain === 'annual' ? null : grain }),
    setTrendRange: ({ from, through }: MonthRange) => {
      if (from === trendRange.from && through === trendRange.through) return
      update(chartRangeParams({ from, through }, trendBounds))
    },
    setCityLayer: (layer: 'heatmap' | 'kde') => update({ layer }),
    setSeverities: (values: CitywideSeverity[]) => update({ severity: values.join(',') }),
  }
}
