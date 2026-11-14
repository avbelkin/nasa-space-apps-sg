export const MIN_CLOUD_TILE_ZOOM = 1
export const MAX_CLOUD_TILE_ZOOM = 7
export const CLOUD_TILE_INNER_SIZE = 256
export const CLOUD_TILE_GUTTER = 1
export const CLOUD_TEXTURE_SIZE = CLOUD_TILE_INNER_SIZE + CLOUD_TILE_GUTTER * 2
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

export function buildCloudTileUrl(
  apiBaseUrl: string,
  z: number,
  x: number,
  y: number,
  refreshTimestamp: number,
): string {
  const normalizedBase = apiBaseUrl.trim().replace(/\/$/, '')
  const path = `/api/weather/satellite/${z}/${x}/${y}.png?timestamp=${Math.trunc(refreshTimestamp)}`
  return normalizedBase ? `${normalizedBase}${path}` : path
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
uniform vec2 u_uv_offset;
uniform float u_uv_scale;
out vec2 v_textureCoord;
#ifdef GLOBE
out float v_depth;
#endif
void main() {
  vec2 inTile = a_pos / 8192.0;
#ifdef GLOBE
  if (a_pos.y < -32767.5) { inTile.y = 0.0; }
  if (a_pos.y > 32766.5) { inTile.y = 1.0; }
#endif
  vec2 inSourceTile = u_uv_offset + inTile * u_uv_scale;
  v_textureCoord = (1.0 + inSourceTile * ${CLOUD_TILE_INNER_SIZE.toFixed(1)}) / ${CLOUD_TEXTURE_SIZE.toFixed(1)};
  gl_Position = projectTile(a_pos, a_pos);
#ifdef GLOBE
  v_depth = gl_Position.z / gl_Position.w;
#endif
}
`
}

/**
 * WebGL2 port of extremum's terminator-aware VIS/IR satellite cloud shader
 * (R = 10.8um IR brightness temp, G = solar VIS reflectance) with NW cloud-top embossing
 * and premultiplied alpha output.
 */
export function buildCloudFragmentShaderSource(shaderData: CloudShaderVariantData): string {
  return `#version 300 es
precision highp float;
${shaderData.define}
uniform sampler2D u_tileTexture;
uniform float u_opacity;
in vec2 v_textureCoord;
#ifdef GLOBE
in float v_depth;
#endif
out vec4 fragColor;

const float TEXTURE_PIXEL_SIZE = ${CLOUD_TEXTURE_SIZE.toFixed(1)};
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

vec2 sampleGamma(vec2 uv) {
  return applyGamma(texture(u_tileTexture, uv).rg);
}

float computeEmboss(vec2 uv, vec2 stepSize) {
  float nx = sampleGamma(uv + vec2(stepSize.x, 0.0)).x - sampleGamma(uv - vec2(stepSize.x, 0.0)).x;
  float ny = sampleGamma(uv - vec2(0.0, stepSize.y)).x - sampleGamma(uv + vec2(0.0, stepSize.y)).x;
  return EMBOSS_BASE + nx + EMBOSS_Y_WEIGHT * ny;
}

vec3 sampleProcessed(vec2 uv, vec2 stepSize) {
  vec2 g = sampleGamma(uv);
  return vec3(g.x, g.y, computeEmboss(uv, stepSize));
}

void main() {
#ifdef GLOBE
  if (v_depth > 1.0) discard;
#endif
  vec4 raw = texture(u_tileTexture, v_textureCoord);
  if (raw.r + raw.g < MIN_CLOUD_SIGNAL) discard;
  vec2 stepSize = vec2(1.0 / TEXTURE_PIXEL_SIZE);
  vec2 blurStep = stepSize * BLUR_OFFSET_SCALE;
  vec3 orig = sampleProcessed(v_textureCoord, stepSize);
  vec3 blur = (
    sampleProcessed(v_textureCoord + vec2(blurStep.x, 0.0), stepSize) +
    sampleProcessed(v_textureCoord - vec2(blurStep.x, 0.0), stepSize) +
    sampleProcessed(v_textureCoord + vec2(0.0, blurStep.y), stepSize) +
    sampleProcessed(v_textureCoord - vec2(0.0, blurStep.y), stepSize)
  ) * QUARTER_WEIGHT;
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
