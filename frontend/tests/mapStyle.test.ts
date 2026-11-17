import { describe, expect, it } from 'vitest'
import { basemapLayers, geometryBounds, rampFill, type MapTokens } from '../src/lib/mapStyle'

const tokens = (prefix: string): MapTokens => ({
  paper: `${prefix}-paper`, sunk: `${prefix}-sunk`, surface: `${prefix}-surface`, rule: `${prefix}-rule`, ruleStrong: `${prefix}-rule-strong`, ink: `${prefix}-ink`,
  ink2: `${prefix}-ink-2`, ink3: `${prefix}-ink-3`, accent: `${prefix}-accent`, ramp: [1, 2, 3, 4, 5, 6].map((step) => `${prefix}-ramp-${step}`),
})

describe('map style', () => {
  it('repaints the same basemap layers for paper and ink', () => {
    const paper = basemapLayers(tokens('paper'))
    const ink = basemapLayers(tokens('ink'))
    expect(ink.map((layer) => layer.id)).toEqual(paper.map((layer) => layer.id))
    expect(JSON.stringify(ink)).not.toContain('paper-')
  })

  it('maps each ramp step held in feature state to its ramp color', () => {
    expect(rampFill(tokens('t'))).toEqual(['step', ['coalesce', ['feature-state', 'step'], 0], 't-ramp-1', 1, 't-ramp-2', 2, 't-ramp-3', 3, 't-ramp-4', 4, 't-ramp-5', 5, 't-ramp-6'])
  })

  it('bounds polygons and multipolygons together', () => {
    expect(geometryBounds([
      { type: 'Polygon', coordinates: [[[-122.4, 47.6], [-122.3, 47.6], [-122.3, 47.7], [-122.4, 47.6]]] },
      { type: 'MultiPolygon', coordinates: [[[[-122.5, 47.5], [-122.45, 47.55], [-122.5, 47.5]]]] },
    ])).toEqual([[-122.5, 47.5], [-122.3, 47.7]])
    expect(geometryBounds([])).toBeNull()
  })
})
