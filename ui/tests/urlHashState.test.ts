import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampGeolocationTargetZoom,
  clampLat,
  computeGreatCircleDistanceKm,
  DEFAULT_CENTER,
  DEFAULT_GEOLOCATION_MAX_ZOOM,
  DEFAULT_ZOOM,
  createDefaultUrlHashState,
  INITIAL_LOCATE_MIN_MOVE_DISTANCE_KM,
  LEGACY_URL_HASH_STORAGE_KEY,
  normalizeLng,
  parseUrlHash,
  resolveInitialUrlHashState,
  serializeStoredState,
  serializeUrlHash,
  shouldMoveOnInitialLocate,
  SINGAPORE_CENTER,
  syncUrlHashAndStorage,
  URL_HASH_STORAGE_KEY,
  type BrowserSyncTarget,
  type UrlHashState,
} from '../src/state/urlHashState.ts'

// Fixed "today" so the date-based defaults are deterministic: 14 November 2026, local time
const TODAY = new Date(2026, 10, 14, 12)
const DEFAULT_URL_HASH_STATE = createDefaultUrlHashState(TODAY)

function createMockBrowserTarget(
  initialHash = '',
  initialStoredHash: string | null = null,
  storageKey = URL_HASH_STORAGE_KEY,
): {
  target: BrowserSyncTarget
  storageMap: Map<string, string>
  replaceCalls: string[]
} {
  const storageMap = new Map<string, string>()
  if (initialStoredHash !== null) {
    storageMap.set(storageKey, initialStoredHash)
  }
  const replaceCalls: string[] = []

  const target: BrowserSyncTarget = {
    location: {
      hash: initialHash,
      pathname: '/earth/',
      search: '',
    },
    history: {
      state: null,
      replaceState(_data: unknown, _unused: string, url?: string | URL | null) {
        const nextUrl = String(url ?? '')
        replaceCalls.push(nextUrl)
        const hashIdx = nextUrl.indexOf('#')
        target.location.hash = hashIdx >= 0 ? nextUrl.slice(hashIdx) : ''
      },
    },
    localStorage: {
      getItem(key: string) {
        return storageMap.get(key) ?? null
      },
      setItem(key: string, value: string) {
        storageMap.set(key, value)
      },
    },
  }

  return { target, storageMap, replaceCalls }
}

test('serializeUrlHash and parseUrlHash round-trip core controls and extensible extraParams', () => {
  const input: UrlHashState = {
    zoom: 6.45,
    lat: 1.3521,
    lng: 103.8198,
    viewMode: 'sensors',
    sensorFilter: 'viirs',
    projectionMode: 'mercator',
    selectedMonth: 2,
    showOrbits: false,
    showClouds: false,
    showNightLights: false,
    showFires: false,
    extraParams: {
      aoi: 'sea-1',
      hotspots: 'on',
    },
  }

  const hash = serializeUrlHash(input)
  assert.equal(
    hash,
    '#z=6.45&lat=1.3521&lng=103.8198&mode=sensors&sensor=viirs&proj=mercator&month=3&orbits=0&clouds=0&lights=0&fires=0&aoi=sea-1&hotspots=on',
  )

  const parsed = parseUrlHash(hash)
  assert.deepEqual(parsed, input)

  const enabledOrbits = parseUrlHash('#orbits=true')
  assert.equal(enabledOrbits?.showOrbits, true)

  const disabledOrbits = parseUrlHash('#orbits=off')
  assert.equal(disabledOrbits?.showOrbits, false)

  const enabledClouds = parseUrlHash('#clouds=true')
  assert.equal(enabledClouds?.showClouds, true)

  const disabledClouds = parseUrlHash('#clouds=off')
  assert.equal(disabledClouds?.showClouds, false)
})

