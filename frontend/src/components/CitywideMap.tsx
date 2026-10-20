import { CircleMarker, MapContainer, Polyline, Rectangle, TileLayer } from 'react-leaflet'
import { useTheme } from '../lib/theme'
import type { DowntownComparisonResponse, HeatmapResponse, KdeResponse, SpatialShiftResponse } from '../lib/contracts'
import styles from './CitywideMap.module.css'

const CENTER: [number, number] = [47.612, -122.334]

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
  const { resolvedTheme } = useTheme()
  const light = resolvedTheme === 'light'
  const lowColor = light ? '#1463c9' : '#2f84ff'
  const countHighColor = light ? '#986000' : '#f3a52b'
  const densityHighColor = light ? '#007f8b' : '#27d1df'
  const beforeColor = light ? '#526779' : '#a1b4c5'
  const shiftPoints: [[number, number], [number, number]] | null = shift?.status === 'available'
    ? [[shift.before.centroidLat, shift.before.centroidLng], [shift.after.centroidLat, shift.after.centroidLng]]
    : null
  const bbox = downtown?.bbox
  return (
    <div className={styles.frame}>
      <MapContainer className={styles.map} center={CENTER} zoom={11} preferCanvas zoomControl attributionControl aria-label="Citywide collision density map">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        {layer === 'heatmap' && heatmap?.points.map((point, index) => {
          const ratio = point.weight / Math.max(1, heatmap.maxWeight)
          return <CircleMarker key={`heatmap-${point.lat}-${point.lng}-${index}`} center={[point.lat, point.lng]} radius={2 + Math.sqrt(ratio) * 14} pathOptions={{ stroke: false, fillColor: ratio > .55 ? countHighColor : lowColor, fillOpacity: .16 + ratio * .6 }}/>
        })}
        {layer === 'kde' && kde?.cells.filter((cell) => cell.density > .06).map((cell, index) => (
          <CircleMarker key={`kde-${cell.lat}-${cell.lng}-${index}`} center={[cell.lat, cell.lng]} radius={2.5 + cell.density * 6} pathOptions={{ stroke: false, fillColor: cell.density > .6 ? densityHighColor : lowColor, fillOpacity: .06 + cell.density * .5 }}/>
        ))}
        {bbox && <Rectangle bounds={[[bbox.yMin, bbox.xMin], [bbox.yMax, bbox.xMax]]} pathOptions={{ color: countHighColor, weight: 1, dashArray: '5 4', fillOpacity: .02 }}/>}
        {shiftPoints !== null && <><Polyline positions={shiftPoints} pathOptions={{ color: densityHighColor, weight: 2, dashArray: '5 5' }}/><CircleMarker center={shiftPoints[0]} radius={5} pathOptions={{ color: beforeColor, fillColor: beforeColor, fillOpacity: 1 }}/><CircleMarker center={shiftPoints[1]} radius={6} pathOptions={{ color: densityHighColor, fillColor: densityHighColor, fillOpacity: 1 }}/></>}
      </MapContainer>
      <div className={styles.legend}>
        <strong>{layer === 'heatmap' ? 'Collisions per grid cell' : 'Relative smoothed density (KDE)'}</strong>
        {(layer === 'kde' || (heatmap?.maxWeight ?? 0) > 0) && <>
          <span><i style={{ background: lowColor }}/>{layer === 'heatmap' ? `≤${Math.floor((heatmap?.maxWeight ?? 0) * .55)} collisions` : '0.06–0.60'}</span>
          <span><i style={{ background: layer === 'heatmap' ? countHighColor : densityHighColor }}/>{layer === 'heatmap' ? `${Math.floor((heatmap?.maxWeight ?? 0) * .55) + 1}–${heatmap?.maxWeight ?? 0} collisions` : '>0.60–1.00'}</span>
        </>}
        {bbox && <span className={styles.annotation}><i className={styles.outline} style={{ borderColor: countHighColor }}/>Downtown boundary</span>}
        {shiftPoints && shift?.status === 'available' && <>
          <span className={styles.annotation}><i className={styles.centroid} style={{ background: beforeColor }}/>{shift.before.label} center</span>
          <span className={styles.annotation}><i className={styles.centroid} style={{ background: densityHighColor }}/>{shift.after.label} center</span>
        </>}
      </div>
    </div>
  )
}
