export type StarTier = 'pinprick' | 'medium' | 'hero'

export type StarPaletteIndex = 0 | 1 | 2 | 3

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

export interface CelestialCameraPose {
  lngDeg: number
  latDeg: number
  bearingDeg: number
  pitchDeg: number
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
const DEFAULT_STAR_COUNT = 1400
const DEFAULT_STAR_SEED = 0x51a7f13d
const MIN_DEPTH_THRESHOLD = 0.42
const SPRITE_CELL_PX = 64
const CULL_MARGIN_PX = 36

const STATIC_REDUCED_MOTION_POSE: CelestialCameraPose = {
  lngDeg: 15,
  latDeg: 15,
  bearingDeg: 0,
  pitchDeg: 0,
}

const STAR_PALETTES: readonly StarPaletteSpec[] = [
  // 0: Ice-blue sapphire
  {
    core: '#f0f8ff',
    innerBloom: 'rgba(125, 211, 252, 0.85)',
    outerBloom: 'rgba(37, 99, 235, 0.38)',
  },
  // 1: Cool diamond blue-white
  {
    core: '#ffffff',
    innerBloom: 'rgba(186, 230, 253, 0.82)',
    outerBloom: 'rgba(59, 130, 246, 0.34)',
  },
  // 2: Pure crisp starlight
  {
    core: '#ffffff',
    innerBloom: 'rgba(224, 242, 254, 0.78)',
    outerBloom: 'rgba(96, 165, 250, 0.28)',
  },
  // 3: Warm faint ivory
  {
    core: '#fffbeb',
    innerBloom: 'rgba(254, 243, 199, 0.72)',
    outerBloom: 'rgba(147, 197, 253, 0.22)',
  },
]

const CURATED_HERO_DIRECTIONS: readonly {
  lngDeg: number
  latDeg: number
  glowRadiusPx: number
  alpha: number
  paletteIndex: StarPaletteIndex
}[] = [
  { lngDeg: -12, latDeg: 38, glowRadiusPx: 19, alpha: 0.98, paletteIndex: 0 },
  { lngDeg: 41, latDeg: 35, glowRadiusPx: 15, alpha: 0.94, paletteIndex: 1 },
  { lngDeg: 47, latDeg: -11, glowRadiusPx: 14, alpha: 0.9, paletteIndex: 0 },
  { lngDeg: -74, latDeg: 24, glowRadiusPx: 17, alpha: 0.95, paletteIndex: 1 },
  { lngDeg: 168, latDeg: 33, glowRadiusPx: 18, alpha: 0.96, paletteIndex: 0 },
  { lngDeg: -136, latDeg: -22, glowRadiusPx: 16, alpha: 0.92, paletteIndex: 2 },
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

function sphericalDegToUnitVec(lngDeg: number, latDeg: number): Vec3Tuple {
  const lng = lngDeg * DEG_TO_RAD
  const lat = latDeg * DEG_TO_RAD
  const cosLat = Math.cos(lat)
  return {
    x: cosLat * Math.sin(lng),
    y: Math.sin(lat),
    z: cosLat * Math.cos(lng),
  }
}

function normalizeTuple(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len <= 1e-12) {
    return { x: 0, y: 0, z: -1 }
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
 * Generates a deterministic 3D celestial star catalog uniformly distributed over
 * the unit sphere, plus curated bright sapphire-white hero stars across hemispheres.
 */
export function createStarCatalog(
  seed: number = DEFAULT_STAR_SEED,
  count: number = DEFAULT_STAR_COUNT,
): readonly StarCatalogEntry[] {
  const safeCount = Math.max(0, Math.floor(count))
  const rng = mulberry32(seed)
  const stars: StarCatalogEntry[] = []

  for (let i = 0; i < safeCount; i++) {
    // Uniform area sampling on S^2: z = 2u - 1, phi = 2pi * v.
    const z = rng() * 2 - 1
    const phi = rng() * Math.PI * 2
    const rXy = Math.sqrt(Math.max(0, 1 - z * z))
    const x = rXy * Math.sin(phi)
    const y = z
    const zCoord = rXy * Math.cos(phi)

    const tierRoll = rng()
    const paletteRoll = rng()
    const paletteIndex: StarPaletteIndex =
      paletteRoll < 0.38 ? 0 : paletteRoll < 0.72 ? 1 : paletteRoll < 0.92 ? 2 : 3

    if (tierRoll < 0.82) {
      stars.push({
        x,
        y,
        z: zCoord,
        tier: 'pinprick',
        radiusPx: 0.45 + rng() * 0.45,
        glowRadiusPx: 0,
        alpha: 0.25 + rng() * 0.65,
        paletteIndex,
      })
    } else if (tierRoll < 0.97) {
      stars.push({
        x,
        y,
        z: zCoord,
        tier: 'medium',
        radiusPx: 0.9 + rng() * 0.5,
        glowRadiusPx: 3.5 + rng() * 3.0,
        alpha: 0.55 + rng() * 0.37,
        paletteIndex,
      })
    } else {
      stars.push({
        x,
        y,
        z: zCoord,
        tier: 'hero',
        radiusPx: 1.5 + rng() * 0.7,
        glowRadiusPx: 10 + rng() * 9.5,
        alpha: 0.78 + rng() * 0.2,
        paletteIndex: paletteIndex === 3 ? 0 : paletteIndex,
      })
    }
  }

  for (const curated of CURATED_HERO_DIRECTIONS) {
    const dir = sphericalDegToUnitVec(curated.lngDeg, curated.latDeg)
    stars.push({
      x: dir.x,
      y: dir.y,
      z: dir.z,
      tier: 'hero',
      radiusPx: 1.9,
      glowRadiusPx: curated.glowRadiusPx,
      alpha: curated.alpha,
      paletteIndex: curated.paletteIndex,
    })
  }

  return stars
}

/**
 * Builds an orthonormal right-handed celestial basis from the map camera pose.
 * Uses exact 1.0x longitude and latitude angles so +/-180 deg wraps seamlessly.
 */
export function computeCelestialCameraBasis(
  pose: CelestialCameraPose,
): CelestialCameraBasis {
  const lngRad = (Number.isFinite(pose.lngDeg) ? pose.lngDeg : 0) * DEG_TO_RAD
  const latRad = (Number.isFinite(pose.latDeg) ? pose.latDeg : 0) * DEG_TO_RAD
  const bearingRad = (Number.isFinite(pose.bearingDeg) ? pose.bearingDeg : 0) * DEG_TO_RAD
  const pitchRad =
    Math.max(0, Math.min(85, Number.isFinite(pose.pitchDeg) ? pose.pitchDeg : 0)) *
    0.65 *
    DEG_TO_RAD

  const cosLat = Math.cos(latRad)
  const forward0: Vec3Tuple = {
    x: -cosLat * Math.sin(lngRad),
    y: -Math.sin(latRad),
    z: -cosLat * Math.cos(lngRad),
  }
  const right0: Vec3Tuple = {
    x: Math.cos(lngRad),
    y: 0,
    z: -Math.sin(lngRad),
  }
  const up0 = normalizeTuple(crossTuple(right0, forward0))

  const cosB = Math.cos(bearingRad)
  const sinB = Math.sin(bearingRad)
  const rightBearing: Vec3Tuple = {
    x: right0.x * cosB - up0.x * sinB,
    y: right0.y * cosB - up0.y * sinB,
    z: right0.z * cosB - up0.z * sinB,
  }
  const upBearing: Vec3Tuple = {
    x: right0.x * sinB + up0.x * cosB,
    y: right0.y * sinB + up0.y * cosB,
    z: right0.z * sinB + up0.z * cosB,
  }

  const cosP = Math.cos(pitchRad)
  const sinP = Math.sin(pitchRad)
  const forward = normalizeTuple({
    x: forward0.x * cosP + upBearing.x * sinP,
    y: forward0.y * cosP + upBearing.y * sinP,
    z: forward0.z * cosP + upBearing.z * sinP,
  })
  const up = normalizeTuple({
    x: upBearing.x * cosP - forward0.x * sinP,
    y: upBearing.y * cosP - forward0.y * sinP,
    z: upBearing.z * cosP - forward0.z * sinP,
  })

  return {
    forward,
    right: normalizeTuple(rightBearing),
    up,
  }
}

/**
 * Perspective-projects a unit-sphere star into 2D CSS pixel coordinates.
 * Returns null if the star is behind the culling cone or outside viewport bounds.
 */
export function projectStarToViewport(
  star: Pick<StarCatalogEntry, 'x' | 'y' | 'z'>,
  basis: CelestialCameraBasis,
  widthCss: number,
  heightCss: number,
): ProjectedStar | null {
  if (widthCss <= 0 || heightCss <= 0) {
    return null
  }
  const depth = dotTuple(basis.forward, star)
  if (depth <= MIN_DEPTH_THRESHOLD) {
    return null
  }
  const sx = dotTuple(basis.right, star) / depth
  const sy = dotTuple(basis.up, star) / depth
  const focal = 0.88 * Math.hypot(widthCss, heightCss) * 0.5
  const x = widthCss * 0.5 + sx * focal
  const y = heightCss * 0.5 - sy * focal

  if (
    x < -CULL_MARGIN_PX ||
    x > widthCss + CULL_MARGIN_PX ||
    y < -CULL_MARGIN_PX ||
    y > heightCss + CULL_MARGIN_PX
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

    // Row 0: medium star soft glow + core
    {
      const cy = half
      const grad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, half - 4)
      grad.addColorStop(0, palette.core)
      grad.addColorStop(0.18, palette.innerBloom)
      grad.addColorStop(0.55, palette.outerBloom)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, half - 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // Row 1: hero sapphire-white star with bloom + delicate 4-point diffraction spikes
    {
      const cy = SPRITE_CELL_PX + half
      const outerGrad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, half - 2)
      outerGrad.addColorStop(0, '#ffffff')
      outerGrad.addColorStop(0.14, palette.innerBloom)
      outerGrad.addColorStop(0.45, palette.outerBloom)
      outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = outerGrad
      ctx.beginPath()
      ctx.arc(cx, cy, half - 2, 0, Math.PI * 2)
      ctx.fill()

      // Tapered 4-point diffraction glints
      const spikeLen = half - 5
      for (const horizontal of [true, false]) {
        const sg = horizontal
          ? ctx.createLinearGradient(cx - spikeLen, cy, cx + spikeLen, cy)
          : ctx.createLinearGradient(cx, cy - spikeLen, cx, cy + spikeLen)
        sg.addColorStop(0, 'rgba(186, 230, 253, 0)')
        sg.addColorStop(0.38, 'rgba(186, 230, 253, 0.45)')
        sg.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)')
        sg.addColorStop(0.62, 'rgba(186, 230, 253, 0.45)')
        sg.addColorStop(1, 'rgba(186, 230, 253, 0)')
        ctx.fillStyle = sg
        ctx.beginPath()
        if (horizontal) {
          ctx.moveTo(cx - spikeLen, cy)
          ctx.lineTo(cx, cy - 1.35)
          ctx.lineTo(cx + spikeLen, cy)
          ctx.lineTo(cx, cy + 1.35)
        } else {
          ctx.moveTo(cx, cy - spikeLen)
          ctx.lineTo(cx + 1.35, cy)
          ctx.lineTo(cx, cy + spikeLen)
          ctx.lineTo(cx - 1.35, cy)
        }
        ctx.closePath()
        ctx.fill()
      }

      // Crisp bright white star nucleus
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 5)
      coreGrad.addColorStop(0, '#ffffff')
      coreGrad.addColorStop(0.55, palette.core)
      coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = coreGrad
      ctx.beginPath()
      ctx.arc(cx, cy, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  return sheet
}

/**
 * Creates a deterministic, camera-coupled deep-space starfield renderer on a 2D canvas.
 * Stays static at rest and caches the last rendered pose so idle/pulse frames do 0 work.
 */
export function createSpaceStarfieldController({
  canvas,
  initialPose,
}: CreateSpaceStarfieldOptions): SpaceStarfieldController {
  const ctx = canvas.getContext('2d', { alpha: false })
  const catalog = createStarCatalog()
  const spriteSheet = createStarSpriteSheet()

  let disposed = false
  let skippedByVisibility = false
  let currentPose: CelestialCameraPose = { ...initialPose }
  let lastRenderKey = ''
  let pendingRafId: number | null = null

  const motionQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null
  let reducedMotion = motionQuery?.matches ?? false

  const buildPoseKey = (pose: CelestialCameraPose, widthCss: number, heightCss: number, dpr: number) => {
    const q = (v: number) => Math.round(v * 10000)
    return `${widthCss}x${heightCss}@${dpr}:${q(pose.lngDeg)},${q(pose.latDeg)},${q(pose.bearingDeg)},${q(pose.pitchDeg)}`
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
    const activePose = reducedMotion ? STATIC_REDUCED_MOTION_POSE : currentPose
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

    // Deep cosmic navy-indigo gradient background
    const bgGrad = ctx.createRadialGradient(
      widthCss * 0.5,
      heightCss * 0.56,
      Math.min(widthCss, heightCss) * 0.08,
      widthCss * 0.5,
      heightCss * 0.5,
      Math.hypot(widthCss, heightCss) * 0.65,
    )
    bgGrad.addColorStop(0, '#091836')
    bgGrad.addColorStop(0.45, '#050c1f')
    bgGrad.addColorStop(1, '#020510')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, widthCss, heightCss)

    // Subtle cosmic dust glow washes for orbital depth
    const wash = ctx.createRadialGradient(
      widthCss * 0.32,
      heightCss * 0.28,
      0,
      widthCss * 0.32,
      heightCss * 0.28,
      Math.max(widthCss, heightCss) * 0.45,
    )
    wash.addColorStop(0, 'rgba(30, 64, 175, 0.08)')
    wash.addColorStop(0.6, 'rgba(15, 23, 42, 0.03)')
    wash.addColorStop(1, 'rgba(2, 5, 16, 0)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, widthCss, heightCss)

    const basis = computeCelestialCameraBasis(activePose)

    // Batch pinpricks by palette to minimize state switches
    const pinprickBuckets: Array<Array<{ x: number; y: number; r: number; a: number }>> = [
      [],
      [],
      [],
      [],
    ]
    const spriteStars: Array<{
      star: StarCatalogEntry
      x: number
      y: number
    }> = []

    for (const star of catalog) {
      const projected = projectStarToViewport(star, basis, widthCss, heightCss)
      if (!projected) {
        continue
      }
      if (star.tier === 'pinprick') {
        pinprickBuckets[star.paletteIndex].push({
          x: projected.x,
          y: projected.y,
          r: star.radiusPx,
          a: star.alpha,
        })
      } else {
        spriteStars.push({ star, x: projected.x, y: projected.y })
      }
    }

    for (let pIdx = 0; pIdx < pinprickBuckets.length; pIdx++) {
      const bucket = pinprickBuckets[pIdx]
      if (bucket.length === 0) {
        continue
      }
      ctx.fillStyle = STAR_PALETTES[pIdx].core
      for (const dot of bucket) {
        ctx.globalAlpha = dot.a
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (spriteSheet) {
      for (const item of spriteStars) {
        const { star, x, y } = item
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
      for (const item of spriteStars) {
        const { star, x, y } = item
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
      void scheduleDraw
    },
  }
}
