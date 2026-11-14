import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildGlobeHaloFragmentShaderSource,
  buildGlobeHaloVertexShaderSource,
  computeGlobeHaloUniforms,
  computeGlobeHaloZoomFade,
  HALO_FADE_END_ZOOM,
  HALO_FADE_START_ZOOM,
  invertMat4,
} from '../src/utils/globeHaloShader.ts'
import {
  computeCelestialCameraBasis,
  createStarCatalog,
  projectStarToViewport,
} from '../src/utils/spaceStarfield.ts'

function makePerspectiveMatrix(
  fovYRad: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1 / Math.tan(fovYRad / 2)
  const nf = 1 / (near - far)
  // Column-major 4x4 WebGL perspective matrix.
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ])
}

function multiplyMat4(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k]
      }
      out[col * 4 + row] = sum
    }
  }
  return out
}

describe('spaceStarfield math and catalog', () => {
  it('generates a deterministic unit-sphere catalog across pinprick, medium, and hero tiers', () => {
    const a = createStarCatalog(0x51a7f13d, 600)
    const b = createStarCatalog(0x51a7f13d, 600)
    assert.deepEqual(a, b)
    assert.ok(a.length > 600, 'Expected random catalog plus curated hero stars')

    const tiers = new Set(a.map((star) => star.tier))
    assert.ok(tiers.has('pinprick'))
    assert.ok(tiers.has('medium'))
    assert.ok(tiers.has('hero'))

    for (const star of a) {
      const length = Math.hypot(star.x, star.y, star.z)
      assert.ok(Math.abs(length - 1) < 1e-12, `Expected unit vector, got ${length}`)
      assert.ok(star.alpha > 0 && star.alpha <= 1)
      assert.ok(star.radiusPx > 0)
    }
  })

  it('builds an orthonormal celestial camera basis and wraps seamlessly at +/-180 deg', () => {
    const poses = [
      { lngDeg: 0, latDeg: 0, bearingDeg: 0, pitchDeg: 0 },
      { lngDeg: 103.8, latDeg: 1.35, bearingDeg: 42, pitchDeg: 58 },
      { lngDeg: -122.4, latDeg: -64.5, bearingDeg: -135, pitchDeg: 35 },
    ]

    for (const pose of poses) {
      const basis = computeCelestialCameraBasis(pose)
      const fLen = Math.hypot(basis.forward.x, basis.forward.y, basis.forward.z)
      const rLen = Math.hypot(basis.right.x, basis.right.y, basis.right.z)
      const uLen = Math.hypot(basis.up.x, basis.up.y, basis.up.z)
      assert.ok(Math.abs(fLen - 1) < 1e-12)
      assert.ok(Math.abs(rLen - 1) < 1e-12)
      assert.ok(Math.abs(uLen - 1) < 1e-12)

      const dotFR =
        basis.forward.x * basis.right.x +
        basis.forward.y * basis.right.y +
        basis.forward.z * basis.right.z
      const dotFU =
        basis.forward.x * basis.up.x +
        basis.forward.y * basis.up.y +
        basis.forward.z * basis.up.z
      const dotRU =
        basis.right.x * basis.up.x +
        basis.right.y * basis.up.y +
        basis.right.z * basis.up.z

      assert.ok(Math.abs(dotFR) < 1e-12)
      assert.ok(Math.abs(dotFU) < 1e-12)
      assert.ok(Math.abs(dotRU) < 1e-12)
    }

    const eastEdge = computeCelestialCameraBasis({
      lngDeg: 179.999,
      latDeg: 15,
      bearingDeg: 12,
      pitchDeg: 25,
    })
    const westEdge = computeCelestialCameraBasis({
      lngDeg: -179.999,
      latDeg: 15,
      bearingDeg: 12,
      pitchDeg: 25,
    })
    assert.ok(Math.abs(eastEdge.forward.x - westEdge.forward.x) < 1e-4)
    assert.ok(Math.abs(eastEdge.forward.y - westEdge.forward.y) < 1e-4)
    assert.ok(Math.abs(eastEdge.forward.z - westEdge.forward.z) < 1e-4)
  })

  it('projects forward stars to the viewport center and culls behind-camera or invalid dims', () => {
    const basis = computeCelestialCameraBasis({
      lngDeg: 25,
      latDeg: 10,
      bearingDeg: 0,
      pitchDeg: 0,
    })

    const centered = projectStarToViewport(basis.forward, basis, 1280, 720)
    assert.ok(centered !== null)
    assert.ok(Math.abs(centered.x - 640) < 1e-9)
    assert.ok(Math.abs(centered.y - 360) < 1e-9)
    assert.ok(Math.abs(centered.depth - 1) < 1e-9)

    const behind = {
      x: -basis.forward.x,
      y: -basis.forward.y,
      z: -basis.forward.z,
    }
    assert.equal(projectStarToViewport(behind, basis, 1280, 720), null)
    assert.equal(projectStarToViewport(basis.forward, basis, 0, 720), null)
  })
})

