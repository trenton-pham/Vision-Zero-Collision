import type { ExpressionSpecification, LngLatBoundsLike, StyleSpecification } from 'maplibre-gl'
import type { Geometry } from 'geojson'
import { RAMP_STEPS } from './mapMetrics'

export type MapTokens = {
  paper: string
  sunk: string
  surface: string
  rule: string
  ruleStrong: string
  ink: string
  ink2: string
  ink3: string
  accent: string
  ramp: string[]
}

export function readMapTokens(): MapTokens {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string) => css.getPropertyValue(name).trim()
  return {
    paper: token('--paper'),
    sunk: token('--sunk'),
    surface: token('--surface'),
    rule: token('--rule'),
    ruleStrong: token('--rule-strong'),
    ink: token('--ink'),
    ink2: token('--ink-2'),
    ink3: token('--ink-3'),
    accent: token('--accent'),
    ramp: Array.from({ length: RAMP_STEPS }, (_, step) => token(`--ramp-${step + 1}`)),
  }
}

export const SEATTLE_BOUNDS: LngLatBoundsLike = [[-122.436, 47.495], [-122.235, 47.735]]
const MAP_ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'

const LABEL_FONT = ['Noto Sans Regular']

// Basemap paint is a pure function of the tokens so a theme change repaints the same layer IDs in place.
export function basemapLayers(tokens: MapTokens): StyleSpecification['layers'] {
  return [
    { id: 'background', type: 'background', paint: { 'background-color': tokens.paper } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': tokens.sunk } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': tokens.rule } },
    {
      id: 'road-minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary']]],
      paint: { 'line-color': tokens.rule, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 2] },
    },
    {
      id: 'road-major', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      paint: { 'line-color': tokens.ruleStrong, 'line-opacity': 0.55, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3] },
    },
    {
      id: 'place-label', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'suburb', 'neighbourhood']]],
      layout: { 'text-field': ['get', 'name'], 'text-font': LABEL_FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 13] },
      paint: { 'text-color': tokens.ink3, 'text-halo-color': tokens.paper, 'text-halo-width': 1.2 },
    },
  ]
}

export function basemapStyle(tokens: MapTokens): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: MAP_ATTRIBUTION } },
    layers: basemapLayers(tokens),
  }
}

export function rampFill(tokens: MapTokens): ExpressionSpecification {
  return ['step', ['coalesce', ['feature-state', 'step'], 0], tokens.ramp[0], ...tokens.ramp.slice(1).flatMap((color, index) => [index + 1, color])] as ExpressionSpecification
}

export function geometryBounds(geometries: Geometry[]): LngLatBoundsLike | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      west = Math.min(west, value[0]); east = Math.max(east, value[0])
      south = Math.min(south, value[1]); north = Math.max(north, value[1])
      return
    }
    value.forEach(visit)
  }
  geometries.forEach((geometry) => { if ('coordinates' in geometry) visit(geometry.coordinates) })
  return Number.isFinite(west) ? [[west, south], [east, north]] : null
}
