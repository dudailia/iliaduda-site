import { program } from '@/lib/gl'
import { EASE_OUT } from '@/lib/ease'
import { FADE_MS } from '@/components/stage/useStage'
import { FILL, KEY, LIGHT, mixv, oklab, UP_LIGHT } from '@/lib/surface/look'
import { spring } from '@/lib/stage/spring'
import { camera, drift, indices, PEAK, RINGS, SPOKES, surface, TEMPO, VERTS, type Table } from '@/lib/membrane/view'
import type { Palette, Renderer, StageEnv } from '@/components/stage/useStage'
import { LINE_FS, LINE_VS } from '../surface/shaders'

/**
 * Fig. 1 of /membrane, live. The membrane's heights are computed on the CPU every frame — Jₙ(λr) is tabulated once per
 * shape (lib/membrane/view.ts), so a frame is only the time factors summed over the modes — and uploaded as one
 * vertex buffer with its normals; no float render targets, so an iPhone draws it as a laptop does. The surface is
 * coloured by height on the site's indigo ramp, with height contours as hairlines and the nodal line (height zero)
 * heavier, then lit as the IV surface is; the rim is an ink line in screen space.
 */

export interface Hooks {
  /** The drum to draw: its expansion tabulated on the mesh. A new object when the shape or the modes change. */
  table(): Table
  /** The signature's rise (0 flat, 1 the shape) and whether time has been released; null once it is over. */
  sequence(): { rise: number; released: boolean } | null
  /** The signature's clock moves on by this much: the drawn frame's time, slowed by a coast and held while paused. */
  tick(dtMs: number): void
  /** Paused: the drum, its story, the drift and the lean coast to rest and hold, and nothing new is drawn. */
  paused(): boolean
  lean(): { x: number; y: number }
  /** The model time just drawn, for the readouts. */
  drawn(t: number): void
  /** Something the reader changed: draw the next frame even when paused. */
  dirty(): boolean
}

