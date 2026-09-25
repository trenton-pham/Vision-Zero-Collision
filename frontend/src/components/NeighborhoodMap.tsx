import { useEffect, useMemo } from 'react'
import { GeoJSON, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { geoJSON, type LeafletMouseEvent, type PathOptions } from 'leaflet'
import type { Feature } from 'geojson'
import type { NeighborhoodFeatureCollection, NeighborhoodMetricSet, NeighborhoodProperties } from '../lib/contracts'
import styles from './NeighborhoodMap.module.css'

const CENTER: [number, number] = [47.612, -122.334]

function metricNumber(metric: NeighborhoodMetricSet | undefined, key: string) {
  const value = metric?.[key as keyof NeighborhoodMetricSet]
  return typeof value === 'number' ? value : 0
}

function FitSelected({ collection, selectedId, pulseKey }: { collection: NeighborhoodFeatureCollection; selectedId: string | null; pulseKey: number }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedId) return
    const feature = collection.features.find((item) => item.properties.id === selectedId)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (feature) map.fitBounds(geoJSON(feature).getBounds(), { padding: [42, 42], maxZoom: 14, animate: !reduceMotion })
  }, [collection, map, pulseKey, selectedId])
  return null
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
  onResolve,
  busy,
}: {
  collection: NeighborhoodFeatureCollection
  metrics: NeighborhoodMetricSet[]
  metricKey: string
  selectedId: string | null
  pulseKey: number
  onResolve: (lat: number, lng: number) => void
  busy: boolean
}) {
  const byId = useMemo(() => new Map(metrics.map((metric) => [metric.id, metric])), [metrics])
  const maximum = Math.max(1, ...metrics.map((metric) => metricNumber(metric, metricKey)))
  const style = (feature?: Feature<GeoJSON.Geometry, NeighborhoodProperties>): PathOptions => {
    const id = feature?.properties.id ?? ''
    const selected = id === selectedId
    const ratio = Math.sqrt(metricNumber(byId.get(id), metricKey) / maximum)
    return {
      color: selected ? '#2f84ff' : '#46627d',
      weight: selected ? 3 : 1,
      fillColor: selected ? '#155ec6' : `rgb(${10 + Math.round(12 * ratio)}, ${39 + Math.round(57 * ratio)}, ${60 + Math.round(102 * ratio)})`,
      fillOpacity: selected ? 0.72 : 0.6,
      className: selected && pulseKey > 0 ? styles.selectionPulsePath : undefined,
    }
  }
  return (
    <div className={styles.frame} aria-busy={busy}>
      <MapContainer className={styles.map} center={CENTER} zoom={11} zoomControl attributionControl aria-label="Interactive Seattle neighborhood collision map">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <GeoJSON
          key={`${metricKey}-${selectedId}-${metrics.length}-${pulseKey}`}
          data={collection}
          style={style}
          onEachFeature={(_, layer) => layer.on({
            click: (event: LeafletMouseEvent) => {
              event.originalEvent.stopPropagation()
              onResolve(event.latlng.lat, event.latlng.lng)
            },
          })}
        />
        <ClickResolver onClick={onResolve}/>
        <FitSelected collection={collection} selectedId={selectedId} pulseKey={pulseKey}/>
      </MapContainer>
      <div className={styles.legend} aria-hidden="true"><span>LOW</span><i/><span>HIGH</span></div>
      <div className={styles.hint}>{busy ? 'RESOLVING LOCATION' : 'CLICK A POLYGON OR SEARCH BY NAME'}</div>
    </div>
  )
}
