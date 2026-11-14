import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FilterSpecification,
  Map as MapLibreMap,
  MapSourceDataEvent,
} from 'maplibre-gl'
import type { SensorFilter, ViewMode } from '../data/stubSeasonalData.ts'
import {
  ANIMATION_INTERVAL_MS,
  COHORT_PHASE_RADIANS,
  computeWildfirePulse,
  MAX_INACTIVITY_MS,
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

const PULSE_HALO_MAX_OPACITY = 0.45

export function getFireSpotColorExpression(viewMode: ViewMode): ExpressionSpecification {
  if (viewMode === 'sensors') {
    return [
      'match',
      ['get', 'instrument'],
      'modis',
      '#22d3ee',
      'viirs',
      '#fb923c',
      '#f59e0b',
    ]
  }

  return [
    'interpolate',
    ['linear'],
    ['get', 'frp'],
    0,
    '#fbbf24',
    20,
    '#ff9100',
    100,
    '#ff1744',
  ]
}

export function buildFireSpotsCoreFilter(sensorFilter: SensorFilter): FilterSpecification {
  if (sensorFilter === 'harmonized') {
    return ['has', 'timestamp']
  }
  return ['==', ['get', 'instrument'], sensorFilter]
}

export function buildFireSpotsPulseFilter(
  sensorFilter: SensorFilter,
  cohort: PhaseCohort,
): FilterSpecification {
  if (sensorFilter === 'harmonized') {
    return ['==', ['get', 'phaseCohort'], cohort]
  }
  return ['all', ['==', ['get', 'instrument'], sensorFilter], ['==', ['get', 'phaseCohort'], cohort]]
}

export function buildFireSpotPulseRadiusExpression(pulse: number): ExpressionSpecification {
  const r11 = SPOT_RADIUS + SPOT_EXPANSION * pulse
  return [
    'interpolate',
    ['linear'],
    ['zoom'],
    1,
    Number((r11 * 0.22).toFixed(2)),
    4,
    Number((r11 * 0.4).toFixed(2)),
    7,
    Number((r11 * 0.68).toFixed(2)),
    11,
    Number(r11.toFixed(2)),
    15,
    Number((r11 * 1.25).toFixed(2)),
  ]
}

export function buildFireSpotLayers(
  initialViewMode: ViewMode,
  initialSensorFilter: SensorFilter,
  initialVisible: boolean,
): CircleLayerSpecification[] {
  const visibility = initialVisible ? 'visible' : 'none'
  const colorExpression = getFireSpotColorExpression(initialViewMode)

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
        'circle-color': colorExpression,
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
      'circle-color': colorExpression,
      'circle-radius': [
        'interpolate',
        ['linear'],
        ['zoom'],
        1,
        ['*', 2.2, ['get', 'powerScale']],
        4,
        ['*', 4.0, ['get', 'powerScale']],
        7,
        ['*', 7.5, ['get', 'powerScale']],
        11,
        ['*', SPOT_RADIUS, ['get', 'powerScale']],
        15,
        ['*', 15, ['get', 'powerScale']],
      ],
      'circle-opacity': [
        'interpolate',
        ['linear'],
        ['zoom'],
        1,
        ['*', 0.72, ['get', 'certainty']],
        3,
        ['*', 0.72, ['get', 'certainty']],
        7,
        ['*', STILL_OPACITY, ['get', 'certainty']],
      ],
      'circle-blur': 0.5,
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
    if (pulsesCleared || !map.isStyleLoaded()) {
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
    if (nowMs - lastActivityAtMs >= MAX_INACTIVITY_MS) {
      return false
    }
    if (getActiveSpotCount() <= 0) {
      return false
    }
    return true
  }

  const queryViewportHasActiveSpots = (): boolean => {
    if (disposed || !isVisible() || getActiveSpotCount() <= 0 || !map.isStyleLoaded()) {
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
    if (!map.isStyleLoaded()) {
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

  const handleSourceData = (event: MapSourceDataEvent) => {
    if (event.sourceId === FIRMS_SPOTS_SOURCE_ID && event.isSourceLoaded) {
      sync()
    }
  }

  const activityEvents = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const
  for (const eventName of activityEvents) {
    window.addEventListener(eventName, handleUserActivity, { passive: true })
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  media?.addEventListener('change', handleReducedMotionChange)
  map.on('moveend', sync)
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
      map.off('sourcedata', handleSourceData)
    },
  }
}
