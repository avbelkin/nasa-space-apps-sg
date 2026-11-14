import {
  createTileMesh,
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from 'maplibre-gl'
import {
  blurRainTileTexture,
  buildGibsDomainsUrl,
  buildRainCloudFragmentShaderSource,
  buildRainCloudVertexShaderSource,
  buildRainTileUrl,
  computeGlobeSubdivisionGranularity,
  computeRainCloudLayerOpacity,
  computeTileSubUv,
  decodeGibsIndexedPng,
  DEFAULT_RAIN_BASE_OPACITY,
  ENABLE_RAIN_CLOUD_BACKDROP,
  formatGibsIsoTimestamp,
  mapRgbaToRainSnow,
  MAX_RAIN_TILE_ZOOM,
  MIN_RAIN_TILE_ZOOM,
  normalizeRainCoveringTiles,
  parseGibsDomainsXml,
  RAIN_FADE_IN_START_ZOOM,
  RAIN_REFRESH_INTERVAL_MS,
  RAIN_TEXTURE_SIZE,
  RAIN_TILE_INNER_SIZE,
  resolveRainObservationTime,
  snapRainLookbackMinutes,
  stitchRainTileGutter,
  type GibsTimeInterval,
  type RainLayerMetadata,
} from './rainCloudShader.ts'

export const RAIN_CLOUDS_LAYER_ID = 'rain-clouds-layer'

const MAX_CACHED_TILES = 192
const ERROR_RETRY_BACKOFF_MS = 30_000
const DOMAINS_FETCH_TIMEOUT_MS = 8_000
const EMPTY_TILE_RG = new Uint8Array(RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE * 2)

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
  uTileOrigin: WebGLUniformLocation | null
  uTileTexture: WebGLUniformLocation | null
  uOpacity: WebGLUniformLocation | null
  uZoom: WebGLUniformLocation | null
  uPixelRatio: WebGLUniformLocation | null
  uEnableCloudBackdrop: WebGLUniformLocation | null
}

interface TileMeshEntry {
  vao: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
  indexBuffer: WebGLBuffer
  indexCount: number
  indexType: number
}

interface RainTileCacheEntry {
  key: string
  z: number
  x: number
  y: number
  rawRg: Uint8Array | null
  texture: WebGLTexture | null
  hasEmptyResponse: boolean
  fetchedEpoch: number
  loadingEpoch: number | null
  retryAfterMs: number
  abortController: AbortController | null
  lastUsedSeq: number
}

export interface RainCloudLayerController extends CustomLayerInterface {
  setVisible: (visible: boolean) => void
  setLookbackMinutes: (minutes: number) => void
  setCloudBackdropEnabled: (enabled: boolean) => void
  refreshNow: () => void
}

export interface CreateRainCloudLayerOptions {
  initialVisible?: boolean
  initialLookbackMinutes?: number
  baseOpacity?: number
  enableCloudBackdrop?: boolean
  onMetadataChange?: (metadata: RainLayerMetadata) => void
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Failed to allocate WebGL2 shader for rain cloud layer.')
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(`Rain cloud shader compile failed: ${info}`)
  }
  return shader
}

function createProgramEntry(
  gl: WebGL2RenderingContext,
  options: CustomRenderMethodInput,
): CompiledProgramEntry {
  const vertexSource = buildRainCloudVertexShaderSource(options.shaderData)
  const fragmentSource = buildRainCloudFragmentShaderSource(options.shaderData)
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error('Failed to allocate WebGL2 program for rain cloud layer.')
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'Unknown program link error'
    gl.deleteProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error(`Rain cloud program link failed: ${info}`)
  }

  return {
    program,
    vertexShader,
    fragmentShader,
    uProjectionMatrix: gl.getUniformLocation(program, 'u_projection_matrix'),
    uProjectionTileMercatorCoords: gl.getUniformLocation(
      program,
      'u_projection_tile_mercator_coords',
    ),
    uProjectionClippingPlane: gl.getUniformLocation(program, 'u_projection_clipping_plane'),
    uProjectionTransition: gl.getUniformLocation(program, 'u_projection_transition'),
    uProjectionFallbackMatrix: gl.getUniformLocation(program, 'u_projection_fallback_matrix'),
    uUvOffset: gl.getUniformLocation(program, 'u_uv_offset'),
    uUvScale: gl.getUniformLocation(program, 'u_uv_scale'),
    uTileOrigin: gl.getUniformLocation(program, 'u_tileOrigin'),
    uTileTexture: gl.getUniformLocation(program, 'u_tileTexture'),
    uOpacity: gl.getUniformLocation(program, 'u_opacity'),
    uZoom: gl.getUniformLocation(program, 'u_zoom'),
    uPixelRatio: gl.getUniformLocation(program, 'u_pixelRatio'),
    uEnableCloudBackdrop: gl.getUniformLocation(program, 'u_enableCloudBackdrop'),
  }
}

