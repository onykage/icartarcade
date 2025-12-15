"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Save, Upload, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { applyVolumeSettings, loadNintendoRom, pauseNintendo, resetNintendo, resumeNintendo } from "@/lib/nintendo/loader"
import {
  NES_BUTTONS,
  getGameById,
  loadStoredScores,
  persistScores,
  readScoreForRomName,
  stateKeyForRom,
} from "@/lib/nes"
import { useAuthUser } from "@/hooks/use-auth"
import { pushNotification } from "@/lib/notifications"
import { withBasePath } from "@/lib/utils"
import { debugEnabled, debugLog } from "@/lib/debug"
import { appendDebugLog } from "@/lib/debug-store"
import { useToast } from "@/components/ui/use-toast"

const AXIS_DEADZONE = 0.4
const NES_MAPPING_STORAGE_PREFIX = "nesControllerMapping:"
const BINDING_ORDER = ["UP", "DOWN", "LEFT", "RIGHT", "SELECT", "START", "B", "A"] as const

type NesLogical = (typeof BINDING_ORDER)[number]

type NesMappingEntry =
  | { type: "button"; index: number }
  | { type: "axis"; axis: number; direction: -1 | 1; threshold: number }

type NesMapping = Partial<Record<NesLogical, NesMappingEntry>>

const friendlyNameForLogical: Record<NesLogical, string> = {
  UP: "D-Pad Up",
  DOWN: "D-Pad Down",
  LEFT: "D-Pad Left",
  RIGHT: "D-Pad Right",
  SELECT: "Select",
  START: "Start",
  B: "B button",
  A: "A button",
}
const NES_CONTROLLER_BG =
  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.08), rgba(4,9,26,0.95) 70%)"
const GUEST_NOTICE_STORAGE_KEY = "arcadeGuestAuthNoticeSeen"

type Status =
  | "Idle"
  | "Loading ROM"
  | "Ready"
  | "Running"
  | "Paused"
  | "State Loaded - Press Resume"
  | "Error loading ROM"

type SavedSlot = { state: unknown; savedAt: number; slot: string }

interface EmulatorScreenProps {
  gameId: string
  onClose: () => void
}

// Track visibility of the emulator view to keep Nintendo.js paused when the UI is hidden
let globalFocusInterceptorBound = false
let emulatorViewVisible = false

