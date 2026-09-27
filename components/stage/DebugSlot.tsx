'use client'

import { useEffect, useState, type ComponentType } from 'react'
import type { LiveInfo } from '@/lib/stage/debug'

type Props = { title: string; read: () => LiveInfo }

/**
 * Where a figure's ?debug=1 panel (./Debug.tsx) goes: it loads only when the
 * address asks for it, so no reader pays for it, and renders nothing otherwise.
 */
export function DebugSlot(props: Props) {
  const [Panel, setPanel] = useState<ComponentType<Props> | null>(null)
  useEffect(() => {
    if (new URLSearchParams(location.search).get('debug') !== '1') return
    let gone = false
    import('./Debug')
      .then((m) => {
        if (!gone) setPanel(() => m.DebugPanel)
      })
      .catch(() => {})
    return () => {
      gone = true
    }
  }, [])
  return Panel ? <Panel {...props} /> : null
}
