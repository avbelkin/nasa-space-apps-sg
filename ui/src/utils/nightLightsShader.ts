export const MIN_NIGHT_TILE_ZOOM = 1
export const MAX_NIGHT_TILE_ZOOM = 5
export const NIGHT_FADE_START_ZOOM = 4
export const NIGHT_FADE_END_ZOOM = 6
export const TWILIGHT_DAY_SIN_ALT = Math.sin((2 * Math.PI) / 180)
export const TWILIGHT_NIGHT_SIN_ALT = Math.sin((-8 * Math.PI) / 180)
export const NIGHT_TERMINATOR_REFRESH_MS = 60_000
export const GIBS_NIGHT_LIGHTS_LAYER =
  'VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance'

const NIGHT_FADE_SPAN = NIGHT_FADE_END_ZOOM - NIGHT_FADE_START_ZOOM
const MS_PER_DAY = 86_400_000
const J2000_UNIX_MS = 946_728_000_000
const DEG_TO_RAD = Math.PI / 180
const SUNLIT_TILE_CULL_MARGIN = 0.03

export interface NightLightsShaderVariantData {
  vertexShaderPrelude: string
  define: string
}

export interface NightLightsCoveringTile {
  canonical: { z: number; x: number; y: number }
  wrap: number
}

export interface SubsolarPoint {
  latRad: number
  lonRad: number
  unitVector: [number, number, number]
}

function normalizeDeg(deg: number): number {
  const mod = deg % 360
  return mod < 0 ? mod + 360 : mod
}

function wrapRadMinusPiToPi(rad: number): number {
  const twoPi = 2 * Math.PI
  let wrapped = ((((rad + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI
  if (wrapped === -Math.PI && rad > 0) {
    wrapped = Math.PI
  }
  return wrapped
}

function mercatorYFractionToLatRad(yFraction: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * yFraction)))
}

/**
 * Full opacity (1.0) through z4, linear cross-fade across z4..z6, hidden at z6+.
 */
export function computeNightLightsZoomOpacity(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom >= NIGHT_FADE_END_ZOOM) {
    return 0
  }
  if (zoom <= NIGHT_FADE_START_ZOOM) {
    return 1
  }
  return Math.max(0, Math.min(1, (NIGHT_FADE_END_ZOOM - zoom) / NIGHT_FADE_SPAN))
}