export function EmulatorScreen({ gameId, onClose }: EmulatorScreenProps) {
  const game = useMemo(() => getGameById(gameId), [gameId])
  const authUser = useAuthUser()
  const scoreOwnerId = authUser?.userUuid ?? null
  const isAuthed = !!scoreOwnerId
  const { toast } = useToast()
  const scoresEnabled = game?.statMode === "score" && game.scoreScrape !== false
  const initialGuestNoticeSeen = useMemo(() => {
    if (typeof window === "undefined") return false
    try {
      return window.localStorage.getItem(GUEST_NOTICE_STORAGE_KEY) === "1"
    } catch {
      return false
    }
  }, [])
  const [viewToken] = useState(() => Math.random().toString(36).slice(2, 10))
  const [status, setStatus] = useState<Status>("Idle")
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [volume, setVolume] = useState(0.75)
  const [isMuted, setIsMuted] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState("slot1")
  const [saveSlots, setSaveSlots] = useState<Record<string, SavedSlot>>({})
  const [scoreHistory, setScoreHistory] = useState<number[]>([])
  const [currentScore, setCurrentScore] = useState<number | null>(null)
  const [resumeFromState, setResumeFromState] = useState(false)
  // Stable across SSR/CSR to avoid hydration mismatches
  const reactId = useId()
  const containerId = useMemo(() => `nes-canvas-${reactId.replace(/[:]/g, "")}`, [reactId])
  const loadTokenRef = useRef(0)
  const nesRef = useRef<any | null>(null)
  const runningRef = useRef(false)
  const volumeRef = useRef(volume)
  const mutedRef = useRef(isMuted)
  const resumeFromStateRef = useRef(false)
  const [showMapperModal, setShowMapperModal] = useState(false)
  const [gamepadConnected, setGamepadConnected] = useState(false)
  const [gamepadLabel, setGamepadLabel] = useState<string | null>(null)
  const [mapping, setMapping] = useState<NesMapping>({})
  const [bindingStep, setBindingStep] = useState(0)
  const [mappingDone, setMappingDone] = useState(false)
  const [activeBinding, setActiveBinding] = useState<NesLogical | null>(null)
  const mappingRef = useRef<NesMapping>({})
  const activeBindingRef = useRef<NesLogical | null>(null)
  const waitingForReleaseRef = useRef(false)
  const pendingAdvanceRef = useRef<NesLogical | null>(null)
  const visibleRef = useRef(false)
  const bindingStepRef = useRef(0)
  const gamepadIndexRef = useRef<number | null>(null)
  const prevButtonsRef = useRef<boolean[]>([])
  const prevAxisRef = useRef({ up: false, down: false, left: false, right: false })
  const prevLogicalRef = useRef<Record<NesLogical, boolean>>(
    BINDING_ORDER.reduce(
      (acc, key) => {
        acc[key] = false
        return acc
      },
      {} as Record<NesLogical, boolean>,
    ),
  )
  const guestNoticeSentRef = useRef<boolean>(initialGuestNoticeSeen)
  const closeMapperModal = useCallback(() => {
    setShowMapperModal(false)
    setActiveBinding(null)
    activeBindingRef.current = null
    waitingForReleaseRef.current = false
    pendingAdvanceRef.current = null
  }, [])
  useEffect(() => {
    mappingRef.current = mapping
  }, [mapping])
  useEffect(() => {
    activeBindingRef.current = activeBinding
  }, [activeBinding])
  useEffect(() => {
    bindingStepRef.current = bindingStep
  }, [bindingStep])

  const slotOrder = ["slot1", "slot2", "slot3"] as const

  const loadMappingForGamepad = useCallback((id: string): NesMapping => {
    if (typeof window === "undefined") return {}
    try {
      const raw = window.localStorage.getItem(`${NES_MAPPING_STORAGE_PREFIX}${id}`)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        return parsed as NesMapping
      }
    } catch {
      //
    }
    return {}
  }, [])

  const persistMappingForGamepad = useCallback((id: string, next: NesMapping) => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(`${NES_MAPPING_STORAGE_PREFIX}${id}`, JSON.stringify(next))
    } catch {
      //
    }
  }, [])

  const startGuidedMapping = useCallback(
    (id?: string | null) => {
      const blank: NesMapping = {}
      setMapping(blank)
      mappingRef.current = blank
      waitingForReleaseRef.current = false
      pendingAdvanceRef.current = null
      if (id) {
        persistMappingForGamepad(id, blank)
      }
      setMappingDone(false)
      setBindingStep(0)
      bindingStepRef.current = 0
      const next = BINDING_ORDER[0]
      setActiveBinding(next)
      activeBindingRef.current = next
    },
    [persistMappingForGamepad],
  )

  const advanceBinding = useCallback(
    (completed: NesLogical) => {
      if (!showMapperModal) return
      const nextIndex = bindingStepRef.current + 1
      if (nextIndex >= BINDING_ORDER.length) {
        bindingStepRef.current = BINDING_ORDER.length
        setBindingStep(BINDING_ORDER.length)
        setActiveBinding(null)
        activeBindingRef.current = null
        setMappingDone(true)
        waitingForReleaseRef.current = false
        pendingAdvanceRef.current = null
        return
      }
      bindingStepRef.current = nextIndex
      setBindingStep(nextIndex)
      const next = BINDING_ORDER[nextIndex]
      setActiveBinding(next)
      activeBindingRef.current = next
      waitingForReleaseRef.current = true
      pendingAdvanceRef.current = completed
    },
    [showMapperModal],
  )

  const formatScore = (value: number | null | undefined) => {
    if (value == null) return "—"
    return value.toLocaleString()
  }

  const cloneStateSnapshot = useCallback(<T,>(state: T): T => {
    try {
      if (typeof structuredClone === "function") {
        return structuredClone(state)
      }
    } catch {
      //
    }
    try {
      return JSON.parse(JSON.stringify(state)) as T
    } catch {
      return state
    }
  }, [])

  const trace = useCallback(
    (...args: unknown[]) => {
      debugLog(...args)
      try {
        const [event, payload] = args as [string, unknown]
        if (typeof event === "string") {
          appendDebugLog(event, payload)
        }
      } catch {
        //
      }
      // Mirror to console when debug toggle is off so we can still see traces during this investigation.
      if (!debugEnabled()) {
        // eslint-disable-next-line no-console
        console.info("[Arcade][EmulatorScreen]", ...args)
      }
    },
    [],
  )

  useEffect(() => {
    trace("EmulatorScreen: mounted", { viewToken, gameId, rom: game?.romFile })
    const container = document.getElementById(containerId)
    trace("EmulatorScreen: canvas container check", { containerId, found: !!container })
    visibleRef.current = true
    emulatorViewVisible = true
    if (!globalFocusInterceptorBound && typeof window !== "undefined") {
      globalFocusInterceptorBound = true
      window.addEventListener(
        "focus",
        (event) => {
          const target = event.target
          if (target !== window && target !== document) {
            return
          }
          // Prevent Nintendo.js internal focus handler from resuming playback
          try {
            event.stopImmediatePropagation()
            event.stopPropagation()
          } catch {
            //
          }
          // Always force pause on focus; active view will manage resume explicitly
          pauseNintendo()
        },
        true,
      )
    }
    return () => {
      trace("EmulatorScreen: unmounted", {
        viewToken,
        gameId,
        status,
        hasNes: !!nesRef.current,
        running: runningRef.current,
      })
      visibleRef.current = false
      emulatorViewVisible = false
    }
  }, [containerId, game?.romFile, gameId, status, trace, viewToken])

  useEffect(() => {
    trace("EmulatorScreen: status change", {
      status,
      isPlaying,
      isLoading,
      hasNes: !!nesRef.current,
      running: runningRef.current,
    })
  }, [isLoading, isPlaying, status, trace])

  const loadRom = useCallback(async (options?: { autoStart?: boolean }) => {
    const autoStart = options?.autoStart ?? true
    if (!game) return null
    const loadToken = ++loadTokenRef.current
    trace("EmulatorScreen: loadRom invoked", { game })
    setIsLoading(true)
    setStatus("Loading ROM")
    runningRef.current = false
    setIsPlaying(false)

    let romBuffer: ArrayBuffer = new ArrayBuffer(0)
    try {
      const romUrl = withBasePath(`/roms/${game.romFile}`)
      const response = await fetch(romUrl)
      if (response.ok) {
        romBuffer = await response.arrayBuffer()
        trace("EmulatorScreen: ROM fetched", { romUrl, size: romBuffer.byteLength })
      } else {
        trace("EmulatorScreen: ROM fetch failed", { romUrl, status: response.status })
      }
    } catch (err) {
      trace("EmulatorScreen: ROM fetch threw, falling back to placeholder", err)
    }

    try {
      const nes = await loadNintendoRom(containerId, game.romFile, romBuffer)
      if (loadToken !== loadTokenRef.current) {
        trace("EmulatorScreen: stale loadRom result ignored", { loadToken, current: loadTokenRef.current })
        return null
      }
      nesRef.current = nes
      applyVolumeSettings(volumeRef.current, mutedRef.current || volumeRef.current === 0)
      const isStub = (nes as { __isStub?: boolean })?.__isStub
      trace("EmulatorScreen: Nintendo loader returned", { isStub })
      if (isStub) {
        setStatus("Error loading ROM")
      } else {
        resumeFromStateRef.current = false
        setResumeFromState(false)
        if (autoStart) {
          resumeNintendo()
          runningRef.current = true
          setIsPlaying(true)
          setStatus("Running")
        } else {
          pauseNintendo()
          runningRef.current = false
          setIsPlaying(false)
          setStatus("Ready")
        }
      }
      return nes
    } catch (err) {
      trace("EmulatorScreen: loadNintendoRom threw", err)
      setStatus("Error loading ROM")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [containerId, game, trace])

  const refreshSlots = useCallback(() => {
    if (!game || typeof window === "undefined" || !isAuthed) return {}
    try {
      const raw = window.localStorage.getItem(stateKeyForRom(game.romFile, scoreOwnerId))
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, SavedSlot>
      }
    } catch {
      //
    }
    return {}
  }, [game, isAuthed, scoreOwnerId])

  const captureScore = useCallback(() => {
    if (!game || !scoresEnabled) return
    const nes = nesRef.current
    if (!nes) return

    const score = readScoreForRomName(game.romFile, nes)
    if (score == null) return

    setCurrentScore(score)
    setScoreHistory((prev) => {
      const next = [...prev, score].slice(-10)
      persistScores(game.romFile, next, scoreOwnerId)
      return next
    })
  }, [game, scoreOwnerId, scoresEnabled])

  const handleTogglePlay = useCallback(async () => {
    if (!game) return
    if (runningRef.current) {
      debugLog("EmulatorScreen: toggling play -> pause")
      captureScore()
      pauseNintendo()
      runningRef.current = false
      setIsPlaying(false)
      setStatus("Paused")
      return
    }

    debugLog("EmulatorScreen: toggling play -> resume/load")
    if (!isAuthed && !guestNoticeSentRef.current) {
      guestNoticeSentRef.current = true
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(GUEST_NOTICE_STORAGE_KEY, "1")
        } catch {
          //
        }
      }
      const title = "Authentication recommended"
      const message =
        "Playing as guest. Sign in with Google to sync scores, saves, ladder, and multiplayer."
      pushNotification({ title, message, type: "system", read: false })
      toast({
        title,
        description: message,
      })
    }

    // If we previously restored a state and are paused, just resume without reloading
    if (resumeFromStateRef.current && nesRef.current) {
      resumeNintendo()
      runningRef.current = true
      setIsPlaying(true)
      setStatus("Running")
      resumeFromStateRef.current = false
      setResumeFromState(false)
      return
    }

    const nes = nesRef.current ?? (await loadRom())
    if (!nes) return

    resumeNintendo()
    runningRef.current = true
    setIsPlaying(true)
    setStatus("Running")
    resumeFromStateRef.current = false
    setResumeFromState(false)
  }, [captureScore, game, loadRom])

  const handleReset = useCallback(() => {
    debugLog("EmulatorScreen: resetting emulator")
    captureScore()
    runningRef.current = false
    setIsPlaying(false)
    setStatus("Loading ROM")
    void loadRom({ autoStart: false })
  }, [captureScore, loadRom])

  const handleSaveState = useCallback(() => {
    if (!game || !nesRef.current || typeof nesRef.current.toJSON !== "function" || !isAuthed) return
    const snapshot = cloneStateSnapshot(nesRef.current.toJSON())
    // Auto-advance to the next empty slot if current slot already has data
    let targetSlot = selectedSlot
    if (saveSlots[selectedSlot]) {
      const empty = ["slot1", "slot2", "slot3"].find((s) => !saveSlots[s])
      if (empty) {
        targetSlot = empty
        setSelectedSlot(empty)
      }
    }
    const next = {
      ...saveSlots,
      [targetSlot]: { state: snapshot, savedAt: Date.now(), slot: targetSlot },
    }
    setSaveSlots(next)
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          stateKeyForRom(game.romFile, scoreOwnerId),
          JSON.stringify(next),
        )
      } catch {
        //
      }
    }
  }, [cloneStateSnapshot, game, isAuthed, saveSlots, scoreOwnerId, selectedSlot])

  const handleLoadState = useCallback(async () => {
    if (!game || !isAuthed) return
    const slot = saveSlots[selectedSlot]
    if (!slot) return

    const wasRunning = runningRef.current
    runningRef.current = false
    setIsPlaying(false)
    setStatus("Loading ROM")
    setIsLoading(true)
    // Always ensure NES instance exists; don't auto-start on load
    const nes = nesRef.current ?? (await loadRom({ autoStart: false }))
    if (!nes || typeof nes.fromJSON !== "function") {
      trace("EmulatorScreen: load state aborted, no fromJSON on nes", { hasNes: !!nes })
      setIsLoading(false)
      setStatus("Paused")
      return
    }

    // Pause before applying snapshot
    pauseNintendo()
    try {
      const snapshot = cloneStateSnapshot(slot.state)
      nes.fromJSON(snapshot)
      trace("EmulatorScreen: state restored from slot", { slot: selectedSlot })
      runningRef.current = false
      setIsPlaying(false)
      setStatus(wasRunning ? "State Loaded - Press Resume" : "Paused")
      resumeFromStateRef.current = true
      setResumeFromState(true)
    } catch (err) {
      console.error("[NES] failed to load state", err)
      setStatus("Error loading ROM")
    } finally {
      setIsLoading(false)
    }
  }, [cloneStateSnapshot, game, loadRom, saveSlots, selectedSlot, trace])

  useEffect(() => {
    volumeRef.current = volume
    applyVolumeSettings(volume, mutedRef.current || volume === 0)
  }, [volume])

  useEffect(() => {
    mutedRef.current = isMuted
    applyVolumeSettings(volumeRef.current, isMuted || volumeRef.current === 0)
  }, [isMuted])

  useEffect(() => {
    if (!game) return
    setStatus("Idle")
    setIsPlaying(false)
    setSelectedSlot("slot1")
    runningRef.current = false
    setScoreHistory(scoresEnabled ? loadStoredScores(game.romFile, scoreOwnerId) : [])
    setSaveSlots(refreshSlots())
    setCurrentScore(null)
    void loadRom()
  }, [game, loadRom, refreshSlots, scoreOwnerId, scoresEnabled])

  useEffect(() => {
    const pauseForFocusLoss = (reason: string) => {
      if (!runningRef.current) return
      trace("EmulatorScreen: auto-pause on focus loss", { reason })
      captureScore()
      pauseNintendo()
      runningRef.current = false
      setIsPlaying(false)
      setStatus("Paused")
      // keep resume flag if we were coming from a loaded state
    }

    const handleBlur = () => pauseForFocusLoss("blur")
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        pauseForFocusLoss("visibilityhidden")
      }
    }
    const handlePageHide = () => pauseForFocusLoss("pagehide")

    window.addEventListener("blur", handleBlur)
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      window.removeEventListener("blur", handleBlur)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [captureScore, trace])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handleWindowFocus = (event: FocusEvent) => {
      // Only intercept top-level window focus to prevent Nintendo.js from auto-resuming
      if (event.target !== window && event.target !== document) return
      // Stop vendor focus listener from toggling back to running
      event.stopImmediatePropagation()
      event.stopPropagation()
      // Keep emulator paused unless the user explicitly resumes
      pauseNintendo()
      if (!runningRef.current) {
        setIsPlaying(false)
        setStatus((prev) => (prev === "Running" ? "Paused" : prev))
      }
    }
    window.addEventListener("focus", handleWindowFocus, true)
    return () => window.removeEventListener("focus", handleWindowFocus, true)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const updateFromNavigator = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      const first = pads.find((pad) => pad != null)
      if (first) {
        gamepadIndexRef.current = first!.index
        setGamepadConnected(true)
        setGamepadLabel(first!.id)
        const loaded = loadMappingForGamepad(first!.id)
        setMapping(loaded)
        setActiveBinding(null)
        activeBindingRef.current = null
      } else {
        gamepadIndexRef.current = null
        setGamepadConnected(false)
        setGamepadLabel(null)
        setMapping({})
      }
    }

    const handleConnect = (event: GamepadEvent) => {
      const gp = event.gamepad
      gamepadIndexRef.current = gp.index
      setGamepadConnected(true)
      setGamepadLabel(gp.id)
      const loaded = loadMappingForGamepad(gp.id)
      setMapping(loaded)
      setActiveBinding(null)
      activeBindingRef.current = null
    }

    const handleDisconnect = (event: GamepadEvent) => {
      if (gamepadIndexRef.current === event.gamepad.index) {
        gamepadIndexRef.current = null
        setGamepadConnected(false)
        setGamepadLabel(null)
        setMapping({})
        setActiveBinding(null)
        activeBindingRef.current = null
      }
    }

    window.addEventListener("gamepadconnected", handleConnect)
    window.addEventListener("gamepaddisconnected", handleDisconnect)
    updateFromNavigator()

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect)
      window.removeEventListener("gamepaddisconnected", handleDisconnect)
    }
  }, [loadMappingForGamepad])

  useEffect(() => {
    const mapKey = (code: string): number | null => {
      switch (code) {
        case "ArrowUp":
          return NES_BUTTONS.BUTTON_UP
        case "ArrowDown":
          return NES_BUTTONS.BUTTON_DOWN
        case "ArrowLeft":
          return NES_BUTTONS.BUTTON_LEFT
        case "ArrowRight":
          return NES_BUTTONS.BUTTON_RIGHT
        case "KeyZ":
          return NES_BUTTONS.BUTTON_A
        case "KeyX":
          return NES_BUTTONS.BUTTON_B
        case "Enter":
          return NES_BUTTONS.BUTTON_START
        case "ShiftRight":
        case "ShiftLeft":
          return NES_BUTTONS.BUTTON_SELECT
        default:
          return null
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!runningRef.current || showMapperModal) return
      const btn = mapKey(e.code)
      if (btn == null) return
      e.preventDefault()
      try {
        nesRef.current?.buttonDown?.(1, btn)
      } catch {
        //
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!runningRef.current || showMapperModal) return
      const btn = mapKey(e.code)
      if (btn == null) return
      e.preventDefault()
      try {
        nesRef.current?.buttonUp?.(1, btn)
      } catch {
        //
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [showMapperModal])

  useEffect(() => {
    if (!isPlaying || !game || !scoresEnabled) return
    const timer = window.setInterval(() => {
      captureScore()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [captureScore, game, isPlaying, scoresEnabled])

  useEffect(() => {
    // Ensure the emulator stays paused whenever we're not in a running state
    if (!isPlaying) {
      pauseNintendo()
    }
  }, [isPlaying])

  useEffect(() => {
    return () => {
      pauseNintendo()
      runningRef.current = false
      nesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    let frameId: number

    const poll = () => {
      const index = gamepadIndexRef.current
      if (index == null || !navigator.getGamepads) {
        frameId = window.requestAnimationFrame(poll)
        return
      }

      const pads = navigator.getGamepads()
      const gp = pads[index]
      if (!gp) {
        frameId = window.requestAnimationFrame(poll)
        return
      }

      const buttons = gp.buttons || []
      const axes = gp.axes || []

      const binding = activeBindingRef.current
      const nes = nesRef.current

      if (binding) {
        if (waitingForReleaseRef.current) {
          const anyPressed = buttons.some((b) => b && (b.pressed || b.value > 0.5))
          const axisEngaged = axes.some((value) => Math.abs(value ?? 0) >= AXIS_DEADZONE)
          if (!anyPressed && !axisEngaged) {
            waitingForReleaseRef.current = false
            const pending = pendingAdvanceRef.current
            pendingAdvanceRef.current = null
            if (pending) {
              advanceBinding(pending)
            }
          }
          frameId = window.requestAnimationFrame(poll)
          return
        }

        let updated = false
        const nextMapping: NesMapping = { ...(mappingRef.current || {}) }

        for (let i = 0; i < buttons.length; i++) {
          const b = buttons[i]
          if (b && (b.pressed || b.value > 0.5)) {
            nextMapping[binding] = { type: "button", index: i }
            mappingRef.current = nextMapping
            setMapping(nextMapping)
            if (gp.id) {
              persistMappingForGamepad(gp.id, nextMapping)
            }
            updated = true
            break
          }
        }

        if (
          !updated &&
          (binding === "UP" || binding === "DOWN" || binding === "LEFT" || binding === "RIGHT")
        ) {
          for (let axisIndex = 0; axisIndex < axes.length; axisIndex++) {
            const value = axes[axisIndex]
            if (value == null) continue

            if (binding === "LEFT" && value <= -AXIS_DEADZONE) {
              nextMapping[binding] = {
                type: "axis",
                axis: axisIndex,
                direction: -1,
                threshold: -AXIS_DEADZONE,
              }
              mappingRef.current = nextMapping
              setMapping(nextMapping)
              if (gp.id) {
                persistMappingForGamepad(gp.id, nextMapping)
              }
              updated = true
              break
            }

            if (binding === "RIGHT" && value >= AXIS_DEADZONE) {
              nextMapping[binding] = {
                type: "axis",
                axis: axisIndex,
                direction: 1,
                threshold: AXIS_DEADZONE,
              }
              mappingRef.current = nextMapping
              setMapping(nextMapping)
              if (gp.id) {
                persistMappingForGamepad(gp.id, nextMapping)
              }
              updated = true
              break
            }

            if (binding === "UP" && value <= -AXIS_DEADZONE) {
              nextMapping[binding] = {
                type: "axis",
                axis: axisIndex,
                direction: -1,
                threshold: -AXIS_DEADZONE,
              }
              mappingRef.current = nextMapping
              setMapping(nextMapping)
              if (gp.id) {
                persistMappingForGamepad(gp.id, nextMapping)
              }
              updated = true
              break
            }

            if (binding === "DOWN" && value >= AXIS_DEADZONE) {
              nextMapping[binding] = {
                type: "axis",
                axis: axisIndex,
                direction: 1,
                threshold: AXIS_DEADZONE,
              }
              mappingRef.current = nextMapping
              setMapping(nextMapping)
              if (gp.id) {
                persistMappingForGamepad(gp.id, nextMapping)
              }
              updated = true
              break
            }
          }
        }

        if (updated) {
          waitingForReleaseRef.current = true
        }

        frameId = window.requestAnimationFrame(poll)
        return
      }

      if (!nes || (!isPlaying && !showMapperModal)) {
        frameId = window.requestAnimationFrame(poll)
        return
      }

      const currentMapping = mappingRef.current
      const hasCustomMapping =
        currentMapping &&
        (currentMapping.A ||
          currentMapping.B ||
          currentMapping.SELECT ||
          currentMapping.START ||
          currentMapping.UP ||
          currentMapping.DOWN ||
          currentMapping.LEFT ||
          currentMapping.RIGHT)

      if (hasCustomMapping) {
        const logicals: NesLogical[] = ["A", "B", "SELECT", "START", "UP", "DOWN", "LEFT", "RIGHT"]

        const isPressedLogical = (logical: NesLogical): boolean => {
          const entry = currentMapping?.[logical]
          if (!entry) return false

          if (entry.type === "button") {
            const b = buttons[entry.index]
            return !!(b && (b.pressed || b.value > 0.5))
          }

          if (entry.type === "axis") {
            const value = axes[entry.axis] ?? 0
            if (entry.direction === -1) {
              return value <= (entry.threshold ?? -AXIS_DEADZONE)
            }
            return value >= (entry.threshold ?? AXIS_DEADZONE)
          }

          return false
        }

        const nesButtonForLogical: Record<NesLogical, number> = {
          A: NES_BUTTONS.BUTTON_A,
          B: NES_BUTTONS.BUTTON_B,
          SELECT: NES_BUTTONS.BUTTON_SELECT,
          START: NES_BUTTONS.BUTTON_START,
          UP: NES_BUTTONS.BUTTON_UP,
          DOWN: NES_BUTTONS.BUTTON_DOWN,
          LEFT: NES_BUTTONS.BUTTON_LEFT,
          RIGHT: NES_BUTTONS.BUTTON_RIGHT,
        }

        for (const logical of logicals) {
          const pressed = isPressedLogical(logical)
          const wasPressed = prevLogicalRef.current[logical]
          if (pressed === wasPressed) continue

          const nesButton = nesButtonForLogical[logical]
          if (pressed) {
            nes.buttonDown?.(1, nesButton)
          } else {
            nes.buttonUp?.(1, nesButton)
          }
          prevLogicalRef.current[logical] = pressed
        }
      } else {
        if (prevButtonsRef.current.length !== buttons.length) {
          prevButtonsRef.current = new Array(buttons.length).fill(false)
        }

        const mapButtonIndex = (i: number): number | null => {
          switch (i) {
            case 12:
              return NES_BUTTONS.BUTTON_UP
            case 13:
              return NES_BUTTONS.BUTTON_DOWN
            case 14:
              return NES_BUTTONS.BUTTON_LEFT
            case 15:
              return NES_BUTTONS.BUTTON_RIGHT
            case 0:
            case 2:
              return NES_BUTTONS.BUTTON_A
            case 1:
            case 3:
              return NES_BUTTONS.BUTTON_B
            case 8:
            case 4:
            case 6:
              return NES_BUTTONS.BUTTON_SELECT
            case 9:
            case 5:
            case 7:
              return NES_BUTTONS.BUTTON_START
            default:
              return null
          }
        }

        for (let i = 0; i < buttons.length; i++) {
          const pressed = !!buttons[i]?.pressed
          const wasPressed = prevButtonsRef.current[i] || false
          if (pressed === wasPressed) continue

          const nesButton = mapButtonIndex(i)
          if (nesButton == null) {
            prevButtonsRef.current[i] = pressed
            continue
          }

          if (pressed) {
            nes.buttonDown?.(1, nesButton)
          } else {
            nes.buttonUp?.(1, nesButton)
          }
          prevButtonsRef.current[i] = pressed
        }

        const axisState = {
          left: axes[0] !== undefined && axes[0] <= -AXIS_DEADZONE,
          right: axes[0] !== undefined && axes[0] >= AXIS_DEADZONE,
          up: axes[1] !== undefined && axes[1] <= -AXIS_DEADZONE,
          down: axes[1] !== undefined && axes[1] >= AXIS_DEADZONE,
        }

        const handleAxisChange = (dir: "left" | "right" | "up" | "down", button: number) => {
          const pressed = axisState[dir]
          const wasPressed = prevAxisRef.current[dir]
          if (pressed === wasPressed) return

          if (pressed) {
            nes.buttonDown?.(1, button)
          } else {
            nes.buttonUp?.(1, button)
          }
          prevAxisRef.current[dir] = pressed
        }

        handleAxisChange("left", NES_BUTTONS.BUTTON_LEFT)
        handleAxisChange("right", NES_BUTTONS.BUTTON_RIGHT)
        handleAxisChange("up", NES_BUTTONS.BUTTON_UP)
        handleAxisChange("down", NES_BUTTONS.BUTTON_DOWN)
      }

      frameId = window.requestAnimationFrame(poll)
    }

    frameId = window.requestAnimationFrame(poll)

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [advanceBinding, isPlaying, persistMappingForGamepad, showMapperModal])

  useEffect(() => {
    if (!showMapperModal) return

    if (runningRef.current) {
      pauseNintendo()
      runningRef.current = false
      setIsPlaying(false)
      setStatus("Paused")
    }

    if (gamepadConnected) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      const currentPad = pads[gamepadIndexRef.current ?? -1]
      const padId = currentPad?.id ?? gamepadLabel
      startGuidedMapping(padId)
    } else {
      setMappingDone(false)
      setBindingStep(0)
      bindingStepRef.current = 0
      setActiveBinding(null)
      activeBindingRef.current = null
      waitingForReleaseRef.current = false
      pendingAdvanceRef.current = null
    }

    const container = document.getElementById(containerId)
    const canvas = container?.querySelector("canvas") as HTMLCanvasElement | null
    if (canvas) {
      canvas.style.pointerEvents = "none"
    }

    return () => {
      if (canvas) {
        canvas.style.pointerEvents = "auto"
      }
    }
  }, [showMapperModal, gamepadConnected, gamepadLabel, startGuidedMapping, containerId])

  const leaderboard = useMemo(
    () => (scoresEnabled ? [...scoreHistory].sort((a, b) => b - a).slice(0, 3) : []),
    [scoreHistory, scoresEnabled],
  )
  const topScore = leaderboard[0] ?? null

  if (!game) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" className="mb-4" onClick={onClose}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Games
        </Button>
        <Card className="p-6">
          <p className="font-mono text-sm text-muted-foreground">Game data not found.</p>
        </Card>
      </div>
    )
  }

  const slotMeta = (slotKey: string, index: number) => {
    const slot = saveSlots[slotKey]
    if (!slot) return `Slot ${index + 1} - Empty`
    return `Slot ${index + 1} - ${new Date(slot.savedAt).toLocaleString()}`
  }

  const handleBack = () => {
    captureScore()
    pauseNintendo()
    runningRef.current = false
    setIsPlaying(false)
    setStatus((prev) => (prev === "Running" ? "Paused" : prev))
    onClose()
  }

  const currentBindingLogical =
    showMapperModal && gamepadConnected && !mappingDone ? BINDING_ORDER[bindingStep] ?? null : null

  const mapperMessage = !gamepadConnected
    ? "Press any button on your controller to begin."
    : mappingDone
    ? "Controller configured! Close to resume playing."
    : currentBindingLogical
    ? `Press ${friendlyNameForLogical[currentBindingLogical]} on your controller`
    : "Press the next button on your controller."

  const handleRestartMapping = () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const currentPad = pads[gamepadIndexRef.current ?? -1]
    startGuidedMapping(currentPad?.id ?? gamepadLabel)
  }

  const showResumeLabel = status === "Paused" || resumeFromState
  const startButtonLabel = isPlaying ? "Pause" : showResumeLabel ? "Resume" : "Start"
  const StartButtonIcon = isPlaying ? Pause : Play

  return (
    <>
    <div className="container mx-auto px-4 py-8">
      <Button variant="ghost" className="mb-4" onClick={handleBack}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Games
      </Button>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
      <Card className="overflow-hidden bg-black p-0">
        <div className="relative aspect-[4/3] w-full max-h-[750px] max-w-[1000px] mx-auto bg-gradient-to-br from-secondary/20 to-primary/20">
          <div id={containerId} className="relative h-full w-full" />
          {status !== "Running" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
              <p className="font-mono text-lg text-muted-foreground">
                {status === "Ready" ? "Emulator Ready" : status === "Paused" ? "Paused" : status}
              </p>
                  <p className="absolute bottom-4 font-mono text-xs text-muted-foreground">
                    Canvas: 256x240 (NES Resolution)
                  </p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg" onClick={handleTogglePlay} disabled={isLoading}>
                <StartButtonIcon className="mr-2 h-5 w-5" />
                {startButtonLabel}
              </Button>

              <Button variant="outline" onClick={handleReset} disabled={!nesRef.current}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>

              <Separator orientation="vertical" className="h-8" />

              <div className="flex flex-1 items-center gap-3">
                <Volume2 className="h-5 w-5 text-muted-foreground" />
                <Slider
                  value={[Math.round(volume * 100)]}
                  max={100}
                  step={1}
                  className="w-full max-w-[200px]"
                  onValueChange={(value) => setVolume((value[0] ?? 0) / 100)}
                />
                <span className="text-sm text-muted-foreground">{Math.round(volume * 100)}%</span>
                <Button
                  variant={isMuted ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => setIsMuted((prev) => !prev)}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <h3 className="mb-4 font-mono font-semibold text-foreground">Save States</h3>
            <div className="space-y-3">
              <Select value={selectedSlot} onValueChange={setSelectedSlot}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {slotOrder.map((slotKey, index) => (
                    <SelectItem key={slotKey} value={slotKey}>
                      {slotMeta(slotKey, index)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveState}
                  disabled={!nesRef.current || isLoading || !isAuthed}
                  title={!isAuthed ? "Sign in to enable save slots" : undefined}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadState}
                  disabled={!saveSlots[selectedSlot] || isLoading || !isAuthed}
                  title={!isAuthed ? "Sign in to enable save slots" : undefined}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Load
                </Button>
              </div>
              {!isAuthed && (
                <p className="text-xs text-muted-foreground">
                  Sign in to unlock save slots for this game.
                </p>
              )}
              {saveSlots[selectedSlot] && (
                <p className="text-xs text-muted-foreground">
                  Saved {new Date(saveSlots[selectedSlot]?.savedAt ?? Date.now()).toLocaleString()}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="mb-4 font-mono font-semibold text-foreground">
              {scoresEnabled ? "High Scores" : "Stats"}
            </h3>
            {scoresEnabled ? (
              <div className="space-y-2 text-sm">
                {leaderboard.length ? (
                  leaderboard.map((score, idx) => (
                    <div key={`${score}-${idx}`} className="flex justify-between">
                      <span className="text-muted-foreground">{idx + 1}. Run</span>
                      <span className="font-mono font-semibold text-foreground">{formatScore(score)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">No scores yet</span>
                    <span className="font-mono font-semibold text-primary">—</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="font-semibold text-primary">Your Best</span>
                  <span className="font-mono font-semibold text-primary">{formatScore(topScore)}</span>
                </div>
                {scoresEnabled && currentScore != null && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Last capture</span>
                    <span className="font-mono font-semibold text-foreground">{formatScore(currentScore)}</span>
                  </div>
                )}
                {!isAuthed && (
                  <p className="pt-2 text-[11px] text-muted-foreground">
                    Playing as guest. Sign in to keep scores with your account.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Scores are not tracked for this title.</p>
                <p className="italic">Stat mode: {game.statMode}. Tracking support coming soon.</p>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="mb-4 font-mono font-semibold text-foreground">Controls</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="grid grid-cols-2 gap-2">
                <span>Arrow Keys</span>
                <span className="text-foreground">D-Pad</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span>Z</span>
                <span className="text-foreground">B Button</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span>X</span>
                <span className="text-foreground">A Button</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span>Enter</span>
                <span className="text-foreground">Start</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span>Shift</span>
                <span className="text-foreground">Select</span>
              </div>
            </div>
            <div className="pt-4 space-y-2 text-xs text-muted-foreground">
              {gamepadConnected ? (
                <>
                  <p className="text-sm text-foreground">
                    Controller: <span className="font-semibold">{gamepadLabel || "Gamepad"}</span>
                  </p>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setShowMapperModal(true)}>
                    Configure Controller
                  </Button>
                  {!mappingDone && (
                    <p className="text-[11px]">Use the guided mapper to bind each button.</p>
                  )}
                </>
              ) : (
                <p>Connect a USB/Bluetooth controller and press a button to start mapping.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
    {showMapperModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closeMapperModal}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            style={{ background: NES_CONTROLLER_BG }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex min-h-[360px] flex-col items-center justify-center gap-4 p-10 text-center text-white">
              <div className="text-xl font-bold font-mono drop-shadow">{mapperMessage}</div>
              <div className="text-[0.65rem] font-semibold uppercase tracking-wide text-white/80">
                Mapping order: Up → Down → Left → Right → Select → Start → B → A
              </div>
              {currentBindingLogical && !mappingDone && (
                <div className="rounded-full bg-white/20 px-4 py-2 text-[0.7rem] font-semibold">
                  Waiting for {friendlyNameForLogical[currentBindingLogical]}
                </div>
              )}
              {mappingDone && (
                <div className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold shadow-lg">
                  Controller mapped! Close to resume the game.
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="secondary"
                  onClick={handleRestartMapping}
                  className="border border-white/30 bg-white/10 text-white hover:bg-white/20"
                >
                  Restart Mapping
                </Button>
                <Button
                  variant="secondary"
                  onClick={closeMapperModal}
                  className="border border-white/30 bg-white/10 text-white hover:bg-white/20"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
