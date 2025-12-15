import { isBrowser, withBasePath } from '../utils'
import { debugLog } from '../debug'
import { appendDebugLog } from '../debug-store'

type NesInstance = {
  buttonDown: (player: number, button: number) => void
  buttonUp: (player: number, button: number) => void
  toJSON: () => unknown
  fromJSON?: (state: unknown) => void
  reset?: () => void
  cpu?: { mem?: Uint8Array | number[] }
  __isStub?: boolean
}

type EmbedNintendoConfig = {
  container: string
  name: string
  rom: ArrayBuffer
  player1?: Record<string, string>
  player2?: Record<string, string>
  cbStarted?: () => void
}

const SCRIPT_SRC = withBasePath('/vendor/nintendo/Nintendo.min.js')

let scriptPromise: Promise<void> | null = null

function loadNintendoScript() {
  if (!isBrowser()) return Promise.reject(new Error('Not in browser'))

  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    )
    if (existing) {
      if ((window as NintendoWindow).embedNintendo) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Nintendo script')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      console.warn('[Nintendo] Failed to load Nintendo.min.js')
      reject(new Error('Failed to load Nintendo script'))
    }
    document.body.appendChild(script)
  })

  return scriptPromise
}

type NintendoWindow = Window &
  typeof globalThis & {
    embedNintendo?: (config: EmbedNintendoConfig) => void
    NINTENDO?: NesInstance
    NINTENDO_GAIN_NODE?: { gain?: { value: number }; connect?: (dest: unknown) => void }
    NINTENDO_AUDIO_CTX?: AudioContext
    NINTENDO_SOUND_ENABLED?: boolean
    NINTENDO_GAME_PAUSED?: boolean
    NINTENDO_DISABLE_INTERNAL_KEYS?: boolean
  }

function createStubEmulator(containerId: string, romName: string, message?: string): NesInstance {
  const container = isBrowser() ? document.getElementById(containerId) : null
  if (container) {
    container.innerHTML = ''
    const canvas = document.createElement('div')
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'grid'
    canvas.style.placeItems = 'center'
    canvas.style.background = '#05070e'
    canvas.style.color = '#f3e9db'
    canvas.style.fontWeight = '700'
    canvas.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    canvas.innerText =
      message ??
      `Nintendo emulator placeholder — replace /public/roms/${romName} with a real NES ROM to play`
    container.appendChild(canvas)
  }

  const mem = new Uint8Array(0x1000)
  debugLog('Nintendo Loader: Using stub emulator for', romName, message || '')
  appendDebugLog('Nintendo Loader: Using stub emulator', { romName, message })
  return {
    cpu: { mem },
    buttonDown: () => {},
    buttonUp: () => {},
    toJSON: () => ({ romName, timestamp: Date.now(), mem: Array.from(mem.slice(0, 64)) }),
    __isStub: true,
  }
}

function ensureCanvasScaling(container: HTMLElement) {
  const applyStyles = () => {
    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return false
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.maxWidth = '100%'
    canvas.style.maxHeight = '100%'
    canvas.style.display = 'block'
    canvas.style.objectFit = 'fill'
    canvas.style.imageRendering = 'pixelated'
    canvas.style.backgroundColor = '#000'
    return true
  }

  if (applyStyles()) return

  const observer = new MutationObserver(() => {
    if (applyStyles()) {
      observer.disconnect()
    }
  })

  observer.observe(container, { childList: true, subtree: true })
}

function hasValidNesHeader(buffer: ArrayBuffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 16) return false
  const header = new Uint8Array(buffer.slice(0, 4))
  return header[0] === 0x4e && header[1] === 0x45 && header[2] === 0x53 && header[3] === 0x1a
}

export async function ensureNintendoLoaded() {
  if (!isBrowser()) return null
  const nintendoWindow = window as NintendoWindow

  if (typeof nintendoWindow.embedNintendo === 'function') {
    return nintendoWindow.embedNintendo
  }

  try {
    await loadNintendoScript()
  } catch (err) {
    debugLog('[Nintendo] Using stub emulator because Nintendo script failed to load.', err)
    return null
  }

  return nintendoWindow.embedNintendo ?? null
}

function patchReload() {
  if (!isBrowser()) return () => {}
  const original = window.location.reload
  let restored = false

  const shim: Location['reload'] = (...args: Parameters<Location['reload']>) => {
    debugLog('Nintendo Loader: intercepted window.location.reload', {
      args,
      stack: new Error().stack,
    })
    appendDebugLog('Nintendo Loader: intercepted reload', { args })
  }

  try {
    window.location.reload = shim
    debugLog('Nintendo Loader: patched window.location.reload to prevent vendor reloads')
    appendDebugLog('Nintendo Loader: patched reload', {})
  } catch (err) {
    debugLog('Nintendo Loader: failed to patch window.location.reload', err)
    appendDebugLog('Nintendo Loader: failed to patch reload', { err: String(err) })
    return () => {}
  }

  return () => {
    if (restored) return
    restored = true
    try {
      window.location.reload = original
    } catch {
      //
    }
    debugLog('Nintendo Loader: restored window.location.reload')
    appendDebugLog('Nintendo Loader: restored reload', {})
  }
}

