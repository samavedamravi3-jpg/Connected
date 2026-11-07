# Architecture

## Stack
React + TypeScript, Vinext/Vite with Next-compatible app routes, Cloudflare Worker, D1/Drizzle database, Leaflet map with OpenStreetMap tiles. Sites provides hosted identity and owner-private hosting.

## Key files
- `components/connected-app.tsx`: UI and user flows
- `components/nearby-map.tsx`: client-only Leaflet integration
- `lib/network.ts`: shared types, demo data, distance and matching
- `app/api/*/route.ts`: authenticated server endpoints
- `db/schema.ts`, `drizzle/`: persistence and migrations
- `app/globals.css`: responsive visual design

## Data boundaries
Profiles: name, role, company, goal, interests and offered help. No passwords stored. Location is stored only after explicit opt-in and is rounded before storage. Visibility expires after one hour; switching off clears location from the profile. Expired coordinates are erased on subsequent profile or discovery reads; this is lazy cleanup, not a scheduled deletion. The database does not store a location trail.

D1 stores profiles, chat requests, saves, blocks, events, and daily AI usage. Server handlers check identity and request ownership; clients cannot accept their own outgoing request. Demo requests never reach a real person.

## Claude
`POST /api/icebreaker` calls Anthropic from the server when `ANTHROPIC_API_KEY` exists. `ANTHROPIC_MODEL` overrides the default model. Only name, career goal, and offered help are sent; no coordinates or email. Profile text is untrusted input. A daily 20-draft quota applies. Missing key or upstream failure uses a clearly labeled template.

Claude Code reads `CLAUDE.md`, which points to this vault. Do not put secrets in notes or commit local environment files.

## Local identity
The supplied local auth adapter offers development sign-in at `/signin-with-chatgpt?return_to=/`. It is loopback-only and is absent from production. Production relies on Sites identity headers. Any separate host must replace this trusted identity boundary before exposing live writes.
