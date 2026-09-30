'use client'

import { useEffect, useState } from 'react'
import { asText, rows, type GlInfo, type LiveInfo } from '@/lib/stage/debug'
import { probeHalfFloat, renderable } from '@/lib/gl'

/**
 * The ?debug=1 panel: loaded only when asked for, so no reader pays for it.
 * It probes WebGL2 on a canvas of its own, which is how it can still report
 * when the figure itself never started, and reads the figure's state twice a
 * second. Copy puts the report on the clipboard as text.
 */

function probe(): GlInfo | null {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) return null
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const half = probeHalfFloat(gl)
    // 32-bit float, the format the first version needed and iPhones lack.
    let f32 = false
    if (gl.getExtension('EXT_color_buffer_float')) {
      const t = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null)
      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
      f32 = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(t)
    }
    const info: GlInfo = {
      version: String(gl.getParameter(gl.VERSION)),
      shading: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
      vendor: String(dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      maxTexture: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
      maxRenderbuffer: Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)),
      maxSamples: Number(gl.getParameter(gl.MAX_SAMPLES)),
      vertexUnits: Number(gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)),
      extensions: gl.getSupportedExtensions() ?? [],
      probes: {
        rgba16f: half,
        rgba32ui: renderable(gl, 'rgba32ui'),
        r32ui: renderable(gl, 'r32ui'),
        rgba8: renderable(gl, 'rgba8'),
        rgba32f: f32,
        floatBlend: !!gl.getExtension('EXT_float_blend'),
      },
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return info
  } catch {
    return null
  }
}

export function DebugPanel({ title, read }: { title: string; read: () => LiveInfo }) {
  const [gl] = useState(probe)
  const [live, setLive] = useState(read)
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const id = window.setInterval(() => setLive(read()), 500)
    return () => window.clearInterval(id)
  }, [read])
  const report = rows(gl, live)
  const copy = () => {
    navigator.clipboard
      ?.writeText(asText(report))
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }
  return (
    <aside
      aria-label="Figure debug report"
      data-stage-debug=""
      className="fixed inset-x-0 bottom-0 z-50 max-h-[48svh] overflow-auto border-t border-ink bg-paper px-3 py-2 font-mono text-[11px] leading-[1.4] text-ink print:hidden [@media(pointer:coarse)]:pb-[calc(env(safe-area-inset-bottom)+5rem)]"
    >
      <div className="flex items-center gap-3">
        <strong className="font-normal">{title} · debug</strong>
        <button type="button" className="underline" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="underline" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && (
        <dl className="mt-1 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3">
          {report.map(({ k, v }) => (
            <div key={k} className="contents">
              <dt className="text-graphite">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  )
}
