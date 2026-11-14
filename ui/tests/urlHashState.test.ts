import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampGeolocationTargetZoom,
  clampLat,
  DEFAULT_GEOLOCATION_MAX_ZOOM,
  DEFAULT_URL_HASH_STATE,
  normalizeLng,
  parseUrlHash,
  resolveInitialUrlHashState,
  serializeUrlHash,
  syncUrlHashAndStorage,
  URL_HASH_STORAGE_KEY,
  type BrowserSyncTarget,
  type UrlHashState,
} from '../src/state/urlHashState.ts'

function createMockBrowserTarget(initialHash = '', initialStoredHash: string | null = null): {
  target: BrowserSyncTarget
  storageMap: Map<string, string>
  replaceCalls: string[]
} {
  const storageMap = new Map<string, string>()
  if (initialStoredHash !== null) {
    storageMap.set(URL_HASH_STORAGE_KEY, initialStoredHash)
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
    extraParams: {
      aoi: 'sea-1',
      hotspots: 'on',
    },
  }

  const hash = serializeUrlHash(input)
  assert.equal(
    hash,
    '#z=6.45&lat=1.3521&lng=103.8198&mode=sensors&sensor=viirs&proj=mercator&month=3&aoi=sea-1&hotspots=on',
  )

  const parsed = parseUrlHash(hash)
  assert.deepEqual(parsed, input)
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
  const partial = parseUrlHash('#z=9&lat=1.3521&lng=103.8198')
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

test('syncUrlHashAndStorage updates URL hash and persists exact hash string to localStorage on every update', () => {
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
  assert.equal(storageMap.get(URL_HASH_STORAGE_KEY), firstHash)
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
  assert.equal(storageMap.get(URL_HASH_STORAGE_KEY), secondHash)
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
  assert.equal(storageMap.get(URL_HASH_STORAGE_KEY), secondHash)
  assert.equal(replaceCalls.length, 2)
})

test('resolveInitialUrlHashState resolves hash > storage > default priority', () => {
  const fromHash = resolveInitialUrlHashState(
    createMockBrowserTarget(
      '#z=7.25&lat=-8.5&lng=-60',
      '#z=4&lat=58.6&lng=-114.4',
    ).target,
  )
  assert.equal(fromHash.source, 'hash')
  assert.equal(fromHash.state.zoom, 7.25)
  assert.equal(fromHash.state.lat, -8.5)
  assert.equal(fromHash.state.lng, -60)

  const fromStorage = resolveInitialUrlHashState(
    createMockBrowserTarget('#inspector-heading', '#z=4&lat=58.6&lng=-114.4&mode=seasonal').target,
  )
  assert.equal(fromStorage.source, 'storage')
  assert.equal(fromStorage.state.zoom, 4)
  assert.equal(fromStorage.state.lat, 58.6)
  assert.equal(fromStorage.state.lng, -114.4)
  assert.equal(fromStorage.state.viewMode, 'seasonal')

  const fromDefault = resolveInitialUrlHashState(
    createMockBrowserTarget('', '#not-valid-state').target,
  )
  assert.equal(fromDefault.source, 'default')
  assert.deepEqual(fromDefault.state, DEFAULT_URL_HASH_STATE)
})

test('clampGeolocationTargetZoom caps geolocation jump at default max zoom z9 while preserving coarser zooms', () => {
  assert.equal(DEFAULT_GEOLOCATION_MAX_ZOOM, 9)
  assert.equal(clampGeolocationTargetZoom(15), 9)
  assert.equal(clampGeolocationTargetZoom(9.01), 9)
  assert.equal(clampGeolocationTargetZoom(9), 9)
  assert.equal(clampGeolocationTargetZoom(6.25), 6.25)
  assert.equal(clampGeolocationTargetZoom(undefined), 9)
  assert.equal(clampGeolocationTargetZoom(Number.NaN), 9)
  assert.equal(clampGeolocationTargetZoom(14, 11), 11)
})
