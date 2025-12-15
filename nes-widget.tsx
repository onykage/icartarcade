"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"
import WidgetCard from "./ui/WidgetCard"
import WidgetGroup from "./ui/WidgetGroup"
import {
  applyVolumeSettings,
  ensureNintendoLoaded,
  loadNintendoRom,
  pauseNintendo,
  resetNintendo,
  resumeNintendo,
} from "@/lib/nintendo/loader"
import { withBasePath } from "@/lib/utils"

const NES_WIDTH = 256
const NES_HEIGHT = 224
const AXIS_DEADZONE = 0.4
const BASE_SCALE = 3.28125 // scales to ~840px width (used only for scale reference)

const debugLog = (...args: any[]) => {
  if (typeof window === "undefined") return
  const search = window.location.search || ""
  const enabled = search.includes("nesDebug=1")
  if (!enabled) return
  // eslint-disable-next-line no-console
  console.log("[NES]", ...args)
}

const ROMS = [
  { id: "smb", label: "Super Mario Bros.", file: "smb.nes" },
  { id: "smb3", label: "Super Mario Bros. 3", file: "smb3.nes" },
  { id: "drmario", label: "Dr. Mario", file: "drmario.nes" },
  { id: "metroid", label: "Metroid", file: "metroid.nes" },
  { id: "megaman2", label: "Mega Man 2", file: "megaman2.nes" },
  { id: "kidicarus", label: "Kid Icarus", file: "kidicarus.nes" },
  { id: "castlevan1", label: "Castlevania", file: "castlevan1.nes" },
  { id: "goonies2", label: "The Goonies II", file: "goonies2.nes" },
  { id: "skyshark", label: "Sky Shark", file: "skyshark.nes" },
  { id: "tcsurf", label: "T & C Surf Designs", file: "tcsurf.nes" },
  { id: "zelda1", label: "The legend of Zelda", file: "zelda1.nes" },
  { id: "punchout", label: "Punch Out!!", file: "punchout.nes" },
] as const

const SMB_SCORE_START = 0x07dd
const SMB_SCORE_DIGITS = 6

function readSmbScoreFromMemory(nes: any): number | null {
  if (!nes || !nes.cpu || !nes.cpu.mem) return null
  const mem = nes.cpu.mem as Uint8Array | number[]

  const digits: number[] = []
  for (let i = 0; i < SMB_SCORE_DIGITS; i++) {
    const raw = (mem[SMB_SCORE_START + i] ?? 0) as number
    const d = raw & 0x0f
    if (d < 0 || d > 9) return null
    digits.push(d)
  }

  const scoreStr = digits.join("") + "0"
  const score = parseInt(scoreStr, 10)
  if (!Number.isFinite(score) || score <= 0) return null
  return score
}

const SMB3_SCORE_ADDR = 0x0715

function readSmb3ScoreFromMemory(nes: any): number | null {
  if (!nes || !nes.cpu || !nes.cpu.mem) return null
  const mem = nes.cpu.mem as Uint8Array | number[]

  const b0 = (mem[SMB3_SCORE_ADDR] ?? 0) as number
  const b1 = (mem[SMB3_SCORE_ADDR + 1] ?? 0) as number
  const b2 = (mem[SMB3_SCORE_ADDR + 2] ?? 0) as number

  const raw = (b0 << 16) | (b1 << 8) | b2
  if (!Number.isFinite(raw) || raw <= 0) return null

  const score = raw * 10
  if (!Number.isFinite(score) || score <= 0) return null

  return score
}

const CASTLEVANIA_SCORE_ADDR = 0x07fc

function readCastlevaniaScoreFromMemory(nes: any): number | null {
  if (!nes || !nes.cpu || !nes.cpu.mem) return null
  const mem = nes.cpu.mem as Uint8Array | number[]

  const b0 = (mem[CASTLEVANIA_SCORE_ADDR] ?? 0) as number
  const b1 = (mem[CASTLEVANIA_SCORE_ADDR + 1] ?? 0) as number
  const b2 = (mem[CASTLEVANIA_SCORE_ADDR + 2] ?? 0) as number

  const bytes = [b2, b1, b0]
  const digits: number[] = []

  for (const b of bytes) {
    const hi = (b >> 4) & 0x0f
    const lo = b & 0x0f
    if (hi > 9 || lo > 9) return null
    digits.push(hi, lo)
  }

  const scoreStr = digits.join("").replace(/^0+/, "") || "0"
  const score = parseInt(scoreStr, 10)
  if (!Number.isFinite(score) || score < 0) return null
  return score
}

type ScoreReader = (nes: any) => number | null

const SCORE_READERS: { test: (name: string) => boolean; read: ScoreReader }[] = [
  {
    test: (name) => name.includes("smb3"),
    read: (nes) => readSmb3ScoreFromMemory(nes),
  },
  {
    test: (name) => name.includes("smb") && !name.includes("smb3"),
    read: (nes) => readSmbScoreFromMemory(nes),
  },
  {
    test: (name) => name.includes("castlevan"),
    read: (nes) => readCastlevaniaScoreFromMemory(nes),
  },
]

