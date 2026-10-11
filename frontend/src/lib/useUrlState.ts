import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDatasetMeta } from './dataset'
import { isCitywideSeverity, type CitywideSeverity } from './severity'
import { parseMapMetric, type MapMetric } from './mapMetrics'

function toYear(value: string | null, fallback: number, minimum: number, maximum: number) {
  if (value === null || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
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
  const neighborhood = searchParams.get('neighborhood')
  const rawMetric = searchParams.get('metric')
  const mapMetric = parseMapMetric(rawMetric)
  const trendGrain: 'annual' | 'monthly' = searchParams.get('grain') === 'monthly' ? 'monthly' : 'annual'
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
    if (!invalidMetric && !invalidSeverity) return
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (invalidMetric) next.delete('metric')
      if (invalidSeverity) {
        if (canonicalSeverity) next.set('severity', canonicalSeverity)
        else next.delete('severity')
      }
      return next
    }, { replace: true })
  }, [rawMetric, mapMetric, rawSeverity, canonicalSeverity, setSearchParams])

  const update = useCallback(
    (changes: Record<string, string | number | null>) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        Object.entries(changes).forEach(([key, value]) => {
          if (value === null || value === '') next.delete(key)
          else next.set(key, String(value))
        })
        return next
      }, { replace: false })
    },
    [setSearchParams],
  )

  return {
    startYear,
    endYear,
    neighborhood,
    mapMetric,
    trendGrain,
    cityLayer,
    severities,
    minimumYear,
    maximumYear,
    setYears: (start: number, end: number) => update({ start, end }),
    setNeighborhood: (id: string | null) => update({ neighborhood: id }),
    setMapMetric: (metric: MapMetric) => update({ metric }),
    setTrendGrain: (grain: 'annual' | 'monthly') => update({ grain: grain === 'annual' ? null : grain }),
    setCityLayer: (layer: 'heatmap' | 'kde') => update({ layer }),
    setSeverities: (values: CitywideSeverity[]) => update({ severity: values.join(',') }),
  }
}
