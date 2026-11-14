import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCloudFragmentShaderSource,
  buildCloudPolarCapUrl,
  buildCloudTileUrl,
  buildCloudVertexShaderSource,
  computeCloudLayerOpacity,
  computeGlobeSubdivisionGranularity,
  computeTileSubUv,
  DEFAULT_CLOUD_BASE_OPACITY,
  getTilePolarHemisphere,
  normalizeCloudCoveringTiles,
  POLAR_CAP_INNER_SIZE,
  POLAR_CAP_TEXTURE_SIZE,
  projectSphereDirToPolarCapUv,
} from '../src/utils/satelliteCloudShader.ts'

test('computeCloudLayerOpacity preserves full base opacity through z5.25 and fades proportionally to zero by z9', () => {
  assert.equal(computeCloudLayerOpacity(0), DEFAULT_CLOUD_BASE_OPACITY)
  assert.equal(computeCloudLayerOpacity(1.75), DEFAULT_CLOUD_BASE_OPACITY)
  assert.equal(computeCloudLayerOpacity(5.25), DEFAULT_CLOUD_BASE_OPACITY)

  assert.ok(Math.abs(computeCloudLayerOpacity(6) - DEFAULT_CLOUD_BASE_OPACITY * 0.8) < 1e-9)
  assert.ok(Math.abs(computeCloudLayerOpacity(7) - DEFAULT_CLOUD_BASE_OPACITY * (2 / 3.75)) < 1e-9)
  assert.ok(Math.abs(computeCloudLayerOpacity(7.125) - DEFAULT_CLOUD_BASE_OPACITY * 0.5) < 1e-9)
  assert.ok(Math.abs(computeCloudLayerOpacity(8) - DEFAULT_CLOUD_BASE_OPACITY * (1 / 3.75)) < 1e-9)

  assert.equal(computeCloudLayerOpacity(9), 0)
  assert.equal(computeCloudLayerOpacity(12), 0)
  assert.equal(computeCloudLayerOpacity(2, 0), 0)
})

test('buildCloudTileUrl targets relative proxy in dev and configured backend origin in prod', () => {
  assert.equal(
    buildCloudTileUrl('', 2, 3, 1, 1700000000123.9),
    '/api/weather/satellite/2/3/1.png?timestamp=1700000000123',
  )
  assert.equal(
    buildCloudTileUrl('https://api.example.run.app/', 4, 10, 7, 1700000000000),
    'https://api.example.run.app/api/weather/satellite/4/10/7.png?timestamp=1700000000000',
  )
})

test('computeTileSubUv maps child tiles accurately onto ancestor cloud textures', () => {
  assert.deepEqual(computeTileSubUv(3, 5, 6, 3), {
    uvOffset: [0, 0],
    uvScale: 1,
  })
  assert.deepEqual(computeTileSubUv(2, 3, 2, 1), {
    uvOffset: [0.5, 0],
    uvScale: 0.5,
  })
  assert.deepEqual(computeTileSubUv(3, 5, 6, 1), {
    uvOffset: [0.25, 0.5],
    uvScale: 0.25,
  })
})

test('computeGlobeSubdivisionGranularity matches MapLibre globe tile subdivision and keeps mercator flat', () => {
  assert.equal(computeGlobeSubdivisionGranularity(1, true), 64)
  assert.equal(computeGlobeSubdivisionGranularity(2, true), 32)
  assert.equal(computeGlobeSubdivisionGranularity(3, true), 32)
  assert.equal(computeGlobeSubdivisionGranularity(7, true), 32)
  assert.equal(computeGlobeSubdivisionGranularity(2, false), 1)
})

test('normalizeCloudCoveringTiles expands z=0 root tiles into z=1 quads, preserves wrap, deduplicates, and filters out-of-range zoom', () => {
  const expanded = normalizeCloudCoveringTiles([
    { canonical: { z: 0, x: 0, y: 0 }, wrap: 0 },
    { canonical: { z: 0, x: 0, y: 0 }, wrap: -1 },
    { canonical: { z: 1, x: 0, y: 0 }, wrap: 0 },
    { canonical: { z: 2, x: 3, y: 1 }, wrap: 0 },
    { canonical: { z: 8, x: 0, y: 0 }, wrap: 0 },
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
    { canonical: { z: 2, x: 3, y: 1 }, wrap: 0 },
  ])
})