function readScoreForRomName(romName: string, nes: any): number | null {
  const name = romName.toLowerCase()
  for (const entry of SCORE_READERS) {
    try {
      if (entry.test(name)) {
        return entry.read(nes)
      }
    } catch {
      //
    }
  }
  return null
}

type NesLogical = "A" | "B" | "SELECT" | "START" | "UP" | "DOWN" | "LEFT" | "RIGHT"

type NesMappingEntry =
  | { type: "button"; index: number }
  | { type: "axis"; axis: number; direction: -1 | 1; threshold: number }

type NesMapping = Partial<Record<NesLogical, NesMappingEntry>>

const NES_MAPPING_STORAGE_PREFIX = "nesControllerMapping:"
const NES_SCORE_STORAGE_PREFIX = "nesWidgetScores:"
const NES_ROM_STATE_PREFIX = "nesWidgetPerRomState:"
const BINDING_ORDER: NesLogical[] = [
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "SELECT",
  "START",
  "B",
  "A",
]
const NES_CONTROLLER_BG = `url('${withBasePath("/images/nes-controller-svgrepo-com.png")}')`

const NINTENDO_BUTTONS = {
  BUTTON_A: 0,
  BUTTON_B: 1,
  BUTTON_SELECT: 2,
  BUTTON_START: 3,
  BUTTON_UP: 4,
  BUTTON_DOWN: 5,
  BUTTON_LEFT: 6,
  BUTTON_RIGHT: 7,
} as const

const stateKeyForRom = (rom: string) => `${NES_ROM_STATE_PREFIX}${rom}`

type Status =
  | "Idle"
  | "Loading ROM"
  | "Ready"
  | "Running"
  | "Paused"
  | "Error loading ROM"
  | "No frame available for screenshot"
  | "Screenshot failed"