test('coordinate normalization rounds to 4 decimals and wraps longitudes into [-180, 180]', () => {
  assert.equal(clampLat(95.123456), 90)
  assert.equal(clampLat(-91.5), -90)
  assert.equal(clampLat(1.352149), 1.3521)
  assert.equal(clampLat(-0), 0)

  assert.equal(normalizeLng(181.25), -178.75)
  assert.equal(normalizeLng(-181.25), 178.75)
  assert.equal(normalizeLng(540), 180)
  assert.equal(normalizeLng(-180), -180)
  assert.equal(normalizeLng(103.819876), 103.8199)
})

test('parseUrlHash accepts partial hashes, month names, legacy positional hashes, and rejects non-state fragments', () => {
  const partial = parseUrlHash('#z=9&lat=1.3521&lng=103.8198', DEFAULT_URL_HASH_STATE)
  assert.deepEqual(partial, {
    ...DEFAULT_URL_HASH_STATE,
    zoom: 9,
    lat: 1.3521,
    lng: 103.8198,
  })

  const namedMonth = parseUrlHash('#month=Aug&lon=-60.1234')
  assert.equal(namedMonth?.selectedMonth, 7)
  assert.equal(namedMonth?.lng, -60.1234)

  const positional = parseUrlHash('#4.5/39.2611/53.0722')
  assert.equal(positional?.zoom, 4.5)
  assert.equal(positional?.lat, 39.2611)
  assert.equal(positional?.lng, 53.0722)

  assert.equal(parseUrlHash(''), null)
  assert.equal(parseUrlHash('#inspector-heading'), null)
  assert.equal(parseUrlHash('#foo=bar'), null)
  assert.equal(parseUrlHash('#99/200/10'), null)
})

test('syncUrlHashAndStorage updates the URL hash and persists it without the month on every update', () => {
  const { target, storageMap, replaceCalls } = createMockBrowserTarget()

  const firstHash = syncUrlHashAndStorage(
    {
      ...DEFAULT_URL_HASH_STATE,
      zoom: 5.5,
      lat: 1.3521,
      lng: 103.8198,
    },
    target,
  )

  assert.equal(target.location.hash, firstHash)
  assert.match(firstHash, /&month=11&/)
  assert.equal(storageMap.get(URL_HASH_STORAGE_KEY), firstHash.replace('&month=11', ''))
  assert.equal(replaceCalls.length, 1)

  const secondHash = syncUrlHashAndStorage(
    {
      ...DEFAULT_URL_HASH_STATE,
      zoom: 5.5,
      lat: 1.3521,
      lng: 103.8198,
      viewMode: 'seasonal',
    },
    target,
  )

  assert.notEqual(secondHash, firstHash)
  assert.equal(target.location.hash, secondHash)
  assert.equal(storageMap.get(URL_HASH_STORAGE_KEY), secondHash.replace('&month=11', ''))
  assert.equal(replaceCalls.length, 2)

  // Calling sync again with identical hash still persists to localStorage without redundant replaceState.
  const repeatedHash = syncUrlHashAndStorage(
    {
      ...DEFAULT_URL_HASH_STATE,
      zoom: 5.5,
      lat: 1.3521,
      lng: 103.8198,
      viewMode: 'seasonal',
    },
    target,
  )
  assert.equal(repeatedHash, secondHash)
  assert.equal(storageMap.get(URL_HASH_STORAGE_KEY), secondHash.replace('&month=11', ''))
  assert.equal(replaceCalls.length, 2)

  // Nothing is written under the old key
  assert.equal(storageMap.has(LEGACY_URL_HASH_STORAGE_KEY), false)
  assert.notEqual(URL_HASH_STORAGE_KEY, LEGACY_URL_HASH_STORAGE_KEY)
})

