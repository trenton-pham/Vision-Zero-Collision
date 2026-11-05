import pointInPolygon from 'point-in-polygon-hao'
import proj4 from 'proj4'
import type { ResolveResponse, ResolverBundle } from './contracts'

type Geometry = ResolverBundle['features'][number]['geometry']

function contains(point: number[], geometry: Geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let boundary = false
  for (const polygon of polygons) {
    const result = pointInPolygon(point, polygon)
    if (result === true) return true
    if (result === 0) boundary = true
  }
  return boundary ? 0 : false
}

function distance(point: [number, number], geometry: Geometry) {
  if (contains(point, geometry) !== false) return 0
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  let minimumSquared = Infinity
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        const start = ring[index - 1]
        const end = ring[index]
        if (!start || !end) continue
        const dx = end[0] - start[0]
        const dy = end[1] - start[1]
        const lengthSquared = dx * dx + dy * dy
        const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared)) : 0
        minimumSquared = Math.min(minimumSquared, (point[0] - start[0] - t * dx) ** 2 + (point[1] - start[1] - t * dy) ** 2)
      }
    }
  }
  return Math.sqrt(minimumSquared)
}

export function resolveNeighborhood(bundle: ResolverBundle, lat: number, lng: number): ResolveResponse {
  const features = [...bundle.features].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const boundaries: typeof features = []
  for (const feature of features) {
    const result = contains([lng, lat], feature.geometry)
    if (result === true) return { id: feature.id, name: feature.name, method: 'contains', distanceMeters: 0 }
    if (result === 0) boundaries.push(feature)
  }
  const boundary = boundaries.sort((a, b) => a.area - b.area)[0]
  if (boundary) return { id: boundary.id, name: boundary.name, method: 'boundary', distanceMeters: 0 }
  const projected = proj4('EPSG:4326', bundle.projection, { x: lng, y: lat })
  let nearest: typeof features[number] | undefined
  let minimum = Infinity
  for (const feature of features) {
    const meters = distance([projected.x, projected.y], feature.projectedGeometry)
    if (meters < minimum) { minimum = meters; nearest = feature }
  }
  const distanceMeters = Number.isFinite(minimum) ? Math.round(minimum * 100) / 100 : null
  return minimum <= 25 && nearest
    ? { id: nearest.id, name: nearest.name, method: 'nearest', distanceMeters }
    : { id: null, name: null, method: 'unassigned', distanceMeters }
}
