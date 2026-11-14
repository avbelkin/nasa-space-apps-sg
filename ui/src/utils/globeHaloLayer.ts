import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import {
  buildGlobeHaloFragmentShaderSource,
  buildGlobeHaloVertexShaderSource,
  computeGlobeHaloUniforms,
} from './globeHaloShader.ts'
import {
  computeSubsolarPoint,
  NIGHT_TERMINATOR_REFRESH_MS,
} from './nightLightsShader.ts'

export const GLOBE_HALO_LAYER_ID = 'globe-halo-layer'
const SUBSOLAR_CACHE_MS = 10_000

export interface CreateGlobeHaloLayerOptions {
  nowProvider?: () => number
}

interface CompiledHaloProgram {
  program: WebGLProgram
  vertexShader: WebGLShader
  fragmentShader: WebGLShader
  uInvProjMatrix: WebGLUniformLocation | null
  uGlobeCenter: WebGLUniformLocation | null
  uGlobeRadius: WebGLUniformLocation | null
  uViewUnitsPerCssPx: WebGLUniformLocation | null
  uScalesCssPx: WebGLUniformLocation | null
  uSunDirView: WebGLUniformLocation | null
  uStrength: WebGLUniformLocation | null
  uPass: WebGLUniformLocation | null
}

interface HaloQuadBuffers {
  vao: WebGLVertexArrayObject
  vertexBuffer: WebGLBuffer
}

export interface GlobeHaloLayerController extends CustomLayerInterface {
  setVisible: (visible: boolean) => void
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Failed to allocate WebGL2 shader for globe halo layer.')
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'Unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(`Globe halo shader compile failed: ${info}`)
  }
  return shader
}

function createProgramEntry(gl: WebGL2RenderingContext): CompiledHaloProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, buildGlobeHaloVertexShaderSource())
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    buildGlobeHaloFragmentShaderSource(),
  )

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error('Failed to allocate WebGL2 program for globe halo layer.')
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? 'Unknown program link error'
    gl.deleteProgram(program)
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error(`Globe halo program link failed: ${info}`)
  }

  return {
    program,
    vertexShader,
    fragmentShader,
    uInvProjMatrix: gl.getUniformLocation(program, 'u_invProjMatrix'),
    uGlobeCenter: gl.getUniformLocation(program, 'u_globeCenter'),
    uGlobeRadius: gl.getUniformLocation(program, 'u_globeRadius'),
    uViewUnitsPerCssPx: gl.getUniformLocation(program, 'u_viewUnitsPerCssPx'),
    uScalesCssPx: gl.getUniformLocation(program, 'u_scalesCssPx'),
    uSunDirView: gl.getUniformLocation(program, 'u_sunDirView'),
    uStrength: gl.getUniformLocation(program, 'u_strength'),
    uPass: gl.getUniformLocation(program, 'u_pass'),
  }
}

function createQuadBuffers(gl: WebGL2RenderingContext): HaloQuadBuffers {
  const vao = gl.createVertexArray()
  const vertexBuffer = gl.createBuffer()
  if (!vao || !vertexBuffer) {
    if (vao) gl.deleteVertexArray(vao)
    if (vertexBuffer) gl.deleteBuffer(vertexBuffer)
    throw new Error('Failed to allocate WebGL2 quad buffers for globe halo layer.')
  }

  const quadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  return { vao, vertexBuffer }
}

/**
 * Creates a MapLibre WebGL2 custom layer rendering an unloaded-tile silhouette occluder
 * and a solar-illuminated orbital atmospheric limb halo around the 3D globe.
 */
