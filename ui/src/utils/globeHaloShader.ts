export const MAX_GLOBE_MERCATOR_LAT = 85.051129
export const HALO_FADE_START_ZOOM = 5.5
export const HALO_FADE_END_ZOOM = 8.5

const MAP_TILE_SIZE = 512
const DEG_TO_RAD = Math.PI / 180

export interface GlobeHaloUniformInput {
  modelViewProjectionMatrix: ArrayLike<number>
  projectionMatrix: ArrayLike<number>
  zoom: number
  centerLatDeg: number
  viewportHeightCssPx: number
  projectionTransition: number
}

export interface GlobeHaloUniforms {
  invProjMatrix: Float32Array
  globeCenterView: [number, number, number]
  globeRadius: number
  viewUnitsPerCssPx: number
  scalesCssPx: [number, number, number]
  strength: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Computes zoom attenuation for the globe atmospheric limb halo:
 * 1.0 through z5.5, smoothstep fade from z5.5 to z8.5, and 0.0 at z8.5+.
 */
export function computeGlobeHaloZoomFade(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom >= HALO_FADE_END_ZOOM) {
    return 0
  }
  if (zoom <= HALO_FADE_START_ZOOM) {
    return 1
  }
  const t = (HALO_FADE_END_ZOOM - zoom) / (HALO_FADE_END_ZOOM - HALO_FADE_START_ZOOM)
  return t * t * (3 - 2 * t)
}

/**
 * Exact 4x4 column-major matrix inverse computed in IEEE-754 double precision.
 * Returns null if the input has fewer than 16 elements or is singular.
 */
export function invertMat4(m: ArrayLike<number>): Float32Array | null {
  if (!m || m.length < 16) {
    return null
  }

  const m00 = m[0],
    m01 = m[1],
    m02 = m[2],
    m03 = m[3]
  const m10 = m[4],
    m11 = m[5],
    m12 = m[6],
    m13 = m[7]
  const m20 = m[8],
    m21 = m[9],
    m22 = m[10],
    m23 = m[11]
  const m30 = m[12],
    m31 = m[13],
    m32 = m[14],
    m33 = m[15]

  const b00 = m00 * m11 - m01 * m10
  const b01 = m00 * m12 - m02 * m10
  const b02 = m00 * m13 - m03 * m10
  const b03 = m01 * m12 - m02 * m11
  const b04 = m01 * m13 - m03 * m11
  const b05 = m02 * m13 - m03 * m12
  const b06 = m20 * m31 - m21 * m30
  const b07 = m20 * m32 - m22 * m30
  const b08 = m20 * m33 - m23 * m30
  const b09 = m21 * m32 - m22 * m31
  const b10 = m21 * m33 - m23 * m31
  const b11 = m22 * m33 - m23 * m32

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!Number.isFinite(det) || Math.abs(det) < 1e-14) {
    return null
  }

  const invDet = 1 / det
  const out = new Float32Array(16)
  out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * invDet
  out[1] = (m02 * b10 - m01 * b11 - m03 * b09) * invDet
  out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * invDet
  out[3] = (m22 * b04 - m21 * b05 - m23 * b03) * invDet
  out[4] = (m12 * b08 - m10 * b11 - m13 * b07) * invDet
  out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * invDet
  out[6] = (m32 * b02 - m30 * b05 - m33 * b01) * invDet
  out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * invDet
  out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * invDet
  out[9] = (m01 * b08 - m00 * b10 - m03 * b06) * invDet
  out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * invDet
  out[11] = (m21 * b02 - m20 * b04 - m23 * b00) * invDet
  out[12] = (m11 * b07 - m10 * b09 - m12 * b06) * invDet
  out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * invDet
  out[14] = (m31 * b01 - m30 * b03 - m32 * b00) * invDet
  out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * invDet
  return out
}

/**
 * Derives view-space globe center, radius, CSS-pixel scale, and atmospheric
 * limb thicknesses from MapLibre's public projection matrices and camera state.
 */