const SURFACE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aP;
layout(location = 1) in vec3 aN;
uniform mat4 uMVP;
out vec3 vP; out vec3 vN;
void main() { vP = aP; vN = aN; gl_Position = uMVP * vec4(aP, 1.0); }`

const SURFACE_FS = `#version 300 es
precision highp float;
in vec3 vP; in vec3 vN;
uniform vec3 uLo, uMid, uTop, uInk;
uniform vec3 uKey, uFill, uLight; uniform float uUp; uniform float uPeak;
uniform float uLines;
out vec4 o;
vec3 lin(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
             -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
             -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 srgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  // Height on the ramp: the trough at the low end, the crest at the top, the rest position mid-way.
  float t = clamp(0.5 + 0.5 * vP.y / uPeak, 0.0, 1.0);
  vec3 lab = t < 0.5 ? mix(uLo, uMid, t / 0.5) : mix(uMid, uTop, (t - 0.5) / 0.5);
  // How far the height moves across a pixel: the height's gradient, from the interpolated normal, along the pixel's
  // own step across the drum. Smooth across the triangles, where the height's screen derivative itself jumps at every
  // edge and the lines would step in width. The normals are the mesh's own, pointing up (the camera is always above).
  vec3 N = normalize(vN);
  vec2 grad = -N.xz / max(N.y, 0.05);
  float dy = max(abs(dot(grad, dFdx(vP.xz))) + abs(dot(grad, dFdy(vP.xz))), 1e-6);
  // The lines are drawn only where the drum has a shape to draw them on (uLines: none while it is flat, coming in as
  // it rises), and leave the last few hundredths of the radius to the rim, where every height is zero.
  float lines = uLines * (1.0 - smoothstep(0.93, 1.0, length(vP.xz)));
  // Contours every fifth of the peak; the nodal line, where the drum is at rest height, heavier and in ink.
  float f = vP.y / uPeak * 5.0;
  float hair = 1.0 - clamp(abs(fract(f + 0.5) - 0.5) / (dy / uPeak * 5.0) - 0.1, 0.0, 1.0);
  lab = mix(lab, mix(lab, uInk, 0.18), hair * lines);
  float node = 1.0 - clamp(abs(vP.y) / dy - 0.6, 0.0, 1.0);
  lab = mix(lab, uInk, node * 0.55 * lines);
  float dif = (uLight.x + uLight.y * max(dot(N, uKey), 0.0) + uLight.z * max(dot(N, uFill), 0.0)) / uUp;
  o = vec4(srgb(lin(lab) * dif), 1.0);
}`

export interface MembraneRenderer extends Renderer {
  /** Draw the next frame even if nothing moved (a control changed while paused). */
  poke(): void
  /**
   * A new shape: when its table arrives, its clock starts again at 0, so the drum shows the shape the margin names
   * and is let go from it. `blend` eases from the drum as it was into the new one (240ms); a keyboard's choice cuts.
   */
  restart(blend: boolean): void
  /** Replay: lower the drum into the page (350ms), set its clock to 0, then call `done`, which starts the story. */
  sink(done: () => void): void
  /** For ?debug=1: the clock's rate, drawn frames and time, and what is in progress. */
  debug(): Record<string, string>
}

/** A shape change's blend, Replay's lowering, and the coast to rest on Pause and back on Resume, in seconds. */
const BLEND_S = 0.24
const SINK_S = 0.35
const COAST_S = 0.24
const RESUME_S = 0.4

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

export function createMembrane(env: StageEnv, hooks: Hooks): MembraneRenderer | null {
  const { gl } = env
  let pal: Palette = env.palette
  const surf = program(gl, SURFACE_VS, SURFACE_FS)
  const line = program(gl, LINE_VS, LINE_FS)

  // The surface: positions and normals, rewritten every frame; the triangles, once.
  const pos = new Float32Array(VERTS * 3)
  const nrm = new Float32Array(VERTS * 3)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const pBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, pBuf)
  gl.bufferData(gl.ARRAY_BUFFER, pos.byteLength, gl.DYNAMIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0)
  const nBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, nBuf)
  gl.bufferData(gl.ARRAY_BUFFER, nrm.byteLength, gl.DYNAMIC_DRAW)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0)
  const ix = indices()
  const iBuf = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ix, gl.STATIC_DRAW)
  gl.bindVertexArray(null)

  // The rim: segments as screen-space quads (the IV surface's line shader): A, B, then (along, side) per corner.
  const rimData = new Float32Array(SPOKES * 6 * 8)
  {
    let k = 0
    const corner = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]] as const
    for (let j = 0; j < SPOKES; j++) {
      const a0 = (2 * Math.PI * j) / SPOKES, a1 = (2 * Math.PI * (j + 1)) / SPOKES
      for (const [s, side] of corner) {
        rimData.set([Math.cos(a0), 0, Math.sin(a0), Math.cos(a1), 0, Math.sin(a1), s, side], k)
        k += 8
      }
    }
  }
  const rimVao = gl.createVertexArray()
  gl.bindVertexArray(rimVao)
  const rBuf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, rBuf)
  gl.bufferData(gl.ARRAY_BUFFER, rimData, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24)
  gl.bindVertexArray(null)

  let w = 1, h = 1, cssW = 1, cssH = 1
  let tModel = 0
  let tWall = 0
  let lastTable: Table | null = null
  let poked = true
  const leanX = { x: 0, v: 0 }, leanY = { x: 0, v: 0 }
  /** How fast the drum's time runs, 0 to 1: below 1 only while it coasts to rest on Pause or picks up on Resume. */
  let rate: number | null = null
  /** Drawn time since the first frame: the story waits for the canvas to have faded in over the poster. */
  let liveMs = 0
  let restarting: { blend: boolean } | null = null
  let blend: { from: Float32Array; t: number } | null = null
  let sinking: { t: number; done: () => void } | null = null
  let drawnFrames = 0, idleFrames = 0

  /** Normals from the mesh: the cross product of the radial and the angular differences at every vertex. */
  const normals = () => {
    nrm[0] = 0
    nrm[1] = 1
    nrm[2] = 0
    const at = (i: number, j: number) => (i === 0 ? 0 : 1 + (i - 1) * SPOKES + (((j % SPOKES) + SPOKES) % SPOKES))
    for (let i = 1; i <= RINGS; i++)
      for (let j = 0; j < SPOKES; j++) {
        const v = at(i, j)
        const out = at(Math.min(RINGS, i + 1), j), inn = at(i - 1, j)
        const cw = at(i, j + 1), ccw = at(i, j - 1)
        const rx = pos[out * 3]! - pos[inn * 3]!, ry = pos[out * 3 + 1]! - pos[inn * 3 + 1]!, rz = pos[out * 3 + 2]! - pos[inn * 3 + 2]!
        const ax = pos[cw * 3]! - pos[ccw * 3]!, ay = pos[cw * 3 + 1]! - pos[ccw * 3 + 1]!, az = pos[cw * 3 + 2]! - pos[ccw * 3 + 2]!
        // Radial × angular points up for a flat drum.
        let nx = ay * rz - az * ry, ny = az * rx - ax * rz, nz = ax * ry - ay * rx
        const l = Math.hypot(nx, ny, nz) || 1
        nx /= l
        ny /= l
        nz /= l
        if (ny < 0) {
          nx = -nx
          ny = -ny
          nz = -nz
        }
        nrm[v * 3] = nx
        nrm[v * 3 + 1] = ny
        nrm[v * 3 + 2] = nz
      }
  }

  // The drum's own ramp, in oklab, from the six tokens: at rest a tone between the page and its rules (the context),
  // displaced toward indigo (the claim), the crest deepest, the trough in the wash; the nodal line and the contours
  // toward ink. At night the tokens swap (ink is the light one): the drum rests a little above the page in the wash
  // and its crests rise toward the light indigo, so it glows on the dark page as the site's other figures do.
  const colours = () => {
    const paper = oklab(pal.paper), rule = oklab(pal.rule), wash = oklab(pal.wash), indigo = oklab(pal.indigo), ink = oklab(pal.ink)
    return pal.dark
      ? { lo: mixv(paper, wash, 0.55), mid: mixv(wash, indigo, 0.14), top: mixv(indigo, ink, 0.2), ink }
      : { lo: mixv(wash, indigo, 0.42), mid: mixv(paper, rule, 0.55), top: indigo, ink }
  }
  let col = colours()

  const r: MembraneRenderer = {
    poke() {
      poked = true
    },
    debug() {
      return {
        rate: (rate ?? -1).toFixed(2),
        'live ms': liveMs.toFixed(0),
        frames: `${drawnFrames} drawn, ${idleFrames} idle`,
        'model t': tModel.toFixed(2),
        busy: [blend && 'blend', sinking && 'sink', restarting && 'restart'].filter(Boolean).join(' ') || 'none',
      }
    },
    restart(withBlend) {
      restarting = { blend: withBlend }
      sinking = null
      poked = true
    },
    sink(done) {
      // A second Replay while the drum is already going down only takes the newer `done`: starting the lowering over
      // popped the drum back to full height for a frame.
      if (sinking) {
        sinking.done = done
        return
      }
      sinking = { t: 0, done }
      blend = null
      poked = true
    },
    frame(_t, dt) {
      const paused = hooks.paused()
      const tb = hooks.table()
      const fresh = tb !== lastTable
      const changed = fresh || poked || hooks.dirty()
      // A figure paused before its first frame (Pause kept from earlier in the visit) opens at rest, with no coast.
      rate ??= paused ? 0 : 1
      // Paused, nothing moves once the coast is over, a blend or a lowering has finished, and nothing has changed:
      // the story holds where it is too (WCAG 2.2.2).
      if (paused && rate === 0 && !blend && !sinking && !changed) {
        idleFrames++
        return 'idle'
      }
      drawnFrames++
      poked = false
      rate = paused ? Math.max(0, rate - dt / COAST_S) : Math.min(1, rate + dt / RESUME_S)
      const run = dt * rate
      liveMs += dt * 1000
      hooks.tick(liveMs >= FADE_MS ? run * 1000 : 0)
      const seq = hooks.sequence()

      // A new shape's clock starts at 0, from the drum as it was a moment ago (`pos` still holds it).
      if (fresh) {
        if (restarting) {
          tModel = 0
          blend = restarting.blend && lastTable ? { from: pos.slice(), t: 0 } : null
          restarting = null
        }
        lastTable = tb
      }

      // Time: held at the start while the shape rises, then the model's own, at the coast's rate.
      const rise = seq ? EASE_OUT(Math.min(1, Math.max(0, seq.rise))) : 1
      if (!seq || seq.released) tModel += run * TEMPO
      tWall += run
      // Replay lowers the drum into the page on the ease-out, ringing as it goes; then its clock is 0 again and the
      // story starts from the flat page.
      let lower = 1
      if (sinking) {
        sinking.t += dt
        lower = 1 - EASE_OUT(Math.min(1, sinking.t / SINK_S))
        if (sinking.t >= SINK_S) {
          const done = sinking.done
          sinking = null
          tModel = 0
          lower = 0
          done()
        }
      }
      const lean = hooks.lean()
      spring(leanX, paused ? leanX.x : lean.x, dt, 4)
      spring(leanY, paused ? leanY.x : lean.y, dt, 4)
      const d = drift(tWall)
      const { mvp } = camera(cssW / cssH, d.yaw + leanX.x * 0.22, d.pitch + leanY.x * 0.12)

      surface(tb, tModel, rise * lower, pos)
      if (blend) {
        // Its first step at most a 60th of a second: the frame that set a new shape carried that work in its dt.
        blend.t += blend.t === 0 ? Math.min(dt, 1 / 60) : dt
        const k = EASE_OUT(Math.min(1, blend.t / BLEND_S))
        const from = blend.from
        for (let i = 1; i < pos.length; i += 3) pos[i] = from[i]! + (pos[i]! - from[i]!) * k
        if (blend.t >= BLEND_S) blend = null
      }
      normals()
      hooks.drawn(tModel)
      // How much shape there is to draw lines on: none while the drum is flat (the page before the rise, a velocity
      // drum at its first instant, the end of Replay's lowering), all of them from a sixth of the peak.
      let amp = 0
      for (let i = 1; i < pos.length; i += 3) amp = Math.max(amp, Math.abs(pos[i]!))
      const lines = smooth(0.01, 0.16, amp / PEAK)

      gl.viewport(0, 0, w, h)
      // The page's own paper behind the drum (the canvas has no alpha).
      gl.clearColor(pal.paper[0], pal.paper[1], pal.paper[2], 1)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)

      surf.use()
      gl.uniformMatrix4fv(surf.u('uMVP'), false, mvp)
      gl.uniform3fv(surf.u('uLo'), col.lo)
      gl.uniform3fv(surf.u('uMid'), col.mid)
      gl.uniform3fv(surf.u('uTop'), col.top)
      gl.uniform3fv(surf.u('uInk'), col.ink)
      gl.uniform3fv(surf.u('uKey'), KEY)
      gl.uniform3fv(surf.u('uFill'), FILL)
      gl.uniform3f(surf.u('uLight'), LIGHT.ambient, LIGHT.key, LIGHT.fill)
      gl.uniform1f(surf.u('uUp'), UP_LIGHT)
      gl.uniform1f(surf.u('uPeak'), PEAK)
      gl.uniform1f(surf.u('uLines'), lines)
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, pBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos)
      gl.bindBuffer(gl.ARRAY_BUFFER, nBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, nrm)
      gl.drawElements(gl.TRIANGLES, ix.length, gl.UNSIGNED_SHORT, 0)

      // The rim, in ink, over the surface's edge.
      gl.disable(gl.DEPTH_TEST)
      line.use()
      gl.uniformMatrix4fv(line.u('uMVP'), false, mvp)
      gl.uniform2f(line.u('uPx'), 2 / w, 2 / h)
      gl.uniform1f(line.u('uWidth'), 1.4 * (w / cssW))
      gl.uniform3fv(line.u('uColor'), pal.ink)
      gl.bindVertexArray(rimVao)
      gl.drawArrays(gl.TRIANGLES, 0, SPOKES * 6)
      gl.bindVertexArray(null)
      return true
    },
    resize(bw, bh, cw, ch) {
      w = bw
      h = bh
      cssW = cw
      cssH = ch
      poked = true
    },
    setPalette(p) {
      pal = p
      col = colours()
      poked = true
    },
    dispose() {
      gl.deleteBuffer(pBuf)
      gl.deleteBuffer(nBuf)
      gl.deleteBuffer(iBuf)
      gl.deleteBuffer(rBuf)
      gl.deleteVertexArray(vao)
      gl.deleteVertexArray(rimVao)
      gl.deleteProgram(surf.program)
      gl.deleteProgram(line.program)
    },
  }
  return r
}