export function createGlobeHaloLayer({
  nowProvider = Date.now,
}: CreateGlobeHaloLayerOptions = {}): GlobeHaloLayerController {
  let mapRef: MapLibreMap | null = null
  let glRef: WebGL2RenderingContext | null = null
  let visible = true
  let contextLost = false
  let disposed = false
  let terminatorTimerId: number | null = null
  let cachedSubsolar = computeSubsolarPoint(nowProvider())
  let cachedSubsolarMs = nowProvider()

  let programEntry: CompiledHaloProgram | null = null
  let quadBuffers: HaloQuadBuffers | null = null

  const getCurrentSubsolarPoint = () => {
    const now = nowProvider()
    if (now - cachedSubsolarMs >= SUBSOLAR_CACHE_MS || now < cachedSubsolarMs) {
      cachedSubsolar = computeSubsolarPoint(now)
      cachedSubsolarMs = now
    }
    return cachedSubsolar
  }

  const clearGpuHandles = (deleteLiveObjects: boolean) => {
    const gl = glRef
    if (deleteLiveObjects && gl && !contextLost) {
      if (quadBuffers) {
        gl.deleteVertexArray(quadBuffers.vao)
        gl.deleteBuffer(quadBuffers.vertexBuffer)
      }
      if (programEntry) {
        gl.deleteProgram(programEntry.program)
        gl.deleteShader(programEntry.vertexShader)
        gl.deleteShader(programEntry.fragmentShader)
      }
    }
    quadBuffers = null
    programEntry = null
  }

  const onContextLost = () => {
    contextLost = true
    clearGpuHandles(false)
  }

  const onContextRestored = () => {
    contextLost = false
    mapRef?.triggerRepaint()
  }

  return {
    id: GLOBE_HALO_LAYER_ID,
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

      if (typeof window !== 'undefined' && terminatorTimerId === null) {
        terminatorTimerId = window.setInterval(() => {
          if (!disposed) {
            cachedSubsolar = computeSubsolarPoint(nowProvider())
            cachedSubsolarMs = nowProvider()
            mapRef?.triggerRepaint()
          }
        }, NIGHT_TERMINATOR_REFRESH_MS)
      }
    },

    onRemove(map) {
      disposed = true
      if (terminatorTimerId !== null && typeof window !== 'undefined') {
        window.clearInterval(terminatorTimerId)
        terminatorTimerId = null
      }
      const canvas = map.getCanvas()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      clearGpuHandles(true)
      glRef = null
      mapRef = null
    },

    render(gl, options) {
      if (disposed || contextLost || !visible || !mapRef) {
        return
      }

      const projectionTransition =
        options.defaultProjectionData.projectionTransition ??
        (options.shaderData.variantName.includes('globe') ? 1 : 0)

      const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
      const viewportHeightCssPx =
        mapRef.getCanvas().clientHeight || gl.drawingBufferHeight / dpr

      const subsolar = getCurrentSubsolarPoint()

      const uniforms = computeGlobeHaloUniforms({
        modelViewProjectionMatrix: options.modelViewProjectionMatrix,
        projectionMatrix: options.projectionMatrix,
        zoom: mapRef.getZoom(),
        centerLatDeg: mapRef.getCenter().lat,
        viewportHeightCssPx,
        projectionTransition,
        subsolarLatRad: subsolar.latRad,
        subsolarLonRad: subsolar.lonRad,
      })

      if (!uniforms) {
        return
      }

      if (!programEntry) {
        programEntry = createProgramEntry(gl)
      }
      if (!quadBuffers) {
        quadBuffers = createQuadBuffers(gl)
      }

      gl.useProgram(programEntry.program)
      gl.disable(gl.DEPTH_TEST)
      gl.depthMask(false)
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.BLEND)

      if (programEntry.uInvProjMatrix !== null) {
        gl.uniformMatrix4fv(programEntry.uInvProjMatrix, false, uniforms.invProjMatrix)
      }
      if (programEntry.uGlobeCenter !== null) {
        gl.uniform3fv(programEntry.uGlobeCenter, uniforms.globeCenterView)
      }
      if (programEntry.uGlobeRadius !== null) {
        gl.uniform1f(programEntry.uGlobeRadius, uniforms.globeRadius)
      }
      if (programEntry.uViewUnitsPerCssPx !== null) {
        gl.uniform1f(programEntry.uViewUnitsPerCssPx, uniforms.viewUnitsPerCssPx)
      }
      if (programEntry.uScalesCssPx !== null) {
        gl.uniform3fv(programEntry.uScalesCssPx, uniforms.scalesCssPx)
      }
      if (programEntry.uSunDirView !== null) {
        gl.uniform3fv(programEntry.uSunDirView, uniforms.sunDirView)
      }
      if (programEntry.uStrength !== null) {
        gl.uniform1f(programEntry.uStrength, uniforms.strength)
      }

      gl.bindVertexArray(quadBuffers.vao)

      // Pass 0: destination-over planetary night base for unloaded basemap tiles.
      gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE)
      if (programEntry.uPass !== null) {
        gl.uniform1i(programEntry.uPass, 0)
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // Pass 1: premultiplied atmospheric horizon rim, grazing limb scatter, and outer corona.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      if (programEntry.uPass !== null) {
        gl.uniform1i(programEntry.uPass, 1)
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      gl.bindVertexArray(null)
    },

    setVisible(nextVisible) {
      if (visible === nextVisible) {
        return
      }
      visible = nextVisible
      mapRef?.triggerRepaint()
    },
  }
}
