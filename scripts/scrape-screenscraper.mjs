#!/usr/bin/env node
/**
 * ScreenScraper WebAPI2 puller (one ROM at a time).
 * - Reads ROM filenames from public/roms (e.g., smb.nes)
 * - Calls ScreenScraper WebAPI2 for NES (systemeid=3) sequentially
 * - Updates data/games-meta.json with boxArtLocal, boxArtSource, descriptionLong, rating, votes
 *
 * Env vars (use either plain or MD5):
 *   SS_USER / SS_PASS          (ssid / sspass)
 *   SS_USER_MD5 / SS_PASS_MD5  (ssidmd5 / sspassmd5)
 *   SS_DEV_ID / SS_DEV_PASS    (devid / devpassword from ScreenScraper)
 *   SS_SOFTNAME                (e.g., "icart-arcade-dev")
 *
 * Usage:
 *   node scripts/scrape-screenscraper.mjs [--rom <file.nes>] [--dry-run]
 *
 * Note: Requires network access. Be gentle; this script waits ~1.2s between calls.
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

// Load env (prefers .env.local)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, "..")
const ROM_DIR = path.join(ROOT, "public", "roms")
const META_PATH = path.join(ROOT, "data", "games-meta.json")
const BOXART_DIR = path.join(ROOT, "public", "boxart")

const API_URL = "https://www.screenscraper.fr/webapi2.php"
const SYSTEM_ID = "3" // NES
const SLEEP_MS = 1200

const env = {
  ssUser: process.env.SS_USER ?? null,
  ssPass: process.env.SS_PASS ?? null,
  ssUserMd5: process.env.SS_USER_MD5 ?? null,
  ssPassMd5: process.env.SS_PASS_MD5 ?? null,
  ssDevId: process.env.SS_DEV_ID ?? null,
  ssDevPass: process.env.SS_DEV_PASS ?? null,
  softname: process.env.SS_SOFTNAME ?? "icart-arcade-dev",
}

const USER_AGENT = process.env.SS_USER_AGENT || `${env.softname || "icart-arcade"}/1.0`

const hasCreds = () =>
  (env.ssUser && env.ssPass) ||
  (env.ssUserMd5 && env.ssPassMd5)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const readMeta = async () => JSON.parse(await fs.readFile(META_PATH, "utf8"))
const writeMeta = async (meta) => fs.writeFile(META_PATH, JSON.stringify(meta, null, 2))
const ensureDirs = async () => fs.mkdir(BOXART_DIR, { recursive: true })

const listRoms = async () => {
  const entries = await fs.readdir(ROM_DIR, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && /\.(nes|zip|7z)$/i.test(e.name))
    .map((e) => e.name)
}

const buildSearchParams = (romName) => {
  const params = new URLSearchParams({
    softname: env.softname,
    output: "json",
    systemeid: SYSTEM_ID,
    romnom: romName,
    alpha: "0",
    numpage: "0",
  })
  if (env.ssDevId) params.set("devid", env.ssDevId)
  if (env.ssDevPass) params.set("devpassword", env.ssDevPass)
  if (env.ssUser && env.ssPass) {
    params.set("ssid", env.ssUser)
    params.set("sspass", env.ssPass)
  } else if (env.ssUserMd5 && env.ssPassMd5) {
    params.set("ssidmd5", env.ssUserMd5)
    params.set("sspassmd5", env.ssPassMd5)
  }
  return params
}

const pickBoxArt = (media) => {
  if (!media || typeof media !== "object") return null
  const box =
    media.find((m) => m.type?.toLowerCase().includes("box-2d")) ||
    media.find((m) => m.type?.toLowerCase().includes("box")) ||
    media[0]
  return box?.url || null
}

const parseResponse = (romName, data) => {
  // WebAPI2 returns { response: { jeux: [...] }} or similar; normalize generously
  const jeux = data?.response?.jeux || data?.jeux || []
  if (!Array.isArray(jeux) || !jeux.length) {
    throw new Error(`No results for ${romName}`)
  }
  const game = jeux[0]
  const media = Array.isArray(game?.medias) ? game.medias : game?.medias?.media || []
  const boxArtSource = pickBoxArt(media)
  const synopsis = game?.synopsis || game?.synopsis_en || null
  const rating = game?.rating || game?.note || null
  const votes = game?.votes || game?.nbvotes || null
  return {
    boxArtSource,
    descriptionLong: synopsis,
    rating: rating != null ? Number(rating) : null,
    votes: votes != null ? Number(votes) : null,
  }
}

const fetchJson = async (url) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
  })

  const contentType = res.headers.get("content-type") || ""
  const text = await res.text()

  if (!res.ok) {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim()
    throw new Error(`HTTP ${res.status} ${res.statusText || ""} (${contentType || "unknown"}): ${snippet}`)
  }

  if (!/json/i.test(contentType) && text.trim().startsWith("<")) {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim()
    throw new Error(`Expected JSON but got HTML (${contentType || "unknown"}): ${snippet}`)
  }

  try {
    return JSON.parse(text)
  } catch (err) {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim()
    throw new Error(`Failed to parse JSON (${contentType || "unknown"}): ${err.message}; body: ${snippet}`)
  }
}

const downloadImage = async (url, destBase) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download image ${url}: ${res.status}`)
  const contentType = res.headers.get("content-type") || ""
  const ext = contentType.includes("png") ? "png" : "jpg"
  const dest = `${destBase}.${ext}`
  const arrayBuffer = await res.arrayBuffer()
  await fs.writeFile(dest, Buffer.from(arrayBuffer))
  return path.basename(dest)
}

const updateGameMeta = async (romName, dryRun = false) => {
  const params = buildSearchParams(romName)
  const url = `${API_URL}?${params.toString()}`
  console.log(`Fetching ScreenScraper for ${romName} -> ${url}`)
  const data = await fetchJson(url)
  const parsed = parseResponse(romName, data)

  await ensureDirs()
  const raw = await readMeta()
  const meta = { ...raw }

  const entryKey = Object.keys(meta).find((key) => meta[key]?.romFile?.toLowerCase() === romName.toLowerCase())
  if (!entryKey) {
    console.warn(`No meta entry found for ROM ${romName}; skipping JSON update.`)
    return
  }

  const savedFile = parsed.boxArtSource
    ? await downloadImage(parsed.boxArtSource, path.join(BOXART_DIR, meta[entryKey].id || entryKey))
    : null

  meta[entryKey] = {
    ...meta[entryKey],
    boxArtSource: parsed.boxArtSource ?? meta[entryKey].boxArtSource ?? null,
    boxArtLocal: savedFile ? `/boxart/${savedFile}` : meta[entryKey].boxArtLocal ?? null,
    descriptionLong: parsed.descriptionLong ?? meta[entryKey].descriptionLong ?? meta[entryKey].descriptionShort ?? null,
    rating: parsed.rating ?? meta[entryKey].rating ?? null,
    votes: parsed.votes ?? meta[entryKey].votes ?? null,
  }

  if (dryRun) {
    console.log(`[dry-run] Would update ${entryKey}:`, meta[entryKey])
  } else {
    await writeMeta(meta)
    console.log(`Updated metadata for ${entryKey}`)
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  const romFilters = []
  const dryRun = args.includes("--dry-run")
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--rom" && args[i + 1]) {
      romFilters.push(args[i + 1])
      i++
    }
  }

  if (!hasCreds()) {
    console.error("Missing ScreenScraper credentials. Set SS_USER/SS_PASS or SS_USER_MD5/SS_PASS_MD5.")
    process.exit(1)
  }

  const roms = romFilters.length ? romFilters : await listRoms()
  if (!roms.length) {
    console.log("No ROM files found in public/roms.")
    return
  }

  for (let i = 0; i < roms.length; i++) {
    const rom = roms[i]
    try {
      await updateGameMeta(rom, dryRun)
    } catch (err) {
      console.error(`Failed to process ${rom}:`, err?.message || err)
    }
    if (i < roms.length - 1) {
      await sleep(SLEEP_MS)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