async function decodePngViaImageBitmap(arrayBuffer: ArrayBuffer): Promise<Uint8Array> {
  const blob = new Blob([arrayBuffer], { type: 'image/png' })
  const bitmap = await (
    typeof createImageBitmap === 'function'
      ? createImageBitmap(blob, {
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        }).catch(() => createImageBitmap(blob))
      : Promise.reject(new Error('createImageBitmap unavailable'))
  )

  try {
    let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null
    if (typeof OffscreenCanvas === 'function') {
      const canvas = new OffscreenCanvas(RAIN_TILE_INNER_SIZE, RAIN_TILE_INNER_SIZE)
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas')
      canvas.width = RAIN_TILE_INNER_SIZE
      canvas.height = RAIN_TILE_INNER_SIZE
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    }

    if (!ctx) {
      throw new Error('2D canvas context unavailable for rain tile decode.')
    }

    ctx.clearRect(0, 0, RAIN_TILE_INNER_SIZE, RAIN_TILE_INNER_SIZE)
    ctx.drawImage(bitmap, 0, 0, RAIN_TILE_INNER_SIZE, RAIN_TILE_INNER_SIZE)
    const imageData = ctx.getImageData(0, 0, RAIN_TILE_INNER_SIZE, RAIN_TILE_INNER_SIZE).data
    const out = new Uint8Array(RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE * 2)
    const pixelCount = RAIN_TILE_INNER_SIZE * RAIN_TILE_INNER_SIZE

    for (let i = 0; i < pixelCount; i++) {
      const src = i * 4
      const [rain, snow] = mapRgbaToRainSnow(
        imageData[src],
        imageData[src + 1],
        imageData[src + 2],
        imageData[src + 3],
      )
      out[i * 2] = rain
      out[i * 2 + 1] = snow
    }

    return out
  } finally {
    bitmap.close()
  }
}

