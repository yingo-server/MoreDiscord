import { useEffect } from "react"
import { useMessageStore } from "@/stores/useMessageStore"
import { useRoomStore } from "@/stores/useRoomStore"
import { playMessageSound } from "@/lib/notify"

const ACTIVE_MS = 2000
const IDLE_MS = 12000
const LIST_REFRESH_MS = 12000

/**
 * Global polling loop (single timer, no WebSocket):
 *  - active conversation sync: 2s when visible, 12s when hidden/idle
 *  - conversations list refresh: every 12s
 *  - visibilitychange → immediate pull to catch up
 */
export function usePolling(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const currentConvId = () => {
      const s = useMessageStore.getState()
      return s.lastConvId
    }

    const tick = async () => {
      if (stopped) return
      const convId = currentConvId()
      if (convId && document.visibilityState === "visible") {
        const added = await useMessageStore.getState().syncNew(convId)
        if (added > 0 && document.visibilityState === "visible") playMessageSound()
      }
      schedule()
    }

    const schedule = () => {
      if (stopped) return
      const idle = document.visibilityState !== "visible"
      timer = setTimeout(tick, idle ? IDLE_MS : ACTIVE_MS)
    }

    const listTimer = setInterval(() => {
      if (document.visibilityState === "visible") {
        useRoomStore.getState().fetchRooms()
      }
    }, LIST_REFRESH_MS)

    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      const convId = currentConvId()
      if (convId) useMessageStore.getState().syncNew(convId)
      useRoomStore.getState().fetchRooms()
    }

    document.addEventListener("visibilitychange", onVisible)
    schedule()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      clearInterval(listTimer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [enabled])
}

