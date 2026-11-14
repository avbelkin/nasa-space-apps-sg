export const MIN_CLOUD_TILE_ZOOM = 1
export const MAX_CLOUD_TILE_ZOOM = 7
export const CLOUD_TILE_INNER_SIZE = 256
export const CLOUD_TILE_GUTTER = 1
export const CLOUD_TEXTURE_SIZE = CLOUD_TILE_INNER_SIZE + CLOUD_TILE_GUTTER * 2
export const POLAR_CAP_INNER_SIZE = 512
export const POLAR_CAP_GUTTER = 1
export const POLAR_CAP_TEXTURE_SIZE = POLAR_CAP_INNER_SIZE + POLAR_CAP_GUTTER * 2
export const POLAR_CAP_BOUNDARY_LAT_DEG = 78
export const POLAR_CAP_BLEND_START_LAT_DEG = 78.5
export const POLAR_CAP_BLEND_END_LAT_DEG = 84.5
export const POLAR_CAP_TAN_HALF_COLAT = Math.tan(
  ((90 - POLAR_CAP_BOUNDARY_LAT_DEG) * 0.5 * Math.PI) / 180,
)
export type PolarHemisphere = 'north' | 'south'
export const DEFAULT_CLOUD_BASE_OPACITY = 0.65
export const CLOUD_FADE_START_ZOOM = 5.25
export const CLOUD_FADE_END_ZOOM = 9
export const CLOUD_REFRESH_INTERVAL_MS = 5 * 60 * 1000

const CLOUD_FADE_SPAN = CLOUD_FADE_END_ZOOM - CLOUD_FADE_START_ZOOM

export interface CloudShaderVariantData {
  vertexShaderPrelude: string
  define: string
}

export interface TileSubUv {
  uvOffset: [number, number]
  uvScale: number
}

export interface CloudCoveringTile {
  canonical: { z: number; x: number; y: number }
  wrap: number
}

/**
 * Expands any z=0 root tiles into the 4 z=1 tiles so MapLibre's low-zoom / globe-horizon
 * LOD selection never drops satellite clouds, while filtering to [MIN, MAX] and deduplicating.
 */
export function normalizeCloudCoveringTiles(
  tiles: readonly CloudCoveringTile[],
): CloudCoveringTile[] {
  const normalized: CloudCoveringTile[] = []
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
    } else if (z >= MIN_CLOUD_TILE_ZOOM && z <= MAX_CLOUD_TILE_ZOOM) {
      pushUnique(z, x, y, tile.wrap)
    }
  }

  return normalized
}

/**
 * Proportionally rescales extremum's SatelliteCloudLayer opacity curve (0..12 → 0..9, ×0.75):
 * full base opacity through z5.25, linear fade from z5.25 to z9, hidden at z9+.
 */
export function computeCloudLayerOpacity(
  zoom: number,
  baseOpacity: number = DEFAULT_CLOUD_BASE_OPACITY,
): number {
  if (!Number.isFinite(zoom) || !Number.isFinite(baseOpacity) || baseOpacity <= 0) {
    return 0
  }
  if (zoom >= CLOUD_FADE_END_ZOOM) {
    return 0
  }
  if (zoom <= CLOUD_FADE_START_ZOOM) {
    return Math.min(1, baseOpacity)
  }
  const fadeFactor = Math.max(
    0,
    Math.min(1, (CLOUD_FADE_END_ZOOM - zoom) / CLOUD_FADE_SPAN),
  )
  return Math.min(1, baseOpacity) * fadeFactor
}

function joinCloudApiUrl(apiBaseUrl: string, path: string, refreshTimestamp: number): string {
  const normalizedBase = apiBaseUrl.trim().replace(/\/$/, '')
  const url = `${path}?timestamp=${Math.trunc(refreshTimestamp)}`
  return normalizedBase ? `${normalizedBase}${url}` : url
}

export function buildCloudTileUrl(
  apiBaseUrl: string,
  z: number,
  x: number,
  y: number,
  refreshTimestamp: number,
): string {
  return joinCloudApiUrl(
    apiBaseUrl,
    `/api/weather/satellite/${z}/${x}/${y}.png`,
    refreshTimestamp,
  )
}

export function buildCloudPolarCapUrl(
  apiBaseUrl: string,
  pole: PolarHemisphere,
  refreshTimestamp: number,
): string {
  return joinCloudApiUrl(
    apiBaseUrl,
    `/api/weather/satellite/polar/${pole}.png`,
    refreshTimestamp,
  )
}

