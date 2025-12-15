# Changelog (developer session snapshot)

## Current state (2025-01-14)
- Auth:
  - Google ID tokens are read from `localStorage.arcadeGoogleIdToken`.
  - Header dropdown has “Sign in with Google (popup)” using Google Identity Services (popup, FedCM disabled) and a manual token paste field. “Sign out (clear token)” clears it. Account panel reflects guest vs authed.
- Scores/saves:
  - Emulator scores/saves keyed by `userUuid` (Google `sub`); guest mode can play but cannot save/load; guest notification fires once on first ROM start.
- Library UI:
  - Max width 1650px; consistent 4-col grid on desktop; search is local-only (no ScreenScraper search).
- Notifications:
  - LocalStorage-backed notifications; guest auth reminder delivered via notification/toast on first guest start.
- ScreenScraper:
  - `scripts/scrape-screenscraper.mjs` reads `.env.local`, uses WebAPI2 (system 3), scrapes ROMs from `public/roms`, updates `data/games-meta.json`, and downloads box art. Run via `node scripts/scrape-screenscraper.mjs` (or `--rom <file>`, `--dry-run`). Credentials in `.env.local` (`SS_USER/SS_PASS`).
- Dev experience:
  - `devIndicators: false` in `next.config.mjs`; disable Turbopack via `NEXT_DISABLE_TURBOPACK=1 npx next dev` if needed.

Known issues / TODO:
- Hydration warnings from Radix dynamic IDs (non-blocking); could add deterministic IDs if desired.
- Missing box art files: `contra.jpg`, `excitebike.jpg`, `punchout.jpg` (404s). Add to `public/boxart/` or update `boxArtLocal`.
- Google popup requires `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and localhost allowed as an origin; ensure env is set. FedCM disabled to avoid local CORS errors.
