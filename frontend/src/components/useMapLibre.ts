import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type LngLatBoundsLike } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { basemapLayers, basemapStyle, readMapTokens, SEATTLE_BOUNDS } from '../lib/mapStyle'
import { usePalette, useTheme } from '../lib/theme'

// Vite does not follow MapLibre's relative worker URL, so hand it the emitted asset.
setWorkerUrl(workerUrl)

export function useMapLibre(label: string, bounds: LngLatBoundsLike = SEATTLE_BOUNDS) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [idle, setIdle] = useState(false)
  const { resolvedTheme } = useTheme()
  const tokens = usePalette(resolvedTheme, readMapTokens)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let instance: MapLibreMap
    try {
      instance = new MapLibreMap({ container, style: basemapStyle(readMapTokens()), bounds, fitBoundsOptions: { padding: 24 }, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false })
    } catch {
      setFailed(true)
      return
    }
    instance.touchZoomRotate.disableRotation()
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-left')
    instance.getCanvas().setAttribute('aria-label', label)
    instance.on('load', () => setReady(true))
    instance.on('movestart', () => setIdle(false))
    instance.on('idle', () => setIdle(true))
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(container)
    setMap(instance)
    return () => { observer.disconnect(); instance.remove(); setMap(null); setReady(false) }
  }, [label])

  useEffect(() => {
    if (!map || !ready) return
    for (const layer of basemapLayers(tokens)) {
      if (!('paint' in layer) || !layer.paint) continue
      for (const [property, value] of Object.entries(layer.paint)) map.setPaintProperty(layer.id, property as Parameters<MapLibreMap['setPaintProperty']>[1], value)
    }
  }, [map, ready, tokens])

  return { containerRef, map: ready ? map : null, failed, idle, tokens }
}