test('resolveInitialUrlHashState resolves hash > storage > default priority', () => {
  const fromHash = resolveInitialUrlHashState(
    createMockBrowserTarget(
      '#z=7.25&lat=-8.5&lng=-60',
      '#z=4&lat=58.6&lng=-114.4',
    ).target,
    TODAY,
  )
  assert.equal(fromHash.source, 'hash')
  assert.equal(fromHash.state.zoom, 7.25)
  assert.equal(fromHash.state.lat, -8.5)
  assert.equal(fromHash.state.lng, -60)

  const fromStorage = resolveInitialUrlHashState(
    createMockBrowserTarget('#inspector-heading', '#z=4&lat=58.6&lng=-114.4&mode=seasonal').target,
    TODAY,
  )
  assert.equal(fromStorage.source, 'storage')
  assert.equal(fromStorage.state.zoom, 4)
  assert.equal(fromStorage.state.lat, 58.6)
  assert.equal(fromStorage.state.lng, -114.4)
  assert.equal(fromStorage.state.viewMode, 'seasonal')

  const fromDefault = resolveInitialUrlHashState(
    createMockBrowserTarget('', '#not-valid-state').target,
    TODAY,
  )
  assert.equal(fromDefault.source, 'default')
  assert.deepEqual(fromDefault.state, DEFAULT_URL_HASH_STATE)
})

test('defaults follow the given date: current month, orbits and clouds on', () => {
  assert.equal(DEFAULT_URL_HASH_STATE.selectedMonth, 10)
  assert.equal(DEFAULT_URL_HASH_STATE.showOrbits, true)
  assert.equal(DEFAULT_URL_HASH_STATE.showClouds, true)
  assert.equal(createDefaultUrlHashState(new Date(2027, 0, 1, 12)).selectedMonth, 0)
  assert.equal(createDefaultUrlHashState(new Date(2027, 11, 31, 12)).selectedMonth, 11)
  assert.match(serializeUrlHash(DEFAULT_URL_HASH_STATE), /&month=11&orbits=1&clouds=1(&|$)/)
})

test('the month comes from the hash or the date, never from storage; orbits and clouds restore from either', () => {
  const fresh = resolveInitialUrlHashState(createMockBrowserTarget().target, TODAY)
  assert.equal(fresh.source, 'default')
  assert.equal(fresh.state.selectedMonth, 10)
  assert.equal(fresh.state.showOrbits, true)
  assert.equal(fresh.state.showClouds, true)

  const fromHash = resolveInitialUrlHashState(
    createMockBrowserTarget('#month=3&orbits=0&clouds=0', '#month=7&orbits=1&clouds=1').target,
    TODAY,
  )
  assert.equal(fromHash.source, 'hash')
  assert.equal(fromHash.state.selectedMonth, 2)
  assert.equal(fromHash.state.showOrbits, false)
  assert.equal(fromHash.state.showClouds, false)

  // A stored month (written by an older build of this key's format) is ignored
  const fromStorage = resolveInitialUrlHashState(
    createMockBrowserTarget('', '#z=2&lat=0&lng=0&month=7&orbits=0&clouds=0').target,
    TODAY,
  )
  assert.equal(fromStorage.source, 'storage')
  assert.equal(fromStorage.state.selectedMonth, 10)
  assert.equal(fromStorage.state.showOrbits, false)
  assert.equal(fromStorage.state.showClouds, false)
  assert.equal(fromStorage.state.zoom, 2)

  // A returning visitor of an old build: its auto-written state under the old key is not read
  const legacy = resolveInitialUrlHashState(
    createMockBrowserTarget(
      '',
      '#z=4&lat=58.6&lng=-114.4&mode=anomaly&sensor=viirs&proj=mercator&month=9&orbits=0&clouds=0',
      LEGACY_URL_HASH_STORAGE_KEY,
    ).target,
    TODAY,
  )
  assert.equal(legacy.source, 'default')
  assert.deepEqual(legacy.state, DEFAULT_URL_HASH_STATE)

  // What sync stores round-trips everything but the month
  const stored = serializeStoredState({
    ...DEFAULT_URL_HASH_STATE,
    selectedMonth: 2,
    showOrbits: false,
    showClouds: false,
    sensorFilter: 'modis',
    projectionMode: 'mercator',
    selectedRegionId: 'amazon-arc',
  })
  assert.doesNotMatch(stored, /month=/)
  const restored = resolveInitialUrlHashState(createMockBrowserTarget('', stored).target, TODAY)
  assert.deepEqual(restored.state, {
    ...DEFAULT_URL_HASH_STATE,
    showOrbits: false,
    showClouds: false,
    sensorFilter: 'modis',
    projectionMode: 'mercator',
    selectedRegionId: 'amazon-arc',
  })

  // A hash without a month (e.g. an old viewport-only link) gets today's month
  const viewportOnly = resolveInitialUrlHashState(
    createMockBrowserTarget('#4.5/39.2611/53.0722').target,
    TODAY,
  )
  assert.equal(viewportOnly.source, 'hash')
  assert.equal(viewportOnly.state.selectedMonth, 10)
  assert.equal(viewportOnly.state.zoom, 4.5)
})

