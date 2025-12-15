import gamesMetaRaw from '@/data/games-meta.json'
import { isBrowser, withBasePath } from './utils'

type StatMode = 'score' | 'time' | 'progress' | 'continue-code'

type GameMetaEntry = {
  id: string
  romFile: string
  title: string
  statMode?: StatMode | null
  descriptionShort?: string | null
  descriptionLong?: string | null
  boxArtLocal?: string | null
  releaseYear?: string | null
  rating?: number | null
  votes?: number | null
  boxArtSource?: string | null
}

export type NesGame = {
  id: string
  title: string
  description: string
  descriptionLong?: string | null
  boxArt: string
  romFile: string
  releaseYear?: string | null
  rating?: number | null
  votes?: number | null
  boxArtSource?: string | null
  statMode: StatMode
}

export type NesInstance = {
  buttonDown?: (player: number, button: number) => void
  buttonUp?: (player: number, button: number) => void
  toJSON?: () => unknown
  fromJSON?: (state: unknown) => void
  cpu?: { mem?: Uint8Array | number[] }
}

const GAME_META: Record<string, GameMetaEntry> = gamesMetaRaw

const normalizeStatMode = (value: StatMode | null | undefined): StatMode => {
  if (value === 'time' || value === 'progress' || value === 'continue-code') return value
  return 'score'
}

export const NES_GAMES: NesGame[] = Object.values(GAME_META).map((meta) => {
  const statMode = normalizeStatMode(meta.statMode ?? null)

  return {
    id: meta.id,
    title: meta.title,
    description: meta.descriptionShort || meta.descriptionLong || meta.title,
    descriptionLong: meta.descriptionLong ?? null,
    boxArt: meta.boxArtLocal ? withBasePath(meta.boxArtLocal) : '/placeholder.svg',
    romFile: meta.romFile,
    releaseYear: meta.releaseYear ?? null,
    rating: meta.rating ?? null,
    votes: meta.votes ?? null,
    boxArtSource: meta.boxArtSource ?? null,
    statMode,
  }
})

const NES_SCORE_STORAGE_PREFIX = 'nesWidgetScores:'
const NES_ROM_STATE_PREFIX = 'nesWidgetPerRomState:'

const SMB_SCORE_START = 0x07dd
const SMB_SCORE_DIGITS = 6
const SMB3_SCORE_ADDR = 0x0715
const CASTLEVANIA_SCORE_ADDR = 0x07fc

const SCORE_READERS: { test: (name: string) => boolean; read: (nes: NesInstance) => number | null }[] = [
  {
    test: (name) => name.includes('smb3'),
    read: (nes) => readSmb3ScoreFromMemory(nes),
  },
  {
    test: (name) => name.includes('smb') && !name.includes('smb3'),
    read: (nes) => readSmbScoreFromMemory(nes),
  },
  {
    test: (name) => name.includes('castlevan'),
    read: (nes) => readCastlevaniaScoreFromMemory(nes),
  },
]

export const NES_BUTTONS = {
  BUTTON_A: 0,
  BUTTON_B: 1,
  BUTTON_SELECT: 2,
  BUTTON_START: 3,
  BUTTON_UP: 4,
  BUTTON_DOWN: 5,
  BUTTON_LEFT: 6,
  BUTTON_RIGHT: 7,
} as const

export function getGameById(id: string | null | undefined) {
  if (!id) return undefined
  return NES_GAMES.find((game) => game.id === id)
}

export function stateKeyForRom(romFile: string, userUuid?: string | null) {
  const owner = userUuid?.trim() || 'anon'
  return `${NES_ROM_STATE_PREFIX}${owner}:${romFile}`
}

export function scoreStorageKey(romFile: string, userUuid?: string | null) {
  const owner = userUuid?.trim() || 'anon'
  return `${NES_SCORE_STORAGE_PREFIX}${owner}:${romFile}`
}

export function loadStoredScores(romFile: string, userUuid?: string | null) {
  if (!isBrowser()) return [] as number[]
  try {
    const raw = window.localStorage.getItem(scoreStorageKey(romFile, userUuid))
    const fallbackRaw =
      !raw && userUuid ? window.localStorage.getItem(`${NES_SCORE_STORAGE_PREFIX}${romFile}`) : null
    const parsed = raw ? JSON.parse(raw) : fallbackRaw ? JSON.parse(fallbackRaw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v) => typeof v === 'number' && Number.isFinite(v))
  } catch {
    return []
  }
}

export function persistScores(romFile: string, scores: number[], userUuid?: string | null) {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(scoreStorageKey(romFile, userUuid), JSON.stringify(scores))
    window.dispatchEvent(
      new CustomEvent('nes:scores-updated', { detail: { romFile, userUuid: userUuid ?? null } }),
    )
  } catch {
    //
  }
}

function readSmbScoreFromMemory(nes: NesInstance): number | null {
  const mem = nes?.cpu?.mem
  if (!mem) return null

  const digits: number[] = []
  for (let i = 0; i < SMB_SCORE_DIGITS; i++) {
    const raw = (mem[SMB_SCORE_START + i] ?? 0) as number
    const d = raw & 0x0f
    if (d < 0 || d > 9) return null
    digits.push(d)
  }

  const scoreStr = digits.join('') + '0'
  const score = parseInt(scoreStr, 10)
  if (!Number.isFinite(score) || score <= 0) return null
  return score
}

function readSmb3ScoreFromMemory(nes: NesInstance): number | null {
  const mem = nes?.cpu?.mem
  if (!mem) return null

  const b0 = (mem[SMB3_SCORE_ADDR] ?? 0) as number
  const b1 = (mem[SMB3_SCORE_ADDR + 1] ?? 0) as number
  const b2 = (mem[SMB3_SCORE_ADDR + 2] ?? 0) as number

  const raw = (b0 << 16) | (b1 << 8) | b2
  if (!Number.isFinite(raw) || raw <= 0) return null

  const score = raw * 10
  if (!Number.isFinite(score) || score <= 0) return null
  return score
}

function readCastlevaniaScoreFromMemory(nes: NesInstance): number | null {
  const mem = nes?.cpu?.mem
  if (!mem) return null

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

  const scoreStr = digits.join('').replace(/^0+/, '') || '0'
  const score = parseInt(scoreStr, 10)
  if (!Number.isFinite(score) || score < 0) return null
  return score
}

export function readScoreForRomName(romName: string, nes: NesInstance): number | null {
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
