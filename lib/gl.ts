/**
 * The small WebGL2 toolkit the live figures share: compile and link with the
 * errors surfaced, a full-screen triangle, and render targets by format, with
 * probes for what this device can render to.
 *
 * No library. Each hero owns its own shaders and passes; this is only what
 * every one of them would otherwise write again.
 */

export type GL = WebGL2RenderingContext

export function compile(gl: GL, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return s
}

/**
 * Link a program. With KHR_parallel_shader_compile the driver compiles off the
 * main thread and `ready()` polls it, so a hero can keep its poster up rather
 * than block the first interaction on a shader compile.
 */
export function program(gl: GL, vs: string, fs: string, varyings?: readonly string[]) {
  const p = gl.createProgram()!
  const v = compile(gl, gl.VERTEX_SHADER, vs)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(p, v)
  gl.attachShader(p, f)
  if (varyings) gl.transformFeedbackVaryings(p, varyings as string[], gl.SEPARATE_ATTRIBS)
  gl.linkProgram(p)
  const ext = gl.getExtension('KHR_parallel_shader_compile')
  let checked = false
  const check = () => {
    if (checked) return true
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p) || gl.getShaderInfoLog(v) || gl.getShaderInfoLog(f)
      throw new Error(`WebGL program failed to link: ${log}`)
    }
    checked = true
    return true
  }
  const uniforms = new Map<string, WebGLUniformLocation | null>()
  return {
    program: p,
    /** True once compiled and linked; never blocks when the extension exists. */
    ready(): boolean {
      if (ext && !gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR)) return false
      return check()
    },
    use() {
      check()
      gl.useProgram(p)
    },
    u(name: string): WebGLUniformLocation | null {
      if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(p, name))
      return uniforms.get(name)!
    },
  }
}
export type Program = ReturnType<typeof program>

/** One triangle that covers the viewport: `gl_VertexID` only, no buffers. */
export const FULLSCREEN_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export function drawFullscreen(gl: GL) {
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

export interface Target {
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

/**
 * The texture formats the figures render to. The integer formats are
 * colour-renderable in WebGL2 itself, on every device, which is why pricing
 * keeps its floats in them as raw bits; rgba16f needs EXT_color_buffer_float
 * or EXT_color_buffer_half_float enabled (see `probeHalfFloat`); rgba8 is
 * always there.
 */
export type Format = 'rgba32ui' | 'r32ui' | 'rgba16f' | 'rgba8'

function spec(gl: GL, f: Format): [number, number, number] {
  switch (f) {
    case 'rgba32ui':
      return [gl.RGBA32UI, gl.RGBA_INTEGER, gl.UNSIGNED_INT]
    case 'r32ui':
      return [gl.R32UI, gl.RED_INTEGER, gl.UNSIGNED_INT]
    case 'rgba16f':
      return [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT]
    case 'rgba8':
      return [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE]
  }
}

/** A render target. Integer formats are never filtered (a linear integer texture is incomplete). */
export function target(gl: GL, w: number, h: number, format: Format, linear = false): Target {
  const [internal, fmt, type] = spec(gl, format)
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, type, null)
  const filter = linear && (format === 'rgba16f' || format === 'rgba8') ? gl.LINEAR : gl.NEAREST
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, tex, w, h }
}

/** Whether a target of this format can be rendered to here: a framebuffer that is complete. */
export function renderable(gl: GL, format: Format): boolean {
  const t = target(gl, 1, 1, format)
  gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  disposeTarget(gl, t)
  return ok
}

const PROBE_ADD = `#version 300 es
precision highp float;
uniform float uV;
out vec4 o;
void main() { o = vec4(uV); }`
const PROBE_READ = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
out vec4 o;
void main() { o = texture(uSrc, vec2(0.5)) / 2.0; }`

/**
 * Whether half float can be rendered to, blended and sampled here, checked by
 * doing it: 0.75 is added twice to a half-float texel (1.5, past what an
 * eight-bit buffer holds), the texel is sampled into an eight-bit one at half
 * strength, and the byte must come back as 0.75. A framebuffer can report
 * complete and still blend wrongly, so completeness alone is not trusted.
 */
export function probeHalfFloat(gl: GL): boolean {
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return false
  if (!renderable(gl, 'rgba16f')) return false
  const add = program(gl, FULLSCREEN_VS, PROBE_ADD)
  const read = program(gl, FULLSCREEN_VS, PROBE_READ)
  const half = target(gl, 1, 1, 'rgba16f', true)
  const byte = target(gl, 1, 1, 'rgba8')
  const vao = gl.createVertexArray()
  let ok = false
  try {
    gl.bindVertexArray(vao)
    gl.bindFramebuffer(gl.FRAMEBUFFER, half.fbo)
    gl.viewport(0, 0, 1, 1)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    add.use()
    gl.uniform1f(add.u('uV'), 0.75)
    drawFullscreen(gl)
    drawFullscreen(gl)
    gl.disable(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, byte.fbo)
    read.use()
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, half.tex)
    gl.uniform1i(read.u('uSrc'), 0)
    drawFullscreen(gl)
    const px = new Uint8Array(4)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    ok = Math.abs(px[0]! - 0.75 * 255) <= 3 && gl.getError() === gl.NO_ERROR
  } catch {
    ok = false
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindVertexArray(null)
    gl.deleteVertexArray(vao)
    gl.deleteProgram(add.program)
    gl.deleteProgram(read.program)
    disposeTarget(gl, half)
    disposeTarget(gl, byte)
  }
  return ok
}

export function disposeTarget(gl: GL, t: Target | null | undefined) {
  if (!t) return
  gl.deleteFramebuffer(t.fbo)
  gl.deleteTexture(t.tex)
}

/** Linear-light conversion for colours passed to shaders that blend. */
export const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
