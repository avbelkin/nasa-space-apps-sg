import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FilterSpecification,
  Map as MapLibreMap,
  MapSourceDataEvent,
} from 'maplibre-gl'
import { FIRE_SPOT_COLORS } from '../data/dataPalette.ts'
import type { SensorFilter } from '../data/mapTypes.ts'
import {
  ANIMATION_INTERVAL_MS,
  COHORT_PHASE_RADIANS,
  computeWildfirePulse,
  MAX_INACTIVITY_MS,
  MIN_FIRE_SPOT_ZOOM,
  SPOT_EXPANSION,
  SPOT_RADIUS,
  STILL_OPACITY,
  type PhaseCohort,
} from './fireSpots.ts'

export const FIRMS_SPOTS_SOURCE_ID = 'firms-hotspots'
export const FIRMS_SPOTS_CORE_LAYER_ID = 'firms-spots-core'
export const FIRMS_SPOTS_PULSE_LAYER_IDS = [
  'firms-spots-pulse-0',
  'firms-spots-pulse-1',
  'firms-spots-pulse-2',
  'firms-spots-pulse-3',
] as const

const PULSE_HALO_MAX_OPACITY = 0.52

function getDeclutterProperty(
  sensorFilter: SensorFilter,
): 'minZoomAll' | 'minZoomModis' | 'minZoomViirs' {
  if (sensorFilter === 'modis') {
    return 'minZoomModis'
  }
  if (sensorFilter === 'viirs') {
    return 'minZoomViirs'
  }
  return 'minZoomAll'
}

/** Builds a MapLibre-valid top-level `step(['zoom'], ...)` filter revealing hierarchical declutter tiers across z1..z7. */
function buildZoomTieredSpotFilter(
  sensorFilter: SensorFilter,
  cohort?: PhaseCohort,
): FilterSpecification {
  const minZoomProp = getDeclutterProperty(sensorFilter)
  const buildPredicate = (maxTier: number | null): boolean | ExpressionSpecification => {
    const clauses: ExpressionSpecification[] = []
    if (sensorFilter !== 'harmonized') {
      clauses.push(['==', ['get', 'instrument'], sensorFilter])
    }
    if (cohort !== undefined) {
      clauses.push(['==', ['get', 'phaseCohort'], cohort])
    }
    if (maxTier !== null) {
      clauses.push(['<=', ['get', minZoomProp], maxTier])
    }
    if (clauses.length === 0) {
      return true
    }
    return clauses.length === 1 ? clauses[0] : (['all', ...clauses] as ExpressionSpecification)
  }

  return [
    'step',
    ['zoom'],
    buildPredicate(1),
    2,
    buildPredicate(2),
    3,
    buildPredicate(3),
    4,
    buildPredicate(4),
    5,
    buildPredicate(5),
    6,
    buildPredicate(6),
    7,
    buildPredicate(null),
  ]
}

export function buildFireSpotsCoreFilter(sensorFilter: SensorFilter): FilterSpecification {
  return buildZoomTieredSpotFilter(sensorFilter)
}

export function buildFireSpotsPulseFilter(
  sensorFilter: SensorFilter,
  cohort: PhaseCohort,
): FilterSpecification {
  return buildZoomTieredSpotFilter(sensorFilter, cohort)
}

export function buildFireSpotPulseRadiusExpression(pulse: number): ExpressionSpecification {
  const r11 = SPOT_RADIUS + SPOT_EXPANSION * pulse
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    1,
    Number((r11 * 0.38).toFixed(2)),
    4,
    Number((r11 * 0.54).toFixed(2)),
    7,
    Number((r11 * 0.74).toFixed(2)),
    11,
    Number(r11.toFixed(2)),
    15,
    Number((r11 * 1.25).toFixed(2)),
  ]
}