export function formatUtcDateString(unixMs: number): string {
  const date = new Date(unixMs)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Resolves NASA GIBS candidate YYYY-MM-DD dates in preference order:
 * - Monthly-stable YYYY-MM-01 when UTC day >= 5 (for clean browser caching),
 *   otherwise now - 4 days (accounting for GIBS A2 processing latency).
 * - Deduplicated fallbacks at now - 4 days and now - 7 days if a tile returns HTTP 404.
 */
export function resolveNightLightsCandidateDates(nowUnixMs: number): string[] {
  const now = new Date(nowUnixMs)
  const utcDay = now.getUTCDate()
  const monthAnchor = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  const lag4Days = formatUtcDateString(nowUnixMs - 4 * MS_PER_DAY)
  const lag7Days = formatUtcDateString(nowUnixMs - 7 * MS_PER_DAY)
  const primary = utcDay >= 5 ? monthAnchor : lag4Days

  const candidates: string[] = []
  for (const date of [primary, lag4Days, lag7Days]) {
    if (!candidates.includes(date)) {
      candidates.push(date)
    }
  }
  return candidates
}

/**
 * Formats a keyless NASA GIBS EPSG:3857 WMTS REST URL (`{z}/{y}/{x}.png` row-first order).
 */
export function buildNightLightsTileUrl(
  z: number,
  x: number,
  y: number,
  date: string,
  layer: string = GIBS_NIGHT_LIGHTS_LAYER,
): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${date}/GoogleMapsCompatible_Level8/${z}/${y}/${x}.png`
}

/**
 * Computes the Sun's real-time subsolar latitude/longitude and Earth-fixed 3D unit vector
 * from Unix epoch milliseconds using J2000 solar coordinates and GMST.
 */
export function computeSubsolarPoint(unixMs: number): SubsolarPoint {
  const d = (unixMs - J2000_UNIX_MS) / MS_PER_DAY
  const meanLonDeg = normalizeDeg(280.46 + 0.9856474 * d)
  const meanAnomalyRad = normalizeDeg(357.528 + 0.9856003 * d) * DEG_TO_RAD
  const eclipticLonRad =
    (meanLonDeg + 1.915 * Math.sin(meanAnomalyRad) + 0.02 * Math.sin(2 * meanAnomalyRad)) *
    DEG_TO_RAD
  const obliquityRad = (23.439 - 0.0000004 * d) * DEG_TO_RAD

  const sinLambda = Math.sin(eclipticLonRad)
  const cosLambda = Math.cos(eclipticLonRad)
  const sinObliquity = Math.sin(obliquityRad)
  const cosObliquity = Math.cos(obliquityRad)

  const latRad = Math.asin(Math.max(-1, Math.min(1, sinObliquity * sinLambda)))
  const rightAscensionRad = Math.atan2(cosObliquity * sinLambda, cosLambda)
  const gmstRad = normalizeDeg(280.46061837 + 360.98564736629 * d) * DEG_TO_RAD
  const lonRad = wrapRadMinusPiToPi(rightAscensionRad - gmstRad)

  const cosLat = Math.cos(latRad)
  return {
    latRad,
    lonRad,
    unitVector: [cosLat * Math.cos(lonRad), cosLat * Math.sin(lonRad), Math.sin(latRad)],
  }
}

/**
 * Exact spherical rectangle check returning true if any point in tile (z, x, y)
 * falls on the twilight/night side (`sinSolarAlt <= TWILIGHT_DAY_SIN_ALT + margin`).
 */
export function doesTileIntersectNightSide(
  z: number,
  x: number,
  y: number,
  subsolarLatRad: number,
  subsolarLonRad: number,
): boolean {
  const n = 1 << z
  const lonMin = (x / n) * 2 * Math.PI - Math.PI
  const lonMax = ((x + 1) / n) * 2 * Math.PI - Math.PI
  const latMax = y === 0 ? Math.PI / 2 : mercatorYFractionToLatRad(y / n)
  const latMin = y === n - 1 ? -Math.PI / 2 : mercatorYFractionToLatRad((y + 1) / n)

  const antiLon = wrapRadMinusPiToPi(subsolarLonRad + Math.PI)
  const lonCenter = (lonMin + lonMax) * 0.5
  const lonHalfSpan = (lonMax - lonMin) * 0.5
  const antiInLonSpan = Math.abs(wrapRadMinusPiToPi(antiLon - lonCenter)) <= lonHalfSpan + 1e-12

  const minCosDeltaLon = antiInLonSpan
    ? -1
    : Math.min(Math.cos(lonMin - subsolarLonRad), Math.cos(lonMax - subsolarLonRad))

  const sinSubsolarLat = Math.sin(subsolarLatRad)
  const weightedCosSubsolarLat = Math.cos(subsolarLatRad) * minCosDeltaLon
  const evalSinAlt = (lat: number) =>
    Math.sin(lat) * sinSubsolarLat + Math.cos(lat) * weightedCosSubsolarLat

  let minSinAlt = Math.min(evalSinAlt(latMin), evalSinAlt(latMax))
  if (weightedCosSubsolarLat < 0) {
    const interiorMinLat = Math.atan2(-sinSubsolarLat, -weightedCosSubsolarLat)
    if (interiorMinLat >= latMin && interiorMinLat <= latMax) {
      minSinAlt = Math.min(minSinAlt, evalSinAlt(interiorMinLat))
    }
  }

  return minSinAlt <= TWILIGHT_DAY_SIN_ALT + SUNLIT_TILE_CULL_MARGIN
}

/**
 * Expands z=0 root tiles into the 4 z=1 tiles so low-zoom globe/mercator views
 * render night lights cleanly while filtering to [MIN_NIGHT_TILE_ZOOM, MAX_NIGHT_TILE_ZOOM].
 */
export function normalizeNightCoveringTiles(
  tiles: readonly NightLightsCoveringTile[],
): NightLightsCoveringTile[] {
  const normalized: NightLightsCoveringTile[] = []
  const seen = new Set<string>()

  const pushUnique = (z: number, x: number, y: number, wrap: number) => {
    const key = `${wrap}:${z}/${x}/${y}`
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    normalized.push({ canonical: { z, x, y }, wrap })
  }

  for (const tile of tiles) {
    const { z, x, y } = tile.canonical
    if (z === 0) {
      pushUnique(1, 0, 0, tile.wrap)
      pushUnique(1, 1, 0, tile.wrap)
      pushUnique(1, 0, 1, tile.wrap)
      pushUnique(1, 1, 1, tile.wrap)
    } else if (z >= MIN_NIGHT_TILE_ZOOM && z <= MAX_NIGHT_TILE_ZOOM) {
      pushUnique(z, x, y, tile.wrap)
    }
  }

  return normalized
}

/**
 * Subdivides low-zoom tiles in BOTH 3D globe and 2D mercator so the spherical
 * solar terminator remains smooth across 180-degree z=1 tiles without chord clipping.
 */
export function computeNightTileSubdivisionGranularity(z: number, isGlobe: boolean): number {
  const clampedZ = Math.min(10, Math.max(0, Math.trunc(z)))
  if (isGlobe) {
    return Math.max(32, Math.floor(128 / (1 << clampedZ)))
  }
  return Math.max(16, Math.floor(64 / (1 << clampedZ)))
}

export function buildNightLightsVertexShaderSource(shaderData: NightLightsShaderVariantData): string {
  return `#version 300 es
${shaderData.vertexShaderPrelude}
${shaderData.define}
layout(location = 0) in vec2 a_pos;
uniform vec3 u_tileMercator;
uniform vec2 u_uv_offset;
uniform float u_uv_scale;
out vec2 v_textureCoord;
out vec3 v_sphereDir;
#ifdef GLOBE
out float v_depth;
#endif
const float PI = 3.14159265358979323846;

void main() {
  vec2 inTile = a_pos / 8192.0;
  bool isNorthPole = false;
  bool isSouthPole = false;
#ifdef GLOBE
  if (a_pos.y < -32767.5) {
    inTile.y = 0.0;
    isNorthPole = true;
  }
  if (a_pos.y > 32766.5) {
    inTile.y = 1.0;
    isSouthPole = true;
  }
#endif
  v_textureCoord = u_uv_offset + inTile * u_uv_scale;
  if (isNorthPole) {
    v_sphereDir = vec3(0.0, 0.0, 1.0);
  } else if (isSouthPole) {
    v_sphereDir = vec3(0.0, 0.0, -1.0);
  } else {
    vec2 merc = u_tileMercator.xy + inTile * u_tileMercator.z;
    float lon = (merc.x * 2.0 - 1.0) * PI;
    float lat = atan(sinh(PI * (1.0 - 2.0 * merc.y)));
    float cosLat = cos(lat);
    v_sphereDir = vec3(cosLat * cos(lon), cosLat * sin(lon), sin(lat));
  }
  gl_Position = projectTile(a_pos, a_pos);
#ifdef GLOBE
  v_depth = gl_Position.z / gl_Position.w;
#endif
}
`
}

export function buildNightLightsFragmentShaderSource(
  shaderData: NightLightsShaderVariantData,
): string {
  return `#version 300 es
precision highp float;
${shaderData.define}
uniform sampler2D u_tileTexture;
uniform vec3 u_sunDir;
uniform float u_zoomOpacity;
in vec2 v_textureCoord;
in vec3 v_sphereDir;
#ifdef GLOBE
in float v_depth;
#endif
out vec4 fragColor;

const float DARK_VEIL_ALPHA = 0.89;

void main() {
#ifdef GLOBE
  if (v_depth > 1.0) discard;
#endif
  float sinSolarAlt = dot(normalize(v_sphereDir), u_sunDir);
  float nightMask = smoothstep(${TWILIGHT_DAY_SIN_ALT.toFixed(4)}, ${TWILIGHT_NIGHT_SIN_ALT.toFixed(4)}, sinSolarAlt);
  float veilStrength = nightMask * u_zoomOpacity;
  if (veilStrength <= 0.001) discard;

  vec4 raw = texture(u_tileTexture, v_textureCoord);
  float cleanRadiance = smoothstep(0.125, 0.94, raw.r) * raw.a;
  float lightCurve = cleanRadiance > 0.0 ? pow(cleanRadiance, 0.82) : 0.0;
  float cityNightMask = smoothstep(-0.0087, -0.1564, sinSolarAlt);
  float lightStrength = lightCurve * cityNightMask * u_zoomOpacity;

  vec3 dimAmber = vec3(0.96, 0.48, 0.14);
  vec3 midGold = vec3(1.0, 0.80, 0.38);
  vec3 brightCore = vec3(1.0, 0.97, 0.86);
  vec3 cityColor = mix(dimAmber, midGold, smoothstep(0.05, 0.55, lightCurve));
  cityColor = mix(cityColor, brightCore, smoothstep(0.55, 0.95, lightCurve));

  float twilightBand = nightMask * (1.0 - nightMask) * 4.0;
  vec3 nightAmbient = vec3(0.014, 0.024, 0.058);
  vec3 twilightLift = vec3(0.08, 0.05, 0.09) * twilightBand;
  vec3 baseNightTint = nightAmbient + twilightLift;

  float finalAlpha = clamp(mix(DARK_VEIL_ALPHA, 0.96, lightCurve) * veilStrength, 0.0, 1.0);
  vec3 premulRgb = clamp(baseNightTint * finalAlpha + cityColor * (lightStrength * 1.08), 0.0, 1.0);
  fragColor = vec4(premulRgb, finalAlpha);
}
`
}
