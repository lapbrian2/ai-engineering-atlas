// Vanilla WebGL helper — compile, link, draw a full-screen fragment shader.
// Used by HeroShader.client.vue. Kept framework-agnostic.

export interface ShaderHandle {
  start: () => void
  stop: () => void
  setMouse: (x: number, y: number) => void
  dispose: () => void
}

export function useShader(canvas: HTMLCanvasElement, fragSource: string, options: {
  /** Pixel density multiplier. 0.65 balances quality vs fill-rate. */
  dpr?: number
  /** Target FPS for the render loop. Default 30. */
  fps?: number
} = {}): ShaderHandle | null {
  const gl = canvas.getContext('webgl') as WebGLRenderingContext | null
  if (!gl) return null

  const dpr = options.dpr ?? 0.65
  const frameBudgetMs = 1000 / (options.fps ?? 30)

  const vtx = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`

  const compile = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type)
    if (!s) return null
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[useShader] compile error:', gl.getShaderInfoLog(s))
      return null
    }
    return s
  }

  const vs = compile(gl.VERTEX_SHADER, vtx)
  const fs = compile(gl.FRAGMENT_SHADER, fragSource)
  if (!vs || !fs) return null

  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.useProgram(prog)

  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const pLoc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(pLoc)
  gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0)

  const uRes   = gl.getUniformLocation(prog, 'u_res')
  const uTime  = gl.getUniformLocation(prog, 'u_time')
  const uMouse = gl.getUniformLocation(prog, 'u_mouse')

  let mouseX = 0.5, mouseY = 0.5
  let running = false
  let rafId = 0
  let lastFrame = 0
  const start0 = performance.now()

  const resize = () => {
    canvas.width  = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  resize()

  const onResize = () => resize()
  window.addEventListener('resize', onResize)

  const loop = (now: number) => {
    if (!running) return
    if (now - lastFrame >= frameBudgetMs) {
      const t = (now - start0) / 1000
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, t)
      gl.uniform2f(uMouse, mouseX, mouseY)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      lastFrame = now
    }
    rafId = requestAnimationFrame(loop)
  }

  return {
    start: () => {
      if (running) return
      running = true
      rafId = requestAnimationFrame(loop)
    },
    stop: () => {
      running = false
      cancelAnimationFrame(rafId)
    },
    setMouse: (x: number, y: number) => {
      mouseX = x
      mouseY = y
    },
    dispose: () => {
      running = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }
}
