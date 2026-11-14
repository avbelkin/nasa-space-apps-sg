import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCloudFragmentShaderSource,
  buildCloudTileUrl,
  buildCloudVertexShaderSource,
  computeCloudLayerOpacity,
  computeGlobeSubdivisionGranularity,
  computeTileSubUv,
  DEFAULT_CLOUD_BASE_OPACITY,
  normalizeCloudCoveringTiles,
} from '../src/utils/satelliteCloudShader.ts'

test('computeCloudLayerOpacity preserves full base opacity through z7 and fades smoothly to zero by z12', () => {
  assert.equal(computeCloudLayerOpacity(0), DEFAULT_CLOUD_BASE_OPACITY)
  assert.equal(computeCloudLayerOpacity(1.75), DEFAULT_CLOUD_BASE_OPACITY)
  assert.equal(computeCloudLayerOpacity(7), DEFAULT_CLOUD_BASE_OPACITY)

  const midZoomOpacity = computeCloudLayerOpacity(9.5)
  assert.ok(Math.abs(midZoomOpacity - DEFAULT_CLOUD_BASE_OPACITY * 0.5) < 1e-9)

  assert.equal(computeCloudLayerOpacity(12), 0)
  assert.equal(computeCloudLayerOpacity(15), 0)
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
