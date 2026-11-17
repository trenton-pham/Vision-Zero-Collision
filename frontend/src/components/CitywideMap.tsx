import { useEffect, useMemo } from 'react'
import type { ExpressionSpecification, GeoJSONSource } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { DowntownComparisonResponse, HeatmapResponse, KdeResponse, SpatialShiftResponse } from '../lib/contracts'
import { useMapLibre } from './useMapLibre'
import styles from './CitywideMap.module.css'

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
const points = (rows: { lat: number; lng: number; value: number }[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: rows.map(({ lat, lng, value }) => ({ type: 'Feature', properties: { value }, geometry: { type: 'Point', coordinates: [lng, lat] } })),
})

export function CitywideMap({
  layer,
  heatmap,
  kde,
  shift,
  downtown,
}: {
  layer: 'heatmap' | 'kde'
  heatmap?: HeatmapResponse
  kde?: KdeResponse
  shift?: SpatialShiftResponse
  downtown?: DowntownComparisonResponse
}) {
  const { containerRef, map, failed, idle, tokens } = useMapLibre('Citywide collision density map')
  const lowColor = tokens.ramp[1] ?? tokens.ink3
  const highColor = tokens.ramp[4] ?? tokens.ink2
  const shiftPoints = shift?.status === 'available'
    ? [[shift.before.centroidLng, shift.before.centroidLat], [shift.after.centroidLng, shift.after.centroidLat]]
    : null
  const bbox = downtown?.bbox

  const data = useMemo(() => ({
    heatmap: heatmap ? points(heatmap.points.map((point) => ({ ...point, value: point.weight / Math.max(1, heatmap.maxWeight) }))) : empty,
    kde: kde ? points(kde.cells.filter((cell) => cell.density > .06).map((cell) => ({ ...cell, value: cell.density }))) : empty,
    downtown: bbox ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[bbox.xMin, bbox.yMin], [bbox.xMax, bbox.yMin], [bbox.xMax, bbox.yMax], [bbox.xMin, bbox.yMax], [bbox.xMin, bbox.yMin]]] } }] } as FeatureCollection : empty,
    shift: shiftPoints ? { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { role: 'path' }, geometry: { type: 'LineString', coordinates: shiftPoints } },
      { type: 'Feature', properties: { role: 'before' }, geometry: { type: 'Point', coordinates: shiftPoints[0] } },
      { type: 'Feature', properties: { role: 'after' }, geometry: { type: 'Point', coordinates: shiftPoints[1] } },
    ] } as FeatureCollection : empty,
  }), [heatmap, kde, bbox, shift])

  useEffect(() => {
    if (!map) return
    for (const id of ['heatmap', 'kde', 'downtown', 'shift']) map.addSource(id, { type: 'geojson', data: empty })
    const value: ExpressionSpecification = ['get', 'value']
    map.addLayer({ id: 'heatmap', type: 'circle', source: 'heatmap', paint: { 'circle-radius': ['+', 2, ['*', ['sqrt', value], 14]], 'circle-opacity': ['+', .16, ['*', value, .6]] } }, 'place-label')
    map.addLayer({ id: 'kde', type: 'circle', source: 'kde', paint: { 'circle-radius': ['+', 2.5, ['*', value, 6]], 'circle-opacity': ['+', .06, ['*', value, .5]] } }, 'place-label')
    map.addLayer({ id: 'downtown', type: 'line', source: 'downtown', paint: { 'line-width': 1.5, 'line-dasharray': [3, 2] } })
    map.addLayer({ id: 'shift-path', type: 'line', source: 'shift', filter: ['==', ['get', 'role'], 'path'], paint: { 'line-width': 2, 'line-dasharray': [2, 2] } })
    map.addLayer({ id: 'shift-points', type: 'circle', source: 'shift', filter: ['!=', ['get', 'role'], 'path'], paint: { 'circle-radius': ['match', ['get', 'role'], 'after', 6, 5] } })
  }, [map])

  useEffect(() => {
    if (!map) return
    map.setPaintProperty('heatmap', 'circle-color', ['case', ['>', ['get', 'value'], .55], highColor, lowColor])
    map.setPaintProperty('kde', 'circle-color', ['case', ['>', ['get', 'value'], .6], highColor, lowColor])
    map.setPaintProperty('downtown', 'line-color', tokens.ink2)
    map.setPaintProperty('shift-path', 'line-color', tokens.accent)
    map.setPaintProperty('shift-points', 'circle-color', ['match', ['get', 'role'], 'after', tokens.accent, tokens.ink3])
  }, [map, tokens, lowColor, highColor])

  useEffect(() => {
    if (!map) return
    for (const [id, collection] of Object.entries(data)) map.getSource<GeoJSONSource>(id)?.setData(collection)
  }, [map, data])

  useEffect(() => {
    if (!map) return
    map.setLayoutProperty('heatmap', 'visibility', layer === 'heatmap' ? 'visible' : 'none')
    map.setLayoutProperty('kde', 'visibility', layer === 'kde' ? 'visible' : 'none')
  }, [map, layer])

  return (
    <div className={styles.frame} aria-busy={!failed && !idle}>
      {failed
        ? <p className={styles.unavailable} role="note">Map unavailable in this browser. The summary and charts still follow the selected filters.</p>
        : <div ref={containerRef} className={styles.map}/>}
      <div className={styles.legend}>
        <strong>{layer === 'heatmap' ? 'Collisions per grid cell' : 'Relative smoothed density (KDE)'}</strong>
        {(layer === 'kde' || (heatmap?.maxWeight ?? 0) > 0) && <>
          <span><i style={{ background: lowColor }}/>{layer === 'heatmap' ? `≤${Math.floor((heatmap?.maxWeight ?? 0) * .55)} collisions` : '0.06–0.60'}</span>
          <span><i style={{ background: highColor }}/>{layer === 'heatmap' ? `${Math.floor((heatmap?.maxWeight ?? 0) * .55) + 1}–${heatmap?.maxWeight ?? 0} collisions` : '>0.60–1.00'}</span>
        </>}
        {bbox && <span className={styles.annotation}><i className={styles.outline} style={{ borderColor: tokens.ink2 }}/>Downtown boundary</span>}
        {shiftPoints && shift?.status === 'available' && <>
          <span className={styles.annotation}><i className={styles.centroid} style={{ background: tokens.ink3 }}/>{shift.before.label} center</span>
          <span className={styles.annotation}><i className={styles.centroid} style={{ background: tokens.accent }}/>{shift.after.label} center</span>
        </>}
      </div>
    </div>
  )
}