function mercatorYToLatDeg(mercY: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * mercY))) * 180) / Math.PI
}

export function getTilePolarHemisphere(z: number, y: number): PolarHemisphere | null {
  if (!Number.isInteger(z) || !Number.isInteger(y) || z < MIN_CLOUD_TILE_ZOOM || z > MAX_CLOUD_TILE_ZOOM) {
    return null
  }
  const count = 1 << z
  if (y < 0 || y >= count) {
    return null
  }
  const latTopDeg = mercatorYToLatDeg(y / count)
  if (latTopDeg >= POLAR_CAP_BLEND_START_LAT_DEG) {
    return 'north'
  }
  const latBottomDeg = mercatorYToLatDeg((y + 1) / count)
  if (latBottomDeg <= -POLAR_CAP_BLEND_START_LAT_DEG) {
    return 'south'
  }
  return null
}

export function projectSphereDirToPolarCapUv(
  dirX: number,
  dirY: number,
  dirZ: number,
): [number, number] {
  const len = Math.hypot(dirX, dirY, dirZ)
  if (len <= 0) {
    return [0.5, 0.5]
  }
  const dx = dirX / len
  const dy = dirY / len
  const dz = dirZ / len
  const denom = (1 + Math.abs(dz)) * POLAR_CAP_TAN_HALF_COLAT
  const projX = dx / denom
  const projY = dy / denom
  const u = Math.min(1, Math.max(0, projX * 0.5 + 0.5))
  const v = Math.min(1, Math.max(0, projY * 0.5 + 0.5))
  return [
    (POLAR_CAP_GUTTER + u * POLAR_CAP_INNER_SIZE) / POLAR_CAP_TEXTURE_SIZE,
    (POLAR_CAP_GUTTER + v * POLAR_CAP_INNER_SIZE) / POLAR_CAP_TEXTURE_SIZE,
  ]
}

/**
 * Maps a target tile's normalized [0..1] extent onto an ancestor tile texture so
 * zoom fallback tiles can be clipped identically to the covering tile partition.
 */
export function computeTileSubUv(
  targetZ: number,
  targetX: number,
  targetY: number,
  sourceZ: number,
): TileSubUv {
  const dz = targetZ - sourceZ
  if (dz <= 0) {
    return { uvOffset: [0, 0], uvScale: 1 }
  }
  const scale = 1 / (1 << dz)
  const sourceX = targetX >> dz
  const sourceY = targetY >> dz
  return {
    uvOffset: [
      (targetX - (sourceX << dz)) * scale,
      (targetY - (sourceY << dz)) * scale,
    ],
    uvScale: scale,
  }
}

export function computeGlobeSubdivisionGranularity(z: number, isGlobe: boolean): number {
  if (!isGlobe) {
    return 1
  }
  const clampedZ = Math.min(10, Math.max(0, Math.trunc(z)))
  return Math.max(32, Math.floor(128 / (1 << clampedZ)))
}

