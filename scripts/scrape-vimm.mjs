#!/usr/bin/env node
/**
 * Scrape box art and metadata from Vimm's vault pages.
 * Usage: node scripts/scrape-vimm.mjs [--id <vimmId> ...]
 *
 * Notes:
 * - Requires network access.
 * - Writes downloaded art to public/boxart/<id>.<ext>
 * - Updates data/games-meta.json in place with boxArtSource/rating/votes/descriptionLong when found.
 */
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ROOT = path.resolve(__dirname, "..")
const META_PATH = path.join(ROOT, "data", "games-meta.json")
const BOXART_DIR = path.join(ROOT, "public", "boxart")

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const pickMeta = (html, name) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=[\"']${name}[\"'][^>]+content=[\"']([^\"']+)[\"'][^>]*>`, "i")
  const match = html.match(re)
  return match ? match[1] : null
}

const extractRating = (html) => {
  const ratingMatch = html.match(/Rating:\s*<\/?[^>]*>\s*([\d.]+)/i) || html.match(/User Rating[:\s]*([\d.]+)/i)
  const votesMatch = html.match(/Votes?:\s*<\/?[^>]*>\s*([\d,]+)/i) || html.match(/([\d,]+)\s+votes/i)
  return {
    rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
    votes: votesMatch ? parseInt(votesMatch[1].replace(/,/g, ""), 10) || null : null,
  }
}

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true })
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

const parsePage = async (id, romId) => {
  const url = `https://vimm.net/vault/${id}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  const html = await res.text()

  const boxArtUrl =
    pickMeta(html, "og:image") ||
    pickMeta(html, "twitter:image") ||
    null

  const description =
    pickMeta(html, "description") || pickMeta(html, "og:description") || null

  const { rating, votes } = extractRating(html)

  let savedFile = null
  if (boxArtUrl) {
    const destBase = path.join(BOXART_DIR, romId || String(id))
    savedFile = await downloadImage(boxArtUrl, destBase)
  }

  return {
    boxArtSource: boxArtUrl,
    savedFile,
    descriptionLong: description,
    rating,
    votes,
  }
}

const main = async () => {
  const args = process.argv.slice(2)
  const onlyIds = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--id" && args[i + 1]) {
      onlyIds.push(parseInt(args[i + 1], 10))
      i++
    }
  }

  const raw = await fs.readFile(META_PATH, "utf8")
  const meta = JSON.parse(raw)
  await ensureDir(BOXART_DIR)

  const entries = Object.values(meta).filter((entry) => entry && entry.vimmId)
  const targets = onlyIds.length ? entries.filter((e) => onlyIds.includes(e.vimmId)) : entries

  if (!targets.length) {
    console.log("No entries with vimmId found to scrape.")
    return
  }

  for (let i = 0; i < targets.length; i++) {
    const entry = targets[i]
    try {
      console.log(`Fetching Vimm #${entry.vimmId} (${entry.id})...`)
      const parsed = await parsePage(entry.vimmId, entry.id || entry.romFile)
      meta[entry.id] = {
        ...entry,
        boxArtSource: parsed.boxArtSource ?? entry.boxArtSource ?? null,
        boxArtLocal: parsed.savedFile ? `/boxart/${parsed.savedFile}` : entry.boxArtLocal ?? null,
        descriptionLong: parsed.descriptionLong ?? entry.descriptionLong ?? entry.descriptionShort ?? null,
        rating: parsed.rating ?? entry.rating ?? null,
        votes: parsed.votes ?? entry.votes ?? null,
      }
      // Be gentle
      await sleep(400)
    } catch (err) {
      console.error(`Failed to scrape Vimm #${entry.vimmId}:`, err?.message || err)
    }
  }

  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2))
  console.log(`Updated ${META_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
