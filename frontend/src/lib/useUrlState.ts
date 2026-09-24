import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

const MIN_YEAR = 2015
const MAX_YEAR = 2026

function toYear(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= MIN_YEAR && parsed <= MAX_YEAR ? parsed : fallback
}

export function useDashboardParams() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStart = toYear(searchParams.get('start'), MIN_YEAR)
  const rawEnd = toYear(searchParams.get('end'), MAX_YEAR)
  const startYear = Math.min(rawStart, rawEnd)
  const endYear = Math.max(rawStart, rawEnd)
  const neighborhood = searchParams.get('neighborhood')
  const mapMetric = searchParams.get('metric') ?? 'collisionCount'
  const trendGrain: 'annual' | 'monthly' = searchParams.get('grain') === 'monthly' ? 'monthly' : 'annual'
  const cityLayer: 'kde' | 'heatmap' = searchParams.get('layer') === 'kde' ? 'kde' : 'heatmap'
  const severities = useMemo(
    () => (searchParams.get('severity') ?? '').split(',').filter(Boolean),
    [searchParams],
  )

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
    setYears: (start: number, end: number) => update({ start, end }),
    setNeighborhood: (id: string | null) => update({ neighborhood: id }),
    setMapMetric: (metric: string) => update({ metric }),
    setTrendGrain: (grain: 'annual' | 'monthly') => update({ grain: grain === 'annual' ? null : grain }),
    setCityLayer: (layer: string) => update({ layer }),
    setSeverities: (values: string[]) => update({ severity: values.join(',') }),
  }
}
