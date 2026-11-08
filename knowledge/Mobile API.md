# Mobile API

The iPhone/Android app in `mobile/` is Kartik's Expo design. It talks to `/api/v1/*` on the same Cloudflare Worker + D1 backend as the web app. This note covers what exists, how it's protected, and how to run and deploy it. See [[Mobile App]], [[Build Status]] and [[Decisions]].

## Run it on an iPhone (same Wi-Fi)
1. In the repo root: `npm ci`, `npm run build`, `npm run db:local` (first time), then `npm run dev:lan` (API on port 5175).
2. In `mobile/`: `npm ci`, then `npx expo start`. Scan the QR code in Expo Go.
3. Sign up with any email. On a local server the code appears on screen ("Use it").

## Deploy (your Cloudflare account)
1. `npx wrangler login` (once).
2. `npm run deploy:cloudflare`. This creates the `connected-db` database, applies migrations, deploys, and sets a random `AUTH_SECRET`.
3. Add the keys it lists: `RESEND_API_KEY` (required for email codes) and optionally `ANTHROPIC_API_KEY` and `MAIL_FROM`.
4. Put the worker URL in `mobile/.env.local` as `EXPO_PUBLIC_API_URL`.

On a deployed server, codes are only ever emailed; the server refuses sign-in if no email service is configured. Without a verified domain, Resend's test sender only delivers to your own Resend account email.

## Endpoints
| Area | Endpoints |
| --- | --- |
| Sign-in | `POST auth/start`, `POST auth/verify`, `POST auth/logout` |
| Me | `GET/PUT/DELETE me`, `POST/DELETE me/location`, `PUT/DELETE me/photo`, `GET photos/:id` |
| Discovery | `GET people?latitude&longitude&radiusMi`, `GET people/:id` |
| Requests + chat | `GET/POST connections`, `PATCH connections/:id`, `GET/POST connections/:id/messages?since=` |
| Safety | `GET/POST/DELETE blocks`, `POST reports` |
| Open Doors | `GET/POST doors`, `DELETE doors/:id` |
| Events | `GET events`, `GET/POST saved-events` |
| Devices + AI | `POST/DELETE push-tokens`, `POST ai/opener`, `POST ai/coach` |

## Guarantees (tested)
- **Sign-in:** 6-digit code, stored only as a salted hash. It expires in 10 minutes, allows 5 tries, and works once. There's a 30-second resend wait and per-email and per-IP limits. Sessions last 30 days and are stored only as hashes.
- **Private answers:** challenges, wanted traits, travel distance, "something else" text and career origin are never sent to other members. Emails are never shown.
- **Location:** snapped to a neighborhood center (within 4 mi) or a roughly 2 km grid. Stored only when discoverable, for one hour, renewed while the app is open, and erased on read once expired.
- **Requests and chat:** the sender cancels; the recipient accepts or declines; no accepting across a block. Chat only happens inside accepted, unblocked connections. There are limits of 20 requests a day and 20 messages a minute.
- **Blocks:** apply in both directions, closing pending requests and hiding conversations. A report stores a reason and also blocks.
- **Open Doors:** only at listed public venues, at most 4 hours long, starting within 7 days, 2 active at a time. The exact venue is withheld from viewers outside the chosen audience.
- **Photos:** JPEG, PNG or WebP only, checked by file signature (never SVG), up to 300 KB. Each gets an unguessable URL that changes on every upload and returns `nosniff`.
- **Account deletion:** removes the profile, photo, requests, messages, doors, saved events, devices and sessions. Safety reports about others are kept.
- **Claude:** receives only names, goals, preferences and public help. Never photos, socials, location, emails or IDs. The daily limit of 20 is shared with the web app.

Proof: `npm test` (48 unit tests, including `tests/mobile-model.test.ts`) and `npm run smoke:mobile` (53 end-to-end checks against local D1).

## Known limits
- Chat refreshes by polling (4 s with a chat open, inbox every 20 s), not websockets.
- Push needs an EAS project id (`npx eas-cli@latest init` in `mobile/`). Android remote push needs a development build.
- Reports are stored for review, but there's no moderation dashboard yet.
- Real events are the curated Charlotte listings in `lib/local-events.ts`, not a live feed.
- Only Kartik's listed venues and neighborhoods exist (Charlotte). Members elsewhere snap to a coarse grid and show as "Nearby".
