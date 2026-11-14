import type { MapSourceDataEvent } from 'maplibre-gl'
import type { SensorFilter } from '../data/stubSeasonalData.ts'
import {
  computeLiveOrbitalState,
  SATELLITE_ANIMATION_INTERVAL_MS,
  type LiveOrbitalState,
  type LiveSatelliteSnapshot,
  type SatelliteOrbit,
} from './satelliteOrbits.ts'

export const SATELLITE_ORBITS_SOURCE_ID = 'satellite-orbits'
export const MAX_PENDING_ORBIT_SYNC_MS = 100
export const VSYNC_JITTER_TOLERANCE_MS = 2.5

export interface SatelliteAnimationMapLike {
  isSourceLoaded: (id: string) => boolean
  on: (type: 'sourcedata', listener: (event: MapSourceDataEvent) => void) => unknown
  off: (type: 'sourcedata', listener: (event: MapSourceDataEvent) => void) => unknown
}

export interface SatelliteFrameStepDecision {
  shouldStep: boolean
  nextFrameTimeMs: number
}

/**
 * Decides whether a VSync callback should advance the 30 FPS satellite simulation
 * while staying phase-locked across 60 Hz (~16.67 ms) and 120 Hz (~8.33 ms) displays.
 */
export function shouldAdvanceSatelliteFrame(
  frameTimeMs: number,
  nextFrameTimeMs: number | null,
  intervalMs: number = SATELLITE_ANIMATION_INTERVAL_MS,
  jitterToleranceMs: number = VSYNC_JITTER_TOLERANCE_MS,
): SatelliteFrameStepDecision {
  if (nextFrameTimeMs === null) {
    return {
      shouldStep: true,
      nextFrameTimeMs: frameTimeMs + intervalMs,
    }
  }

  if (frameTimeMs + jitterToleranceMs < nextFrameTimeMs) {
    return {
      shouldStep: false,
      nextFrameTimeMs,
    }
  }

  const scheduled = nextFrameTimeMs + intervalMs
  return {
    shouldStep: true,
    nextFrameTimeMs: frameTimeMs - nextFrameTimeMs > intervalMs ? frameTimeMs + intervalMs : scheduled,
  }
}

export interface SatelliteAnimationControllerOptions {
  map: SatelliteAnimationMapLike
  getSatellites: () => readonly SatelliteOrbit[]
  getSensorFilter: () => SensorFilter
  isOrbitsVisible: () => boolean
  onApplyOrbitalGeoJson: (state: LiveOrbitalState) => void
  onCommitMarkers: (snapshots: readonly LiveSatelliteSnapshot[], orbitsVisible: boolean) => void
  nowProvider?: () => number
  frameNowProvider?: () => number
  requestFrame?: (cb: FrameRequestCallback) => number
  cancelFrame?: (id: number) => void
  isDocumentHidden?: () => boolean
}

export interface SatelliteAnimationController {
  syncNow: () => void
  dispose: () => void
}

/**
 * Drives satellite swaths, ground tracks, and HTML markers in lockstep at 30 FPS
 * using requestAnimationFrame pacing and MapLibre GeoJSON worker backpressure.
 */
export function createSatelliteAnimationController({
  map,
  getSatellites,
  getSensorFilter,
  isOrbitsVisible,
  onApplyOrbitalGeoJson,
  onCommitMarkers,
  nowProvider = Date.now,
  frameNowProvider = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  requestFrame,
  cancelFrame,
  isDocumentHidden = () => typeof document !== 'undefined' && document.hidden,
}: SatelliteAnimationControllerOptions): SatelliteAnimationController {
  const scheduleFrame: ((cb: FrameRequestCallback) => number) | null =
    requestFrame ??
    (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? (cb) => window.requestAnimationFrame(cb)
      : null)
  const abortFrame: (id: number) => void =
    cancelFrame ??
    ((id) => {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(id)
      }
    })

  let rafId: number | null = null
  let nextFrameTimeMs: number | null = null
  let pendingSnapshots: readonly LiveSatelliteSnapshot[] | null = null
  let pendingSinceMs = 0
  let disposed = false

  const hasVisibleSatellites = (): boolean => {
    if (!isOrbitsVisible()) {
      return false
    }
    const filter = getSensorFilter()
    return getSatellites().some((sat) => filter === 'harmonized' || sat.instrument === filter)
  }

  const stopLoop = () => {
    if (rafId !== null) {
      abortFrame(rafId)
      rafId = null
    }
    nextFrameTimeMs = null
  }

  const handleSourceData = (event: MapSourceDataEvent) => {
    if (
      disposed ||
      event.sourceId !== SATELLITE_ORBITS_SOURCE_ID ||
      pendingSnapshots === null ||
      !map.isSourceLoaded(SATELLITE_ORBITS_SOURCE_ID)
    ) {
      return
    }
    const snapshotsToCommit = pendingSnapshots
    pendingSnapshots = null
    onCommitMarkers(snapshotsToCommit, isOrbitsVisible())
  }

  const onFrame: FrameRequestCallback = (rawFrameTimeMs) => {
    rafId = null
    if (disposed || isDocumentHidden() || !hasVisibleSatellites()) {
      nextFrameTimeMs = null
      return
    }

    if (scheduleFrame) {
      rafId = scheduleFrame(onFrame)
    }

    const frameTimeMs = Number.isFinite(rawFrameTimeMs) ? rawFrameTimeMs : frameNowProvider()
    const step = shouldAdvanceSatelliteFrame(frameTimeMs, nextFrameTimeMs)
    nextFrameTimeMs = step.nextFrameTimeMs
    if (!step.shouldStep) {
      return
    }

    const nowMs = nowProvider()
    if (pendingSnapshots !== null) {
      if (nowMs - pendingSinceMs < MAX_PENDING_ORBIT_SYNC_MS) {
        return
      }
      const stalePending = pendingSnapshots
      pendingSnapshots = null
      onCommitMarkers(stalePending, isOrbitsVisible())
    }

    const state = computeLiveOrbitalState(getSatellites(), getSensorFilter(), nowMs, true)
    pendingSnapshots = state.snapshots
    pendingSinceMs = nowMs
    onApplyOrbitalGeoJson(state)
  }

  const syncNow = () => {
    if (disposed) {
      return
    }
    pendingSnapshots = null
    nextFrameTimeMs = null

    const visible = isOrbitsVisible()
    const state = computeLiveOrbitalState(
      getSatellites(),
      getSensorFilter(),
      nowProvider(),
      visible,
    )
    onApplyOrbitalGeoJson(state)
    onCommitMarkers(state.snapshots, visible)

    if (!isDocumentHidden() && hasVisibleSatellites()) {
      if (rafId === null && scheduleFrame) {
        rafId = scheduleFrame(onFrame)
      }
    } else {
      stopLoop()
    }
  }

  const handleVisibilityChange = () => {
    if (disposed) {
      return
    }
    if (isDocumentHidden()) {
      stopLoop()
    } else {
      syncNow()
    }
  }

  map.on('sourcedata', handleSourceData)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  return {
    syncNow,
    dispose: () => {
      disposed = true
      stopLoop()
      pendingSnapshots = null
      map.off('sourcedata', handleSourceData)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    },
  }
}
