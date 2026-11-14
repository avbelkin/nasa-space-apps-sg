import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNightLightsFragmentShaderSource,
  buildNightLightsTileUrl,
  buildNightLightsVertexShaderSource,
  computeNightLightsZoomOpacity,
  computeNightTileSubdivisionGranularity,
  computeSubsolarPoint,
  doesTileIntersectNightSide,
  formatUtcDateString,
  GIBS_NIGHT_LIGHTS_LAYER,
  MAX_NIGHT_TILE_ZOOM,
  normalizeNightCoveringTiles,
  resolveNightLightsCandidateDates,
} from '../src/utils/nightLightsShader.ts'

const RAD_TO_DEG = 180 / Math.PI

test('computeNightLightsZoomOpacity holds 1.0 through z4, fades linearly to z6, and hides at z6+', () => {
  assert.equal(computeNightLightsZoomOpacity(-1), 1)
  assert.equal(computeNightLightsZoomOpacity(0), 1)
  assert.equal(computeNightLightsZoomOpacity(1.75), 1)
  assert.equal(computeNightLightsZoomOpacity(4), 1)

  assert.ok(Math.abs(computeNightLightsZoomOpacity(4.5) - 0.75) < 1e-9)
  assert.ok(Math.abs(computeNightLightsZoomOpacity(5) - 0.5) < 1e-9)
  assert.ok(Math.abs(computeNightLightsZoomOpacity(5.5) - 0.25) < 1e-9)

  assert.equal(computeNightLightsZoomOpacity(6), 0)
  assert.equal(computeNightLightsZoomOpacity(9), 0)
  assert.equal(computeNightLightsZoomOpacity(Number.NaN), 0)
  assert.equal(computeNightLightsZoomOpacity(Number.POSITIVE_INFINITY), 0)
})