test('generated GLSL shaders preserve extremum terminator VIS/IR math, 258px gutter UV, and globe projection support', () => {
  const vertexSource = buildCloudVertexShaderSource({
    vertexShaderPrelude: 'vec4 projectTile(vec2 p, vec2 r) { return vec4(p, 0.0, 1.0); }',
    define: '#define GLOBE',
  })
  assert.match(vertexSource, /^#version 300 es/)
  assert.match(vertexSource, /\(1\.0 \+ inSourceTile \* 256\.0\) \/ 258\.0/)
  assert.match(vertexSource, /projectTile\(a_pos, a_pos\)/)
  assert.match(vertexSource, /#ifdef GLOBE[\s\S]*v_depth = gl_Position\.z \/ gl_Position\.w;/)

  const fragmentSource = buildCloudFragmentShaderSource({
    vertexShaderPrelude: '',
    define: '#define GLOBE',
  })
  assert.match(fragmentSource, /^#version 300 es/)
  assert.match(fragmentSource, /computeEmboss/)
  assert.match(fragmentSource, /vec3 irTint = ir \* vec3\(0\.0, 0\.35, 0\.9\);/)
  assert.match(fragmentSource, /vec3 visTint = vis \* vec3\(1\.0, 0\.67, 0\.15\);/)
  assert.match(fragmentSource, /vec3 nightTint = \(ir \* vec3\(0\.8, 0\.3, 0\.0\) \+ vec3\(0\.1, 0\.15, 0\.2\)\) \* orig\.z;/)
  assert.match(fragmentSource, /fragColor = vec4\(cloudColor \* finalAlpha, finalAlpha\);/)
  assert.match(fragmentSource, /if \(v_depth > 1\.0\) discard;/)
})

test('buildCloudPolarCapUrl targets relative proxy in dev and configured backend origin in prod', () => {
  assert.equal(
    buildCloudPolarCapUrl('', 'north', 1700000000123.9),
    '/api/weather/satellite/polar/north.png?timestamp=1700000000123',
  )
  assert.equal(
    buildCloudPolarCapUrl('https://api.example.run.app/', 'south', 1700000000000),
    'https://api.example.run.app/api/weather/satellite/polar/south.png?timestamp=1700000000000',
  )
})

test('getTilePolarHemisphere detects all z=1..7 tiles intersecting |lat| >= 78.5', () => {
  assert.equal(getTilePolarHemisphere(1, 0), 'north')
  assert.equal(getTilePolarHemisphere(1, 1), 'south')

  assert.equal(getTilePolarHemisphere(3, 0), 'north')
  assert.equal(getTilePolarHemisphere(3, 1), 'north')
  assert.equal(getTilePolarHemisphere(3, 2), null)
  assert.equal(getTilePolarHemisphere(3, 5), null)
  assert.equal(getTilePolarHemisphere(3, 6), 'south')
  assert.equal(getTilePolarHemisphere(3, 7), 'south')

  assert.equal(getTilePolarHemisphere(6, 0), 'north')
  assert.equal(getTilePolarHemisphere(6, 8), 'north')
  assert.equal(getTilePolarHemisphere(6, 9), null)
  assert.equal(getTilePolarHemisphere(6, 54), null)
  assert.equal(getTilePolarHemisphere(6, 55), 'south')
  assert.equal(getTilePolarHemisphere(6, 63), 'south')
})

test('projectSphereDirToPolarCapUv matches NasaGibsCloudComposer 514px guttered stereographic orientation', () => {
  const centerNorth = projectSphereDirToPolarCapUv(0, 0, 1)
  assert.ok(Math.abs(centerNorth[0] - 0.5) < 1e-9)
  assert.ok(Math.abs(centerNorth[1] - 0.5) < 1e-9)

  const centerSouth = projectSphereDirToPolarCapUv(0, 0, -1)
  assert.ok(Math.abs(centerSouth[0] - 0.5) < 1e-9)
  assert.ok(Math.abs(centerSouth[1] - 0.5) < 1e-9)

  const boundaryRad = (78 * Math.PI) / 180
  const maxInnerUv = (1 + POLAR_CAP_INNER_SIZE) / POLAR_CAP_TEXTURE_SIZE
  const minInnerUv = 1 / POLAR_CAP_TEXTURE_SIZE

  const primeMeridianNorth = projectSphereDirToPolarCapUv(Math.cos(boundaryRad), 0, Math.sin(boundaryRad))
  assert.ok(Math.abs(primeMeridianNorth[0] - maxInnerUv) < 1e-6)
  assert.ok(Math.abs(primeMeridianNorth[1] - 0.5) < 1e-6)

  const antiMeridianNorth = projectSphereDirToPolarCapUv(-Math.cos(boundaryRad), 0, Math.sin(boundaryRad))
  assert.ok(Math.abs(antiMeridianNorth[0] - minInnerUv) < 1e-6)
  assert.ok(Math.abs(antiMeridianNorth[1] - 0.5) < 1e-6)

  const ninetyEastSouth = projectSphereDirToPolarCapUv(0, Math.cos(boundaryRad), -Math.sin(boundaryRad))
  assert.ok(Math.abs(ninetyEastSouth[0] - 0.5) < 1e-6)
  assert.ok(Math.abs(ninetyEastSouth[1] - maxInnerUv) < 1e-6)
})

test('generated GLSL shaders include spherical pole direction and dual-sampler polar cap blending', () => {
  const vertexSource = buildCloudVertexShaderSource({
    vertexShaderPrelude: 'vec4 projectTile(vec2 p, vec2 r) { return vec4(p, 0.0, 1.0); }',
    define: '#define GLOBE',
  })
  assert.match(vertexSource, /uniform vec3 u_tileMercator;/)
  assert.match(vertexSource, /out vec3 v_sphereDir;/)
  assert.match(vertexSource, /v_sphereDir = vec3\(0\.0, 0\.0, 1\.0\);/)
  assert.match(vertexSource, /v_sphereDir = vec3\(0\.0, 0\.0, -1\.0\);/)

  const fragmentSource = buildCloudFragmentShaderSource({
    vertexShaderPrelude: '',
    define: '#define GLOBE',
  })
  assert.match(fragmentSource, /uniform sampler2D u_polarCapTexture;/)
  assert.match(fragmentSource, /uniform float u_polarCapMode;/)
  assert.match(fragmentSource, /dir\.xy \/ \(\(1\.0 \+ abs\(dir\.z\)\) \* POLAR_CAP_TAN_HALF_COLAT\)/)
  assert.match(fragmentSource, /smoothstep\(/)
})