describe('globeHaloShader math and GLSL sources', () => {
  it('inverts column-major 4x4 matrices accurately and rejects singular inputs', () => {
    const proj = makePerspectiveMatrix((36.87 * Math.PI) / 180, 16 / 9, 10, 10000)
    const inv = invertMat4(proj)
    assert.ok(inv !== null)

    const product = multiplyMat4(proj, inv)
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        const expected = col === row ? 1 : 0
        assert.ok(
          Math.abs(product[col * 4 + row] - expected) < 1e-5,
          `Mismatch at (${row},${col}): ${product[col * 4 + row]}`,
        )
      }
    }

    assert.equal(invertMat4(new Float32Array(16)), null)
    assert.equal(invertMat4([1, 0, 0]), null)
  })

  it('computes zoom fade thresholds from z5.5 to z8.5', () => {
    assert.equal(computeGlobeHaloZoomFade(0), 1)
    assert.equal(computeGlobeHaloZoomFade(HALO_FADE_START_ZOOM), 1)
    const mid = computeGlobeHaloZoomFade((HALO_FADE_START_ZOOM + HALO_FADE_END_ZOOM) / 2)
    assert.ok(Math.abs(mid - 0.5) < 1e-12)
    assert.equal(computeGlobeHaloZoomFade(HALO_FADE_END_ZOOM), 0)
    assert.equal(computeGlobeHaloZoomFade(11), 0)
    assert.equal(computeGlobeHaloZoomFade(Number.NaN), 0)
  })

  it('computes view-space globe halo uniforms and skips 2D Mercator or high zoom', () => {
    const proj = makePerspectiveMatrix((36.87 * Math.PI) / 180, 1.5, 50, 50000)
    const centerDist = 1400
    // ModelView translating world origin to (0, 0, -centerDist) in view space.
    const mv = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, -centerDist, 1,
    ])
    const mvp = multiplyMat4(proj, mv)

    const uniforms = computeGlobeHaloUniforms({
      modelViewProjectionMatrix: mvp,
      projectionMatrix: proj,
      zoom: 1.5,
      centerLatDeg: 15,
      viewportHeightCssPx: 800,
      projectionTransition: 1,
    })
    assert.ok(uniforms !== null)
    assert.ok(Math.abs(uniforms.globeCenterView[0]) < 1e-3)
    assert.ok(Math.abs(uniforms.globeCenterView[1]) < 1e-3)
    assert.ok(Math.abs(uniforms.globeCenterView[2] + centerDist) < 0.05)
    assert.ok(uniforms.globeRadius > 0)
    assert.ok(uniforms.viewUnitsPerCssPx > 0)
    assert.ok(uniforms.scalesCssPx[0] >= 30 && uniforms.scalesCssPx[0] <= 108)
    assert.ok(uniforms.scalesCssPx[1] >= 10 && uniforms.scalesCssPx[1] <= 34)
    assert.ok(uniforms.scalesCssPx[2] >= 2.0 && uniforms.scalesCssPx[2] <= 5.2)
    assert.equal(uniforms.strength, 1)

    assert.equal(
      computeGlobeHaloUniforms({
        modelViewProjectionMatrix: mvp,
        projectionMatrix: proj,
        zoom: 1.5,
        centerLatDeg: 15,
        viewportHeightCssPx: 800,
        projectionTransition: 0,
      }),
      null,
    )
    assert.equal(
      computeGlobeHaloUniforms({
        modelViewProjectionMatrix: mvp,
        projectionMatrix: proj,
        zoom: 9.0,
        centerLatDeg: 15,
        viewportHeightCssPx: 800,
        projectionTransition: 1,
      }),
      null,
    )
  })

  it('builds valid WebGL2 ES 3.00 shaders with dithered premultiplied atmospheric glow', () => {
    const vert = buildGlobeHaloVertexShaderSource()
    const frag = buildGlobeHaloFragmentShaderSource()

    assert.match(vert, /^#version 300 es/)
    assert.match(vert, /uniform mat4 u_invProjMatrix/)
    assert.match(vert, /out vec3 v_viewDir/)

    assert.match(frag, /^#version 300 es/)
    assert.match(frag, /uniform vec3 u_globeCenter/)
    assert.match(frag, /uniform float u_globeRadius/)
    assert.match(frag, /uniform int u_pass/)
    assert.match(frag, /interleavedGradientNoise/)
    assert.match(frag, /clamp\(\(premulRgb \+ vec3\(dither \* 0\.35\)\) \* u_strength, vec3\(0\.0\), vec3\(finalAlpha\)\)/)
  })
})
