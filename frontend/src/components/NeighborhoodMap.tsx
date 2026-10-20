import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTheme } from '../lib/theme'
import { GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { DomEvent, geoJSON, type PathOptions } from 'leaflet'
import type { Feature } from 'geojson'
import type { NeighborhoodFeatureCollection, NeighborhoodMetricSet, NeighborhoodProperties } from '../lib/contracts'
import type { MapMetric } from '../lib/mapMetrics'
import styles from './NeighborhoodMap.module.css'

const CENTER: [number, number] = [47.612, -122.334]

function metricNumber(metric: NeighborhoodMetricSet | undefined, key: MapMetric) {
  const value = metric?.[key]
  return typeof value === 'number' ? value : 0
}

function FitSelected({ collection, selectedId, pulseKey }: { collection: NeighborhoodFeatureCollection; selectedId: string | null; pulseKey: number }) {
  const map = useMap()
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  useLayoutEffect(() => {
    const feature = collection.features.find((item) => item.properties.id === selectedId)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bounds = geoJSON(feature ?? collection).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: feature ? 14 : 11, animate: Boolean(feature) && !reduceMotion })
  }, [collection, map, pulseKey, selectedId])
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
  selectedId,
  pulseKey,
  geometryRevision,
  onResolve,
  busy,
}: {
  collection: NeighborhoodFeatureCollection
  metrics: NeighborhoodMetricSet[]
  metricKey: MapMetric
  selectedId: string | null
  pulseKey: number
  geometryRevision: number
  onResolve: (lat: number, lng: number) => void
  busy: boolean
}) {
  const { resolvedTheme } = useTheme()
  const light = resolvedTheme === 'light'
  const byId = useMemo(() => new Map(metrics.map((metric) => [metric.id, metric])), [metrics])
  const maximum = Math.max(0, ...metrics.map((metric) => metricNumber(metric, metricKey)))
  const style = (feature?: Feature<GeoJSON.Geometry, NeighborhoodProperties>): PathOptions => {
    const id = feature?.properties.id ?? ''
    const selected = id === selectedId
    const ratio = Math.sqrt(metricNumber(byId.get(id), metricKey) / Math.max(1, maximum))
    return {
      color: selected ? (light ? '#1463c9' : '#2f84ff') : (light ? '#526779' : '#66839e'),
      weight: selected ? 3 : 1,
      fillColor: selected ? (light ? '#1463c9' : '#155ec6') : light
        ? `rgb(${218 - Math.round(137 * ratio)}, ${232 - Math.round(96 * ratio)}, ${242 - Math.round(43 * ratio)})`
        : `rgb(${10 + Math.round(12 * ratio)}, ${39 + Math.round(57 * ratio)}, ${60 + Math.round(102 * ratio)})`,
      fillOpacity: selected ? 0.72 : 0.6,
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
        <FitSelected collection={collection} selectedId={selectedId} pulseKey={pulseKey}/>
      </MapContainer>
      <div className={styles.legend} aria-label="Neighborhood map scale"><span>0</span><i/><span>{maximum.toLocaleString()} (highest)</span></div>
      <div className={styles.hint}>{busy ? 'Finding neighborhood…' : 'Choose a neighborhood on the map or search by name'}</div>
    </div>
  )
}