export function NESGame() {
  const containerId = useMemo(
    () => `nes-embed-${Math.random().toString(36).slice(2, 8)}`,
    []
  )

  const nesRef = useRef<any | null>(null)
  const runningRef = useRef(false)

  const rootRef = useRef<HTMLElement | null>(null)

  const [status, setStatus] = useState<Status>("Idle")
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [romFile, setRomFile] = useState<string>("smb.nes")
  const [showMapperModal, setShowMapperModal] = useState(false)
  const [bindingStep, setBindingStep] = useState(0)
  const [mappingDone, setMappingDone] = useState(false)
  const [cheatInput, setCheatInput] = useState("")

  const [ramDump, setRamDump] = useState<string>("")
  const [hasSavedState, setHasSavedState] = useState(false)
  const [resumeFromLoadPending, setResumeFromLoadPending] = useState(false)

  const [volume, setVolume] = useState(0.8)

  const [scores, setScores] = useState<number[]>([])
  const [currentScore, setCurrentScore] = useState<number | null>(null)
  const [showScores, setShowScores] = useState(false)

  const [gamepadConnected, setGamepadConnected] = useState(false)
  const [gamepadLabel, setGamepadLabel] = useState<string | null>(null)
  const gamepadIndexRef = useRef<number | null>(null)
  const prevButtonsRef = useRef<boolean[]>([])
  const prevAxisRef = useRef<{
    up: boolean
    down: boolean
    left: boolean
    right: boolean
  }>({
    up: false,
    down: false,
    left: false,
    right: false,
  })
  const waitingForReleaseRef = useRef(false)
  const pendingAdvanceRef = useRef<NesLogical | null>(null)
  const bindingStepRef = useRef(0)

  const prevLogicalRef = useRef<Record<NesLogical, boolean>>({
    A: false,
    B: false,
    SELECT: false,
    START: false,
    UP: false,
    DOWN: false,
    LEFT: false,
    RIGHT: false,
  })
  const [mapping, setMapping] = useState<NesMapping>({})
  const [activeBinding, setActiveBinding] = useState<NesLogical | null>(null)

  const mappingRef = useRef<NesMapping>({})
  const activeBindingRef = useRef<NesLogical | null>(null)

  useEffect(() => {
    mappingRef.current = mapping
  }, [mapping])

  useEffect(() => {
    activeBindingRef.current = activeBinding
  }, [activeBinding])
  useEffect(() => {
    bindingStepRef.current = bindingStep
  }, [bindingStep])

  useEffect(() => {
    void ensureNintendoLoaded()
  }, [])

  useEffect(() => {
    applyVolumeSettings(volume, isMuted)
    debugLog("volume set", { volume, isMuted })
  }, [volume, isMuted])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(`${NES_SCORE_STORAGE_PREFIX}${romFile}`)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const cleaned = parsed.filter((v) => typeof v === "number" && Number.isFinite(v))
          setScores(cleaned)
          return
        }
      }
    } catch {
      //
    }
    setScores([])
  }, [romFile])

  const persistScores = useCallback(
    (next: number[]) => {
      if (typeof window === "undefined") return
      try {
        window.localStorage.setItem(
          `${NES_SCORE_STORAGE_PREFIX}${romFile}`,
          JSON.stringify(next)
        )
      } catch {
        //
      }
    },
    [romFile]
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const key = stateKeyForRom(romFile)
      const raw = window.localStorage.getItem(key)
      setHasSavedState(!!raw)
    } catch {
      setHasSavedState(false)
    }
  }, [romFile])

  const captureScoreFromEmulator = useCallback(() => {
    const nes = nesRef.current
    if (!nes) return

    const score = readScoreForRomName(romFile, nes)
    if (score == null) return

    setCurrentScore(score)
    setScores((prev) => {
      const merged = [...prev, score]
      const trimmed = merged.slice(-10)
      persistScores(trimmed)
      return trimmed
    })
  }, [persistScores, romFile])

  const topScore = scores.length ? Math.max(...scores) : null
  const topTenSorted = [...scores].sort((a, b) => b - a).slice(0, 10)

  const handleSaveState = useCallback(() => {
    if (typeof window === "undefined") return
    const nes = nesRef.current
    if (!nes || typeof nes.toJSON !== "function") return

    try {
      const state = nes.toJSON()
      const payload = { romFile, state }
      const key = stateKeyForRom(romFile)
      window.localStorage.setItem(key, JSON.stringify(payload))
      setHasSavedState(true)
      debugLog("Saved state for ROM", romFile)
      setStatus("Ready")
    } catch (err) {
      debugLog("Failed to save state", err)
    }
  }, [romFile])

  const loadRomAndStart = useCallback(
    async (romOverride?: string) => {
      const target = romOverride ?? romFile
      try {
        setStatus("Loading ROM")
        runningRef.current = false
        setIsRunning(false)

      const romUrl = withBasePath(`/roms/${target}`)
      const response = await fetch(romUrl)
      if (!response.ok) {
        throw new Error("Failed to fetch ROM")
      }
      const romBuffer = await response.arrayBuffer()
      const nes = await loadNintendoRom(containerId, target, romBuffer)
      nesRef.current = nes
      applyVolumeSettings(volume, isMuted)

      // Lower canvas z-index so overlays (mapper, modals) sit above Nintendo.js canvas
      const containerEl = document.getElementById(containerId)
      const canvasEl = containerEl?.querySelector("canvas") as HTMLCanvasElement | null
      if (canvasEl) {
        canvasEl.style.zIndex = "1"
        canvasEl.style.position = "relative"
        canvasEl.style.pointerEvents = "auto"
      }

      setStatus("Running")
      runningRef.current = true
      setIsRunning(true)
      setResumeFromLoadPending(false)
      } catch (err) {
        console.error(err)
        setStatus("Error loading ROM")
        setIsRunning(false)
        runningRef.current = false
      }
    },
    [containerId, isMuted, romFile, volume]
  )

  const handlePause = useCallback(() => {
    if (!nesRef.current) return
    if (runningRef.current) {
      pauseNintendo()
      runningRef.current = false
      setIsRunning(false)
      setStatus("Paused")
    } else {
      resumeNintendo()
      runningRef.current = true
      setIsRunning(true)
      setStatus("Running")
      if (resumeFromLoadPending) {
        setResumeFromLoadPending(false)
      }
    }
  }, [resumeFromLoadPending])

  const handleReset = useCallback(() => {
    const nes = nesRef.current
    if (!nes) return
    resetNintendo()
    runningRef.current = false
    setIsRunning(false)
    setStatus("Ready")
  }, [])

  const handleLoadState = useCallback(async () => {
    if (typeof window === "undefined") return
    const key = stateKeyForRom(romFile)

    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      raw = null
    }
    if (!raw) {
      setHasSavedState(false)
      return
    }

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      debugLog("Failed to parse saved state", err)
      return
    }

    const snapshotState =
      parsed && typeof parsed === "object" && "state" in parsed ? parsed.state : parsed

    try {
      await loadRomAndStart(romFile)
      pauseNintendo()
      runningRef.current = false
      setIsRunning(false)
      const nes = nesRef.current
      if (nes && typeof nes.fromJSON === "function" && snapshotState) {
        nes.fromJSON(snapshotState)
        debugLog("State restored from saved slot", romFile)
        setStatus("Paused")
        setResumeFromLoadPending(true)
      }
    } catch (err) {
      debugLog("Failed to load state", err)
    }
  }, [loadRomAndStart, romFile])

  const handleStartStop = useCallback(() => {
    if (runningRef.current) {
      captureScoreFromEmulator()
      pauseNintendo()
      runningRef.current = false
      setIsRunning(false)
      setStatus("Paused")
    } else {
      const nes = nesRef.current
      if (nes) {
        resumeNintendo()
        runningRef.current = true
        setIsRunning(true)
        setStatus("Running")
      } else {
        void loadRomAndStart()
      }
    }
  }, [captureScoreFromEmulator, loadRomAndStart])

  const handleRomChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const file = e.target.value
      runningRef.current = false
      setIsRunning(false)
      setRomFile(file)
      debugLog("handleRomChange: loading", { file })
      void loadRomAndStart(file)
    },
    [loadRomAndStart]
  )

  const handleDumpMemory = useCallback(() => {
    const nes = nesRef.current
    if (!nes || !nes.cpu || !nes.cpu.mem) {
      setRamDump("No NES CPU memory available.")
      return
    }
    const mem = nes.cpu.mem as Uint8Array | number[]

    const length = (mem as any).length ?? 0x800
    const max = Math.min(length, 0x800)

    const lines: string[] = []
    for (let addr = 0; addr < max; addr += 16) {
      const bytes: string[] = []
      for (let i = 0; i < 16 && addr + i < max; i++) {
        const value = (mem[addr + i] ?? 0) as number
        bytes.push(value.toString(16).padStart(2, "0"))
      }
      lines.push(addr.toString(16).padStart(4, "0") + ": " + bytes.join(" "))
    }

    setRamDump(lines.join("\n"))
  }, [])

  const handleScreenshot = useCallback(() => {
    const container = typeof document !== "undefined" ? document.getElementById(containerId) : null
    const canvas = container?.querySelector("canvas") as HTMLCanvasElement | null
    if (!canvas) {
      setStatus("No frame available for screenshot")
      return
    }
    try {
      const dataUrl = canvas.toDataURL("image/png")
      const link = document.createElement("a")
      link.href = dataUrl
      link.download = `${romFile.replace(/\\.nes$/i, "") || "nes"}-screenshot.png`
      link.click()
    } catch (err) {
      debugLog("screenshot failed", err)
      setStatus("Screenshot failed")
    }
  }, [containerId, romFile])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handleBlur = () => {
      if (runningRef.current) {
        pauseNintendo()
        runningRef.current = false
        setIsRunning(false)
        setStatus("Paused")
      }
    }
    const handleClick = (e: MouseEvent) => {
      if (!runningRef.current) return
      const root = rootRef.current
      if (!root) return
      const target = e.target as Node | null
      if (target && !root.contains(target)) {
        pauseNintendo()
        runningRef.current = false
        setIsRunning(false)
        setStatus("Paused")
      }
    }
    window.addEventListener("blur", handleBlur)
    window.addEventListener("mousedown", handleClick)
    return () => {
      window.removeEventListener("blur", handleBlur)
      window.removeEventListener("mousedown", handleClick)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handleClick = (e: MouseEvent) => {
      if (!runningRef.current) return
      const root = rootRef.current
      if (!root) return
      const target = e.target as Node | null
      if (target && !root.contains(target)) {
        pauseNintendo()
        runningRef.current = false
        setIsRunning(false)
        setStatus("Paused")
      }
    }
    window.addEventListener("mousedown", handleClick)
    return () => window.removeEventListener("mousedown", handleClick)
  }, [])

  useEffect(() => {
    return () => {
      pauseNintendo()
      runningRef.current = false
      nesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const mapKey = (code: string): number | null => {
      switch (code) {
        case "ArrowUp":
          return NINTENDO_BUTTONS.BUTTON_UP
        case "ArrowDown":
          return NINTENDO_BUTTONS.BUTTON_DOWN
        case "ArrowLeft":
          return NINTENDO_BUTTONS.BUTTON_LEFT
        case "ArrowRight":
          return NINTENDO_BUTTONS.BUTTON_RIGHT
        case "KeyZ":
          return NINTENDO_BUTTONS.BUTTON_A
        case "KeyX":
          return NINTENDO_BUTTONS.BUTTON_B
        case "Enter":
          return NINTENDO_BUTTONS.BUTTON_START
        case "ShiftRight":
        case "ShiftLeft":
          return NINTENDO_BUTTONS.BUTTON_SELECT
        default:
          return null
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isRunning || isCollapsed) return
      const nes = nesRef.current
      if (!nes) return
      const button = mapKey(e.code)
      if (button == null) return
      e.preventDefault()
      try {
        nes.buttonDown(1, button)
      } catch (err) {
        debugLog("buttonDown failed", err)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isRunning || isCollapsed) return
      const nes = nesRef.current
      if (!nes) return
      const button = mapKey(e.code)
      if (button == null) return
      e.preventDefault()
      try {
        nes.buttonUp(1, button)
      } catch (err) {
        debugLog("buttonUp failed", err)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [isCollapsed, isRunning])

  const loadMappingForGamepad = useCallback((id: string): NesMapping => {
    if (typeof window === "undefined") return {}
    try {
      const raw = window.localStorage.getItem(`${NES_MAPPING_STORAGE_PREFIX}${id}`)
      if (!raw) return {}
      return JSON.parse(raw) as NesMapping
    } catch {
      return {}
    }
  }, [])

  const persistMappingForGamepad = useCallback((id: string, next: NesMapping) => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(
        `${NES_MAPPING_STORAGE_PREFIX}${id}`,
        JSON.stringify(next)
      )
    } catch {
      //
    }
  }, [])

  const startGuidedMapping = useCallback((id?: string | null) => {
    const blank: NesMapping = {}
    setMapping(blank)
    mappingRef.current = blank
    waitingForReleaseRef.current = false
    pendingAdvanceRef.current = null
    if (id) {
      try {
        window.localStorage.setItem(
          `${NES_MAPPING_STORAGE_PREFIX}${id}`,
          JSON.stringify(blank)
        )
      } catch {
        //
      }
    }
    setMappingDone(false)
    setBindingStep(0)
    bindingStepRef.current = 0
    const next = BINDING_ORDER[0]
    setActiveBinding(next)
    activeBindingRef.current = next
  }, [])

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
        return
      }
      const next = BINDING_ORDER[nextIndex]
      bindingStepRef.current = nextIndex
      setBindingStep(nextIndex)
      setActiveBinding(next)
      activeBindingRef.current = next
    },
    [showMapperModal]
  )


  useEffect(() => {
    if (typeof window === "undefined") return

    const updateFromNavigator = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      const first = pads.find((p) => p != null)
      if (first) {
        gamepadIndexRef.current = first!.index
        setGamepadConnected(true)
        setGamepadLabel(first!.id)
        const loaded = loadMappingForGamepad(first!.id)
        setMapping(loaded)
        setActiveBinding(null)
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
    }

    const handleDisconnect = (event: GamepadEvent) => {
      if (gamepadIndexRef.current === event.gamepad.index) {
        gamepadIndexRef.current = null
        setGamepadConnected(false)
        setGamepadLabel(null)
        setMapping({})
        setActiveBinding(null)
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
          const axisEngaged = axes.some((v) => Math.abs(v ?? 0) >= AXIS_DEADZONE)
          if (anyPressed || axisEngaged) {
            frameId = window.requestAnimationFrame(poll)
            return
          }
          waitingForReleaseRef.current = false
          const pending = pendingAdvanceRef.current
          pendingAdvanceRef.current = null
          if (pending) {
            advanceBinding(pending)
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
            persistMappingForGamepad(gp.id, nextMapping)
            updated = true
            break
          }
        }

        if (
          !updated &&
          (binding === "UP" ||
            binding === "DOWN" ||
            binding === "LEFT" ||
            binding === "RIGHT")
        ) {
          for (let axisIndex = 0; axisIndex < axes.length; axisIndex++) {
            const v = axes[axisIndex]
            if (v == null) continue

            if (binding === "LEFT" && v <= -AXIS_DEADZONE) {
              nextMapping[binding] = {
                type: "axis",
                axis: axisIndex,
                direction: -1,
                threshold: -AXIS_DEADZONE,
              }
              mappingRef.current = nextMapping
              setMapping(nextMapping)
              persistMappingForGamepad(gp.id, nextMapping)
              updated = true
              break
            }

            if (binding === "RIGHT" && v >= AXIS_DEADZONE) {
              nextMapping[binding] = {
                type: "axis",
                axis: axisIndex,
                direction: 1,
                threshold: AXIS_DEADZONE,
              }
              mappingRef.current = nextMapping
              setMapping(nextMapping)
              persistMappingForGamepad(gp.id, nextMapping)
              updated = true
              break
            }

            if (binding === "UP" && v <= -AXIS_DEADZONE) {
              nextMapping[binding] = {
                type: "axis",
                axis: axisIndex,
                direction: -1,
                threshold: -AXIS_DEADZONE,
              }
              mappingRef.current = nextMapping
              setMapping(nextMapping)
              persistMappingForGamepad(gp.id, nextMapping)
              updated = true
              break
            }

            if (binding === "DOWN" && v >= AXIS_DEADZONE) {
              nextMapping[binding] = {
                type: "axis",
                axis: axisIndex,
                direction: 1,
                threshold: AXIS_DEADZONE,
              }
              mappingRef.current = nextMapping
              setMapping(nextMapping)
              persistMappingForGamepad(gp.id, nextMapping)
              updated = true
              break
            }
          }
        }

        if (updated) {
          if (showMapperModal) {
            waitingForReleaseRef.current = true
            pendingAdvanceRef.current = binding
          } else {
            activeBindingRef.current = null
            setActiveBinding(null)
          }
          frameId = window.requestAnimationFrame(poll)
          return
        }
      }

      if (!nes || !isRunning || isCollapsed) {
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
        const logicals: NesLogical[] = [
          "A",
          "B",
          "SELECT",
          "START",
          "UP",
          "DOWN",
          "LEFT",
          "RIGHT",
        ]

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
              return value <= (entry.threshold ?? -0.4)
            }
            return value >= (entry.threshold ?? 0.4)
          }

          return false
        }

        const prev = prevLogicalRef.current

        const nesButtonForLogical: Record<NesLogical, number> = {
          A: NINTENDO_BUTTONS.BUTTON_A,
          B: NINTENDO_BUTTONS.BUTTON_B,
          SELECT: NINTENDO_BUTTONS.BUTTON_SELECT,
          START: NINTENDO_BUTTONS.BUTTON_START,
          UP: NINTENDO_BUTTONS.BUTTON_UP,
          DOWN: NINTENDO_BUTTONS.BUTTON_DOWN,
          LEFT: NINTENDO_BUTTONS.BUTTON_LEFT,
          RIGHT: NINTENDO_BUTTONS.BUTTON_RIGHT,
        }

        for (const logical of logicals) {
          const pressed = isPressedLogical(logical)
          const wasPressed = prev[logical]
          if (pressed === wasPressed) continue

          const nesButton = nesButtonForLogical[logical]
          if (pressed) {
            nes.buttonDown(1, nesButton)
          } else {
            nes.buttonUp(1, nesButton)
          }
          prev[logical] = pressed
        }
      } else {
        if (prevButtonsRef.current.length !== buttons.length) {
          prevButtonsRef.current = new Array(buttons.length).fill(false)
        }

        const mapButtonIndex = (i: number): number | null => {
          switch (i) {
            case 12:
              return NINTENDO_BUTTONS.BUTTON_UP
            case 13:
              return NINTENDO_BUTTONS.BUTTON_DOWN
            case 14:
              return NINTENDO_BUTTONS.BUTTON_LEFT
            case 15:
              return NINTENDO_BUTTONS.BUTTON_RIGHT
            case 0:
            case 2:
              return NINTENDO_BUTTONS.BUTTON_A
            case 1:
            case 3:
              return NINTENDO_BUTTONS.BUTTON_B
            case 8:
            case 4:
            case 6:
              return NINTENDO_BUTTONS.BUTTON_SELECT
            case 9:
            case 5:
            case 7:
              return NINTENDO_BUTTONS.BUTTON_START
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
            nes.buttonDown(1, nesButton)
          } else {
            nes.buttonUp(1, nesButton)
          }
          prevButtonsRef.current[i] = pressed
        }

        const axisState = {
          left: axes[0] !== undefined && axes[0] <= -AXIS_DEADZONE,
          right: axes[0] !== undefined && axes[0] >= AXIS_DEADZONE,
          up: axes[1] !== undefined && axes[1] <= -AXIS_DEADZONE,
          down: axes[1] !== undefined && axes[1] >= AXIS_DEADZONE,
        }

        const prevAxis = prevAxisRef.current

        const handleAxisChange = (
          dir: "left" | "right" | "up" | "down",
          button: number
        ) => {
          const pressed = axisState[dir]
          const wasPressed = prevAxis[dir]
          if (pressed === wasPressed) return

          if (pressed) {
            nes.buttonDown(1, button)
          } else {
            nes.buttonUp(1, button)
          }
          prevAxis[dir] = pressed
        }

        handleAxisChange("left", NINTENDO_BUTTONS.BUTTON_LEFT)
        handleAxisChange("right", NINTENDO_BUTTONS.BUTTON_RIGHT)
        handleAxisChange("up", NINTENDO_BUTTONS.BUTTON_UP)
        handleAxisChange("down", NINTENDO_BUTTONS.BUTTON_DOWN)
      }

      frameId = window.requestAnimationFrame(poll)
    }

    frameId = window.requestAnimationFrame(poll)

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [advanceBinding, isCollapsed, isRunning, persistMappingForGamepad, showMapperModal])

  useEffect(() => {
    if (!showMapperModal) return
    if (runningRef.current) {
      pauseNintendo()
      runningRef.current = false
      setIsRunning(false)
      setStatus("Paused")
    }

    if (gamepadConnected) {
      const currentPad =
        typeof navigator !== "undefined" && navigator.getGamepads
          ? navigator.getGamepads()[gamepadIndexRef.current ?? -1]
          : null
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

    // While mapper is open, block canvas pointer events to ensure clicks land on the modal
    const containerEl = document.getElementById(containerId)
    const canvasEl = containerEl?.querySelector("canvas") as HTMLCanvasElement | null
    if (canvasEl) {
      canvasEl.style.pointerEvents = "none"
    }
    return () => {
      if (canvasEl) {
        canvasEl.style.pointerEvents = "auto"
      }
    }
  }, [gamepadConnected, gamepadLabel, showMapperModal, startGuidedMapping])

  const canvasWrapperClass =
    "relative h-[600px] w-full overflow-hidden rounded-lg border bg-black"

  const canvasWrapperStyle = {
    width: "940px",
    height: "705px", // keep 4:3 ratio
  }

  const mainCanvas = (
    <div className="flex flex-col items-center gap-3">
      <div className={canvasWrapperClass} style={canvasWrapperStyle}>
        <div
          id={containerId}
          className={`h-full w-full relative z-0 ${showMapperModal ? "pointer-events-none" : ""}`}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">
        Controls: Arrow keys, Z (B), X (A), Enter (Start), Right Shift (Select)
      </div>
    </div>
  )

  const sidebarFull = (
    <>
      <WidgetGroup>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-muted-foreground">Status</div>
          <button
            type="button"
            onClick={handleSaveState}
            disabled={!nesRef.current}
            className="inline-flex items-center justify-center rounded-md border bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save
          </button>
        </div>
        <div className="mt-1 text-sm">{status}</div>
      </WidgetGroup>

      <WidgetGroup title="High Scores">
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Top score
            </div>
            <div className="text-base font-semibold">
              {topScore != null ? topScore.toLocaleString() : "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowScores((v) => !v)}
            className="rounded-md border bg-background px-2 py-1 text-[11px] hover:bg-accent"
          >
            {showScores ? "Hide list" : "Show top 10"}
          </button>
        </div>
        {currentScore != null && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            Last captured:{" "}
            <span className="font-semibold text-foreground">
              {currentScore.toLocaleString()}
            </span>
          </div>
        )}
        {showScores && (
          <ol className="mt-2 space-y-1 text-[11px]">
            {topTenSorted.length ? (
              topTenSorted.map((score, idx) => (
                <li
                  key={`${score}-${idx}`}
                  className="flex items-center justify-between"
                >
                  <span className="text-muted-foreground">#{idx + 1}</span>
                  <span className="font-semibold">{score.toLocaleString()}</span>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No scores yet.</li>
            )}
          </ol>
        )}
      </WidgetGroup>

      <WidgetGroup>
        <label className="block mb-1 text-[11px] font-semibold">ROM</label>
        <select
          value={romFile}
          onChange={handleRomChange}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
        >
          {ROMS.map((rom) => (
            <option key={rom.id} value={rom.file}>
              {rom.label}
            </option>
          ))}
        </select>
      </WidgetGroup>

      <WidgetGroup>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleStartStop}
            disabled={status === "Loading ROM"}
            className="flex-1 inline-flex items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? "Stop" : "Start"}
          </button>

          <button
            type="button"
            onClick={handlePause}
            disabled={!nesRef.current}
            className={`flex-1 inline-flex items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 ${
              resumeFromLoadPending ? "border-emerald-500 text-emerald-500" : ""
            }`}
          >
            {isRunning ? "Pause" : "Resume"}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleLoadState()
            }}
            disabled={!nesRef.current || !hasSavedState}
            className="flex-1 inline-flex items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            Load
          </button>
        </div>
      </WidgetGroup>

      <WidgetGroup title="Audio">
        <div className="mb-2 flex items-center justify-between">
          <div />
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            className="h-1 w-full cursor-pointer align-middle"
          />
          <span className="w-10 text-right text-[11px] text-muted-foreground">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </WidgetGroup>

      <WidgetGroup title="Extras">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleScreenshot}
            className="w-full rounded-md border bg-background px-3 py-2 text-[0.75rem] font-semibold hover:bg-accent"
          >
            Save screenshot
          </button>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-muted-foreground">
              Cheat codes (placeholder)
            </div>
            <input
              type="text"
              value={cheatInput}
              onChange={(e) => setCheatInput(e.target.value)}
              placeholder="e.g. GAMEGENIE code"
              className="w-full rounded-md border bg-background px-2 py-1 text-[12px]"
            />
            <button
              type="button"
              disabled
              className="w-full rounded-md border bg-background px-3 py-2 text-[0.7rem] font-semibold text-muted-foreground"
              title="Cheat support coming soon"
            >
              Apply cheat (coming soon)
            </button>
          </div>
        </div>
      </WidgetGroup>

      <WidgetGroup title="Controller">
        <div className="mt-1">
          {gamepadConnected ? (
            <div className="space-y-2">
              <div className="text-emerald-500">
                Connected:{" "}
                <span className="font-semibold">{gamepadLabel || "Gamepad"}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMapperModal(true)}
                className="w-full rounded-md border bg-background px-3 py-2 text-[0.6rem] font-semibold font-mono hover:bg-accent"
              >
                Open guided controller mapper
              </button>
            </div>
          ) : (
            <span className="text-muted-foreground">
              No controller detected. Connect a USB NES-style controller and press a
              button.
            </span>
          )}
        </div>
      </WidgetGroup>

      <WidgetGroup title="RAM Snapshot">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="font-semibold uppercase tracking-wide text-muted-foreground">
            RAM Snapshot
          </div>
          <button
            type="button"
            onClick={handleDumpMemory}
            className="rounded-md border bg-background px-2 py-0.5 text-[10px] hover:bg-accent"
          >
            Dump
          </button>
        </div>
        <textarea
          className="h-40 w-full resize-none rounded-md border bg-background p-1 text-[10px] font-mono"
          value={ramDump}
          readOnly
          spellCheck={false}
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          Copy this into chat so we can inspect raw NES RAM.
        </p>
      </WidgetGroup>
    </>
  )

  const sidebarPopup = (
    <div className="space-y-3">
      <WidgetGroup>
        <div className="text-xs font-semibold text-muted-foreground">Status</div>
        <div className="mt-1 text-sm">{status}</div>
      </WidgetGroup>

      <WidgetGroup>
        <label className="block mb-1 text-[11px] font-semibold">ROM</label>
        <select
          value={romFile}
          onChange={handleRomChange}
          className="w-full rounded-md border bg-background px-2 py-1 text-xs"
        >
          {ROMS.map((rom) => (
            <option key={rom.id} value={rom.file}>
              {rom.label}
            </option>
          ))}
        </select>
      </WidgetGroup>

      <WidgetGroup>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleStartStop}
            disabled={status === "Loading ROM"}
            className="flex-1 inline-flex items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? "Stop" : "Start"}
          </button>

          <button
            type="button"
            onClick={handlePause}
            disabled={!nesRef.current}
            className="flex-1 inline-flex items-center justify-center rounded-md border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRunning ? "Pause" : "Resume"}
          </button>
        </div>
      </WidgetGroup>

      <WidgetGroup title="Audio">
        <div className="mb-2 flex items-center justify-between">
          <div />
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            className="h-1 w-full cursor-pointer align-middle"
          />
          <span className="w-10 text-right text-[11px] text-muted-foreground">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </WidgetGroup>

      <WidgetGroup title="Controller">
        <div className="mt-1">
          {gamepadConnected ? (
            <div className="space-y-2">
              <div className="text-emerald-500">
                Connected:{" "}
                <span className="font-semibold">{gamepadLabel || "Gamepad"}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMapperModal(true)}
                className="w-full rounded-md border bg-background px-3 py-2 text-[0.6rem] font-semibold font-mono hover:bg-accent"
              >
                Open guided controller mapper
              </button>
            </div>
          ) : (
            <span className="text-muted-foreground">
              No controller detected. Connect a USB NES-style controller and press a
              button.
            </span>
          )}
        </div>
      </WidgetGroup>
    </div>
  )

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

  const currentBindingLogical =
    showMapperModal && gamepadConnected && !mappingDone
      ? BINDING_ORDER[bindingStep] ?? null
      : null

  const mapperMessage = !gamepadConnected
    ? "Press any button on your controller to begin."
    : mappingDone
    ? "Controller configured! Close to start playing."
    : currentBindingLogical
    ? `Press ${friendlyNameForLogical[currentBindingLogical]} on your controller`
    : "Press the next button on your controller."

  return (
    <WidgetCard
      title="NES Emulator"
      subtitle="Nintendo.js · Select a ROM and press Start"
      popoutEnabled={true}
      onPopout={() => {
        if (typeof window === "undefined") return
        const base = window.location.origin
        const path = window.location.pathname.replace(/\/$/, "")
        const url = `${base}${path}/nes-popout`
        const features =
          "noopener,noreferrer,width=1210,height=925,left=50,top=50,location=no,menubar=no,resizable=no,scrollbars=no,toolbar=no,status=no"
        window.open(url, "_blank", features)
      }}
      collapseEnabled={true}
      defaultCollapsed={false}
      onCollapse={(v) => setIsCollapsed(v)}
    >
      <div ref={rootRef as any} className="flex gap-4 p-4">
        <main className="flex-1 flex flex-col items-start gap-3">{mainCanvas}</main>

        <aside className="w-80 flex-shrink-0 space-y-3">{sidebarFull}</aside>
      </div>
      <style jsx global>{`
        #${containerId} canvas {
          position: relative !important;
          z-index: 1 !important;
        }
      `}</style>
      {showMapperModal && (
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            setShowMapperModal(false)
            setActiveBinding(null)
            activeBindingRef.current = null
          }}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-xl border shadow-2xl"
            style={{
              backgroundImage: NES_CONTROLLER_BG,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/45 to-black/60" />
            <div className="relative flex min-h-[380px] flex-col items-center justify-center gap-4 p-10 text-center">
              <div className="text-xl font-bold text-white drop-shadow font-mono">
                {mapperMessage}
              </div>
              <div className="text-[0.65rem] font-semibold text-white/80 font-mono">
                Mapping order: Up → Down → Left → Right → Select → Start → B → A
              </div>
              {gamepadConnected && !mappingDone && currentBindingLogical && (
                <div className="rounded-full bg-white/15 px-4 py-2 text-[0.65rem] font-semibold text-white font-mono">
                  Waiting for {friendlyNameForLogical[currentBindingLogical]}
                </div>
              )}
              {mappingDone && (
                <div className="rounded-md bg-emerald-500 px-4 py-2 text-[0.7rem] font-semibold text-white shadow-lg font-mono">
                  Controller mapped! You are ready to play.
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMapperModal(false)
                  setActiveBinding(null)
                  activeBindingRef.current = null
                }}
                className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-[0.7rem] font-semibold text-white hover:bg-white/20 font-mono"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  )
}

export default NESGame
