let cachedFlag: boolean | null = null

function resolveDebugFlag() {
  if (cachedFlag !== null) return cachedFlag

  // Env-based toggle
  if (process.env.NEXT_PUBLIC_ARCADE_DEBUG === '1') {
    cachedFlag = true
    return cachedFlag
  }

  // Browser query/localStorage toggles
  if (typeof window !== 'undefined') {
    const search = window.location.search || ''
    if (search.includes('arcadeDebug=1') || search.includes('nesDebug=1')) {
      cachedFlag = true
      return cachedFlag
    }
    try {
      const stored = window.localStorage.getItem('arcadeDebug')
      if (stored === '1' || stored === 'true') {
        cachedFlag = true
        return cachedFlag
      }
    } catch {
      //
    }
  }

  cachedFlag = false
  return cachedFlag
}

export function debugEnabled() {
  return resolveDebugFlag()
}

export function debugLog(...args: unknown[]) {
  if (!debugEnabled()) return
  // eslint-disable-next-line no-console
  console.log('[Arcade]', ...args)
}
