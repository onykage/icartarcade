import { isBrowser, isDevMode } from "./utils"

export type AuthUser = {
  userUuid: string
  displayName?: string | null
  email?: string | null
  rawToken?: string | null
}

export const GOOGLE_TOKEN_STORAGE_KEY = "arcadeGoogleIdToken"

const decodeBase64Url = (value: string) => {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    if (typeof atob === "function") {
      return atob(padded)
    }
    const nodeBuffer = (globalThis as any)?.Buffer
    if (nodeBuffer) {
      return nodeBuffer.from(padded, "base64").toString("utf8")
    }
    return null
  } catch {
    return null
  }
}

export function decodeGoogleIdToken(token: string): AuthUser | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length < 2) return null

  const payloadRaw = decodeBase64Url(parts[1])
  if (!payloadRaw) return null

  try {
    const payload = JSON.parse(payloadRaw)
    const sub = typeof payload.sub === "string" ? payload.sub : null
    if (!sub) return null
    return {
      userUuid: sub,
      displayName: payload.name ?? null,
      email: payload.email ?? null,
      rawToken: token,
    }
  } catch {
    return null
  }
}

export function loadAuthUser(): AuthUser | null {
  if (!isBrowser()) return null
  try {
    const token = window.localStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY)
    if (token) {
      return decodeGoogleIdToken(token)
    }
    if (isDevMode()) {
      return {
        userUuid: "dev-user",
        displayName: "Dev Tester",
        email: "dev@example.com",
        rawToken: null,
      }
    }
    return null
  } catch {
    return null
  }
}

export function persistGoogleToken(token: string | null) {
  if (!isBrowser()) return
  try {
    if (token) {
      window.localStorage.setItem(GOOGLE_TOKEN_STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY)
    }
    window.dispatchEvent(new CustomEvent("nes:auth-updated"))
  } catch {
    //
  }
}

export function clearGoogleToken() {
  persistGoogleToken(null)
}