export function buildCloudVertexShaderSource(shaderData: CloudShaderVariantData): string {
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
const float CLOUD_PI = 3.14159265358979323846;

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
  vec2 inSourceTile = u_uv_offset + inTile * u_uv_scale;
  v_textureCoord = (1.0 + inSourceTile * ${CLOUD_TILE_INNER_SIZE.toFixed(1)}) / ${CLOUD_TEXTURE_SIZE.toFixed(1)};
  if (isNorthPole) {
    v_sphereDir = vec3(0.0, 0.0, 1.0);
  } else if (isSouthPole) {
    v_sphereDir = vec3(0.0, 0.0, -1.0);
  } else {
    vec2 merc = u_tileMercator.xy + inTile * u_tileMercator.z;
    float lon = (merc.x * 2.0 - 1.0) * CLOUD_PI;
    float lat = atan(sinh(CLOUD_PI * (1.0 - 2.0 * merc.y)));
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

/**
 * WebGL2 port of extremum's terminator-aware VIS/IR satellite cloud shader
 * (R = 10.8um IR brightness temp, G = solar VIS reflectance) with NW cloud-top embossing,
 * stereographic polar-cap blending across |lat| >= 78.5 deg on the 3D globe,
 * and premultiplied alpha output.
 */
export function buildCloudFragmentShaderSource(shaderData: CloudShaderVariantData): string {
  const sinBlendStart = Math.sin((POLAR_CAP_BLEND_START_LAT_DEG * Math.PI) / 180).toFixed(10)
  const sinBlendEnd = Math.sin((POLAR_CAP_BLEND_END_LAT_DEG * Math.PI) / 180).toFixed(10)

  return `#version 300 es
precision highp float;
${shaderData.define}
uniform sampler2D u_tileTexture;
uniform sampler2D u_polarCapTexture;
uniform float u_opacity;
uniform float u_polarCapMode;
in vec2 v_textureCoord;
in vec3 v_sphereDir;
#ifdef GLOBE
in float v_depth;
#endif
out vec4 fragColor;

const float TEXTURE_PIXEL_SIZE = ${CLOUD_TEXTURE_SIZE.toFixed(1)};
const float POLAR_CAP_INNER = ${POLAR_CAP_INNER_SIZE.toFixed(1)};
const float POLAR_CAP_GUTTER = ${POLAR_CAP_GUTTER.toFixed(1)};
const float POLAR_CAP_PIXEL_SIZE = ${POLAR_CAP_TEXTURE_SIZE.toFixed(1)};
const float POLAR_CAP_TAN_HALF_COLAT = ${POLAR_CAP_TAN_HALF_COLAT.toFixed(10)};
const float POLAR_CAP_SIN_BLEND_START = ${sinBlendStart};
const float POLAR_CAP_SIN_BLEND_END = ${sinBlendEnd};
const float GAMMA_BRIGHT = 1.75;
const float GAMMA_DARK = 1.2;
const float BLUR_OFFSET_SCALE = 1.36;
const float QUARTER_WEIGHT = 0.25;
const float SHARPEN_STRENGTH = 0.5;
const float EMBOSS_BASE = 0.5;
const float EMBOSS_Y_WEIGHT = 1.6;
const float ALPHA_SCALE = 1.3;
const float ALPHA_BIAS = 0.3;
const float IR_DARKEN_BASE = 0.9;
const float IR_DARKEN_SLOPE = 0.7;
const float VIS_DARKEN_BASE = 0.9;
const float VIS_DARKEN_SLOPE = 0.7;
const float IR_VIS_EXPONENT = 1.5;
const float IR_VIS_OFFSET = 0.1;
const float IR_ROLLOFF_SLOPE = -3.7;
const float IR_ROLLOFF_INTERCEPT = 4.05;
const float LUMINANCE_BOOST = 1.1;
const float COLOR_MIX = 0.32;
const float MIN_CLOUD_SIGNAL = 0.002;

vec2 applyGamma(vec2 c) {
  vec2 t = pow(clamp(1.0 - c, 0.0, 1.0), vec2(GAMMA_BRIGHT));
  return pow(1.0 - t, vec2(GAMMA_DARK));
}

vec2 sampleGammaFrom(sampler2D tex, vec2 uv) {
  return applyGamma(texture(tex, uv).rg);
}

float computeEmbossFrom(sampler2D tex, vec2 uv, vec2 stepSize) {
  float nx = sampleGammaFrom(tex, uv + vec2(stepSize.x, 0.0)).x - sampleGammaFrom(tex, uv - vec2(stepSize.x, 0.0)).x;
  float ny = sampleGammaFrom(tex, uv - vec2(0.0, stepSize.y)).x - sampleGammaFrom(tex, uv + vec2(0.0, stepSize.y)).x;
  return EMBOSS_BASE + nx + EMBOSS_Y_WEIGHT * ny;
}

vec3 sampleProcessedFrom(sampler2D tex, vec2 uv, vec2 stepSize) {
  vec2 g = sampleGammaFrom(tex, uv);
  return vec3(g.x, g.y, computeEmbossFrom(tex, uv, stepSize));
}

void sampleSharpenInputs(sampler2D tex, vec2 uv, float pixelSize, out vec3 orig, out vec3 blur) {
  vec2 stepSize = vec2(1.0 / pixelSize);
  vec2 blurStep = stepSize * BLUR_OFFSET_SCALE;
  orig = sampleProcessedFrom(tex, uv, stepSize);
  blur = (
    sampleProcessedFrom(tex, uv + vec2(blurStep.x, 0.0), stepSize) +
    sampleProcessedFrom(tex, uv - vec2(blurStep.x, 0.0), stepSize) +
    sampleProcessedFrom(tex, uv + vec2(0.0, blurStep.y), stepSize) +
    sampleProcessedFrom(tex, uv - vec2(0.0, blurStep.y), stepSize)
  ) * QUARTER_WEIGHT;
}

void main() {
#ifdef GLOBE
  if (v_depth > 1.0) discard;
#endif
  vec3 dir = normalize(v_sphereDir);
  float polarWeight = 0.0;
#ifdef GLOBE
  bool matchNorth = u_polarCapMode > 0.5 && dir.z > 0.0;
  bool matchSouth = u_polarCapMode < -0.5 && dir.z < 0.0;
  if (matchNorth || matchSouth) {
    polarWeight = smoothstep(POLAR_CAP_SIN_BLEND_START, POLAR_CAP_SIN_BLEND_END, abs(dir.z));
  }
#endif
  vec2 polarUv = vec2(0.5);
  float rawSignal = 0.0;
  if (polarWeight < 1.0) {
    vec4 tileRaw = texture(u_tileTexture, v_textureCoord);
    rawSignal = max(rawSignal, tileRaw.r + tileRaw.g);
  }
  if (polarWeight > 0.0) {
    vec2 proj = dir.xy / ((1.0 + abs(dir.z)) * POLAR_CAP_TAN_HALF_COLAT);
    vec2 inPolarCap = clamp(proj * 0.5 + 0.5, 0.0, 1.0);
    polarUv = (POLAR_CAP_GUTTER + inPolarCap * POLAR_CAP_INNER) / POLAR_CAP_PIXEL_SIZE;
    vec4 polarRaw = texture(u_polarCapTexture, polarUv);
    rawSignal = max(rawSignal, polarRaw.r + polarRaw.g);
  }
  if (rawSignal < MIN_CLOUD_SIGNAL) discard;

  vec3 orig = vec3(0.0, 0.0, EMBOSS_BASE);
  vec3 blur = vec3(0.0, 0.0, EMBOSS_BASE);
  if (polarWeight <= 0.0) {
    sampleSharpenInputs(u_tileTexture, v_textureCoord, TEXTURE_PIXEL_SIZE, orig, blur);
  } else if (polarWeight >= 1.0) {
    sampleSharpenInputs(u_polarCapTexture, polarUv, POLAR_CAP_PIXEL_SIZE, orig, blur);
  } else {
    vec3 tileOrig;
    vec3 tileBlur;
    vec3 polarOrig;
    vec3 polarBlur;
    sampleSharpenInputs(u_tileTexture, v_textureCoord, TEXTURE_PIXEL_SIZE, tileOrig, tileBlur);
    sampleSharpenInputs(u_polarCapTexture, polarUv, POLAR_CAP_PIXEL_SIZE, polarOrig, polarBlur);
    orig = mix(tileOrig, polarOrig, polarWeight);
    blur = mix(tileBlur, polarBlur, polarWeight);
  }

  vec3 sharp = clamp(orig + SHARPEN_STRENGTH * (orig - blur), 0.0, 1.0);
  float ir = sharp.x;
  float vis = sharp.y;
  float alpha = 1.0 - (1.0 - ir) * (1.0 - vis);
  alpha = max(alpha * ALPHA_SCALE - ALPHA_BIAS, 0.0);
  if (alpha <= 0.0) discard;
  float visEffective = max(pow(ir, IR_VIS_EXPONENT) - IR_VIS_OFFSET, vis);
  float luminance = 1.0 - (IR_DARKEN_BASE - IR_DARKEN_SLOPE * ir) * (VIS_DARKEN_BASE - VIS_DARKEN_SLOPE * visEffective);
  luminance = luminance * min(1.0, IR_ROLLOFF_SLOPE * ir + IR_ROLLOFF_INTERCEPT) * LUMINANCE_BOOST;
  luminance = clamp(luminance * (orig.z + EMBOSS_BASE) + orig.y - blur.y, 0.0, 1.0);
  vec3 irTint = ir * vec3(0.0, 0.35, 0.9);
  vec3 visTint = vis * vec3(1.0, 0.67, 0.15);
  vec3 nightTint = (ir * vec3(0.8, 0.3, 0.0) + vec3(0.1, 0.15, 0.2)) * orig.z;
  vec3 visColor = clamp(visTint + nightTint * (1.0 - visTint) + irTint, 0.0, 1.0);
  vec3 cloudColor = mix(vec3(luminance), visColor, COLOR_MIX);
  float finalAlpha = clamp(alpha * u_opacity, 0.0, 1.0);
  fragColor = vec4(cloudColor * finalAlpha, finalAlpha);
}
`
}
