import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  classifyFireSensorGroup,
  compareMatchedFireSpots,
  deduplicateSpotMatches,
  featureToTooltipInput,
  type BuiltFireSpotsData,
  type FireSensorGroup,
  type FireSpotTooltipInput,
} from './fireSpots.ts'
import { FIRMS_SPOTS_CORE_LAYER_ID, FIRMS_SPOTS_SOURCE_ID } from './fireSpotsAnimation.ts'

export const FIRE_SPOT_HIT_PADDING = 8

interface ProjectedFireSpot {
  index: number
  x: number
  y: number
  detection: FireSpotTooltipInput
}

export interface FireSpotScreenGroup {
  members: readonly number[]
  color: FireSensorGroup | null
}

// Screen-space grouping keeps nearby detections together at full-detail zooms, where geographic
// decluttering ends. Use the original hit padding plus the width of a typical marker's radius.
const GROUP_DISTANCE = 2 * FIRE_SPOT_HIT_PADDING

export function groupProjectedFireSpots(spots: readonly ProjectedFireSpot[]): Map<number, FireSpotScreenGroup> {
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
    const group = {
      members: members.map((spot) => spot.index),
      color: classifyFireSensorGroup(deduplicateSpotMatches(members.map((spot) => spot.detection))),
    }
    for (const member of members) {
      groups.set(member.index, group)
    }
  }
  return groups
}

export function readFireSpotScreenGroups(map: MapLibreMap, data: BuiltFireSpotsData) {
  const hits = map.queryRenderedFeatures({ layers: [FIRMS_SPOTS_CORE_LAYER_ID] })
  const spots = new Map<number, ProjectedFireSpot>()
  const centerLng = map.getCenter().lng
  for (const hit of hits) {
    const index = hit.properties?.spotIndex
    const feature = data.featureCollection.features[index]
    if (feature && !spots.has(index)) {
      const [lng, lat] = feature.geometry.coordinates
      const nearestLng = lng + 360 * Math.round((centerLng - lng) / 360)
      const { x, y } = map.project([nearestLng, lat])
      spots.set(index, { index, x, y, detection: featureToTooltipInput(feature) })
    }
  }
  return groupProjectedFireSpots([...spots.values()])
}

export function updateFireSpotScreenColors(
  map: MapLibreMap,
  previous: ReadonlyMap<number, FireSpotScreenGroup> | undefined,
  next: ReadonlyMap<number, FireSpotScreenGroup> | undefined,
) {
  for (const [id, group] of previous ?? []) {
    const nextColor = next?.get(id)?.color
    if (group.color && group.color !== 'single' && (!nextColor || nextColor === 'single')) {
      map.removeFeatureState({ source: FIRMS_SPOTS_SOURCE_ID, id }, 'screenSensorGroup')
    }
  }
  for (const [id, group] of next ?? []) {
    if (group.color && group.color !== 'single' && group.color !== previous?.get(id)?.color) {
      map.setFeatureState({ source: FIRMS_SPOTS_SOURCE_ID, id }, { screenSensorGroup: group.color })
    }
  }
}
