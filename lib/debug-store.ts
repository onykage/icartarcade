const STORAGE_KEY = "arcadeDebugLog"
const MAX_ENTRIES = 200

type DebugEntry = {
  ts: number
  event: string
  payload?: unknown
}

export function appendDebugLog(event: string, payload?: unknown) {
  if (typeof window === "undefined") return
  const entry: DebugEntry = { ts: Date.now(), event, payload }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: DebugEntry[] = raw ? JSON.parse(raw) : []
    const next = [...parsed, entry].slice(-MAX_ENTRIES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures
  }
}

export function readDebugLogs(): DebugEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DebugEntry[]) : []
  } catch {
    return []
  }
}