test('selected region round-trips through the hash and stays out of it when nothing is selected', () => {
  const withRegion: UrlHashState = { ...DEFAULT_URL_HASH_STATE, selectedRegionId: 'amazon-arc' }
  const hash = serializeUrlHash(withRegion)
  assert.match(hash, /&region=amazon-arc(&|$)/)
  assert.deepEqual(parseUrlHash(hash), withRegion)

  const withoutRegion = serializeUrlHash(DEFAULT_URL_HASH_STATE)
  assert.doesNotMatch(withoutRegion, /region=/)
  const parsedWithout = parseUrlHash(withoutRegion)
  assert.equal(parsedWithout?.selectedRegionId, undefined)
  assert.equal(parsedWithout !== null && 'selectedRegionId' in parsedWithout, false)

  // A region alone is a valid state hash; extra params survive next to it
  assert.equal(parseUrlHash('#region=boreal-canada')?.selectedRegionId, 'boreal-canada')
  const withExtra = parseUrlHash('#z=3&region=mediterranean&aoi=sea-1')
  assert.equal(withExtra?.selectedRegionId, 'mediterranean')
  assert.deepEqual(withExtra?.extraParams, { aoi: 'sea-1' })
})

test('unknown region ids are ignored, never selected and never kept as extra params', () => {
  const parsed = parseUrlHash('#z=3&lat=10&lng=20&region=atlantis')
  assert.ok(parsed)
  assert.equal(parsed.selectedRegionId, undefined)
  assert.equal(parsed.extraParams, undefined)
  assert.equal(parsed.zoom, 3)
  assert.doesNotMatch(serializeUrlHash(parsed), /region=/)

  // Ids are matched exactly
  assert.equal(parseUrlHash('#z=3&region=Amazon-Arc')?.selectedRegionId, undefined)
  assert.equal(parseUrlHash('#region=atlantis'), null)

  // The fallback's selection is replaced only by a valid id
  const fallback: UrlHashState = { ...DEFAULT_URL_HASH_STATE, selectedRegionId: 'boreal-canada' }
  assert.equal(parseUrlHash('#z=3&region=atlantis', fallback)?.selectedRegionId, 'boreal-canada')
  assert.equal(parseUrlHash('#z=3&region=mediterranean', fallback)?.selectedRegionId, 'mediterranean')
})

test('selected region is restored on load from the hash and from storage, and written by sync', () => {
  const fromHash = resolveInitialUrlHashState(
    createMockBrowserTarget('#z=0.6&lat=0&lng=20&proj=mercator&region=northern-australia').target,
    TODAY,
  )
  assert.equal(fromHash.source, 'hash')
  assert.equal(fromHash.state.selectedRegionId, 'northern-australia')
  // The link's viewport is kept as is
  assert.equal(fromHash.state.zoom, 0.6)
  assert.equal(fromHash.state.lng, 20)

  const fromStorage = resolveInitialUrlHashState(
    createMockBrowserTarget('', '#z=4&lat=58.6&lng=-114.4&region=boreal-canada').target,
    TODAY,
  )
  assert.equal(fromStorage.source, 'storage')
  assert.equal(fromStorage.state.selectedRegionId, 'boreal-canada')

  const { target, storageMap } = createMockBrowserTarget()
  const selectedHash = syncUrlHashAndStorage(
    { ...DEFAULT_URL_HASH_STATE, selectedRegionId: 'singapore' },
    target,
  )
  assert.equal(target.location.hash, selectedHash)
  assert.match(storageMap.get(URL_HASH_STORAGE_KEY) ?? '', /region=singapore/)
  assert.equal(
    parseUrlHash('#z=3&region=sea-equatorial', DEFAULT_URL_HASH_STATE)?.selectedRegionId,
    'singapore',
  )

  syncUrlHashAndStorage({ ...DEFAULT_URL_HASH_STATE }, target)
  assert.doesNotMatch(target.location.hash, /region=/)
  assert.doesNotMatch(storageMap.get(URL_HASH_STORAGE_KEY) ?? '', /region=/)
})

