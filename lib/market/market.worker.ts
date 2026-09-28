import { MarketHost } from './host'
import type { FanMsg, FromWorker, ToWorker } from './protocol'

/**
 * /market's worker: the market runs here, off the page's thread, and answers each frame the page asks for
 * (lib/market/host.ts does the work; lib/market/protocol.ts is what the two say). It is a module worker loaded from
 * the site's own origin, as the page's scripts are: the content security policy's script-src 'self' covers it, and
 * nothing is built from a blob.
 */

/** The worker's global scope, as far as this file uses it (the project's TypeScript libraries are the page's). */
interface Scope {
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
  postMessage(msg: FromWorker, transfer?: Transferable[]): void
}

const scope = self as unknown as Scope
let host: MarketHost | null = null

scope.onmessage = (e) => {
  const msg = e.data
  try {
    switch (msg.kind) {
      case 'start':
        host = new MarketHost(msg.seed, msg.t, () => performance.now())
        scope.postMessage({ kind: 'ready', t: host.market.t, hash: host.market.hash() })
        break
      case 'frame': {
        let fan: FanMsg | null = null
        if (host) fan = host.frame(msg.at, msg.buf)
        // A frame asked for before the market is built goes back unwritten, marked as no frame (version 0).
        else new Float64Array(msg.buf, 0, 1)[0] = 0
        scope.postMessage({ kind: 'frame', buf: msg.buf }, [msg.buf])
        if (fan) scope.postMessage(fan, [fan.bands.buffer, fan.strands.buffer])
        break
      }
      case 'act':
        host?.act(msg.act)
        break
      case 'pause':
        host?.pause()
        break
      case 'resume':
        host?.resume()
        break
      case 'reset':
        host?.reset()
        break
    }
  } catch (err) {
    scope.postMessage({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
