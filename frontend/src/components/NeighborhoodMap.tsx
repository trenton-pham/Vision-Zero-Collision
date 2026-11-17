import { useEffect, useMemo, useRef } from 'react'
import type { ExpressionSpecification, GeoJSONSource, LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { NeighborhoodFeatureCollection, NeighborhoodMetricSet } from '../lib/contracts'
import { RAMP_STEPS, sqrtRampStep, sqrtRampStepFloor, type MapMetric } from '../lib/mapMetrics'
import { geometryBounds, rampFill } from '../lib/mapStyle'
import { useMapLibre } from './useMapLibre'
import styles from './NeighborhoodMap.module.css'

const SOURCE = 'neighborhoods'

function metricNumber(metric: NeighborhoodMetricSet | undefined, key: MapMetric) {
  const value = metric?.[key]
  return typeof value === 'number' ? value : 0
}

export function NeighborhoodMap({
  collection,
  metrics,
  metricKey,
  selectedIds,
  pulseKey,
  geometryRevision,
  onResolve,
  busy,
}: {
  collection: NeighborhoodFeatureCollection
  metrics: NeighborhoodMetricSet[]
  metricKey: MapMetric
  selectedIds: string[]
  pulseKey: number
  geometryRevision: number
  onResolve: (lat: number, lng: number) => void
  busy: boolean
}) {
  const cityBounds = useMemo(() => geometryBounds(collection.features.map((feature) => feature.geometry)) ?? undefined, [collection])
  const { containerRef, map, failed, idle, tokens } = useMapLibre('Interactive Seattle neighborhood collision map', cityBounds)
  const byId = useMemo(() => new Map(metrics.map((metric) => [metric.id, metric])), [metrics])
  const maximum = Math.max(0, ...metrics.map((metric) => metricNumber(metric, metricKey)))
  const resolveRef = useRef(onResolve)
  resolveRef.current = onResolve

  useEffect(() => {
    if (!map) return
    map.addSource(SOURCE, { type: 'geojson', data: collection, promoteId: 'id' })
    map.addLayer({ id: 'neighborhood-fill', type: 'fill', source: SOURCE, paint: { 'fill-opacity': 0.78 } }, 'place-label')
    map.addLayer({ id: 'neighborhood-edge', type: 'line', source: SOURCE, paint: { 'line-width': 0.8 } }, 'place-label')
    const selected: ExpressionSpecification = ['case', ['boolean', ['feature-state', 'selected'], false], 1, 0]
    map.addLayer({ id: 'neighborhood-selected-casing', type: 'line', source: SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-width': 6, 'line-opacity': selected } })
    map.addLayer({ id: 'neighborhood-selected', type: 'line', source: SOURCE, layout: { 'line-join': 'round' }, paint: { 'line-width': 3, 'line-opacity': selected } })
    const click = ({ lngLat }: { lngLat: { lat: number; lng: number } }) => resolveRef.current(lngLat.lat, lngLat.lng)
    map.on('click', click)
    return () => { map.off('click', click) }
  }, [map])

  useEffect(() => {
    if (!map) return
    map.setPaintProperty('neighborhood-fill', 'fill-color', rampFill(tokens))
    map.setPaintProperty('neighborhood-edge', 'line-color', tokens.paper)
    map.setPaintProperty('neighborhood-selected-casing', 'line-color', tokens.paper)
    map.setPaintProperty('neighborhood-selected', 'line-color', tokens.accent)
  }, [map, tokens])

  useEffect(() => {
    if (!map) return
    map.getSource<GeoJSONSource>(SOURCE)?.setData(collection)
  }, [map, collection, geometryRevision])

  useEffect(() => {
    if (!map) return
    for (const feature of collection.features) {
      const id = feature.properties.id
      map.setFeatureState({ source: SOURCE, id }, { step: sqrtRampStep(metricNumber(byId.get(id), metricKey), maximum), selected: selectedIds.includes(id) })
    }
  }, [map, collection, geometryRevision, byId, metricKey, maximum, selectedIds])

  function fit(bounds: LngLatBoundsLike | null | undefined, maxZoom: number, animate: boolean) {
    if (map && bounds) map.fitBounds(bounds, { padding: 24, maxZoom, animate })
  }

  useEffect(() => {
    const features = collection.features.filter((item) => selectedIds.includes(item.properties.id))
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (features.length) fit(geometryBounds(features.map((feature) => feature.geometry)), 14, !reduceMotion)
    else fit(cityBounds, 11, false)
  }, [map, collection, cityBounds, pulseKey, selectedIds])

  return (
    <div className={styles.frame} aria-busy={busy || (!failed && !idle)}>
      {failed
        ? <p className={styles.unavailable} role="note">Map unavailable in this browser. Use the neighborhood search to select areas.</p>
        : <div ref={containerRef} className={styles.map}/>}
      {!failed && <button className={styles.reset} type="button" onClick={() => fit(cityBounds, 11, false)}>Reset map</button>}
      <div className={styles.legend} role="img" aria-label={`Neighborhood map scale from 0 to ${maximum.toLocaleString()}, in ${RAMP_STEPS} steps from pale yellow to dark red`}>
        <span>0</span>
        <ol aria-hidden="true">{tokens.ramp.map((color, step) => <li key={step} style={{ background: color }} title={`${sqrtRampStepFloor(step, maximum).toLocaleString()}+`}/>)}</ol>
        <span>{maximum.toLocaleString()} (highest)</span>
      </div>
      {!failed && <div className={styles.hint}>{busy ? 'Finding neighborhood…' : 'Click neighborhoods to add or remove them, or search by name'}</div>}
    </div>
  )
}
