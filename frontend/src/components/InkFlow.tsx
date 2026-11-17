import { useMemo } from 'react'
import type { KdeResponse } from '../lib/contracts'
import { inkFlow, inkStroke } from '../lib/inkFlow'

const VIEW_WIDTH = 1000

export function InkFlow({ kde, label, className, levels = 20, weight = 1 }: { kde: KdeResponse; label?: string; className?: string; levels?: number; weight?: number }) {
  const { paths, height } = useMemo(() => {
    const flow = inkFlow(kde, levels)
    const { west, south, east, north } = flow.bounds
    const scaleX = Math.cos(((south + north) / 2) * Math.PI / 180)
    const height = Math.round(VIEW_WIDTH * (north - south) / ((east - west) * scaleX))
    const point = ([lng, lat]: [number, number]) => `${((lng - west) / (east - west) * VIEW_WIDTH).toFixed(1)} ${((north - lat) / (north - south) * height).toFixed(1)}`
    const paths = flow.levels.map((level, index) => ({
      key: index,
      top: index === flow.levels.length - 1,
      d: level.rings.map((polygon) => polygon.map((ring) => `M${ring.map(point).join('L')}Z`).join('')).join(''),
      ...inkStroke(level.fraction),
    }))
    return { paths, height }
  }, [kde, levels])
  return (
    <svg className={className} viewBox={`0 0 ${VIEW_WIDTH} ${height}`} preserveAspectRatio="xMidYMid meet" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {paths.map(({ key, top, d, width, opacity }) => (
        <path key={key} d={d} fill={top ? 'currentColor' : 'none'} fillOpacity={top ? 0.9 : 0} stroke="currentColor" strokeWidth={width * 2 * weight} strokeOpacity={opacity} strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      ))}
    </svg>
  )
}