export function buildFireSpotLayers(
  initialSensorFilter: SensorFilter,
  initialVisible: boolean,
): CircleLayerSpecification[] {
  const visibility = initialVisible ? 'visible' : 'none'

  const pulseLayers: CircleLayerSpecification[] = FIRMS_SPOTS_PULSE_LAYER_IDS.map((id, idx) => {
    const cohort = idx as PhaseCohort
    return {
      id,
      type: 'circle',
      source: FIRMS_SPOTS_SOURCE_ID,
      filter: buildFireSpotsPulseFilter(initialSensorFilter, cohort),
      layout: {
        visibility,
      },
      paint: {
        'circle-color': FIRE_SPOT_COLORS.pulse,
        'circle-blur': 0.85,
        'circle-radius': buildFireSpotPulseRadiusExpression(0),
        'circle-radius-transition': { duration: 0, delay: 0 },
        'circle-opacity': 0,
        'circle-opacity-transition': { duration: 0, delay: 0 },
      },
    }
  })

  const coreLayer: CircleLayerSpecification = {
    id: FIRMS_SPOTS_CORE_LAYER_ID,
    type: 'circle',
    source: FIRMS_SPOTS_SOURCE_ID,
    filter: buildFireSpotsCoreFilter(initialSensorFilter),
    layout: {
      visibility,
      'circle-sort-key': ['get', 'frp'],
    },
    paint: {
      'circle-color': FIRE_SPOT_COLORS.fill,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        1,
        ['*', 3.4, ['get', 'powerScale']],
        3,
        ['*', 4.5, ['get', 'powerScale']],
        5,
        ['*', 6.0, ['get', 'powerScale']],
        8,
        ['*', 8.5, ['get', 'powerScale']],
        11,
        ['*', SPOT_RADIUS, ['get', 'powerScale']],
        15,
        ['*', 15, ['get', 'powerScale']],
      ],
      'circle-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        0.95,
        0,
        1,
        ['*', 0.9, ['get', 'certainty']],
        4,
        ['*', 0.82, ['get', 'certainty']],
        8,
        ['*', STILL_OPACITY, ['get', 'certainty']],
      ],
      'circle-blur': [
        'interpolate',
        ['linear'],
        ['zoom'],
        1,
        0.15,
        6,
        0.35,
        10,
        0.5,
      ],
      'circle-stroke-width': [
        'interpolate',
        ['linear'],
        ['zoom'],
        1,
        0.6,
        5,
        0.4,
        8,
        0,
      ],
      'circle-stroke-color': FIRE_SPOT_COLORS.stroke,
      'circle-stroke-opacity': ['step', ['zoom'], 0, 1, 1],
    },
  }

  return [...pulseLayers, coreLayer]
}

export interface FireSpotsAnimationControllerOptions {
  map: MapLibreMap
  getCohortAgeSeconds: () => readonly [number, number, number, number]
  getReferenceNowMs: () => number
  getActiveSpotCount: () => number
  isVisible: () => boolean
  isPaused: () => boolean
  onReducedMotionChange?: (reduced: boolean) => void
}

export interface FireSpotsAnimationController {
  sync: () => void
  reducedMotion: () => boolean
  dispose: () => void
}

