import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { usePalette, useTheme } from '../lib/theme'
import { GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { DomEvent, geoJSON, type PathOptions } from 'leaflet'
import type { Feature } from 'geojson'
import type { NeighborhoodFeatureCollection, NeighborhoodMetricSet, NeighborhoodProperties } from '../lib/contracts'
import { RAMP_STEPS, rampStep, rampStepFloor, type MapMetric } from '../lib/mapMetrics'
import styles from './NeighborhoodMap.module.css'

const CENTER: [number, number] = [47.612, -122.334]

function metricNumber(metric: NeighborhoodMetricSet | undefined, key: MapMetric) {
  const value = metric?.[key]
  return typeof value === 'number' ? value : 0
}

function FitSelected({ collection, selectedIds, pulseKey }: { collection: NeighborhoodFeatureCollection; selectedIds: string[]; pulseKey: number }) {
  const map = useMap()
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  useLayoutEffect(() => {
    const features = collection.features.filter((item) => selectedIds.includes(item.properties.id))
    const selected = features.length > 0
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bounds = geoJSON(selected ? { type: 'FeatureCollection', features } : collection).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: selected ? 14 : 11, animate: selected && !reduceMotion })
  }, [collection, map, pulseKey, selectedIds])
  return null
}

function ResetMap({ collection }: { collection: NeighborhoodFeatureCollection }) {
  const map = useMap()
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (button.current) DomEvent.disableClickPropagation(button.current)
  }, [])
  return <button ref={button} className={styles.reset} type="button" onClick={() => {
    const bounds = geoJSON(collection).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11, animate: false })
  }}>Reset map</button>
}

function ClickResolver({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: ({ latlng }) => onClick(latlng.lat, latlng.lng) })
  return null
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
  const { resolvedTheme } = useTheme()
  const palette = usePalette(resolvedTheme, () => {
    const css = getComputedStyle(document.documentElement)
    const token = (name: string) => css.getPropertyValue(name).trim()
    return { ramp: Array.from({ length: RAMP_STEPS }, (_, step) => token(`--ramp-${step + 1}`)), accent: token('--accent'), edge: token('--paper') }
  })
  const byId = useMemo(() => new Map(metrics.map((metric) => [metric.id, metric])), [metrics])
  const maximum = Math.max(0, ...metrics.map((metric) => metricNumber(metric, metricKey)))
  const style = (feature?: Feature<GeoJSON.Geometry, NeighborhoodProperties>): PathOptions => {
    const id = feature?.properties.id ?? ''
    const selected = selectedIds.includes(id)
    return {
      color: selected ? palette.accent : palette.edge,
      weight: selected ? 3.5 : 0.8,
      fillColor: palette.ramp[rampStep(metricNumber(byId.get(id), metricKey), maximum)],
      fillOpacity: 0.82,
    }
  }
  return (
    <div className={styles.frame} aria-busy={busy}>
      <MapContainer className={styles.map} center={CENTER} zoom={11} zoomControl attributionControl aria-label="Interactive Seattle neighborhood collision map">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON
          key={geometryRevision}
          data={collection}
          style={style}
        />
        <ResetMap collection={collection}/>
        <ClickResolver onClick={onResolve}/>
        <FitSelected collection={collection} selectedIds={selectedIds} pulseKey={pulseKey}/>
      </MapContainer>
      <div className={styles.legend} role="img" aria-label={`Neighborhood map scale from 0 to ${maximum.toLocaleString()}, in ${RAMP_STEPS} steps from pale yellow to dark red`}>
        <span>0</span>
        <ol aria-hidden="true">{palette.ramp.map((color, step) => <li key={step} style={{ background: color }} title={`${rampStepFloor(step, maximum).toLocaleString()}+`}/>)}</ol>
        <span>{maximum.toLocaleString()} (highest)</span>
      </div>
      <div className={styles.hint}>{busy ? 'Finding neighborhood…' : 'Click neighborhoods to add or remove them, or search by name'}</div>
    </div>
  )
}
