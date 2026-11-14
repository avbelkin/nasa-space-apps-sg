import {
  BRIGHT_STAR_CATALOG_J2000,
  bvToPaletteIndex,
  type StarPaletteIndex,
} from '../data/brightStarCatalog.ts'

export type StarTier = 'pinprick' | 'medium' | 'hero'
export type { StarPaletteIndex }

export interface StarCatalogEntry {
  x: number
  y: number
  z: number
  tier: StarTier
  radiusPx: number
  glowRadiusPx: number
  alpha: number
  paletteIndex: StarPaletteIndex
}

export interface MilkyWayCloudNode {
  x: number
  y: number
  z: number
  angularRadiusRad: number
  alpha: number
  tintIndex: 0 | 1
}

export interface CelestialCameraPose {
  lngDeg: number
  latDeg: number
  bearingDeg: number
  pitchDeg: number
  rollDeg?: number
  zoom?: number
  fovDeg?: number
  unixMs?: number
  isGlobe?: boolean
}

export interface Vec3Tuple {
  x: number
  y: number
  z: number
}

export interface CelestialCameraBasis {
  forward: Vec3Tuple
  right: Vec3Tuple
  up: Vec3Tuple
}

export interface ProjectedStar {
  x: number
  y: number
  depth: number
}

export interface SpaceStarfieldController {
  updateCamera: (pose: CelestialCameraPose) => void
  dispose: () => void
}

export interface CreateSpaceStarfieldOptions {
  canvas: HTMLCanvasElement
  initialPose: CelestialCameraPose
}

interface StarPaletteSpec {
  core: string
  innerBloom: string
  outerBloom: string
}

const DEG_TO_RAD = Math.PI / 180
const MS_PER_DAY = 86_400_000
const J2000_UNIX_MS = 946_728_000_000
const DEFAULT_STAR_COUNT = 8500
const DEFAULT_STAR_SEED = 0x51a7f13d
const DEFAULT_MILKY_WAY_COUNT = 165
const DEFAULT_MILKY_WAY_SEED = 0x2c91b4e7
const SPRITE_CELL_PX = 96
const MILKY_WAY_CELL_PX = 96
const CULL_MARGIN_PX = 40
const SIDEREAL_BUCKET_MS = 15_000
const PINPRICK_ALPHA_BANDS: readonly number[] = [0.22, 0.44, 0.68]

// MapLibre default vertical FOV: 2 * atan(1 / 3) rad ~= 36.87 deg.
export const DEFAULT_VERTICAL_FOV_DEG = (2 * Math.atan(1 / 3)) / DEG_TO_RAD
export const SKYBOX_WIDE_FOV_DEG = 64
export const SKYBOX_NARROW_FOV_DEG = 40
export const SKYBOX_FOV_MIN_ZOOM = 0.5
export const SKYBOX_FOV_MAX_ZOOM = 6.5

// 5 spectral color palettes from hot O/B blue-white to cool K/M warm amber.
const STAR_PALETTES: readonly StarPaletteSpec[] = [
  // 0: O/B hot sapphire
  {
    core: '#f4f9ff',
    innerBloom: 'rgba(147, 210, 255, 0.72)',
    outerBloom: 'rgba(56, 132, 248, 0.24)',
  },
  // 1: B/A blue-white
  {
    core: '#ffffff',
    innerBloom: 'rgba(191, 226, 255, 0.68)',
    outerBloom: 'rgba(84, 152, 252, 0.22)',
  },
  // 2: A/F pure white
  {
    core: '#ffffff',
    innerBloom: 'rgba(226, 240, 255, 0.64)',
    outerBloom: 'rgba(120, 174, 252, 0.18)',
  },
  // 3: F/G solar ivory
  {
    core: '#fffdf2',
    innerBloom: 'rgba(254, 243, 210, 0.62)',
    outerBloom: 'rgba(218, 200, 168, 0.16)',
  },
  // 4: K/M warm amber
  {
    core: '#fff3db',
    innerBloom: 'rgba(255, 210, 152, 0.64)',
    outerBloom: 'rgba(244, 154, 88, 0.19)',
  },
]

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeDeg(deg: number): number {
  const mod = deg % 360
  return mod < 0 ? mod + 360 : mod
}