test('clampGeolocationTargetZoom caps geolocation jump at default max zoom z7 while preserving coarser zooms', () => {
  assert.equal(DEFAULT_GEOLOCATION_MAX_ZOOM, 7)
  assert.equal(clampGeolocationTargetZoom(15), 7)
  assert.equal(clampGeolocationTargetZoom(7.01), 7)
  assert.equal(clampGeolocationTargetZoom(7), 7)
  assert.equal(clampGeolocationTargetZoom(6.25), 6.25)
  assert.equal(clampGeolocationTargetZoom(undefined), 7)
  assert.equal(clampGeolocationTargetZoom(Number.NaN), 7)
  assert.equal(clampGeolocationTargetZoom(14, 11), 11)
})

test('region and clouds share one registry and round-trip together', () => {
  const state: UrlHashState = {
    ...DEFAULT_URL_HASH_STATE,
    showClouds: false,
    selectedRegionId: 'boreal-canada',
  }
  const hash = serializeUrlHash(state)
  assert.match(hash, /&orbits=1&clouds=0&region=boreal-canada$/)
  assert.deepEqual(parseUrlHash(hash, DEFAULT_URL_HASH_STATE), state)
  assert.equal(parseUrlHash('#clouds=maybe&region=boreal-canada')?.showClouds, true)
})

test('fires sits in the same registry: on by default and absent, fires=0 when off', () => {
  assert.equal(DEFAULT_URL_HASH_STATE.showFires, true)
  assert.doesNotMatch(serializeUrlHash(DEFAULT_URL_HASH_STATE), /fires=/)

  const off: UrlHashState = { ...DEFAULT_URL_HASH_STATE, showFires: false, selectedRegionId: 'mediterranean' }
  const hash = serializeUrlHash(off)
  assert.match(hash, /&orbits=1&clouds=1&fires=0&region=mediterranean$/)
  assert.deepEqual(parseUrlHash(hash, DEFAULT_URL_HASH_STATE), off)

  // The team's links: fires=0 turns them off, fires=1 or no key keeps them on; never an extra param
  assert.equal(parseUrlHash('#fires=0')?.showFires, false)
  assert.equal(parseUrlHash('#fires=1')?.showFires, true)
  assert.equal(parseUrlHash('#z=3&fires=0')?.extraParams, undefined)
  assert.equal(parseUrlHash('#z=3&fires=maybe')?.showFires, true)

  // Restored from storage like orbits and clouds
  const restored = resolveInitialUrlHashState(
    createMockBrowserTarget('', serializeStoredState(off)).target,
    TODAY,
  )
  assert.equal(restored.state.showFires, false)
})

