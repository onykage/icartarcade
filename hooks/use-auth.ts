"use client"

import { useEffect, useState } from "react"
import { AuthUser, GOOGLE_TOKEN_STORAGE_KEY, loadAuthUser } from "@/lib/auth"

export function useAuthUser() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadAuthUser())

  useEffect(() => {
    const refresh = () => setAuthUser(loadAuthUser())
    refresh()

    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === GOOGLE_TOKEN_STORAGE_KEY) {
        refresh()
      }
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener("nes:auth-updated", refresh as EventListener)
    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("nes:auth-updated", refresh as EventListener)
    }
  }, [])

  return authUser
}
