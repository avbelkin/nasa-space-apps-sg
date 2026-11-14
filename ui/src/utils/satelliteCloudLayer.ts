import {
  createTileMesh,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import {
  buildCloudFragmentShaderSource,
  buildCloudTileUrl,
  buildCloudVertexShaderSource,
  CLOUD_REFRESH_INTERVAL_MS,
  computeCloudLayerOpacity,
  computeGlobeSubdivisionGranularity,
  computeTileSubUv,
  DEFAULT_CLOUD_BASE_OPACITY,
  MAX_CLOUD_TILE_ZOOM,
  MIN_CLOUD_TILE_ZOOM,
  normalizeCloudCoveringTiles,
} from './satelliteCloudShader.ts'

export const SATELLITE_CLOUDS_LAYER_ID = 'satellite-clouds-layer'

const MAX_CACHED_TILES = 192
const ERROR_RETRY_BACKOFF_MS = 30_000

interface CompiledProgramEntry {
  program: WebGLProgram
  vertexShader: WebGLShader
  fragmentShader: WebGLShader
  uProjectionMatrix: WebGLUniformLocation | null
  uProjectionTileMercatorCoords: WebGLUniformLocation | null
  uProjectionClippingPlane: WebGLUniformLocation | null
  uProjectionTransition: WebGLUniformLocation | null
  uProjectionFallbackMatrix: WebGLUniformLocation | null
  uUvOffset: WebGLUniformLocation | null
  uUvScale: WebGLUniformLocation | null
  uTileTexture: WebGLUniformLocation | null
  uOpacity: WebGLUniformLocation | null
}

interface TileMeshEntry {
  vao: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  indexCount: number
  indexType: number
}

interface TileCacheEntry {
  key: string
  z: number
  x: number
  y: number
  texture: WebGLTexture | null
  hasEmptyResponse: boolean
  fetchedEpoch: number
  loadingEpoch: number | null
  retryAfterMs: number
  abortController: AbortController | null
  lastUsedSeq: number
}

export interface SatelliteCloudLayerController extends CustomLayerInterface {
  setVisible: (visible: boolean) => void
  setDisabled: (disabled: boolean) => void
  refreshNow: () => void
}

export interface CreateSatelliteCloudLayerOptions {
  apiBaseUrl: string
  disabled?: boolean
  initialVisible?: boolean
  baseOpacity?: number
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Failed to allocate WebGL2 shader for satellite cloud layer.')
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(`Satellite cloud shader compile failed: ${info}`)
  }
  return shader
}

function createProgramEntry(
  gl: WebGL2RenderingContext,
  options: CustomRenderMethodInput,
): CompiledProgramEntry {
  const vertexSource = buildCloudVertexShaderSource(options.shaderData)
  const fragmentSource = buildCloudFragmentShaderSource(options.shaderData)
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error('Failed to allocate WebGL2 program for satellite cloud layer.')
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'Unknown program link error'
    gl.deleteProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error(`Satellite cloud program link failed: ${info}`)
  }

  return {
    program,
    vertexShader,
    fragmentShader,
    uProjectionMatrix: gl.getUniformLocation(program, 'u_projection_matrix'),
    uProjectionTileMercatorCoords: gl.getUniformLocation(program, 'u_projection_tile_mercator_coords'),
    uProjectionClippingPlane: gl.getUniformLocation(program, 'u_projection_clipping_plane'),
    uProjectionTransition: gl.getUniformLocation(program, 'u_projection_transition'),
    uProjectionFallbackMatrix: gl.getUniformLocation(program, 'u_projection_fallback_matrix'),
    uUvOffset: gl.getUniformLocation(program, 'u_uv_offset'),
    uUvScale: gl.getUniformLocation(program, 'u_uv_scale'),
    uTileTexture: gl.getUniformLocation(program, 'u_tileTexture'),
    uOpacity: gl.getUniformLocation(program, 'u_opacity'),
  }
}

