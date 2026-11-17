import { contours } from 'd3-contour'
import type { KdeResponse } from './contracts'

type InkLevel = { fraction: number; rings: [number, number][][][] }
export type InkFlow = { levels: InkLevel[]; bounds: { west: number; south: number; east: number; north: number } }

const UPSAMPLE = 4
const BLUR_RADIUS = 6

function upsample(kde: KdeResponse) {
  const { rows, columns } = kde
  const width = (columns - 1) * UPSAMPLE + 1
  const height = (rows - 1) * UPSAMPLE + 1
  const grid = new Float64Array(width * height)
  const at = (row: number, column: number) => kde.cells[row * columns + column]?.density ?? 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx = x / UPSAMPLE, gy = y / UPSAMPLE
      const x0 = Math.floor(gx), y0 = Math.floor(gy)
      const x1 = Math.min(columns - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1)
      const fx = gx - x0, fy = gy - y0
      grid[y * width + x] = (at(y0, x0) * (1 - fx) + at(y0, x1) * fx) * (1 - fy) + (at(y1, x0) * (1 - fx) + at(y1, x1) * fx) * fy
    }
  }
  return { grid, width, height }
}

// The 42-cell KDE grid shows its cells in raw contours; a separable Gaussian pass turns them into continuous strokes.
function blur(source: Float64Array, width: number, height: number) {
  const sigma = BLUR_RADIUS / 2
  const kernel = Array.from({ length: BLUR_RADIUS * 2 + 1 }, (_, index) => Math.exp(-((index - BLUR_RADIUS) ** 2) / (2 * sigma * sigma)))
  const total = kernel.reduce((sum, weight) => sum + weight, 0)
  const pass = (input: Float64Array, horizontal: boolean) => {
    const output = new Float64Array(input.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let value = 0
        kernel.forEach((weight, index) => {
          const offset = index - BLUR_RADIUS
          const sx = horizontal ? Math.min(width - 1, Math.max(0, x + offset)) : x
          const sy = horizontal ? y : Math.min(height - 1, Math.max(0, y + offset))
          value += weight * (input[sy * width + sx] ?? 0)
        })
        output[y * width + x] = value / total
      }
    }
    return output
  }
  return pass(pass(source, true), false)
}

export function inkFlow(kde: KdeResponse, levelCount = 20): InkFlow {
  const [south, west, north, east] = kde.bounds
  const bounds = { west, south, east, north }
  if (kde.rows < 2 || kde.columns < 2) return { levels: [], bounds }
  const { grid, width, height } = upsample(kde)
  const smooth = blur(grid, width, height)
  let maximum = 0
  for (const value of smooth) maximum = Math.max(maximum, value)
  if (maximum <= 0) return { levels: [], bounds }
  // The lowest ring starts at 7% of the peak so smoothing halos never spill past the city's edge onto water.
  const thresholds = Array.from({ length: levelCount }, (_, index) => maximum * (0.07 + 0.93 * ((index + 1) / (levelCount + 1)) ** 1.25))
  const toLngLat = ([x, y]: number[]): [number, number] => [
    west + ((x ?? 0) - 0.5) / (width - 1) * (east - west),
    south + ((y ?? 0) - 0.5) / (height - 1) * (north - south),
  ]
  const levels = contours().size([width, height]).thresholds(thresholds)(Array.from(smooth))
    .map((multi, index) => ({ fraction: (index + 1) / levelCount, rings: multi.coordinates.map((polygon) => polygon.map((ring) => ring.map(toLngLat))) }))
    .filter((level) => level.rings.length > 0)
  return { levels, bounds }
}

export const inkStroke = (fraction: number) => ({ width: 0.35 + 1.4 * fraction ** 1.6, opacity: 0.18 + 0.72 * fraction })
