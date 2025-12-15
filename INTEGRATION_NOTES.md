# iCart Arcade - Backend Integration Hooks

This document outlines where backend functionality should be integrated into the UI shell.

## Authentication

**Location:** `components/header.tsx`
- Lines with `// BACKEND HOOK:` comments
- Replace mock `isLoggedIn` and `userName` with actual auth state
- Implement login/logout actions in dropdown menu handlers
- Connect to authentication provider (Supabase Auth, NextAuth, etc.)

## User Profile & Settings

**Location:** `components/panels/account-panel.tsx`
- Replace `mockUser` object with real user data from database
- Implement profile editing functionality
- Connect password change feature
- Implement account deletion with confirmation

**Location:** `components/panels/settings-panel.tsx`
- Load user preferences from database/localStorage
- Persist settings changes when switches/sliders are modified
- Connect display settings to actual emulator configuration
- Save audio preferences

## Notifications System

**Location:** `components/panels/notifications-panel.tsx`
- Replace `mockNotifications` with real-time notifications from database
- Implement WebSocket/Server-Sent Events for live updates
- Add mark as read functionality
- Connect to notification creation events (new high scores, friend requests, etc.)

## Game Library

**Location:** `components/game-carousel.tsx`
- Replace `mockGames` array with database query for available ROMs
- Load box art images from storage (Vercel Blob, S3, etc.)
- Fetch user's personal scores and global high scores per game
- Implement pagination with actual total game count
- Add search/filter functionality

## Emulator Integration

**Location:** `components/emulator-screen.tsx`
- Initialize NES emulator library (JSNES, NES.js, etc.) on mount
- Load ROM file based on `gameId` prop
- Connect play/pause/reset buttons to emulator control methods
- Implement volume control connected to Web Audio API
- Add keyboard event listeners for game controls
- Consider gamepad API for controller support

### Canvas Setup
The emulator output should render to a `<canvas>` element:
\`\`\`tsx
<canvas 
  ref={canvasRef} 
  width={256} 
  height={240} 
  className="w-full h-full"
/>
\`\`\`

## Save States

**Location:** `components/emulator-screen.tsx` - Save States card
- Implement save state creation (serialize emulator state)
- Store save states in database with user_id, game_id, slot_number
- Load save states and deserialize to emulator
- Display save state metadata (level, timestamp, thumbnail)
- Handle multiple save slots per game

## High Scores

**Location:** `components/emulator-screen.tsx` - High Scores card
- Query high scores table for current game
- Real-time score updates during gameplay
- Submit new high scores when game ends
- Leaderboard with user rankings
- Personal best tracking

## Database Schema Suggestions

### users
- id, username, email, avatar_url, created_at

### games
- id, title, description, rom_url, box_art_url, release_year

### high_scores
- id, user_id, game_id, score, achieved_at

### save_states
- id, user_id, game_id, slot_number, state_data, created_at, metadata

### notifications
- id, user_id, type, title, message, read, created_at

### user_settings
- user_id, fullscreen, crt_filter, volume, auto_save, etc.

## API Routes Needed

### Authentication
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/signup
- GET /api/auth/session

### Games
- GET /api/games (list with pagination)
- GET /api/games/[id] (single game details)
- GET /api/games/[id]/rom (ROM file download)

### Scores
- GET /api/scores/[gameId] (leaderboard)
- POST /api/scores (submit new score)
- GET /api/scores/user/[userId] (user's scores)

### Save States
- GET /api/save-states/[gameId] (user's save slots)
- POST /api/save-states (create/update save)
- DELETE /api/save-states/[id]

### Notifications
- GET /api/notifications (user's notifications)
- PATCH /api/notifications/[id]/read
- PATCH /api/notifications/read-all

### Settings
- GET /api/settings (user preferences)
- PATCH /api/settings (update preferences)

## Environment Variables

Add these to your Vercel project:
- DATABASE_URL (if using Postgres/MySQL)
- NEXT_PUBLIC_SUPABASE_URL (if using Supabase)
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- BLOB_READ_WRITE_TOKEN (for Vercel Blob storage)
- NEXTAUTH_SECRET (if using NextAuth)
- NEXTAUTH_URL

## Recommended Integrations

1. **Database:** Supabase or Neon for Postgres
2. **Storage:** Vercel Blob for ROM files and box art
3. **Auth:** Supabase Auth (built-in) or NextAuth.js
4. **Emulator:** JSNES (https://github.com/bfirsh/jsnes)
5. **Real-time:** Supabase Realtime for live notifications

## Next Steps

1. Choose and set up database integration
2. Implement authentication system
3. Create database tables and seed with games
4. Integrate NES emulator library
5. Connect all UI hooks to backend APIs
6. Add error handling and loading states
7. Implement responsive improvements for mobile

## Emulator Roadmap (additional systems)

- **SNES:** bsnes/higan or snes9x WASM builds; load lazily due to CPU cost.
- **Game Boy / GBC:** wasm-boy (WASM) or gbajs (JS) for lighter option.
- **GBA:** mGBA/VBA WASM builds; prefer mGBA for accuracy.
- **Sega Genesis/Mega Drive:** Genesis-Plus-GX WASM or PicoDrive JS/WASM; load on demand.
- **PSX:** pcsx-rearmed WASM exists but heavy; needs BIOS and perf/bundle care.
- **Intellivision:** likely a custom Emscripten build of jzintv/MAME core; manual integration + BIOS handling.
- **Atari 2600:** stella JS/WASM builds exist; straightforward to embed similarly to NES.