export function computeGlobeHaloUniforms(
  input: GlobeHaloUniformInput,
): GlobeHaloUniforms | null {
  const {
    modelViewProjectionMatrix: mvp,
    projectionMatrix: proj,
    zoom,
    centerLatDeg,
    viewportHeightCssPx,
    projectionTransition,
  } = input

  if (
    !mvp ||
    mvp.length < 16 ||
    !proj ||
    proj.length < 16 ||
    !Number.isFinite(zoom) ||
    !Number.isFinite(centerLatDeg) ||
    !Number.isFinite(viewportHeightCssPx) ||
    viewportHeightCssPx <= 0 ||
    !Number.isFinite(projectionTransition)
  ) {
    return null
  }

  const strength = clamp(projectionTransition, 0, 1) * computeGlobeHaloZoomFade(zoom)
  if (strength <= 0.001) {
    return null
  }

  const invProjMatrix = invertMat4(proj)
  if (!invProjMatrix) {
    return null
  }

  // Transform world origin [0, 0, 0, 1] -> clip space (mvp col 3) -> view space.
  const cxClip = mvp[12]
  const cyClip = mvp[13]
  const czClip = mvp[14]
  const cwClip = mvp[15]

  const vx =
    invProjMatrix[0] * cxClip +
    invProjMatrix[4] * cyClip +
    invProjMatrix[8] * czClip +
    invProjMatrix[12] * cwClip
  const vy =
    invProjMatrix[1] * cxClip +
    invProjMatrix[5] * cyClip +
    invProjMatrix[9] * czClip +
    invProjMatrix[13] * cwClip
  const vz =
    invProjMatrix[2] * cxClip +
    invProjMatrix[6] * cyClip +
    invProjMatrix[10] * czClip +
    invProjMatrix[14] * cwClip
  const vw =
    invProjMatrix[3] * cxClip +
    invProjMatrix[7] * cyClip +
    invProjMatrix[11] * czClip +
    invProjMatrix[15] * cwClip

  if (!Number.isFinite(vw) || Math.abs(vw) < 1e-12) {
    return null
  }

  const gx = vx / vw
  const gy = vy / vw
  const gz = vz / vw
  const centerDist = Math.hypot(gx, gy, gz)

  const worldSize = MAP_TILE_SIZE * Math.pow(2, zoom)
  const clampedLat = Math.min(Math.abs(centerLatDeg), MAX_GLOBE_MERCATOR_LAT)
  const planetScale = Math.cos(clampedLat * DEG_TO_RAD)
  if (!Number.isFinite(planetScale) || planetScale <= 1e-6) {
    return null
  }

  const globeRadius = worldSize / (2 * Math.PI) / planetScale
  if (!Number.isFinite(globeRadius) || globeRadius <= 0 || centerDist <= globeRadius * 1.0005) {
    return null
  }

  const projYScale = Math.abs(proj[5])
  if (!Number.isFinite(projYScale) || projYScale <= 1e-6) {
    return null
  }

  const limbDepth = Math.sqrt(centerDist * centerDist - globeRadius * globeRadius)
  const viewUnitsPerCssPx = (2 * limbDepth) / (viewportHeightCssPx * projYScale)
  if (!Number.isFinite(viewUnitsPerCssPx) || viewUnitsPerCssPx <= 0) {
    return null
  }

  const apparentRadiusPx = globeRadius / viewUnitsPerCssPx
  const outerHaloCssPx = clamp(0.19 * apparentRadiusPx, 30, 108)
  const innerGrazingCssPx = clamp(0.065 * apparentRadiusPx, 10, 34)
  const rimCoreCssPx = clamp(0.014 * apparentRadiusPx, 2.0, 5.2)

  return {
    invProjMatrix,
    globeCenterView: [gx, gy, gz],
    globeRadius,
    viewUnitsPerCssPx,
    scalesCssPx: [outerHaloCssPx, innerGrazingCssPx, rimCoreCssPx],
    strength,
  }
}

export function buildGlobeHaloVertexShaderSource(): string {
  return `#version 300 es
layout(location = 0) in vec2 a_pos;
uniform mat4 u_invProjMatrix;
out vec3 v_viewDir;

void main() {
  vec4 viewPos = u_invProjMatrix * vec4(a_pos, 0.0, 1.0);
  v_viewDir = viewPos.xyz / max(abs(viewPos.w), 1e-6);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`
}