export function createFireSpotsAnimationController({
  map,
  getCohortAgeSeconds,
  getReferenceNowMs,
  getActiveSpotCount,
  isVisible,
  isPaused,
  onReducedMotionChange,
}: FireSpotsAnimationControllerOptions): FireSpotsAnimationController {
  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null

  let intervalId: number | null = null
  let lastActivityAtMs = Date.now()
  let hasRenderedActiveSpots = false
  let pulsesCleared = true
  let disposed = false

  const isReducedMotion = () => Boolean(media?.matches)

  const clearPulses = () => {
    if (pulsesCleared || !map.getLayer(FIRMS_SPOTS_CORE_LAYER_ID)) {
      return
    }
    for (const layerId of FIRMS_SPOTS_PULSE_LAYER_IDS) {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'circle-opacity', 0)
      }
    }
    pulsesCleared = true
  }

  const stopTimer = () => {
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
    clearPulses()
  }

  const isAllowedToAnimate = (nowMs: number): boolean => {
    if (disposed || typeof document === 'undefined') {
      return false
    }
    if (document.hidden || isReducedMotion() || !isVisible() || isPaused()) {
      return false
    }
    if (map.getZoom() < MIN_FIRE_SPOT_ZOOM) {
      return false
    }
    if (nowMs - lastActivityAtMs >= MAX_INACTIVITY_MS) {
      return false
    }
    if (getActiveSpotCount() <= 0) {
      return false
    }
    return true
  }

  const queryViewportHasActiveSpots = (): boolean => {
    if (
      disposed ||
      !isVisible() ||
      getActiveSpotCount() <= 0 ||
      map.getZoom() < MIN_FIRE_SPOT_ZOOM
    ) {
      return false
    }
    if (!map.getLayer(FIRMS_SPOTS_CORE_LAYER_ID)) {
      return false
    }
    try {
      const rendered = map.queryRenderedFeatures({
        layers: [FIRMS_SPOTS_CORE_LAYER_ID],
        filter: ['>=', ['get', 'phaseCohort'], 0],
      })
      return rendered.length > 0
    } catch {
      return getActiveSpotCount() > 0
    }
  }

  const tick = () => {
    const nowMs = Date.now()
    if (!isAllowedToAnimate(nowMs) || !hasRenderedActiveSpots) {
      stopTimer()
      return
    }
    if (map.isMoving() || map.isZooming() || map.isRotating()) {
      return
    }
    if (!map.getLayer(FIRMS_SPOTS_CORE_LAYER_ID)) {
      return
    }

    const baseAges = getCohortAgeSeconds()
    const elapsedSinceBuildSec = Math.max(0, (nowMs - getReferenceNowMs()) / 1000)

    for (let idx = 0; idx < FIRMS_SPOTS_PULSE_LAYER_IDS.length; idx++) {
      const layerId = FIRMS_SPOTS_PULSE_LAYER_IDS[idx]
      if (!map.getLayer(layerId)) {
        continue
      }
      const ageSeconds = baseAges[idx] + elapsedSinceBuildSec
      const pulse = computeWildfirePulse(ageSeconds, COHORT_PHASE_RADIANS[idx], true)
      map.setPaintProperty(layerId, 'circle-radius', buildFireSpotPulseRadiusExpression(pulse))
      map.setPaintProperty(
        layerId,
        'circle-opacity',
        Number((pulse * PULSE_HALO_MAX_OPACITY).toFixed(3)),
      )
    }
    pulsesCleared = false
  }

  const sync = () => {
    if (disposed) {
      return
    }
    hasRenderedActiveSpots = queryViewportHasActiveSpots()
    if (!isAllowedToAnimate(Date.now()) || !hasRenderedActiveSpots) {
      stopTimer()
      return
    }
    if (intervalId === null) {
      intervalId = window.setInterval(tick, ANIMATION_INTERVAL_MS)
    }
    tick()
  }

  const handleUserActivity = () => {
    const nowMs = Date.now()
    const wasInactive = nowMs - lastActivityAtMs >= MAX_INACTIVITY_MS
    lastActivityAtMs = nowMs
    if (wasInactive && intervalId === null) {
      sync()
    }
  }

  const handleVisibilityChange = () => {
    if (document.hidden) {
      stopTimer()
    } else {
      lastActivityAtMs = Date.now()
      sync()
    }
  }

  const handleReducedMotionChange = () => {
    onReducedMotionChange?.(isReducedMotion())
    if (isReducedMotion()) {
      stopTimer()
    } else {
      sync()
    }
  }

  const handleIdle = () => {
    if (intervalId === null) {
      sync()
    }
  }

  const handleSourceData = (event: MapSourceDataEvent) => {
    if (event.sourceId === FIRMS_SPOTS_SOURCE_ID && event.isSourceLoaded) {
      sync()
      if (intervalId === null && typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (!disposed && intervalId === null) {
            sync()
          }
        })
      }
    }
  }

  const activityEvents = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const
  for (const eventName of activityEvents) {
    window.addEventListener(eventName, handleUserActivity, { passive: true })
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  media?.addEventListener('change', handleReducedMotionChange)
  map.on('moveend', sync)
  map.on('idle', handleIdle)
  map.on('sourcedata', handleSourceData)

  onReducedMotionChange?.(isReducedMotion())
  sync()

  return {
    sync,
    reducedMotion: isReducedMotion,
    dispose: () => {
      disposed = true
      stopTimer()
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, handleUserActivity)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      media?.removeEventListener('change', handleReducedMotionChange)
      map.off('moveend', sync)
      map.off('idle', handleIdle)
      map.off('sourcedata', handleSourceData)
    },
  }
}
