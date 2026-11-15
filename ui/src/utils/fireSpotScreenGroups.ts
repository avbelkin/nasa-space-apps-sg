import type { GeoJSONSourceDiff, Map as MapLibreMap } from 'maplibre-gl'
import {
  classifyFireSensorGroup,
  compareMatchedFireSpots,
  deduplicateSpotMatches,
  expandHoveredFireSpots,
  featureToTooltipInput,
  FULL_DETAIL_FIRE_SPOT_ZOOM,
  type BuiltFireSpotsData,
  type FireSensorGroup,
  type FireSpotTooltipInput,
} from './fireSpots.ts'

export const FIRE_SPOT_HIT_PADDING = 8

interface ProjectedFireSpot {
  index: number
  x: number
  y: number
  detection: FireSpotTooltipInput
}

export interface FireSpotScreenGroup {
  detections: readonly FireSpotTooltipInput[]
  color: FireSensorGroup | null
}

// Keep nearby rendered marks together. At low zoom each mark can represent a geographic group.
const GROUP_DISTANCE = 2 * FIRE_SPOT_HIT_PADDING

export function groupProjectedFireSpots(
  spots: readonly ProjectedFireSpot[],
  expand: (members: readonly ProjectedFireSpot[]) => readonly FireSpotTooltipInput[],
): Map<number, FireSpotScreenGroup> {
  const buckets = new Map<string, ProjectedFireSpot[]>()
  const cell = (value: number) => Math.floor(value / GROUP_DISTANCE)
  for (const spot of spots) {
    const key = `${cell(spot.x)},${cell(spot.y)}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(spot)
    } else {
      buckets.set(key, [spot])
    }
  }

  const groups = new Map<number, FireSpotScreenGroup>()
  const sorted = [...spots].sort((a, b) => compareMatchedFireSpots(a.detection, b.detection) || a.index - b.index)
  for (const leader of sorted) {
    if (groups.has(leader.index)) {
      continue
    }
    const members: ProjectedFireSpot[] = []
    const column = cell(leader.x)
    const row = cell(leader.y)
    for (let x = column - 1; x <= column + 1; x++) {
      for (let y = row - 1; y <= row + 1; y++) {
        for (const spot of buckets.get(`${x},${y}`) ?? []) {
          if (!groups.has(spot.index) &&
            Math.abs(spot.x - leader.x) <= GROUP_DISTANCE &&
            Math.abs(spot.y - leader.y) <= GROUP_DISTANCE) {
            members.push(spot)
          }
        }
      }
    }
    const detections = deduplicateSpotMatches(expand(members))
    const group = { detections, color: classifyFireSensorGroup(detections) }
    for (const member of members) {
      groups.set(member.index, group)
    }
  }
  return groups
}

export function readFireSpotScreenGroups(map: MapLibreMap, data: BuiltFireSpotsData) {
  const spots: ProjectedFireSpot[] = []
  const zoom = map.getZoom()
  const globe = map.getProjection()?.type === 'globe'
  const bounds = globe ? undefined : map.getBounds()
  const centerLng = map.getCenter().lng
  const { clientWidth, clientHeight } = map.getCanvas()
  for (const feature of data.featureCollection.features) {
    if (zoom < FULL_DETAIL_FIRE_SPOT_ZOOM && feature.properties.minZoomAll > zoom) {
      continue
    }
    const [lng, lat] = feature.geometry.coordinates
    const nearestLng = lng + 360 * Math.round((centerLng - lng) / 360)
    if (bounds && !bounds.contains([nearestLng, lat])) {
      continue
    }
    const point = map.project([nearestLng, lat])
    const { x, y } = point
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > clientWidth || y > clientHeight) {
      continue
    }
    if (globe) {
      // Projection alone also gives screen coordinates for points on the far side of the globe.
      const surface = map.unproject(point).wrap()
      const lngDelta = ((surface.lng - lng + 540) % 360) - 180
      if (Math.abs(surface.lat - lat) > 0.0001 || Math.abs(lngDelta) > 0.0001) {
        continue
      }
    }
    spots.push({ index: feature.properties.spotIndex, x, y, detection: featureToTooltipInput(feature) })
  }
  return groupProjectedFireSpots(spots, (members) =>
    expandHoveredFireSpots(data, members.map((spot) => spot.index), zoom, 'harmonized'),
  )
}

export function buildFireSpotSourceData(
  data: BuiltFireSpotsData,
  groups: ReadonlyMap<number, FireSpotScreenGroup> | undefined,
): BuiltFireSpotsData['featureCollection'] {
  if (!groups?.size) {
    return data.featureCollection
  }
  return {
    ...data.featureCollection,
    features: data.featureCollection.features.map((feature) => {
      const screenSensorGroup = groups.get(feature.properties.spotIndex)?.color
      return screenSensorGroup ? { ...feature, properties: { ...feature.properties, screenSensorGroup } } : feature
    }),
  }
}

export function diffFireSpotScreenColors(
  previous: ReadonlyMap<number, FireSpotScreenGroup> | undefined,
  next: ReadonlyMap<number, FireSpotScreenGroup> | undefined,
): NonNullable<GeoJSONSourceDiff['update']> {
  const update: NonNullable<GeoJSONSourceDiff['update']> = []
  for (const [id, group] of previous ?? []) {
    if (group.color && !next?.get(id)?.color) {
      update.push({ id, removeProperties: ['screenSensorGroup'] })
    }
  }
  for (const [id, group] of next ?? []) {
    if (group.color && group.color !== previous?.get(id)?.color) {
      update.push({ id, addOrUpdateProperties: [{ key: 'screenSensorGroup', value: group.color }] })
    }
  }
  return update
}