test('lights sits in the same registry: on by default and absent, lights=0 when off', () => {
  assert.equal(DEFAULT_URL_HASH_STATE.showNightLights, true)
  assert.doesNotMatch(serializeUrlHash(DEFAULT_URL_HASH_STATE), /lights=/)

  const off: UrlHashState = {
    ...DEFAULT_URL_HASH_STATE,
    showNightLights: false,
    selectedRegionId: 'mediterranean',
  }
  const hash = serializeUrlHash(off)
  assert.match(hash, /&orbits=1&clouds=1&lights=0&region=mediterranean$/)
  assert.deepEqual(parseUrlHash(hash, DEFAULT_URL_HASH_STATE), off)

  assert.equal(parseUrlHash('#lights=0')?.showNightLights, false)
  assert.equal(parseUrlHash('#lights=off')?.showNightLights, false)
  assert.equal(parseUrlHash('#lights=1')?.showNightLights, true)
  assert.equal(parseUrlHash('#z=3&lights=0')?.extraParams, undefined)
  assert.equal(parseUrlHash('#z=3&lights=maybe')?.showNightLights, true)

  const restored = resolveInitialUrlHashState(
    createMockBrowserTarget('', serializeStoredState(off)).target,
    TODAY,
  )
  assert.equal(restored.state.showNightLights, false)
})

test('default viewport centers on Singapore at globe zoom z3', () => {
  assert.deepEqual(SINGAPORE_CENTER, [103.8198, 1.3521])
  assert.deepEqual(DEFAULT_CENTER, [103.8198, 1.3521])
  assert.equal(DEFAULT_ZOOM, 3)

  assert.equal(DEFAULT_URL_HASH_STATE.lat, 1.3521)
  assert.equal(DEFAULT_URL_HASH_STATE.lng, 103.8198)
  assert.equal(DEFAULT_URL_HASH_STATE.zoom, 3)

  assert.equal(clampLat(Number.NaN), 1.3521)
  assert.equal(normalizeLng(Number.NaN), 103.8198)
})

test('shouldMoveOnInitialLocate enforces 100 km bounce-prevention threshold from Singapore', () => {
  assert.equal(INITIAL_LOCATE_MIN_MOVE_DISTANCE_KM, 100)

  const nearbyLocations: readonly [string, [number, number]][] = [
    ['Singapore center', [103.8198, 1.3521]],
    ['Changi', [103.9915, 1.3644]],
    ['Tuas', [103.6366, 1.3404]],
    ['Johor Bahru', [103.7414, 1.4927]],
    ['Batam', [104.0305, 1.0456]],
  ]
  for (const [label, coords] of nearbyLocations) {
    const distanceKm = computeGreatCircleDistanceKm(SINGAPORE_CENTER, coords)
    assert.ok(distanceKm < 100, `${label} should be < 100 km (got ${distanceKm.toFixed(2)} km)`)
    assert.equal(shouldMoveOnInitialLocate(coords), false, `${label} should not trigger move`)
  }

  const distantLocations: readonly [string, [number, number]][] = [
    ['Malacca', [102.2501, 2.1896]],
    ['Kuala Lumpur', [101.6869, 3.139]],
    ['Jakarta', [106.8456, -6.2088]],
    ['London', [-0.1276, 51.5072]],
  ]
  for (const [label, coords] of distantLocations) {
    const distanceKm = computeGreatCircleDistanceKm(SINGAPORE_CENTER, coords)
    assert.ok(distanceKm >= 100, `${label} should be >= 100 km (got ${distanceKm.toFixed(2)} km)`)
    assert.equal(shouldMoveOnInitialLocate(coords), true, `${label} should trigger move`)
  }

  const crossAntimeridianShort = computeGreatCircleDistanceKm([179.9, 0], [-179.9, 0])
  assert.ok(
    crossAntimeridianShort > 20 && crossAntimeridianShort < 25,
    `expected ~22.2 km across antimeridian, got ${crossAntimeridianShort.toFixed(2)} km`,
  )
  assert.equal(shouldMoveOnInitialLocate([-179.9, 0], [179.9, 0]), false)
  assert.equal(shouldMoveOnInitialLocate([-175, 0], [179, 0]), true)

  assert.equal(Number.isNaN(computeGreatCircleDistanceKm(SINGAPORE_CENTER, [Number.NaN, 1.3521])), true)
  assert.equal(shouldMoveOnInitialLocate([Number.NaN, 1.3521]), false)
  assert.equal(shouldMoveOnInitialLocate([103.8198, Number.POSITIVE_INFINITY]), false)
})
