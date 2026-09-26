/**
 * The small WebGL2 toolkit the lab heroes share: compile and link with the
 * errors surfaced, a full-screen triangle, render targets that know whether
 * this device can render to float, and a device tier.
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
 * A render target. `float` asks for 32-bit float when the device can render
 * to it (EXT_color_buffer_float), else 16-bit float, else 8-bit — the caller
 * reads `kind` and decides whether its maths still holds at that precision.
 */
export function target(
  gl: GL,
  w: number,
  h: number,
  opts: { float?: 'f32' | 'f16'; channels?: 1 | 4; linear?: boolean } = {},
): Target & { kind: 'f32' | 'f16' | 'u8' } {
  const f32 = !!gl.getExtension('EXT_color_buffer_float')
  const f16 = f32 || !!gl.getExtension('EXT_color_buffer_half_float')
  const want = opts.float
  const kind: 'f32' | 'f16' | 'u8' = want === 'f32' && f32 ? 'f32' : want && f16 ? 'f16' : 'u8'
  const one = opts.channels === 1
  const [internal, format, type] =
    kind === 'f32'
      ? [one ? gl.R32F : gl.RGBA32F, one ? gl.RED : gl.RGBA, gl.FLOAT]
      : kind === 'f16'
        ? [one ? gl.R16F : gl.RGBA16F, one ? gl.RED : gl.RGBA, gl.HALF_FLOAT]
        : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE]
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null)
  const filter = opts.linear && (kind !== 'f32' || gl.getExtension('OES_texture_float_linear')) ? gl.LINEAR : gl.NEAREST
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return { fbo, tex, w, h, kind }
}

export function disposeTarget(gl: GL, t: Target | null | undefined) {
  if (!t) return
  gl.deleteFramebuffer(t.fbo)
  gl.deleteTexture(t.tex)
}

/** Linear-light conversion for colours passed to shaders that blend. */
export const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