export function createSatelliteCloudLayer({
  apiBaseUrl,
  disabled = false,
  initialVisible = true,
  baseOpacity = DEFAULT_CLOUD_BASE_OPACITY,
}: CreateSatelliteCloudLayerOptions): SatelliteCloudLayerController {
  let mapRef: MapLibreMap | null = null
  let glRef: WebGL2RenderingContext | null = null
  let visible = initialVisible
  let isDisabled = disabled
  let contextLost = false
  let disposed = false

  let refreshEpoch = 1
  let refreshTimestamp = Date.now()
  let useSeq = 0
  let refreshTimerId: number | null = null

  const programs = new Map<string, CompiledProgramEntry>()
  const meshes = new Map<string, TileMeshEntry>()
  const tiles = new Map<string, TileCacheEntry>()

  const evictCacheIfNeeded = (gl: WebGL2RenderingContext) => {
    if (tiles.size <= MAX_CACHED_TILES) {
      return
    }
    const candidates = [...tiles.values()]
      .filter((entry) => entry.loadingEpoch === null)
      .sort((a, b) => a.lastUsedSeq - b.lastUsedSeq)

    const removeCount = tiles.size - MAX_CACHED_TILES
    for (let i = 0; i < removeCount && i < candidates.length; i++) {
      const target = candidates[i]
      if (target.texture && !contextLost) {
        gl.deleteTexture(target.texture)
      }
      target.texture = null
      tiles.delete(target.key)
    }
  }

  const abortAllTileRequests = () => {
    for (const entry of tiles.values()) {
      entry.abortController?.abort()
      entry.abortController = null
      entry.loadingEpoch = null
    }
  }

  const clearGpuHandles = (deleteLiveObjects: boolean) => {
    const gl = glRef
    if (deleteLiveObjects && gl && !contextLost) {
      for (const entry of tiles.values()) {
        if (entry.texture) {
          gl.deleteTexture(entry.texture)
        }
      }
      for (const mesh of meshes.values()) {
        gl.deleteVertexArray(mesh.vao)
        gl.deleteBuffer(mesh.vertexBuffer)
        gl.deleteBuffer(mesh.indexBuffer)
      }
      for (const compiled of programs.values()) {
        gl.deleteProgram(compiled.program)
        gl.deleteShader(compiled.vertexShader)
        gl.deleteShader(compiled.fragmentShader)
      }
    }
    for (const entry of tiles.values()) {
      entry.texture = null
      entry.hasEmptyResponse = false
      entry.fetchedEpoch = 0
      entry.loadingEpoch = null
      entry.retryAfterMs = 0
    }
    meshes.clear()
    programs.clear()
  }

  const getOrCreateMesh = (
    gl: WebGL2RenderingContext,
    z: number,
    y: number,
    isGlobe: boolean,
  ): TileMeshEntry => {
    const granularity = computeGlobeSubdivisionGranularity(z, isGlobe)
    const extendToNorthPole = isGlobe && y === 0
    const extendToSouthPole = isGlobe && y === (1 << z) - 1
    const key = `${isGlobe ? 'g' : 'm'}:${granularity}:${extendToNorthPole ? 1 : 0}:${extendToSouthPole ? 1 : 0}`

    const cached = meshes.get(key)
    if (cached) {
      return cached
    }

    const tileMesh = createTileMesh(
      {
        granularity,
        generateBorders: false,
        extendToNorthPole,
        extendToSouthPole,
      },
      '16bit',
    )

    const vao = gl.createVertexArray()
    const vertexBuffer = gl.createBuffer()
    const indexBuffer = gl.createBuffer()
    if (!vao || !vertexBuffer || !indexBuffer) {
      if (vao) gl.deleteVertexArray(vao)
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer)
      if (indexBuffer) gl.deleteBuffer(indexBuffer)
      throw new Error('Failed to allocate WebGL2 buffers for satellite cloud tile mesh.')
    }

    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, tileMesh.vertices, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.SHORT, false, 4, 0)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, tileMesh.indices, gl.STATIC_DRAW)
    gl.bindVertexArray(null)

    const indexCount = tileMesh.indices.byteLength / (tileMesh.uses32bitIndices ? 4 : 2)
    const entry: TileMeshEntry = {
      vao,
      vertexBuffer,
      indexBuffer,
      indexCount,
      indexType: tileMesh.uses32bitIndices ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    }
    meshes.set(key, entry)
    return entry
  }

  const ensureTileFetched = (z: number, x: number, y: number) => {
    const gl = glRef
    if (!gl || contextLost || disposed || isDisabled) {
      return
    }

    const key = `${z}/${x}/${y}`
    let entry = tiles.get(key)
    if (!entry) {
      entry = {
        key,
        z,
        x,
        y,
        texture: null,
        hasEmptyResponse: false,
        fetchedEpoch: 0,
        loadingEpoch: null,
        retryAfterMs: 0,
        abortController: null,
        lastUsedSeq: ++useSeq,
      }
      tiles.set(key, entry)
    } else {
      entry.lastUsedSeq = ++useSeq
    }

    const nowMs = Date.now()
    if (
      entry.fetchedEpoch >= refreshEpoch ||
      entry.loadingEpoch === refreshEpoch ||
      nowMs < entry.retryAfterMs
    ) {
      return
    }

    entry.abortController?.abort()
    const abortController = new AbortController()
    const targetEpoch = refreshEpoch
    const url = buildCloudTileUrl(apiBaseUrl, z, x, y, refreshTimestamp)

    entry.abortController = abortController
    entry.loadingEpoch = targetEpoch

    void fetch(url, { signal: abortController.signal })
      .then(async (response) => {
        if (response.status === 204) {
          if (disposed || targetEpoch !== refreshEpoch) {
            return
          }
          if (entry.texture && !contextLost) {
            gl.deleteTexture(entry.texture)
          }
          entry.texture = null
          entry.hasEmptyResponse = true
          entry.fetchedEpoch = targetEpoch
          entry.retryAfterMs = 0
          mapRef?.triggerRepaint()
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} fetching cloud tile ${key}`)
        }

        const blob = await response.blob()
        if (disposed || abortController.signal.aborted || contextLost) {
          return
        }

        const bitmap = await (
          typeof createImageBitmap === 'function'
            ? createImageBitmap(blob, {
                premultiplyAlpha: 'none',
                colorSpaceConversion: 'none',
              }).catch(() => createImageBitmap(blob))
            : Promise.reject(new Error('createImageBitmap unavailable'))
        )

        try {
          if (disposed || abortController.signal.aborted || contextLost) {
            return
          }

          let texture = entry.texture
          if (!texture) {
            texture = gl.createTexture()
            if (!texture) {
              throw new Error('Failed to allocate WebGL2 texture for cloud tile.')
            }
            entry.texture = texture
          }

          gl.bindTexture(gl.TEXTURE_2D, texture)
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0)
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
          gl.bindTexture(gl.TEXTURE_2D, null)

          entry.hasEmptyResponse = false
          entry.fetchedEpoch = targetEpoch
          entry.retryAfterMs = 0
          evictCacheIfNeeded(gl)
          mapRef?.triggerRepaint()
        } finally {
          bitmap.close()
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        entry.retryAfterMs = Date.now() + ERROR_RETRY_BACKOFF_MS
      })
      .finally(() => {
        if (entry.abortController === abortController) {
          entry.abortController = null
          entry.loadingEpoch = null
        }
      })
  }

  const resolveRenderableTexture = (
    z: number,
    x: number,
    y: number,
  ): { texture: WebGLTexture; uvOffset: [number, number]; uvScale: number } | null => {
    const exact = tiles.get(`${z}/${x}/${y}`)
    if (exact?.hasEmptyResponse && exact.fetchedEpoch === refreshEpoch) {
      return null
    }
    if (exact?.texture) {
      exact.lastUsedSeq = ++useSeq
      return { texture: exact.texture, uvOffset: [0, 0], uvScale: 1 }
    }

    for (let ancestorZ = z - 1; ancestorZ >= MIN_CLOUD_TILE_ZOOM; ancestorZ--) {
      const dz = z - ancestorZ
      const ancestorX = x >> dz
      const ancestorY = y >> dz
      const ancestor = tiles.get(`${ancestorZ}/${ancestorX}/${ancestorY}`)
      if (ancestor?.texture) {
        ancestor.lastUsedSeq = ++useSeq
        const subUv = computeTileSubUv(z, x, y, ancestorZ)
        return {
          texture: ancestor.texture,
          uvOffset: subUv.uvOffset,
          uvScale: subUv.uvScale,
        }
      }
    }

    return null
  }

  const advanceRefreshEpoch = (nowMs = Date.now()) => {
    if (disposed || isDisabled) {
      return
    }
    refreshTimestamp = nowMs
    refreshEpoch += 1
    for (const entry of tiles.values()) {
      entry.retryAfterMs = 0
    }
    mapRef?.triggerRepaint()
  }

  const onVisibilityChange = () => {
    if (disposed || typeof document === 'undefined') {
      return
    }
    if (!document.hidden && visible && Date.now() - refreshTimestamp >= CLOUD_REFRESH_INTERVAL_MS) {
      advanceRefreshEpoch()
    }
  }

  const onContextLost = () => {
    contextLost = true
    abortAllTileRequests()
    clearGpuHandles(false)
  }

  const onContextRestored = () => {
    contextLost = false
    mapRef?.triggerRepaint()
  }

  return {
    id: SATELLITE_CLOUDS_LAYER_ID,
    type: 'custom',
    renderingMode: '2d',

    onAdd(map, gl) {
      mapRef = map
      glRef = gl
      disposed = false
      contextLost = false

      const canvas = map.getCanvas()
      canvas.addEventListener('webglcontextlost', onContextLost)
      canvas.addEventListener('webglcontextrestored', onContextRestored)

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange)
      }

      if (typeof window !== 'undefined') {
        refreshTimerId = window.setInterval(() => {
          if (disposed || isDisabled || !visible) {
            return
          }
          if (typeof document !== 'undefined' && document.hidden) {
            return
          }
          advanceRefreshEpoch()
        }, CLOUD_REFRESH_INTERVAL_MS)
      }
    },

    onRemove(map) {
      disposed = true
      if (refreshTimerId !== null && typeof window !== 'undefined') {
        window.clearInterval(refreshTimerId)
        refreshTimerId = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      const canvas = map.getCanvas()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)

      abortAllTileRequests()
      clearGpuHandles(true)
      tiles.clear()
      glRef = null
      mapRef = null
    },

    render(gl, options) {
      if (disposed || contextLost || !visible || isDisabled || !mapRef) {
        return
      }

      const opacity = computeCloudLayerOpacity(mapRef.getZoom(), baseOpacity)
      if (opacity <= 0) {
        return
      }

      const coveringTiles = normalizeCloudCoveringTiles(
        mapRef.coveringTiles({
          tileSize: 256,
          minzoom: 0,
          maxzoom: MAX_CLOUD_TILE_ZOOM,
        }),
      )
      if (coveringTiles.length === 0) {
        return
      }

      const variantKey = options.shaderData.variantName
      let programEntry = programs.get(variantKey)
      if (!programEntry) {
        programEntry = createProgramEntry(gl, options)
        programs.set(variantKey, programEntry)
      }

      const isGlobe = variantKey.includes('globe')

      gl.useProgram(programEntry.program)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.enable(gl.CULL_FACE)
      gl.cullFace(gl.BACK)
      gl.frontFace(gl.CCW)

      gl.activeTexture(gl.TEXTURE0)
      if (programEntry.uTileTexture !== null) {
        gl.uniform1i(programEntry.uTileTexture, 0)
      }
      if (programEntry.uOpacity !== null) {
        gl.uniform1f(programEntry.uOpacity, opacity)
      }

      for (const tileID of coveringTiles) {
        const { z, x, y } = tileID.canonical
        if (z < MIN_CLOUD_TILE_ZOOM || z > MAX_CLOUD_TILE_ZOOM) {
          continue
        }

        ensureTileFetched(z, x, y)
        const resolved = resolveRenderableTexture(z, x, y)
        if (!resolved) {
          continue
        }

        const projectionData = options.getProjectionData({
          tileID: {
            canonical: tileID.canonical,
            wrap: tileID.wrap,
          },
          applyGlobeMatrix: true,
        })

        if (programEntry.uProjectionMatrix !== null) {
          gl.uniformMatrix4fv(
            programEntry.uProjectionMatrix,
            false,
            projectionData.mainMatrix as Float32Array,
          )
        }
        if (programEntry.uProjectionTileMercatorCoords !== null) {
          gl.uniform4fv(
            programEntry.uProjectionTileMercatorCoords,
            projectionData.tileMercatorCoords,
          )
        }
        if (programEntry.uProjectionClippingPlane !== null) {
          gl.uniform4fv(
            programEntry.uProjectionClippingPlane,
            projectionData.clippingPlane,
          )
        }
        if (programEntry.uProjectionTransition !== null) {
          gl.uniform1f(programEntry.uProjectionTransition, projectionData.projectionTransition)
        }
        if (programEntry.uProjectionFallbackMatrix !== null) {
          gl.uniformMatrix4fv(
            programEntry.uProjectionFallbackMatrix,
            false,
            projectionData.fallbackMatrix as Float32Array,
          )
        }
        if (programEntry.uUvOffset !== null) {
          gl.uniform2fv(programEntry.uUvOffset, resolved.uvOffset)
        }
        if (programEntry.uUvScale !== null) {
          gl.uniform1f(programEntry.uUvScale, resolved.uvScale)
        }

        const mesh = getOrCreateMesh(gl, z, y, isGlobe)
        gl.bindTexture(gl.TEXTURE_2D, resolved.texture)
        gl.bindVertexArray(mesh.vao)
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0)
      }

      gl.bindVertexArray(null)
      gl.bindTexture(gl.TEXTURE_2D, null)
    },

    setVisible(nextVisible) {
      if (visible === nextVisible) {
        return
      }
      visible = nextVisible
      if (!visible) {
        abortAllTileRequests()
      } else if (Date.now() - refreshTimestamp >= CLOUD_REFRESH_INTERVAL_MS) {
        advanceRefreshEpoch()
      }
      mapRef?.triggerRepaint()
    },

    setDisabled(nextDisabled) {
      if (isDisabled === nextDisabled) {
        return
      }
      isDisabled = nextDisabled
      if (isDisabled) {
        abortAllTileRequests()
      } else {
        advanceRefreshEpoch()
      }
      mapRef?.triggerRepaint()
    },

    refreshNow() {
      advanceRefreshEpoch()
    },
  }
}