export function createRainCloudLayer({
  initialVisible = true,
  initialLookbackMinutes = 0,
  baseOpacity = DEFAULT_RAIN_BASE_OPACITY,
  enableCloudBackdrop = ENABLE_RAIN_CLOUD_BACKDROP,
  onMetadataChange,
}: CreateRainCloudLayerOptions = {}): RainCloudLayerController {
  let mapRef: MapLibreMap | null = null
  let glRef: WebGL2RenderingContext | null = null
  let visible = initialVisible
  let lookbackMinutes = snapRainLookbackMinutes(initialLookbackMinutes)
  let cloudBackdropEnabled = enableCloudBackdrop
  let contextLost = false
  let disposed = false

  let refreshEpoch = 1
  let domainsFetchedAtMs = 0
  let domainsSettledOnce = false
  let lastLatestAvailableMs: number | null = null
  let cachedIntervals: GibsTimeInterval[] = []
  let activeTimeParam = lookbackMinutes === 0 ? 'default' : ''
  let domainsInFlight: Promise<void> | null = null
  let domainsAbortController: AbortController | null = null
  let useSeq = 0
  let refreshTimerId: number | null = null

  const programs = new Map<string, CompiledProgramEntry>()
  const meshes = new Map<string, TileMeshEntry>()
  const tiles = new Map<string, RainTileCacheEntry>()

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
      target.rawRg = null
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
      entry.rawRg = null
      entry.hasEmptyResponse = false
      entry.fetchedEpoch = 0
      entry.loadingEpoch = null
      entry.retryAfterMs = 0
    }
    meshes.clear()
    programs.clear()
  }

  const bumpEpoch = () => {
    if (disposed) {
      return
    }
    abortAllTileRequests()
    refreshEpoch += 1
    for (const entry of tiles.values()) {
      entry.retryAfterMs = 0
    }
    mapRef?.triggerRepaint()
  }

  const emitMetadata = (
    latestAvailableMs: number | null,
    effectiveTimeMs: number | null,
    effectiveLookback: number,
  ) => {
    onMetadataChange?.({
      latestAvailableIso:
        latestAvailableMs !== null ? formatGibsIsoTimestamp(latestAvailableMs) : null,
      effectiveTimeIso:
        effectiveTimeMs !== null ? formatGibsIsoTimestamp(effectiveTimeMs) : null,
      lookbackMinutes: effectiveLookback,
    })
  }

  const applyResolvedTime = (forceEpochBump = false) => {
    const resolved = resolveRainObservationTime(lookbackMinutes, cachedIntervals)
    const isInitialLatestDiscovery =
      lastLatestAvailableMs === null &&
      resolved.lookbackMinutes === 0 &&
      activeTimeParam === 'default' &&
      !forceEpochBump

    const nextLatestMs = resolved.latestAvailableMs
    const latestAdvanced =
      lastLatestAvailableMs !== null &&
      nextLatestMs !== null &&
      nextLatestMs !== lastLatestAvailableMs

    if (nextLatestMs !== null) {
      lastLatestAvailableMs = nextLatestMs
    }

    const timeChanged = resolved.timeParam !== activeTimeParam
    activeTimeParam = resolved.timeParam

    emitMetadata(
      resolved.latestAvailableMs,
      resolved.effectiveTimeMs,
      resolved.lookbackMinutes,
    )

    if (
      !isInitialLatestDiscovery &&
      (forceEpochBump || timeChanged || (resolved.lookbackMinutes === 0 && latestAdvanced))
    ) {
      bumpEpoch()
    } else {
      mapRef?.triggerRepaint()
    }
  }

  const ensureDomainsMetadata = (force = false): Promise<void> => {
    if (disposed) {
      return Promise.resolve()
    }
    if (domainsInFlight && !force) {
      return domainsInFlight
    }
    if (!force && domainsFetchedAtMs > 0 && Date.now() - domainsFetchedAtMs < RAIN_REFRESH_INTERVAL_MS) {
      return Promise.resolve()
    }

    domainsAbortController?.abort()
    const controller = new AbortController()
    domainsAbortController = controller
    const timeoutId =
      typeof window !== 'undefined'
        ? window.setTimeout(() => controller.abort(), DOMAINS_FETCH_TIMEOUT_MS)
        : null

    const task = fetch(buildGibsDomainsUrl(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} fetching NASA GIBS Domains XML`)
        }
        const xmlText = await response.text()
        if (disposed || controller.signal.aborted) {
          return
        }
        const parsed = parseGibsDomainsXml(xmlText)
        if (parsed.length > 0) {
          cachedIntervals = parsed
          domainsFetchedAtMs = Date.now()
        }
        domainsSettledOnce = true
        applyResolvedTime(force)
      })
      .catch(() => {
        if (disposed || controller.signal.aborted) {
          return
        }
        domainsSettledOnce = true
        applyResolvedTime(force)
      })
      .finally(() => {
        if (timeoutId !== null && typeof window !== 'undefined') {
          window.clearTimeout(timeoutId)
        }
        if (domainsAbortController === controller) {
          domainsAbortController = null
        }
        if (domainsInFlight === task) {
          domainsInFlight = null
        }
      })

    domainsInFlight = task
    return task
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
      throw new Error('Failed to allocate WebGL2 buffers for rain cloud tile mesh.')
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

  const uploadStitchedTexture = (
    gl: WebGL2RenderingContext,
    entry: RainTileCacheEntry,
    epoch: number,
  ) => {
    if (!entry.rawRg || contextLost || disposed) {
      return
    }
    const stitched = stitchRainTileGutter(
      entry.rawRg,
      (nz, nx, ny) => {
        if (nz !== entry.z) {
          return null
        }
        const neighbor = tiles.get(`${nz}/${nx}/${ny}`)
        if (!neighbor || neighbor.fetchedEpoch !== epoch) {
          return null
        }
        if (neighbor.rawRg) {
          return neighbor.rawRg
        }
        return neighbor.hasEmptyResponse ? EMPTY_TILE_RG : null
      },
      entry.z,
      entry.x,
      entry.y,
    )

    const smoothed = blurRainTileTexture(stitched)

    let texture = entry.texture
    if (!texture) {
      texture = gl.createTexture()
      if (!texture) {
        throw new Error('Failed to allocate WebGL2 texture for rain cloud tile.')
      }
      entry.texture = texture
    }

    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG16F,
      RAIN_TEXTURE_SIZE,
      RAIN_TEXTURE_SIZE,
      0,
      gl.RG,
      gl.FLOAT,
      smoothed,
    )
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  const forEachNeighborTile = (
    z: number,
    x: number,
    y: number,
    visitor: (nx: number, ny: number) => void,
  ) => {
    const tilesPerAxis = 1 << z
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= tilesPerAxis) {
        continue
      }
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) {
          continue
        }
        const nx = (((x + dx) % tilesPerAxis) + tilesPerAxis) % tilesPerAxis
        visitor(nx, ny)
      }
    }
  }

  const restitchLoadedNeighbors = (
    gl: WebGL2RenderingContext,
    z: number,
    x: number,
    y: number,
    epoch: number,
  ) => {
    forEachNeighborTile(z, x, y, (nx, ny) => {
      const neighbor = tiles.get(`${z}/${nx}/${ny}`)
      if (neighbor && neighbor.fetchedEpoch === epoch && neighbor.rawRg) {
        uploadStitchedTexture(gl, neighbor, epoch)
      }
    })
  }

  const ensureTileFetched = (z: number, x: number, y: number) => {
    const gl = glRef
    if (!gl || contextLost || disposed) {
      return
    }

    if (lookbackMinutes > 0 && cachedIntervals.length === 0 && !domainsSettledOnce) {
      void ensureDomainsMetadata()
      return
    }

    const effectiveTimeParam =
      activeTimeParam || resolveRainObservationTime(lookbackMinutes, cachedIntervals).timeParam

    const key = `${z}/${x}/${y}`
    let entry = tiles.get(key)
    if (!entry) {
      entry = {
        key,
        z,
        x,
        y,
        rawRg: null,
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
    const url = buildRainTileUrl(z, x, y, effectiveTimeParam)

    entry.abortController = abortController
    entry.loadingEpoch = targetEpoch

    void fetch(url, { signal: abortController.signal })
      .then(async (response) => {
        if (response.status === 204 || response.status === 404) {
          if (disposed || targetEpoch !== refreshEpoch) {
            return
          }
          if (entry.texture && !contextLost) {
            gl.deleteTexture(entry.texture)
          }
          entry.texture = null
          entry.rawRg = null
          entry.hasEmptyResponse = true
          entry.fetchedEpoch = targetEpoch
          entry.retryAfterMs = 0
          restitchLoadedNeighbors(gl, z, x, y, targetEpoch)
          mapRef?.triggerRepaint()
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} fetching NASA GIBS rain tile ${key}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        if (disposed || abortController.signal.aborted || contextLost) {
          return
        }

        const pngBytes = new Uint8Array(arrayBuffer)
        let rawRg = await decodeGibsIndexedPng(pngBytes)
        if (!rawRg) {
          rawRg = await decodePngViaImageBitmap(arrayBuffer)
        }

        if (
          disposed ||
          abortController.signal.aborted ||
          contextLost ||
          targetEpoch !== refreshEpoch
        ) {
          return
        }

        entry.rawRg = rawRg
        entry.hasEmptyResponse = false
        entry.fetchedEpoch = targetEpoch
        entry.retryAfterMs = 0

        uploadStitchedTexture(gl, entry, targetEpoch)
        restitchLoadedNeighbors(gl, z, x, y, targetEpoch)

        evictCacheIfNeeded(gl)
        mapRef?.triggerRepaint()
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

    for (let ancestorZ = z - 1; ancestorZ >= MIN_RAIN_TILE_ZOOM; ancestorZ--) {
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

  const isZoomOrLookbackActive = () =>
    (mapRef?.getZoom() ?? 0) > RAIN_FADE_IN_START_ZOOM || lookbackMinutes > 0

  const onVisibilityChange = () => {
    if (disposed || typeof document === 'undefined') {
      return
    }
    if (
      !document.hidden &&
      visible &&
      isZoomOrLookbackActive() &&
      Date.now() - domainsFetchedAtMs >= RAIN_REFRESH_INTERVAL_MS
    ) {
      void ensureDomainsMetadata()
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
    id: RAIN_CLOUDS_LAYER_ID,
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
          if (disposed || !visible || !isZoomOrLookbackActive()) {
            return
          }
          if (typeof document !== 'undefined' && document.hidden) {
            return
          }
          void ensureDomainsMetadata(true)
        }, RAIN_REFRESH_INTERVAL_MS)
      }

      if (visible && isZoomOrLookbackActive()) {
        void ensureDomainsMetadata()
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

      domainsAbortController?.abort()
      domainsAbortController = null
      abortAllTileRequests()
      clearGpuHandles(true)
      tiles.clear()
      glRef = null
      mapRef = null
    },

    render(gl, options) {
      if (disposed || contextLost || !visible || !mapRef) {
        return
      }

      const zoom = mapRef.getZoom()
      const opacity = computeRainCloudLayerOpacity(zoom, baseOpacity)
      if (opacity <= 0) {
        return
      }
      if (domainsFetchedAtMs === 0 && !domainsInFlight) {
        void ensureDomainsMetadata()
      }

      const coveringTiles = normalizeRainCoveringTiles(
        mapRef.coveringTiles({
          tileSize: 256,
          minzoom: 0,
          maxzoom: MAX_RAIN_TILE_ZOOM,
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
      if (programEntry.uZoom !== null) {
        gl.uniform1f(programEntry.uZoom, zoom)
      }
      if (programEntry.uPixelRatio !== null) {
        const canvas = mapRef.getCanvas()
        const clientWidth = canvas?.clientWidth ?? 0
        const pixelRatio =
          clientWidth > 0 && gl.drawingBufferWidth > 0
            ? gl.drawingBufferWidth / clientWidth
            : typeof window !== 'undefined' && window.devicePixelRatio > 0
              ? window.devicePixelRatio
              : 1
        gl.uniform1f(programEntry.uPixelRatio, pixelRatio)
      }
      if (programEntry.uEnableCloudBackdrop !== null) {
        gl.uniform1f(programEntry.uEnableCloudBackdrop, cloudBackdropEnabled ? 1 : 0)
      }

      for (const tileID of coveringTiles) {
        const { z, x, y } = tileID.canonical
        if (z < MIN_RAIN_TILE_ZOOM || z > MAX_RAIN_TILE_ZOOM) {
          continue
        }

        ensureTileFetched(z, x, y)
        forEachNeighborTile(z, x, y, (nx, ny) => {
          ensureTileFetched(z, nx, ny)
        })

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
        if (programEntry.uTileOrigin !== null) {
          gl.uniform2f(programEntry.uTileOrigin, x, y)
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
      } else if (
        isZoomOrLookbackActive() &&
        (domainsFetchedAtMs === 0 || Date.now() - domainsFetchedAtMs >= RAIN_REFRESH_INTERVAL_MS)
      ) {
        void ensureDomainsMetadata()
      }
      mapRef?.triggerRepaint()
    },

    setLookbackMinutes(minutes) {
      const nextLookback = snapRainLookbackMinutes(minutes)
      if (nextLookback === lookbackMinutes) {
        return
      }
      lookbackMinutes = nextLookback
      if (cachedIntervals.length > 0 || domainsSettledOnce) {
        applyResolvedTime(false)
      } else {
        activeTimeParam = lookbackMinutes === 0 ? 'default' : ''
        emitMetadata(
          lastLatestAvailableMs,
          null,
          lookbackMinutes,
        )
        void ensureDomainsMetadata()
      }
    },

    setCloudBackdropEnabled(enabled) {
      if (cloudBackdropEnabled === enabled) {
        return
      }
      cloudBackdropEnabled = enabled
      mapRef?.triggerRepaint()
    },

    refreshNow() {
      void ensureDomainsMetadata(true)
    },
  }
}
