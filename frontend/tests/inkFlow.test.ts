import { describe, expect, it } from 'vitest'
import type { KdeResponse } from '../src/lib/contracts'
import { inkFlow } from '../src/lib/inkFlow'

function grid(density: (row: number, column: number) => number, rows = 12, columns = 10): KdeResponse {
  const bounds: KdeResponse['bounds'] = [47.5, -122.4, 47.7, -122.2]
  const cells = Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns), column = index % columns
    return { lat: bounds[0] + row * (bounds[2] - bounds[0]) / (rows - 1), lng: bounds[1] + column * (bounds[3] - bounds[1]) / (columns - 1), density: density(row, column) }
  })
  return { cells, rows, columns, bounds, collisionCount: 100 }
}

const ringArea = (ring: [number, number][]) => Math.abs(ring.reduce((sum, [x, y], index) => {
  const [nx, ny] = ring[(index + 1) % ring.length] ?? [x, y]
  return sum + x * ny - nx * y
}, 0) / 2)

describe('ink flow', () => {
  it('draws nothing for an empty density field', () => {
    expect(inkFlow(grid(() => 0)).levels).toEqual([])
  })

  it('nests levels so each higher level covers less ground', () => {
    const peak = grid((row, column) => Math.exp(-((row - 6) ** 2 + (column - 4) ** 2) / 6))
    const areas = inkFlow(peak, 8).levels.map((level) => level.rings.reduce((sum, polygon) => sum + ringArea(polygon[0] ?? []), 0))
    expect(areas.length).toBeGreaterThan(3)
    areas.slice(1).forEach((area, index) => expect(area).toBeLessThanOrEqual((areas[index] ?? 0) + 1e-12))
  })

  it('places the top level over the densest cell in longitude and latitude', () => {
    const peak = grid((row, column) => Math.exp(-((row - 8) ** 2 + (column - 2) ** 2) / 4))
    const flow = inkFlow(peak, 10)
    const top = flow.levels.at(-1)?.rings.flat(2) ?? []
    const lngs = top.map(([lng]) => lng), lats = top.map(([, lat]) => lat)
    const densest = peak.cells[8 * 10 + 2]
    expect(Math.min(...lngs)).toBeLessThan(densest?.lng ?? 0)
    expect(Math.max(...lngs)).toBeGreaterThan(densest?.lng ?? 0)
    expect(Math.min(...lats)).toBeLessThan(densest?.lat ?? 0)
    expect(Math.max(...lats)).toBeGreaterThan(densest?.lat ?? 0)
  })
})
