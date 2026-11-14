import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BRIGHT_STAR_CATALOG_J2000,
  bvToPaletteIndex,
} from '../src/data/brightStarCatalog.ts'
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
  computeGmstRad,
  computeSkyboxFovDeg,
  createMilkyWayCatalog,
  createSpaceStarfieldController,
  createStarCatalog,
  equatorialDegToUnitVec,
  galacticDegToEquatorialUnitVec,
  projectStarToViewport,
  SKYBOX_FOV_MAX_ZOOM,
  SKYBOX_FOV_MIN_ZOOM,
  SKYBOX_NARROW_FOV_DEG,
  SKYBOX_WIDE_FOV_DEG,
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

function makeTranslateZView(centerDist: number): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, -centerDist, 1,
  ])
}

function makeRotateYAndTranslateZView(angleRad: number, centerDist: number): Float32Array {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  // gl-matrix rotateY(angle) followed by translate(0, 0, -centerDist) in view coords:
  // v_cam = T(0,0,-d) * R_y(angle) * p
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, -centerDist, 1,
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

describe('brightStarCatalog & spaceStarfield astronomical 3D skybox', () => {
  it('provides accurate J2000 bright navigation stars and B-V spectral palette mapping', () => {
    assert.ok(BRIGHT_STAR_CATALOG_J2000.length >= 200)
    assert.equal(bvToPaletteIndex(-0.22), 0)
    assert.equal(bvToPaletteIndex(0.0), 1)
    assert.equal(bvToPaletteIndex(0.22), 2)
    assert.equal(bvToPaletteIndex(0.71), 3)
    assert.equal(bvToPaletteIndex(1.85), 4)

    // Verify key reference stars (Sirius, Canopus, Vega, Rigel, Betelgeuse, Acrux, Polaris)
    const hasSirius = BRIGHT_STAR_CATALOG_J2000.some(
      ([ra, dec, vMag]) => Math.abs(ra - 101.29) < 0.05 && Math.abs(dec + 16.72) < 0.05 && vMag < -1.4,
    )
    const hasVega = BRIGHT_STAR_CATALOG_J2000.some(
      ([ra, dec]) => Math.abs(ra - 279.23) < 0.05 && Math.abs(dec - 38.78) < 0.05,
    )
    const hasCanopus = BRIGHT_STAR_CATALOG_J2000.some(
      ([ra, dec]) => Math.abs(ra - 95.99) < 0.05 && Math.abs(dec + 52.7) < 0.05,
    )
    const hasRigel = BRIGHT_STAR_CATALOG_J2000.some(
      ([ra, dec]) => Math.abs(ra - 78.63) < 0.05 && Math.abs(dec + 8.2) < 0.05,
    )
    const hasBetelgeuse = BRIGHT_STAR_CATALOG_J2000.some(
      ([ra, dec]) => Math.abs(ra - 88.79) < 0.05 && Math.abs(dec - 7.41) < 0.05,
    )
    const hasAcrux = BRIGHT_STAR_CATALOG_J2000.some(
      ([ra, dec]) => Math.abs(ra - 186.65) < 0.05 && Math.abs(dec + 63.1) < 0.05,
    )
    const hasPolaris = BRIGHT_STAR_CATALOG_J2000.some(
      ([ra, dec]) => Math.abs(ra - 37.95) < 0.05 && Math.abs(dec - 89.26) < 0.05,
    )
    assert.ok(hasSirius && hasVega && hasCanopus && hasRigel && hasBetelgeuse && hasAcrux && hasPolaris)

    for (const [ra, dec, vMag] of BRIGHT_STAR_CATALOG_J2000) {
      assert.ok(ra >= 0 && ra < 360)
      assert.ok(dec >= -90 && dec <= 90)
      assert.ok(vMag >= -1.5 && vMag <= 4.0)
    }
  })

  it('generates deterministic unit-sphere stars with strong Galactic Plane concentration', () => {
    const a = createStarCatalog(0x51a7f13d, 3000)
    const b = createStarCatalog(0x51a7f13d, 3000)
    assert.deepEqual(a, b)
    assert.equal(a.length, BRIGHT_STAR_CATALOG_J2000.length + 3000)

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

    // Verify generated stars are concentrated along the IAU J2000 Galactic plane (|b| < 15 deg)
    const galacticNorthPole = equatorialDegToUnitVec(192.85948, 27.12825)
    const sin15 = Math.sin((15 * Math.PI) / 180)
    const generated = a.slice(BRIGHT_STAR_CATALOG_J2000.length)
    let nearGalacticPlaneCount = 0
    for (const star of generated) {
      const sinB = Math.abs(
        star.x * galacticNorthPole.x +
          star.y * galacticNorthPole.y +
          star.z * galacticNorthPole.z,
      )
      if (sinB < sin15) {
        nearGalacticPlaneCount += 1
      }
    }
    const bandFraction = nearGalacticPlaneCount / generated.length
    assert.ok(
      bandFraction > 0.42,
      `Expected Galactic disk concentration > 0.42 (uniform is ~0.259), got ${bandFraction.toFixed(3)}`,
    )

    // Verify Galactic coordinate round-trip at b = +90 deg equals Galactic North Pole
    const galPoleCheck = galacticDegToEquatorialUnitVec(0, 90)
    assert.ok(Math.abs(galPoleCheck.x - galacticNorthPole.x) < 1e-9)
    assert.ok(Math.abs(galPoleCheck.y - galacticNorthPole.y) < 1e-9)
    assert.ok(Math.abs(galPoleCheck.z - galacticNorthPole.z) < 1e-9)

    // Verify deterministic Milky Way clouds
    const mwA = createMilkyWayCatalog()
    const mwB = createMilkyWayCatalog()
    assert.deepEqual(mwA, mwB)
    assert.ok(mwA.length === 165)
    for (const node of mwA) {
      assert.ok(Math.abs(Math.hypot(node.x, node.y, node.z) - 1) < 1e-12)
      assert.ok(node.angularRadiusRad > 0 && node.alpha > 0)
    }
  })

  it('builds an orthonormal J2000 camera basis with +/-180 deg wrap, GMST, and pitch alignment', () => {
    const poses = [
      { lngDeg: 0, latDeg: 0, bearingDeg: 0, pitchDeg: 0, rollDeg: 0, unixMs: 1700000000000 },
      { lngDeg: 103.8, latDeg: 1.35, bearingDeg: 42, pitchDeg: 58, rollDeg: -10, unixMs: 1700025000000 },
      { lngDeg: -122.4, latDeg: -64.5, bearingDeg: -135, pitchDeg: 35, rollDeg: 15, unixMs: 1760000000000 },
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
      unixMs: 1700000000000,
    })
    const westEdge = computeCelestialCameraBasis({
      lngDeg: -179.999,
      latDeg: 15,
      bearingDeg: 12,
      pitchDeg: 25,
      unixMs: 1700000000000,
    })
    assert.ok(Math.abs(eastEdge.forward.x - westEdge.forward.x) < 1e-4)
    assert.ok(Math.abs(eastEdge.forward.y - westEdge.forward.y) < 1e-4)
    assert.ok(Math.abs(eastEdge.forward.z - westEdge.forward.z) < 1e-4)

    // Sidereal invariance of North Celestial Pole (0, 0, 1) across different GMST times
    const pole = { x: 0, y: 0, z: 1 }
    const gmstA = computeGmstRad(1700000000000)
    const gmstB = computeGmstRad(1700021600000)
    assert.notEqual(gmstA, gmstB)

    const basisT1 = computeCelestialCameraBasis({
      lngDeg: 10,
      latDeg: -60,
      bearingDeg: 18,
      pitchDeg: 32,
      unixMs: 1700000000000,
    })
    const basisT2 = computeCelestialCameraBasis({
      lngDeg: 10,
      latDeg: -60,
      bearingDeg: 18,
      pitchDeg: 32,
      unixMs: 1700021600000,
    })
    const projT1 = projectStarToViewport(pole, basisT1, 1280, 720)
    const projT2 = projectStarToViewport(pole, basisT2, 1280, 720)
    assert.ok(projT1 !== null && projT2 !== null)
    assert.ok(Math.abs(projT1.x - projT2.x) < 1e-9)
    assert.ok(Math.abs(projT1.y - projT2.y) < 1e-9)
    assert.ok(Math.abs(projT1.depth - projT2.depth) < 1e-9)

    // Exact alignment with MapLibre camera tilt (pitchDeg shifts Northern sky stars to viewport center)
    const basisPitch0 = computeCelestialCameraBasis({
      lngDeg: 25,
      latDeg: 10,
      bearingDeg: 0,
      pitchDeg: 0,
      unixMs: 1700000000000,
    })
    const deg12 = (12 * Math.PI) / 180
    const star12North = {
      x: basisPitch0.forward.x * Math.cos(deg12) + basisPitch0.up.x * Math.sin(deg12),
      y: basisPitch0.forward.y * Math.cos(deg12) + basisPitch0.up.y * Math.sin(deg12),
      z: basisPitch0.forward.z * Math.cos(deg12) + basisPitch0.up.z * Math.sin(deg12),
    }
    const unpitchedProj = projectStarToViewport(star12North, basisPitch0, 1280, 720)
    assert.ok(unpitchedProj !== null && unpitchedProj.y < 360)

    const basisPitch12 = computeCelestialCameraBasis({
      lngDeg: 25,
      latDeg: 10,
      bearingDeg: 0,
      pitchDeg: 12,
      unixMs: 1700000000000,
    })
    const pitched12Center = projectStarToViewport(star12North, basisPitch12, 1280, 720)
    assert.ok(pitched12Center !== null)
    assert.ok(Math.abs(pitched12Center.x - 640) < 1e-8)
    assert.ok(Math.abs(pitched12Center.y - 360) < 1e-8)
    assert.ok(Math.abs(pitched12Center.depth - 1) < 1e-9)

    const deg30 = (30 * Math.PI) / 180
    const star30North = {
      x: basisPitch0.forward.x * Math.cos(deg30) + basisPitch0.up.x * Math.sin(deg30),
      y: basisPitch0.forward.y * Math.cos(deg30) + basisPitch0.up.y * Math.sin(deg30),
      z: basisPitch0.forward.z * Math.cos(deg30) + basisPitch0.up.z * Math.sin(deg30),
    }
    // At pitch 0 with 36.87 deg vertical FOV (+/-18.43 deg), 30 deg N is culled above viewport;
    // tilting to pitch 30 centers it cleanly at (640, 360).
    assert.equal(projectStarToViewport(star30North, basisPitch0, 1280, 720), null)
    const basisPitch30 = computeCelestialCameraBasis({
      lngDeg: 25,
      latDeg: 10,
      bearingDeg: 0,
      pitchDeg: 30,
      unixMs: 1700000000000,
    })
    const pitched30Center = projectStarToViewport(star30North, basisPitch30, 1280, 720)
    assert.ok(pitched30Center !== null)
    assert.ok(Math.abs(pitched30Center.x - 640) < 1e-8)
    assert.ok(Math.abs(pitched30Center.y - 360) < 1e-8)
    assert.ok(Math.abs(pitched30Center.depth - 1) < 1e-9)
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

  it('moves projected stars proportionally across and in/out of the viewport on map rotation', () => {
    const fov = 60
    const basis0 = computeCelestialCameraBasis({
      lngDeg: 0,
      latDeg: 0,
      bearingDeg: 0,
      pitchDeg: 0,
      unixMs: 1700000000000,
    })

    const starAtEastDeg = (deg: number) => {
      const rad = (deg * Math.PI) / 180
      return {
        x: basis0.forward.x * Math.cos(rad) + basis0.right.x * Math.sin(rad),
        y: basis0.forward.y * Math.cos(rad) + basis0.right.y * Math.sin(rad),
        z: basis0.forward.z * Math.cos(rad) + basis0.right.z * Math.sin(rad),
      }
    }

    const star0 = starAtEastDeg(0)
    const starRightEdge = starAtEastDeg(42)
    const starBeyondLeft = starAtEastDeg(-54)

    const p0 = projectStarToViewport(star0, basis0, 1280, 720, fov)
    const pRight0 = projectStarToViewport(starRightEdge, basis0, 1280, 720, fov)
    assert.ok(p0 !== null && pRight0 !== null)
    assert.ok(pRight0.x > 1180)
    assert.equal(projectStarToViewport(starBeyondLeft, basis0, 1280, 720, fov), null)

    const basisEast6 = computeCelestialCameraBasis({
      lngDeg: 6,
      latDeg: 0,
      bearingDeg: 0,
      pitchDeg: 0,
      unixMs: 1700000000000,
    })
    const basisEast12 = computeCelestialCameraBasis({
      lngDeg: 12,
      latDeg: 0,
      bearingDeg: 0,
      pitchDeg: 0,
      unixMs: 1700000000000,
    })

    const p6 = projectStarToViewport(star0, basisEast6, 1280, 720, fov)
    const p12 = projectStarToViewport(star0, basisEast12, 1280, 720, fov)
    assert.ok(p6 !== null && p12 !== null)

    const shift6 = p6.x - p0.x
    const shift12 = p12.x - p0.x
    assert.ok(shift6 > 40)
    // Tangent projection over small angles yields ~2x pixel shift for 2x rotation angle
    assert.ok(Math.abs(shift12 / shift6 - 2) < 0.08)

    // Orbiting camera 15 deg East turns view leftward around globe, so the right-edge
    // star exits the viewport while the beyond-left star enters from the left.
    const basisEast15 = computeCelestialCameraBasis({
      lngDeg: 15,
      latDeg: 0,
      bearingDeg: 0,
      pitchDeg: 0,
      unixMs: 1700000000000,
    })
    assert.equal(projectStarToViewport(starRightEdge, basisEast15, 1280, 720, fov), null)
    const enteredLeft = projectStarToViewport(starBeyondLeft, basisEast15, 1280, 720, fov)
    assert.ok(enteredLeft !== null && enteredLeft.x > 0 && enteredLeft.x < 640)
  })

  it('shifts stars proportionally toward and away from the viewport center on zoom changes', () => {
    assert.equal(computeSkyboxFovDeg(0), SKYBOX_WIDE_FOV_DEG)
    assert.equal(computeSkyboxFovDeg(SKYBOX_FOV_MIN_ZOOM), SKYBOX_WIDE_FOV_DEG)
    assert.equal(computeSkyboxFovDeg(SKYBOX_FOV_MAX_ZOOM), SKYBOX_NARROW_FOV_DEG)
    assert.equal(computeSkyboxFovDeg(9), SKYBOX_NARROW_FOV_DEG)

    const fovZ1 = computeSkyboxFovDeg(1.0)
    const fovZ3 = computeSkyboxFovDeg(3.0)
    const fovZ55 = computeSkyboxFovDeg(5.5)
    assert.ok(fovZ1 > fovZ3 && fovZ3 > fovZ55)

    const basis = computeCelestialCameraBasis({
      lngDeg: 25,
      latDeg: 15,
      bearingDeg: 0,
      pitchDeg: 10,
      unixMs: 1700000000000,
    })
    const offAxisRad = (14 * Math.PI) / 180
    const offCenterStar = {
      x: basis.forward.x * Math.cos(offAxisRad) + basis.right.x * Math.sin(offAxisRad),
      y: basis.forward.y * Math.cos(offAxisRad) + basis.right.y * Math.sin(offAxisRad),
      z: basis.forward.z * Math.cos(offAxisRad) + basis.right.z * Math.sin(offAxisRad),
    }

    const projZ1 = projectStarToViewport(offCenterStar, basis, 1280, 720, fovZ1)
    const projZ3 = projectStarToViewport(offCenterStar, basis, 1280, 720, fovZ3)
    const projZ55 = projectStarToViewport(offCenterStar, basis, 1280, 720, fovZ55)
    assert.ok(projZ1 !== null && projZ3 !== null && projZ55 !== null)

    const radialDist = (pt: { x: number; y: number }) => Math.hypot(pt.x - 640, pt.y - 360)
    assert.ok(radialDist(projZ55) > radialDist(projZ3))
    assert.ok(radialDist(projZ3) > radialDist(projZ1))
  })

  it('continues updating star positions on pan, rotate, and zoom when reduced-motion is enabled', () => {
    let fillRectCount = 0
    const fakeCtx = {
      fillStyle: '',
      globalAlpha: 1,
      setTransform() {},
      createRadialGradient() {
        return { addColorStop() {} }
      },
      fillRect() {
        fillRectCount += 1
      },
      beginPath() {},
      moveTo() {},
      arc() {},
      fill() {},
      drawImage() {},
    }
    const fakeCanvas = {
      width: 0,
      height: 0,
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
      getContext: () => fakeCtx,
      addEventListener() {},
      removeEventListener() {},
    }

    const prevWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = {
      devicePixelRatio: 1,
      matchMedia: () => ({
        matches: true,
        addEventListener() {},
        removeEventListener() {},
      }),
    }

    const controller = createSpaceStarfieldController({
      canvas: fakeCanvas as unknown as HTMLCanvasElement,
      initialPose: {
        lngDeg: 10,
        latDeg: 10,
        bearingDeg: 0,
        pitchDeg: 0,
        zoom: 1.65,
        unixMs: 1700000000000,
      },
    })

    try {
      assert.equal(fillRectCount, 1)

      // Idle timestamp tick under reduced-motion stays stationary (no autonomous drift)
      controller.updateCamera({
        lngDeg: 10,
        latDeg: 10,
        bearingDeg: 0,
        pitchDeg: 0,
        zoom: 1.65,
        unixMs: 1700000060000,
      })
      assert.equal(fillRectCount, 1)

      // Pan/rotate and zoom always move stars proportionally even when reduced-motion is active
      controller.updateCamera({
        lngDeg: 28,
        latDeg: 10,
        bearingDeg: 0,
        pitchDeg: 0,
        zoom: 1.65,
        unixMs: 1700000060000,
      })
      assert.equal(fillRectCount, 2)

      controller.updateCamera({
        lngDeg: 28,
        latDeg: 24,
        bearingDeg: 15,
        pitchDeg: 20,
        zoom: 1.65,
        unixMs: 1700000060000,
      })
      assert.equal(fillRectCount, 3)

      controller.updateCamera({
        lngDeg: 28,
        latDeg: 24,
        bearingDeg: 15,
        pitchDeg: 20,
        zoom: 3.2,
        unixMs: 1700000060000,
      })
      assert.equal(fillRectCount, 4)
    } finally {
      controller.dispose()
      if (prevWindow === undefined) {
        delete (globalThis as { window?: unknown }).window
      } else {
        ;(globalThis as { window?: unknown }).window = prevWindow
      }
    }
  })
})

describe('globeHaloShader solar-backlit Beer-Lambert math and GLSL sources', () => {
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

  it('transforms subsolar vector into view space across frontlit, backlit, and rotated limbs', () => {
    const proj = makePerspectiveMatrix((36.87 * Math.PI) / 180, 1.5, 50, 50000)
    const centerDist = 1400
    const mvpBase = multiplyMat4(proj, makeTranslateZView(centerDist))

    // 1. Facing subsolar point directly -> sunDirView points toward camera (+Z)
    const frontLit = computeGlobeHaloUniforms({
      modelViewProjectionMatrix: mvpBase,
      projectionMatrix: proj,
      zoom: 1.5,
      centerLatDeg: 0,
      viewportHeightCssPx: 800,
      projectionTransition: 1,
      subsolarLatRad: 0,
      subsolarLonRad: 0,
    })
    assert.ok(frontLit !== null)
    assert.ok(frontLit.sunDirView[2] > 0.95)
    assert.ok(Math.abs(frontLit.globeCenterView[2] + centerDist) < 0.05)
    assert.ok(frontLit.scalesCssPx[0] >= 8 && frontLit.scalesCssPx[0] <= 34)
    assert.ok(frontLit.scalesCssPx[1] >= 2 && frontLit.scalesCssPx[1] <= 6.5)
    assert.ok(frontLit.scalesCssPx[2] >= 2.5 && frontLit.scalesCssPx[2] <= 11)

    // 2. Facing antisolar point (Sun behind Earth) -> sunDirView points away (-Z, forward scatter)
    const backlit = computeGlobeHaloUniforms({
      modelViewProjectionMatrix: mvpBase,
      projectionMatrix: proj,
      zoom: 1.5,
      centerLatDeg: 0,
      viewportHeightCssPx: 800,
      projectionTransition: 1,
      subsolarLatRad: 0,
      subsolarLonRad: Math.PI,
    })
    assert.ok(backlit !== null)
    assert.ok(backlit.sunDirView[2] < -0.95)

    // 3. Facing 90 deg West of subsolar point (Sun at +90E) -> sunDirView points right (+X)
    const rightLimbLit = computeGlobeHaloUniforms({
      modelViewProjectionMatrix: mvpBase,
      projectionMatrix: proj,
      zoom: 1.5,
      centerLatDeg: 0,
      viewportHeightCssPx: 800,
      projectionTransition: 1,
      subsolarLatRad: 0,
      subsolarLonRad: Math.PI / 2,
    })
    assert.ok(rightLimbLit !== null)
    assert.ok(rightLimbLit.sunDirView[0] > 0.95)

    // 4. Rotate globe by -90 deg around Y (now facing +90E directly) with same subsolarLonRad -> Sun is behind camera (+Z)
    const mvpRotated90E = multiplyMat4(proj, makeRotateYAndTranslateZView(-Math.PI / 2, centerDist))
    const rotatedToSun = computeGlobeHaloUniforms({
      modelViewProjectionMatrix: mvpRotated90E,
      projectionMatrix: proj,
      zoom: 1.5,
      centerLatDeg: 0,
      viewportHeightCssPx: 800,
      projectionTransition: 1,
      subsolarLatRad: 0,
      subsolarLonRad: Math.PI / 2,
    })
    assert.ok(rotatedToSun !== null)
    assert.ok(rotatedToSun.sunDirView[2] > 0.95)

    // 2D Mercator & high-zoom cutoff still skip cleanly
    assert.equal(
      computeGlobeHaloUniforms({
        modelViewProjectionMatrix: mvpBase,
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
        modelViewProjectionMatrix: mvpBase,
        projectionMatrix: proj,
        zoom: 9.0,
        centerLatDeg: 15,
        viewportHeightCssPx: 800,
        projectionTransition: 1,
      }),
      null,
    )
  })

  it('builds WebGL2 ES 3.00 shaders using solar direction and real-photo orbital B-spline gradient', () => {
    const vert = buildGlobeHaloVertexShaderSource()
    const frag = buildGlobeHaloFragmentShaderSource()

    assert.match(vert, /^#version 300 es/)
    assert.match(vert, /uniform mat4 u_invProjMatrix/)
    assert.match(vert, /out vec3 v_viewDir/)

    assert.match(frag, /^#version 300 es/)
    assert.match(frag, /sampleOrbitalAtmosphereRadiance/)
    assert.match(frag, /uniform vec3 u_sunDirView/)
    assert.match(frag, /backlitBoost/)
    assert.match(frag, /interleavedGradientNoise/)
    assert.match(frag, /clamp\(\(premulRgb \+ vec3\(dither \* 0\.35\)\) \* u_strength, vec3\(0\.0\), vec3\(finalAlpha\)\)/)
    assert.doesNotMatch(frag, /rimCore/)
  })
})