export async function loadNintendoRom(
  containerId: string,
  romName: string,
  romBuffer: ArrayBuffer,
): Promise<NesInstance> {
  const embedNintendo = await ensureNintendoLoaded()
  if (!isBrowser() || !embedNintendo || !(romBuffer instanceof ArrayBuffer) || !romBuffer.byteLength) {
    debugLog('Nintendo Loader: Falling back to stub due to missing browser/script/rom buffer', {
      hasBrowser: isBrowser(),
      hasEmbed: !!embedNintendo,
      bufferBytes: romBuffer?.byteLength ?? 'n/a',
    })
    appendDebugLog('Nintendo Loader: stub fallback pre-embed', {
      hasBrowser: isBrowser(),
      hasEmbed: !!embedNintendo,
      bufferBytes: romBuffer?.byteLength ?? 'n/a',
    })
    return createStubEmulator(containerId, romName)
  }

  const container = document.getElementById(containerId)
  if (!container) {
    return createStubEmulator(containerId, romName)
  }

  container.innerHTML = ''
  ensureCanvasScaling(container)

  if (!hasValidNesHeader(romBuffer)) {
    debugLog(
      `[Nintendo] ROM "${romName}" does not contain a valid iNES header. Provide a .nes ROM dumped from original media.`,
    )
    return createStubEmulator(
      containerId,
      romName,
      `Invalid or placeholder ROM detected for "${romName}". Replace /public/roms/${romName} with a legitimate .nes file.`,
    )
  }

  const nintendoWindow = window as NintendoWindow

  const restoreReload = patchReload()
  const restoreOnce = () => {
    try {
      restoreReload()
    } catch {
      //
    }
  }

  return new Promise<NesInstance>((resolve) => {
    let resolved = false
    const handleResolve = (instance: NesInstance) => {
      if (resolved) return
      resolved = true
      restoreOnce()
      resolve(instance)
    }

    const onEmbedError = (event: Event) => {
      const detail = (event as CustomEvent).detail
      debugLog('Nintendo Loader: embed error event', { romName, detail })
      appendDebugLog('Nintendo Loader: embed error event', { romName, detail })
      handleResolve(createStubEmulator(containerId, romName))
    }

    window.addEventListener('nes:embed-error', onEmbedError, { once: true })

    debugLog('Nintendo Loader: invoking embedNintendo', {
      containerId,
      romName,
      bufferBytes: romBuffer.byteLength,
    })
    appendDebugLog('Nintendo Loader: invoking embedNintendo', {
      containerId,
      romName,
      bufferBytes: romBuffer.byteLength,
    })
    try {
      embedNintendo({
        container: containerId,
        name: romName,
        rom: romBuffer,
        cbStarted: () => {
          debugLog('Nintendo Loader: embedNintendo cbStarted fired for', romName)
          appendDebugLog('Nintendo Loader: cbStarted', { romName })
          const instance = nintendoWindow.NINTENDO
          nintendoWindow.NINTENDO_DISABLE_INTERNAL_KEYS = true
          handleResolve(instance ?? createStubEmulator(containerId, romName))
        },
      })
    } catch (err) {
      debugLog('[Nintendo] Failed to boot ROM', err)
      appendDebugLog('Nintendo Loader: boot failed', { romName, err: String(err) })
      handleResolve(createStubEmulator(containerId, romName))
    }
    // Fail-safe to ensure reload is restored even if cbStarted never fires
    setTimeout(() => {
      if (!resolved) {
        debugLog('Nintendo Loader: embed timeout fallback', { romName })
        appendDebugLog('Nintendo Loader: embed timeout fallback', { romName })
        handleResolve(createStubEmulator(containerId, romName))
      }
    }, 4000)
  })
}

export function pauseNintendo() {
  if (!isBrowser()) return
  const nintendoWindow = window as NintendoWindow
  nintendoWindow.NINTENDO_GAME_PAUSED = true
}

export function resumeNintendo() {
  if (!isBrowser()) return
  const nintendoWindow = window as NintendoWindow
  nintendoWindow.NINTENDO_GAME_PAUSED = false
}

export function resetNintendo() {
  if (!isBrowser()) return
  const nintendoWindow = window as NintendoWindow
  try {
    nintendoWindow.NINTENDO?.reset?.()
    nintendoWindow.NINTENDO_GAME_PAUSED = false
  } catch {
    //
  }
}

export function applyVolumeSettings(volume: number, isMuted: boolean) {
  if (!isBrowser()) return
  const nintendoWindow = window as NintendoWindow
  const normalized = Math.min(Math.max(volume, 0), 1)
  const audioCtx = nintendoWindow.NINTENDO_AUDIO_CTX

  const ensureGainNode = () => {
    if (!audioCtx) return null
    // Resume context if needed so gain changes take effect immediately.
    if (audioCtx.state === 'suspended') {
      try {
        void audioCtx.resume()
      } catch {
        //
      }
    }
    let node = nintendoWindow.NINTENDO_GAIN_NODE
    if (!node && audioCtx.createGain) {
      try {
        node = audioCtx.createGain()
        node.gain.value = 1
        node.connect(audioCtx.destination)
        nintendoWindow.NINTENDO_GAIN_NODE = node
      } catch {
        node = null
      }
    }
    return node
  }

  const gainNode = ensureGainNode()
  if (gainNode?.gain) {
    gainNode.gain.value = isMuted ? 0 : normalized
  }
  // Gate sample output as a secondary mute.
  nintendoWindow.NINTENDO_SOUND_ENABLED = !isMuted && normalized > 0
}
