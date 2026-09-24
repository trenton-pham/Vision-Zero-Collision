import { CircleMarker, MapContainer, Polyline, Rectangle, TileLayer } from 'react-leaflet'
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
  const shiftPoints: [number, number][] = shift?.status === 'available' && shift.before.centroidLat && shift.before.centroidLng && shift.after.centroidLat && shift.after.centroidLng
    ? [[shift.before.centroidLat, shift.before.centroidLng], [shift.after.centroidLat, shift.after.centroidLng]]
    : []
  const bbox = downtown?.bbox
  return (
    <div className={styles.frame}>
      <MapContainer className={styles.map} center={CENTER} zoom={11} zoomControl attributionControl aria-label="Citywide collision density map">
        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        {layer === 'heatmap' && heatmap?.points.map((point, index) => {
          const ratio = point.weight / Math.max(1, heatmap.maxWeight)
          return <CircleMarker key={`${point.lat}-${point.lng}-${index}`} center={[point.lat, point.lng]} radius={2 + Math.sqrt(ratio) * 14} pathOptions={{ stroke: false, fillColor: ratio > .55 ? '#f3a52b' : '#2f84ff', fillOpacity: .16 + ratio * .6 }}/>
        })}
        {layer === 'kde' && kde?.cells.filter((cell) => cell.density > .06).map((cell, index) => (
          <CircleMarker key={`${cell.lat}-${cell.lng}-${index}`} center={[cell.lat, cell.lng]} radius={2.5 + cell.density * 6} pathOptions={{ stroke: false, fillColor: cell.density > .6 ? '#27d1df' : '#2f84ff', fillOpacity: .06 + cell.density * .5 }}/>
        ))}
        {bbox && <Rectangle bounds={[[bbox.yMin, bbox.xMin], [bbox.yMax, bbox.xMax]]} pathOptions={{ color: '#f3a52b', weight: 1, dashArray: '5 4', fillOpacity: .02 }}/>} 
        {shiftPoints.length === 2 && <><Polyline positions={shiftPoints} pathOptions={{ color: '#27d1df', weight: 2, dashArray: '5 5' }}/><CircleMarker center={shiftPoints[0]} radius={5} pathOptions={{ color: '#7890a8', fillColor: '#7890a8', fillOpacity: 1 }}/><CircleMarker center={shiftPoints[1]} radius={6} pathOptions={{ color: '#27d1df', fillColor: '#27d1df', fillOpacity: 1 }}/></>}
      </MapContainer>
      <div className={styles.legend}>
        <strong>{layer === 'heatmap' ? 'GRIDDED COLLISION COUNT' : 'NORMALIZED KDE DENSITY'}</strong>
        <span><i/> Low</span><span><i/> High</span>
      </div>
    </div>
  )
}
