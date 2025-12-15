Assistant hand-off / working notes
-----------------------------------

Current state
- Auth: Google ID token is read from localStorage key `arcadeGoogleIdToken`. The token’s `sub` field becomes `userUuid`; scores and save-states are keyed by that ID (fallback to legacy anon scores if no user).
- Score gating: Emulator disables save/load and shows guest warnings when no `userUuid`. Game carousel warns that ladders/multiplayer/state saving need auth.
- UI changes: Library width capped at 1650px with consistent 4-col grid; search bar with inline autocomplete under the nav; emulator score handling respects `scoresEnabled`.

What’s next / open items
- Wire real Google sign-in to populate `arcadeGoogleIdToken` in localStorage (or persist via API) so auth gating unlocks.
- Decide on ScreenScraper search/autocomplete: waiting for hashed creds (`ssidmd5`/`sspassmd5`) from your ScreenScraper account page (“Mon Compte” → “Mes Infos”).
- Optional: Replace localStorage score/state with API-backed per-user storage once auth is live.

Backup/versioning guidance
- If making milestone/version changes, create a pre-change snapshot in `/backups`:
  - Example (from repo root): `mkdir -p backups && tar -czf backups/arcade-$(date +%Y%m%d-%H%M%S).tar.gz .`
  - Or lighter: `rsync -a --delete ./ backups/arcade-$(date +%Y%m%d-%H%M%S)/`
- Git is preferred: initialize a repo and commit before/after milestones:
  - `git init && git add . && git commit -m "baseline"` (once)
  - `git add . && git commit -m "milestone: <desc>"` for each change.

How to grant edit access without prompts (CLI harness)
- The current CLI session is `approval_policy: untrusted`, so write commands may prompt. You can re-run the session with a more permissive policy (e.g., `on-failure` or `on-request`) and `sandbox_mode` allowing writes.
- Alternatively, pre-approve a path (or disable sandbox) when starting the session so routine file edits and tests don’t need per-command approval.
- For git-based workflows, give access to the repo root and ensure the sandbox allows `git add/commit` and file writes.

Quick reminders for future edits
- Scores/storage functions now accept an optional `userUuid`; pass it when loading/persisting scores or save-states.
- Guest users should keep seeing gating/warnings for ladders/multiplayer/saves until auth is provided.
- Avoid breaking the 1650px layout cap for the library grid; keep consistent column counts at desktop widths.