export function buildGlobeHaloFragmentShaderSource(): string {
  return `#version 300 es
precision highp float;

in vec3 v_viewDir;
uniform vec3 u_globeCenter;
uniform float u_globeRadius;
uniform float u_viewUnitsPerCssPx;
uniform vec3 u_scalesCssPx;
uniform float u_strength;
uniform int u_pass;

out vec4 fragColor;

// Interleaved gradient noise dither (+/- 0.5 / 255) to eliminate 8-bit atmospheric banding.
float interleavedGradientNoise(vec2 pixelCoord) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(pixelCoord, magic.xy))) - 0.5;
}

void main() {
  float centerDist = length(u_globeCenter);
  if (centerDist <= u_globeRadius * 1.0005) {
    discard;
  }

  vec3 rayDir = normalize(v_viewDir);
  vec3 centerDir = u_globeCenter / centerDist;

  float sinAngle = length(cross(rayDir, centerDir));
  float cosAngle = dot(rayDir, centerDir);
  float angleToCenter = atan(sinAngle, cosAngle);
  float horizonAngle = asin(clamp(u_globeRadius / centerDist, 0.0, 1.0));
  float limbDepth = sqrt(max(centerDist * centerDist - u_globeRadius * u_globeRadius, 0.0));

  // Signed distance in CSS pixels relative to the planet silhouette:
  // < 0 inside the Earth disc, 0 on the horizon limb, > 0 in open space.
  float signedPx = (limbDepth * (angleToCenter - horizonAngle)) / max(u_viewUnitsPerCssPx, 1e-6);

  // Pass 0 (destination-over): fill unloaded basemap tiles inside the globe silhouette
  // with deep planetary night so stars never leak through before Earth tiles finish loading.
  if (u_pass == 0) {
    float insideMask = 1.0 - smoothstep(-0.75, 0.75, signedPx);
    float occludeAlpha = clamp(insideMask * u_strength, 0.0, 1.0);
    if (occludeAlpha <= 0.001) {
      discard;
    }
    vec3 nightBase = vec3(0.016, 0.032, 0.078);
    fragColor = vec4(nightBase * occludeAlpha, occludeAlpha);
    return;
  }

  float outerScalePx = max(u_scalesCssPx.x, 1.0);
  float innerScalePx = max(u_scalesCssPx.y, 1.0);
  float rimScalePx = max(u_scalesCssPx.z, 0.5);

  if (signedPx > outerScalePx * 1.65 || signedPx < -innerScalePx * 2.2) {
    discard;
  }

  // Tight luminous atmospheric limb line hugging signedPx = 0.
  float rimOffset = signedPx - 0.15 * rimScalePx;
  float rimNorm = rimOffset / rimScalePx;
  float rimCore = exp(-rimNorm * rimNorm * 1.15);

  // Inner grazing atmospheric scatter kissing the Earth edge without washing out continents/night lights.
  float innerDist = max(-signedPx, 0.0);
  float innerWeight = step(signedPx, 0.75) * exp(-innerDist / (innerScalePx * 0.42)) *
    (1.0 - smoothstep(innerScalePx * 1.4, innerScalePx * 2.1, innerDist));

  // Multi-scale outer atmospheric glow extending from the bright cyan limb into deep sapphire space.
  float outerDist = max(signedPx, 0.0);
  float outerMask = smoothstep(-0.85, 0.85, signedPx);
  float outerEnvelope = 1.0 - smoothstep(outerScalePx * 0.95, outerScalePx * 1.6, outerDist);
  float outerNear = exp(-outerDist / (outerScalePx * 0.13)) * outerMask * outerEnvelope;
  float outerMid = exp(-outerDist / (outerScalePx * 0.34)) * outerMask * outerEnvelope;
  float outerFar = exp(-outerDist / (outerScalePx * 0.72)) * outerMask * outerEnvelope;

  vec3 rimColor = vec3(0.84, 0.95, 1.00);
  vec3 innerColor = vec3(0.32, 0.76, 1.00);
  vec3 nearColor = vec3(0.24, 0.74, 0.98);
  vec3 midColor = vec3(0.11, 0.46, 0.92);
  vec3 farColor = vec3(0.05, 0.17, 0.54);

  vec3 premulRgb =
    rimColor * (rimCore * 0.78) +
    innerColor * (innerWeight * 0.25) +
    nearColor * (outerNear * 0.46) +
    midColor * (outerMid * 0.26) +
    farColor * (outerFar * 0.12);

  float rawAlpha =
    rimCore * 0.80 +
    innerWeight * 0.28 +
    outerNear * 0.49 +
    outerMid * 0.30 +
    outerFar * 0.15;

  float dither = interleavedGradientNoise(gl_FragCoord.xy) / 255.0;
  float finalAlpha = clamp((rawAlpha + dither * 0.6) * u_strength, 0.0, 1.0);
  vec3 finalRgb = clamp((premulRgb + vec3(dither * 0.35)) * u_strength, vec3(0.0), vec3(finalAlpha));

  if (finalAlpha <= 0.001) {
    discard;
  }

  fragColor = vec4(finalRgb, finalAlpha);
}
`
}