function normalizeTuple(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len <= 1e-12) {
    return { x: 0, y: 0, z: 1 }
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

function crossTuple(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

function dotTuple(a: Vec3Tuple, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

/**
 * Computes Greenwich Mean Sidereal Time (GMST) in radians for a Unix timestamp,
 * matching the astronomical epoch/rate used in `nightLightsShader.ts`.
 */
export function computeGmstRad(unixMs: number): number {
  const safeMs = Number.isFinite(unixMs) ? unixMs : J2000_UNIX_MS
  const d = (safeMs - J2000_UNIX_MS) / MS_PER_DAY
  return normalizeDeg(280.46061837 + 360.98564736629 * d) * DEG_TO_RAD
}

/**
 * Converts J2000 Equatorial right ascension & declination (degrees) to an
 * ECI J2000 unit vector: +X = Vernal Equinox (RA 0), +Y = RA 90E, +Z = NCP.
 */
export function equatorialDegToUnitVec(raDeg: number, decDeg: number): Vec3Tuple {
  const ra = raDeg * DEG_TO_RAD
  const dec = decDeg * DEG_TO_RAD
  const cosDec = Math.cos(dec)
  return {
    x: cosDec * Math.cos(ra),
    y: cosDec * Math.sin(ra),
    z: Math.sin(dec),
  }
}

// Orthonormal IAU J2000 Galactic -> Equatorial basis.
// North Galactic Pole: RA = 192.85948 deg, Dec = +27.12825 deg.
// Galactic Center: RA = 266.40500 deg, Dec = -28.93617 deg.
const GALACTIC_Z = equatorialDegToUnitVec(192.85948, 27.12825)
const GALACTIC_CENTER_RAW = equatorialDegToUnitVec(266.405, -28.93617)
const GALACTIC_Z_DOT_X = dotTuple(GALACTIC_Z, GALACTIC_CENTER_RAW)
const GALACTIC_X = normalizeTuple({
  x: GALACTIC_CENTER_RAW.x - GALACTIC_Z_DOT_X * GALACTIC_Z.x,
  y: GALACTIC_CENTER_RAW.y - GALACTIC_Z_DOT_X * GALACTIC_Z.y,
  z: GALACTIC_CENTER_RAW.z - GALACTIC_Z_DOT_X * GALACTIC_Z.z,
})
const GALACTIC_Y = normalizeTuple(crossTuple(GALACTIC_Z, GALACTIC_X))

/**
 * Converts J2000 Galactic longitude l and latitude b (degrees) to a J2000 Equatorial unit vector.
 */
export function galacticDegToEquatorialUnitVec(lDeg: number, bDeg: number): Vec3Tuple {
  const l = lDeg * DEG_TO_RAD
  const b = bDeg * DEG_TO_RAD
  const cosB = Math.cos(b)
  const gx = cosB * Math.cos(l)
  const gy = cosB * Math.sin(l)
  const gz = Math.sin(b)
  return normalizeTuple({
    x: GALACTIC_X.x * gx + GALACTIC_Y.x * gy + GALACTIC_Z.x * gz,
    y: GALACTIC_X.y * gx + GALACTIC_Y.y * gy + GALACTIC_Z.y * gz,
    z: GALACTIC_X.z * gx + GALACTIC_Y.z * gy + GALACTIC_Z.z * gz,
  })
}

function sampleGaussian(rng: () => number): number {
  const u1 = Math.max(1e-7, rng())
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function computeFocalPx(widthCss: number, heightCss: number, fovDeg: number): number {
  const clampedFov = clamp(Number.isFinite(fovDeg) ? fovDeg : DEFAULT_VERTICAL_FOV_DEG, 10, 100)
  const tanHalfFov = Math.tan(clampedFov * 0.5 * DEG_TO_RAD)
  const refHeight = heightCss > 0 ? heightCss : widthCss
  return (refHeight * 0.5) / Math.max(tanHalfFov, 1e-4)
}

/**
 * Computes a smooth vertical FOV for the celestial skybox from map zoom so panning
 * rotates stars proportionally while zooming shifts them radially toward or away from the viewport.
 */
export function computeSkyboxFovDeg(
  zoom?: number,
  baseFovDeg: number = DEFAULT_VERTICAL_FOV_DEG,
): number {
  const safeZoom = zoom !== undefined && Number.isFinite(zoom) ? zoom : 1.65
  const t = clamp(
    (safeZoom - SKYBOX_FOV_MIN_ZOOM) / (SKYBOX_FOV_MAX_ZOOM - SKYBOX_FOV_MIN_ZOOM),
    0,
    1,
  )
  const eased = t * t * (3 - 2 * t)
  const rawFovDeg = SKYBOX_WIDE_FOV_DEG + (SKYBOX_NARROW_FOV_DEG - SKYBOX_WIDE_FOV_DEG) * eased
  const safeBaseFov =
    Number.isFinite(baseFovDeg) && baseFovDeg > 0 ? baseFovDeg : DEFAULT_VERTICAL_FOV_DEG
  return clamp(rawFovDeg * (safeBaseFov / DEFAULT_VERTICAL_FOV_DEG), 10, 100)
}

/**
 * Generates a realistic 3D astronomical star catalog in J2000 Equatorial space:
 * - All ~215+ bright real J2000 catalog stars (Hipparcos / Yale Bright Star V <= 3.65)
 * - Pogson-distributed fainter stars partitioned between Galactic disk (with bulge & Great Rift)
 *   and isotropic celestial sphere halo stars.
 */
export function createStarCatalog(
  seed: number = DEFAULT_STAR_SEED,
  count: number = DEFAULT_STAR_COUNT,
): readonly StarCatalogEntry[] {
  const stars: StarCatalogEntry[] = []

  // 1. Real bright navigation & constellation stars in J2000 equatorial coordinates
  for (const [raDeg, decDeg, vMag, bv] of BRIGHT_STAR_CATALOG_J2000) {
    const dir = equatorialDegToUnitVec(raDeg, decDeg)
    const paletteIndex = bvToPaletteIndex(bv)
    if (vMag <= 1.35) {
      stars.push({
        x: dir.x,
        y: dir.y,
        z: dir.z,
        tier: 'hero',
        radiusPx: clamp(2.1 - 0.35 * vMag, 1.4, 2.5),
        glowRadiusPx: clamp(10.5 - 3.2 * vMag, 9.5, 16.5),
        alpha: clamp(0.92 - 0.06 * vMag, 0.80, 0.99),
        paletteIndex,
      })
    } else {
      stars.push({
        x: dir.x,
        y: dir.y,
        z: dir.z,
        tier: 'medium',
        radiusPx: clamp(1.45 - 0.14 * (vMag - 1.35), 0.9, 1.5),
        glowRadiusPx: clamp(9.8 - 1.9 * vMag, 3.0, 8.2),
        alpha: clamp(0.95 - 0.11 * vMag, 0.55, 0.90),
        paletteIndex,
      })
    }
  }

  // 2. Deterministic Galactic disk (58%) + isotropic halo (42%) background stars
  const safeCount = Math.max(0, Math.floor(count))
  const rng = mulberry32(seed)

  let generated = 0
  let safetyCounter = 0
  const maxAttempts = safeCount * 3 + 64

  while (generated < safeCount && safetyCounter < maxAttempts) {
    safetyCounter += 1
    let dir: Vec3Tuple
    let inDisk = false
    let diskBoost = 0

    if (rng() < 0.58) {
      inDisk = true
      // Prefer Galactic center bulge & Carina/Cygnus spiral arms cleanly
      const bulgePick = rng()
      let lDeg: number
      if (bulgePick < 0.32) {
        lDeg = normalizeDeg(sampleGaussian(rng) * 34)
      } else if (bulgePick < 0.48) {
        lDeg = normalizeDeg(78 + sampleGaussian(rng) * 26)
      } else if (bulgePick < 0.64) {
        lDeg = normalizeDeg(286 + sampleGaussian(rng) * 28)
      } else {
        lDeg = rng() * 360
      }

      const scaleHeightDeg = rng() < 0.72 ? 6.2 : 15.0
      const bDeg = clamp(sampleGaussian(rng) * scaleHeightDeg, -88, 88)

      // Subtle Great Rift dust absorption along l = -20..75 deg near |b| < 2.6 deg
      const wrappedL = ((lDeg + 180) % 360) - 180
      if (wrappedL > -18 && wrappedL < 78 && Math.abs(bDeg) < 2.6 && rng() < 0.58) {
        continue
      }

      dir = galacticDegToEquatorialUnitVec(lDeg, bDeg)
      diskBoost = Math.abs(bDeg) < 10 ? 0.35 : 0
    } else {
      const z = rng() * 2 - 1
      const phi = rng() * Math.PI * 2
      const rXy = Math.sqrt(Math.max(0, 1 - z * z))
      dir = {
        x: rXy * Math.cos(phi),
        y: rXy * Math.sin(phi),
        z,
      }
    }

    // Pogson magnitude distribution: N(m) ~ 10^(0.42 * m) between V 3.65 and 6.6
    const uMag = rng()
    const vMag = clamp(3.65 + 2.95 * Math.pow(uMag, 0.36), 3.65, 6.6)
    const paletteRoll = rng()
    let paletteIndex: StarPaletteIndex
    if (inDisk) {
      paletteIndex =
        paletteRoll < 0.28
          ? 0
          : paletteRoll < 0.58
            ? 1
            : paletteRoll < 0.80
              ? 2
              : paletteRoll < 0.92
                ? 3
                : 4
    } else {
      paletteIndex =
        paletteRoll < 0.18
          ? 0
          : paletteRoll < 0.44
            ? 1
            : paletteRoll < 0.70
              ? 2
              : paletteRoll < 0.88
                ? 3
                : 4
    }

    if (vMag <= 4.15) {
      stars.push({
        x: dir.x,
        y: dir.y,
        z: dir.z,
        tier: 'medium',
        radiusPx: clamp(1.05 - (vMag - 3.65) * 0.25, 0.85, 1.05),
        glowRadiusPx: clamp(3.6 - (vMag - 3.65) * 1.4, 2.8, 3.6),
        alpha: clamp(0.68 - (vMag - 3.65) * 0.22 + diskBoost * 0.12, 0.45, 0.78),
        paletteIndex,
      })
    } else {
      const normMag = (vMag - 4.15) / 2.45
      stars.push({
        x: dir.x,
        y: dir.y,
        z: dir.z,
        tier: 'pinprick',
        radiusPx: clamp(0.95 - normMag * 0.56, 0.36, 1.0),
        glowRadiusPx: 0,
        alpha: clamp(0.76 - normMag * 0.60, 0.15, 0.76),
        paletteIndex,
      })
    }
    generated += 1
  }

  return stars
}

/**
 * Generates diffuse 3D Milky Way star-cloud nodes concentrated along the Galactic Plane
 * in J2000 Equatorial coordinates for subtle deep-space nebular depth.
 */
export function createMilkyWayCatalog(
  seed: number = DEFAULT_MILKY_WAY_SEED,
  count: number = DEFAULT_MILKY_WAY_COUNT,
): readonly MilkyWayCloudNode[] {
  const rng = mulberry32(seed)
  const nodes: MilkyWayCloudNode[] = []
  const safeCount = Math.max(0, Math.floor(count))

  for (let i = 0; i < safeCount; i++) {
    const regionRoll = rng()
    let lDeg: number
    let warmBulge = false
    if (regionRoll < 0.38) {
      // Sagittarius / Scorpius Galactic Bulge
      lDeg = normalizeDeg(sampleGaussian(rng) * 26)
      warmBulge = rng() < 0.68
    } else if (regionRoll < 0.60) {
      // Carina / Crux cloud arm
      lDeg = normalizeDeg(290 + sampleGaussian(rng) * 22)
    } else if (regionRoll < 0.80) {
      // Cygnus cloud arm
      lDeg = normalizeDeg(78 + sampleGaussian(rng) * 22)
    } else {
      lDeg = rng() * 360
    }

    const bDeg = clamp(sampleGaussian(rng) * 5.2, -22, 22)
    // Skip central Great Rift notch so dark dust rift preserves contrast
    const wrappedL = ((lDeg + 180) % 360) - 180
    const riftFactor =
      wrappedL > -14 && wrappedL < 74 && Math.abs(bDeg) < 2.2 ? 0.35 : 1.0

    const dir = galacticDegToEquatorialUnitVec(lDeg, bDeg)
    nodes.push({
      x: dir.x,
      y: dir.y,
      z: dir.z,
      angularRadiusRad: (4.5 + rng() * 7.5) * DEG_TO_RAD,
      alpha: clamp((0.014 + rng() * 0.024) * riftFactor, 0.008, 0.038),
      tintIndex: warmBulge ? 1 : 0,
    })
  }

  return nodes
}

function rotateXVec(v: Vec3Tuple, rad: number): Vec3Tuple {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return {
    x: v.x,
    y: c * v.y - s * v.z,
    z: s * v.y + c * v.z,
  }
}

function rotateYVec(v: Vec3Tuple, rad: number): Vec3Tuple {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return {
    x: c * v.x + s * v.z,
    y: v.y,
    z: -s * v.x + c * v.z,
  }
}

function rotateZVec(v: Vec3Tuple, rad: number): Vec3Tuple {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return {
    x: c * v.x - s * v.y,
    y: s * v.x + c * v.y,
    z: v.z,
  }
}

/**
 * Builds an orthonormal J2000 Equatorial camera basis matching MapLibre's exact
 * 5-step globe camera rotation (`RotZ(roll) * RotX(-pitch) * RotZ(bearing) * RotX(+lat) * RotY(-lng)`)
 * and Greenwich Mean Sidereal Time (GMST) Earth rotation.
 */
export function computeCelestialCameraBasis(
  pose: CelestialCameraPose,
): CelestialCameraBasis {
  const lngRad = (Number.isFinite(pose.lngDeg) ? pose.lngDeg : 0) * DEG_TO_RAD
  const latRad = clamp(Number.isFinite(pose.latDeg) ? pose.latDeg : 0, -90, 90) * DEG_TO_RAD
  const bearingRad = (Number.isFinite(pose.bearingDeg) ? pose.bearingDeg : 0) * DEG_TO_RAD
  const pitchRad = clamp(Number.isFinite(pose.pitchDeg) ? pose.pitchDeg : 0, 0, 85) * DEG_TO_RAD
  const rollRad = (pose.rollDeg !== undefined && Number.isFinite(pose.rollDeg) ? pose.rollDeg : 0) * DEG_TO_RAD
  const gmstRad = computeGmstRad(pose.unixMs ?? J2000_UNIX_MS)
  const cosG = Math.cos(gmstRad)
  const sinG = Math.sin(gmstRad)

  // Inverse MapLibre camera rotation: View -> MapLibre unit-globe space:
  // RotY(+lng) * RotX(-lat) * RotZ(-bearing) * RotX(+pitch) * RotZ(-roll),
  // followed by MapLibre globe -> J2000 Equatorial ECI via GMST:
  // eqX = mapZ * cosG - mapX * sinG, eqY = mapX * cosG + mapZ * sinG, eqZ = mapY.
  const viewAxisToEquatorial = (viewVec: Vec3Tuple): Vec3Tuple => {
    let v = rotateZVec(viewVec, -rollRad)
    v = rotateXVec(v, pitchRad)
    v = rotateZVec(v, -bearingRad)
    v = rotateXVec(v, -latRad)
    v = rotateYVec(v, lngRad)
    return normalizeTuple({
      x: v.z * cosG - v.x * sinG,
      y: v.x * cosG + v.z * sinG,
      z: v.y,
    })
  }

  const right = viewAxisToEquatorial({ x: 1, y: 0, z: 0 })
  const up = viewAxisToEquatorial({ x: 0, y: 1, z: 0 })
  const forward = viewAxisToEquatorial({ x: 0, y: 0, z: -1 })

  return { forward, right, up }
}

/**
 * Perspective-projects a J2000 celestial unit vector into 2D CSS pixel coordinates
 * using MapLibre's exact vertical FOV perspective scale.
 */
export function projectStarToViewport(
  star: Pick<StarCatalogEntry, 'x' | 'y' | 'z'>,
  basis: CelestialCameraBasis,
  widthCss: number,
  heightCss: number,
  fovDeg: number = DEFAULT_VERTICAL_FOV_DEG,
  marginPx: number = CULL_MARGIN_PX,
): ProjectedStar | null {
  if (widthCss <= 0 || heightCss <= 0) {
    return null
  }
  const focal = computeFocalPx(widthCss, heightCss, fovDeg)
  const halfDiag = Math.hypot(widthCss * 0.5 + marginPx, heightCss * 0.5 + marginPx)
  const minDepth = 1 / Math.hypot(1, halfDiag / focal)

  const depth = dotTuple(basis.forward, star)
  if (depth <= minDepth) {
    return null
  }
  const sx = dotTuple(basis.right, star) / depth
  const sy = dotTuple(basis.up, star) / depth
  const x = widthCss * 0.5 + sx * focal
  const y = heightCss * 0.5 - sy * focal

  if (
    x < -marginPx ||
    x > widthCss + marginPx ||
    y < -marginPx ||
    y > heightCss + marginPx
  ) {
    return null
  }

  return { x, y, depth }
}

function createStarSpriteSheet(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null
  }
  const sheet = document.createElement('canvas')
  sheet.width = SPRITE_CELL_PX * STAR_PALETTES.length
  sheet.height = SPRITE_CELL_PX * 2
  const ctx = sheet.getContext('2d')
  if (!ctx) {
    return null
  }

  const half = SPRITE_CELL_PX / 2

  for (let pIdx = 0; pIdx < STAR_PALETTES.length; pIdx++) {
    const palette = STAR_PALETTES[pIdx]
    const cx = pIdx * SPRITE_CELL_PX + half

    // Row 0: medium star optical PSF + crisp Airy core
    {
      const cy = half
      const grad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, half - 6)
      grad.addColorStop(0, palette.core)
      grad.addColorStop(0.16, palette.innerBloom)
      grad.addColorStop(0.48, palette.outerBloom)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, half - 6, 0, Math.PI * 2)
      ctx.fill()
    }

    // Row 1: bright hero star with smooth optical Airy halo & whisper-soft micro-glint
    {
      const cy = SPRITE_CELL_PX + half
      const outerGrad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, half - 4)
      outerGrad.addColorStop(0, '#ffffff')
      outerGrad.addColorStop(0.10, palette.core)
      outerGrad.addColorStop(0.24, palette.innerBloom)
      outerGrad.addColorStop(0.54, palette.outerBloom)
      outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = outerGrad
      ctx.beginPath()
      ctx.arc(cx, cy, half - 4, 0, Math.PI * 2)
      ctx.fill()

      // Ultra-subtle photographic optical glint (0.12 max opacity, no artificial spiky cross)
      const glintLen = half - 14
      for (const horizontal of [true, false]) {
        const sg = horizontal
          ? ctx.createLinearGradient(cx - glintLen, cy, cx + glintLen, cy)
          : ctx.createLinearGradient(cx, cy - glintLen, cx, cy + glintLen)
        sg.addColorStop(0, 'rgba(220, 238, 255, 0)')
        sg.addColorStop(0.42, 'rgba(220, 238, 255, 0.06)')
        sg.addColorStop(0.5, 'rgba(255, 255, 255, 0.14)')
        sg.addColorStop(0.58, 'rgba(220, 238, 255, 0.06)')
        sg.addColorStop(1, 'rgba(220, 238, 255, 0)')
        ctx.fillStyle = sg
        ctx.beginPath()
        if (horizontal) {
          ctx.moveTo(cx - glintLen, cy)
          ctx.lineTo(cx, cy - 1.1)
          ctx.lineTo(cx + glintLen, cy)
          ctx.lineTo(cx, cy + 1.1)
        } else {
          ctx.moveTo(cx, cy - glintLen)
          ctx.lineTo(cx + 1.1, cy)
          ctx.lineTo(cx, cy + glintLen)
          ctx.lineTo(cx - 1.1, cy)
        }
        ctx.closePath()
        ctx.fill()
      }

      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 5.5)
      coreGrad.addColorStop(0, '#ffffff')
      coreGrad.addColorStop(0.55, palette.core)
      coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = coreGrad
      ctx.beginPath()
      ctx.arc(cx, cy, 5.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  return sheet
}

function createMilkyWaySpriteSheet(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null
  }
  const sheet = document.createElement('canvas')
  sheet.width = MILKY_WAY_CELL_PX * 2
  sheet.height = MILKY_WAY_CELL_PX
  const ctx = sheet.getContext('2d')
  if (!ctx) {
    return null
  }

  const half = MILKY_WAY_CELL_PX / 2
  const radius = half - 2
  const tints: readonly [string, string] = [
    'rgba(58, 108, 196, 1)',
    'rgba(108, 146, 212, 1)',
  ]
  const midTints: readonly [string, string] = [
    'rgba(28, 58, 128, 0.45)',
    'rgba(56, 86, 152, 0.45)',
  ]

  for (let i = 0; i < 2; i++) {
    const cx = i * MILKY_WAY_CELL_PX + half
    const grad = ctx.createRadialGradient(cx, half, 0, cx, half, radius)
    grad.addColorStop(0, tints[i])
    grad.addColorStop(0.45, midTints[i])
    grad.addColorStop(1, 'rgba(2, 5, 16, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, half, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  return sheet
}

/**
 * Creates a deterministic, astronomically anchored 3D deep-space star map & Milky Way
 * skybox controller on a 2D canvas synced with MapLibre's 3D globe camera.
 */
export function createSpaceStarfieldController({
  canvas,
  initialPose,
}: CreateSpaceStarfieldOptions): SpaceStarfieldController {
  const ctx = canvas.getContext('2d', { alpha: false })
  const catalog = createStarCatalog()
  const milkyWayNodes = createMilkyWayCatalog()
  const spriteSheet = createStarSpriteSheet()
  const milkyWaySheet = createMilkyWaySpriteSheet()

  let disposed = false
  let skippedByVisibility = false
  let currentPose: CelestialCameraPose = { ...initialPose }
  let lastRenderKey = ''
  let pendingRafId: number | null = null

  // Persistent flat buffers ([x, y, r, ...] and [starIndex, x, y, ...]) to avoid per-frame allocations.
  const pinprickBuckets: number[][][] = Array.from(
    { length: STAR_PALETTES.length },
    () => Array.from({ length: PINPRICK_ALPHA_BANDS.length }, () => []),
  )
  const spriteStars: number[] = []

  const motionQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
  let reducedMotion = motionQuery?.matches ?? false

  const buildPoseKey = (
    pose: CelestialCameraPose,
    widthCss: number,
    heightCss: number,
    dpr: number,
  ) => {
    const q = (v: number) => Math.round(v * 10000)
    const isGlobeFlag = pose.isGlobe === false ? 0 : 1
    const siderealBucket = Math.floor((pose.unixMs ?? J2000_UNIX_MS) / SIDEREAL_BUCKET_MS)
    return `${widthCss}x${heightCss}@${dpr}:${isGlobeFlag}:${siderealBucket}:${q(pose.lngDeg)},${q(pose.latDeg)},${q(pose.bearingDeg)},${q(pose.pitchDeg)},${q(pose.rollDeg ?? 0)},${q(pose.zoom ?? 1.65)},${q(pose.fovDeg ?? DEFAULT_VERTICAL_FOV_DEG)}`
  }

  const drawFrame = (force = false) => {
    if (disposed || skippedByVisibility || !ctx) {
      return
    }
    if (typeof document !== 'undefined' && document.hidden) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const widthCss = Math.max(0, Math.round(rect.width || canvas.clientWidth))
    const heightCss = Math.max(0, Math.round(rect.height || canvas.clientHeight))
    if (widthCss === 0 || heightCss === 0) {
      return
    }

    const dpr =
      typeof window !== 'undefined' && window.devicePixelRatio > 0
        ? Math.min(window.devicePixelRatio, 2)
        : 1
    // Keep camera tracking live on pan/rotate/zoom even under reduced motion; only freeze idle sidereal drift.
    const activePose: CelestialCameraPose = reducedMotion
      ? { ...currentPose, unixMs: J2000_UNIX_MS }
      : currentPose

    const renderKey = buildPoseKey(activePose, widthCss, heightCss, dpr)
    if (!force && renderKey === lastRenderKey) {
      return
    }
    lastRenderKey = renderKey

    const targetW = Math.round(widthCss * dpr)
    const targetH = Math.round(heightCss * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Deep orbital blackness / very dark abyssal navy gradient
    const bgGrad = ctx.createRadialGradient(
      widthCss * 0.5,
      heightCss * 0.54,
      Math.min(widthCss, heightCss) * 0.10,
      widthCss * 0.5,
      heightCss * 0.5,
      Math.hypot(widthCss, heightCss) * 0.65,
    )
    bgGrad.addColorStop(0, '#040a18')
    bgGrad.addColorStop(0.55, '#020612')
    bgGrad.addColorStop(1, '#010309')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, widthCss, heightCss)

    const skyboxFovDeg = computeSkyboxFovDeg(
      activePose.zoom,
      activePose.fovDeg ?? DEFAULT_VERTICAL_FOV_DEG,
    )
    const focalPx = computeFocalPx(widthCss, heightCss, skyboxFovDeg)
    const basis = computeCelestialCameraBasis(activePose)

    // 1. Subtle diffuse 3D Milky Way star-cloud band
    if (milkyWaySheet) {
      for (const node of milkyWayNodes) {
        const radiusPx = node.angularRadiusRad * focalPx
        const projected = projectStarToViewport(
          node,
          basis,
          widthCss,
          heightCss,
          skyboxFovDeg,
          Math.max(CULL_MARGIN_PX, radiusPx),
        )
        if (!projected) {
          continue
        }
        ctx.globalAlpha = node.alpha
        ctx.drawImage(
          milkyWaySheet,
          node.tintIndex * MILKY_WAY_CELL_PX,
          0,
          MILKY_WAY_CELL_PX,
          MILKY_WAY_CELL_PX,
          projected.x - radiusPx,
          projected.y - radiusPx,
          radiusPx * 2,
          radiusPx * 2,
        )
      }
    }

    // 2. Partition projected stars into 15 batched pinprick buckets (5 palettes x 3 alpha bands) + sprites
    for (let pIdx = 0; pIdx < STAR_PALETTES.length; pIdx++) {
      for (let bIdx = 0; bIdx < PINPRICK_ALPHA_BANDS.length; bIdx++) {
        pinprickBuckets[pIdx][bIdx].length = 0
      }
    }
    spriteStars.length = 0

    const halfW = widthCss * 0.5
    const halfH = heightCss * 0.5
    const halfDiag = Math.hypot(halfW + CULL_MARGIN_PX, halfH + CULL_MARGIN_PX)
    const minDepth = 1 / Math.hypot(1, halfDiag / focalPx)
    const minX = -CULL_MARGIN_PX
    const maxX = widthCss + CULL_MARGIN_PX
    const minY = -CULL_MARGIN_PX
    const maxY = heightCss + CULL_MARGIN_PX

    const fx = basis.forward.x
    const fy = basis.forward.y
    const fz = basis.forward.z
    const rx = basis.right.x
    const ry = basis.right.y
    const rz = basis.right.z
    const ux = basis.up.x
    const uy = basis.up.y
    const uz = basis.up.z

    for (let idx = 0; idx < catalog.length; idx++) {
      const star = catalog[idx]
      const depth = fx * star.x + fy * star.y + fz * star.z
      if (depth <= minDepth) {
        continue
      }
      const invDepth = focalPx / depth
      const x = halfW + (rx * star.x + ry * star.y + rz * star.z) * invDepth
      if (x < minX || x > maxX) {
        continue
      }
      const y = halfH - (ux * star.x + uy * star.y + uz * star.z) * invDepth
      if (y < minY || y > maxY) {
        continue
      }
      if (star.tier === 'pinprick') {
        const bandIdx = star.alpha < 0.34 ? 0 : star.alpha < 0.58 ? 1 : 2
        pinprickBuckets[star.paletteIndex][bandIdx].push(x, y, star.radiusPx)
      } else {
        spriteStars.push(idx, x, y)
      }
    }

    for (let pIdx = 0; pIdx < STAR_PALETTES.length; pIdx++) {
      ctx.fillStyle = STAR_PALETTES[pIdx].core
      for (let bIdx = 0; bIdx < PINPRICK_ALPHA_BANDS.length; bIdx++) {
        const bucket = pinprickBuckets[pIdx][bIdx]
        if (bucket.length === 0) {
          continue
        }
        ctx.globalAlpha = PINPRICK_ALPHA_BANDS[bIdx]
        ctx.beginPath()
        for (let k = 0; k < bucket.length; k += 3) {
          const x = bucket[k]
          const y = bucket[k + 1]
          const r = bucket[k + 2]
          ctx.moveTo(x + r, y)
          ctx.arc(x, y, r, 0, Math.PI * 2)
        }
        ctx.fill()
      }
    }

    if (spriteSheet) {
      for (let k = 0; k < spriteStars.length; k += 3) {
        const star = catalog[spriteStars[k]]
        const x = spriteStars[k + 1]
        const y = spriteStars[k + 2]
        const row = star.tier === 'hero' ? 1 : 0
        const sx = star.paletteIndex * SPRITE_CELL_PX
        const sy = row * SPRITE_CELL_PX
        const drawSize = star.glowRadiusPx * 2
        ctx.globalAlpha = star.alpha
        ctx.drawImage(
          spriteSheet,
          sx,
          sy,
          SPRITE_CELL_PX,
          SPRITE_CELL_PX,
          x - star.glowRadiusPx,
          y - star.glowRadiusPx,
          drawSize,
          drawSize,
        )
      }
    } else {
      for (let k = 0; k < spriteStars.length; k += 3) {
        const star = catalog[spriteStars[k]]
        const x = spriteStars[k + 1]
        const y = spriteStars[k + 2]
        ctx.globalAlpha = star.alpha
        ctx.fillStyle = STAR_PALETTES[star.paletteIndex].core
        ctx.beginPath()
        ctx.arc(x, y, star.radiusPx, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.globalAlpha = 1
  }

  const scheduleDraw = (force = false) => {
    if (disposed) {
      return
    }
    if (force) {
      lastRenderKey = ''
    }
    if (pendingRafId !== null || typeof window === 'undefined') {
      return
    }
    pendingRafId = window.requestAnimationFrame(() => {
      pendingRafId = null
      drawFrame(force)
    })
  }

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          lastRenderKey = ''
          drawFrame(true)
        })
      : null
  resizeObserver?.observe(canvas)

  const onMotionChange = (event: MediaQueryListEvent) => {
    reducedMotion = event.matches
    drawFrame(true)
  }
  motionQuery?.addEventListener('change', onMotionChange)

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && !document.hidden) {
      drawFrame(true)
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  const onContentVisibilityChange = (event: Event) => {
    const skipped = (event as Event & { skipped?: boolean }).skipped
    if (typeof skipped === 'boolean') {
      skippedByVisibility = skipped
      if (!skipped) {
        drawFrame(true)
      }
    }
  }
  canvas.addEventListener('contentvisibilityautostatechange', onContentVisibilityChange)

  // Initial synchronous draw so stars are ready before first paint
  drawFrame(true)

  return {
    updateCamera(pose: CelestialCameraPose) {
      currentPose = pose
      drawFrame(false)
    },

    dispose() {
      disposed = true
      if (pendingRafId !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(pendingRafId)
        pendingRafId = null
      }
      resizeObserver?.disconnect()
      motionQuery?.removeEventListener('change', onMotionChange)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      canvas.removeEventListener('contentvisibilityautostatechange', onContentVisibilityChange)
      if (spriteSheet) {
        spriteSheet.width = 0
        spriteSheet.height = 0
      }
      if (milkyWaySheet) {
        milkyWaySheet.width = 0
        milkyWaySheet.height = 0
      }
      void scheduleDraw
    },
  }
}