test('buildNightLightsTileUrl uses NASA GIBS EPSG:3857 WMTS {z}/{y}/{x}.png row-first coordinate order', () => {
  const url = buildNightLightsTileUrl(3, 5, 2, '2026-11-01')
  assert.equal(
    url,
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${GIBS_NIGHT_LIGHTS_LAYER}/default/2026-11-01/GoogleMapsCompatible_Level8/3/2/5.png`,
  )
  assert.ok(url.endsWith('/3/2/5.png'))
})

test('resolveNightLightsCandidateDates anchors monthly YYYY-MM-01 from day 5+ and falls back early in month', () => {
  const midMonthMs = Date.UTC(2026, 10, 14, 12, 0, 0) // 2026-11-14
  assert.equal(formatUtcDateString(midMonthMs), '2026-11-14')
  assert.deepEqual(resolveNightLightsCandidateDates(midMonthMs), [
    '2026-11-01',
    '2026-11-10',
    '2026-11-07',
  ])

  const dayFiveMs = Date.UTC(2026, 10, 5, 0, 0, 0) // 2026-11-05 (now - 4d == 2026-11-01)
  assert.deepEqual(resolveNightLightsCandidateDates(dayFiveMs), [
    '2026-11-01',
    '2026-10-29',
  ])

  const earlyMonthMs = Date.UTC(2026, 10, 2, 6, 0, 0) // 2026-11-02
  assert.deepEqual(resolveNightLightsCandidateDates(earlyMonthMs), [
    '2026-10-29',
    '2026-10-26',
  ])
})

test('computeSubsolarPoint matches equinox, solstices, and unit vector length', () => {
  const marchEquinox = computeSubsolarPoint(Date.UTC(2026, 2, 20, 14, 46, 0))
  assert.ok(Math.abs(marchEquinox.latRad * RAD_TO_DEG) < 1)
  assert.ok(Math.abs(marchEquinox.lonRad * RAD_TO_DEG - -41.5) < 3)

  const juneSolstice = computeSubsolarPoint(Date.UTC(2026, 5, 21, 12, 0, 0))
  assert.ok(Math.abs(juneSolstice.latRad * RAD_TO_DEG - 23.44) < 0.3)

  const decSolstice = computeSubsolarPoint(Date.UTC(2026, 11, 21, 12, 0, 0))
  assert.ok(Math.abs(decSolstice.latRad * RAD_TO_DEG - -23.44) < 0.3)

  for (const sample of [marchEquinox, juneSolstice, decSolstice]) {
    const [ux, uy, uz] = sample.unitVector
    const norm = Math.hypot(ux, uy, uz)
    assert.ok(Math.abs(norm - 1) < 1e-12)
  }
})

test('doesTileIntersectNightSide culls sunlit tiles while keeping night, terminator, and winter polar tiles', () => {
  // Equinox noon at (lat = 0, lon = 0)
  const equinoxLat = 0
  const equinoxLon = 0

  // z=3, x=4 (0..+45E), y=3 (0..+41N) is fully near subsolar noon -> culled
  assert.equal(doesTileIntersectNightSide(3, 4, 3, equinoxLat, equinoxLon), false)
  // z=3, x=0 (-180..-135W), y=3 is centered near anti-solar midnight -> rendered
  assert.equal(doesTileIntersectNightSide(3, 0, 3, equinoxLat, equinoxLon), true)
  // z=3, x=2 (-90..-45W), y=3 straddles the -90W sunset/sunrise terminator -> rendered
  assert.equal(doesTileIntersectNightSide(3, 2, 3, equinoxLat, equinoxLon), true)

  // December solstice (subsolar ~23.44S, 0E): North Pole daytime-sector tile y=0 still enters polar night
  const decLat = -23.44 * (Math.PI / 180)
  assert.equal(doesTileIntersectNightSide(2, 2, 0, decLat, 0), true)

  // June solstice (subsolar ~23.44N, 0E): South Pole daytime-sector tile y=3 enters polar night,
  // while North Pole daytime-sector tile y=0 is in 24h polar daylight.
  const juneLat = 23.44 * (Math.PI / 180)
  assert.equal(doesTileIntersectNightSide(2, 2, 3, juneLat, 0), true)
  assert.equal(doesTileIntersectNightSide(2, 2, 0, juneLat, 0), false)
})

test('normalizeNightCoveringTiles and computeNightTileSubdivisionGranularity handle low zooms and mercator subdivision', () => {
  const expanded = normalizeNightCoveringTiles([
    { canonical: { z: 0, x: 0, y: 0 }, wrap: 0 },
    { canonical: { z: 0, x: 0, y: 0 }, wrap: -1 },
    { canonical: { z: 1, x: 0, y: 0 }, wrap: 0 },
    { canonical: { z: 4, x: 9, y: 5 }, wrap: 0 },
    { canonical: { z: MAX_NIGHT_TILE_ZOOM + 1, x: 0, y: 0 }, wrap: 0 },
    { canonical: { z: -1, x: 0, y: 0 }, wrap: 0 },
  ])

  assert.deepEqual(expanded, [
    { canonical: { z: 1, x: 0, y: 0 }, wrap: 0 },
    { canonical: { z: 1, x: 1, y: 0 }, wrap: 0 },
    { canonical: { z: 1, x: 0, y: 1 }, wrap: 0 },
    { canonical: { z: 1, x: 1, y: 1 }, wrap: 0 },
    { canonical: { z: 1, x: 0, y: 0 }, wrap: -1 },
    { canonical: { z: 1, x: 1, y: 0 }, wrap: -1 },
    { canonical: { z: 1, x: 0, y: 1 }, wrap: -1 },
    { canonical: { z: 1, x: 1, y: 1 }, wrap: -1 },
    { canonical: { z: 4, x: 9, y: 5 }, wrap: 0 },
  ])

  assert.equal(computeNightTileSubdivisionGranularity(1, true), 64)
  assert.equal(computeNightTileSubdivisionGranularity(2, true), 32)
  assert.equal(computeNightTileSubdivisionGranularity(5, true), 32)
  assert.equal(computeNightTileSubdivisionGranularity(1, false), 32)
  assert.equal(computeNightTileSubdivisionGranularity(2, false), 16)
  assert.equal(computeNightTileSubdivisionGranularity(5, false), 16)
})

test('generated GLSL shaders enforce solar terminator masking, pole mapping, ocean floor suppression, and premultiplied alpha', () => {
  const vertexSource = buildNightLightsVertexShaderSource({
    vertexShaderPrelude:
      'const float PI = 3.141592653589793;\nvec4 projectTile(vec2 p, vec2 r) { return vec4(p, 0.0, 1.0); }',
    define: '#define GLOBE',
  })
  assert.match(vertexSource, /^#version 300 es/)
  assert.equal((vertexSource.match(/\bconst float PI\b/g) ?? []).length, 1)
  assert.match(vertexSource, /\bNIGHT_LIGHTS_PI\b/)
  assert.match(vertexSource, /uniform vec3 u_tileMercator;/)
  assert.match(vertexSource, /if \(a_pos\.y < -32767\.5\)/)
  assert.match(vertexSource, /if \(a_pos\.y > 32766\.5\)/)
  assert.match(vertexSource, /out vec3 v_sphereDir;/)
  assert.match(vertexSource, /projectTile\(a_pos, a_pos\)/)
  assert.match(vertexSource, /#ifdef GLOBE[\s\S]*v_depth = gl_Position\.z \/ gl_Position\.w;/)

  const fragmentSource = buildNightLightsFragmentShaderSource({
    vertexShaderPrelude: '',
    define: '#define GLOBE',
  })
  assert.match(fragmentSource, /^#version 300 es/)
  assert.match(fragmentSource, /dot\(normalize\(v_sphereDir\), u_sunDir\)/)
  assert.match(fragmentSource, /smoothstep\(0\.125, 0\.94, raw\.r\) \* raw\.a/)
  assert.match(fragmentSource, /if \(v_depth > 1\.0\) discard;/)
  assert.match(fragmentSource, /fragColor = vec4\(premulRgb, finalAlpha\);/)
})
