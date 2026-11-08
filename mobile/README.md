# Connected.

Find the right people around you, and make the first connection easier.

An Expo (SDK 58) + React Native + TypeScript app. The main screen is a real street map of Charlotte, NC showing people who opted in to nearby discovery.

## Run it

**You need:**
- [Node.js LTS](https://nodejs.org) on the computer.
- The **Expo Go** app on your phone (App Store / Google Play).
- A free [Expo account](https://expo.dev/signup). iPhone's Expo Go requires you to be signed in to the same account on the phone and the computer.

**Steps** (in a terminal, inside this folder):

```bash
npm install
npx expo login
npx expo start
```

1. `npm install` downloads dependencies (a few minutes the first time).
2. `npx expo login` signs you in. If the browser doesn't open, use `npx expo login --no-browser`.
3. `npx expo start` shows a QR code. Scan it with the iPhone Camera, or from inside Expo Go on Android. Keep the phone on the same Wi-Fi as the computer. If it can't connect, use `npx expo start --tunnel`.

You can also press `a` for an Android emulator or `i` for the iOS simulator (Mac only).

Checks: `npm run typecheck`, `npx expo lint`, `npx expo-doctor`.

## Demo path

1. Tap **Get started** (or **Try it with a sample profile** to skip ahead as Alex, a first-gen finance student).
2. Set preferences: field, interests, skills → goals → travel distance and role → visibility. Then a short profile.
3. The **Map** opens on Charlotte (or on you, if you allow location). Use the quick chips or **Filters**.
4. Tap a pin → compact card → **View profile** for match reasons and a suggested opener.
5. Pick a style, edit the message, **Send connection request**. A demo reply arrives in about 6 seconds (or use "Accept now").
6. **Inbox** shows requested / accepted / declined / cancelled; accepted requests open a conversation.
7. **Events** lists networking events, career events and hackathons. **Profile → Open Door → Offer one** lets you post a short public-place conversation.

## Map and location

- Map: the phone's built-in map (Apple Maps on iOS, Google Maps on Android) via `react-native-maps`, in a muted style. No API key is needed in Expo Go. Android store builds need a free Google Maps key in the `react-native-maps` config plugin.
- Location: one foreground fix with `expo-location` after you allow it. There are no watchers and no background location (disabled in `app.json`).

## Data: demo mode and real accounts

- **Sample mode** ("Look around with a sample profile"): everything stays on the phone. People and events are labeled demo data (`src/data/demo.ts`), and replies are simulated.
- **Real accounts** ("Get started" → sign up with an email code, or "I already have an account"): the app uses the Connected backend in the repo root (`/api/v1`, Cloudflare Worker + D1).
  - Profiles, discovery, requests, chat, Open Doors, saved events, blocks, reports and photos are all stored on the server.
  - The session token lives in the iOS Keychain (`expo-secure-store`).

Screens only talk to `dataSource` (`src/data/source.ts`) and `useApp()` (`src/state/AppState.tsx`). Both switch between demo and live automatically, and `src/data/api.ts` is the HTTP client.

## Run it against the real backend (same Wi-Fi)

1. In the **repo root**: `npm ci`, `npm run build`, `npm run db:local` (first time), then `npm run dev:lan`. This serves the API on port 5175 to your network.
2. In **mobile/**: `npm ci`, then `npx expo start`. Scan the QR code with the iPhone camera (Expo Go).
3. The app finds the backend on the same computer automatically. With no email service configured locally, the sign-in screen shows your code with a **Use it** button.

To use a deployed backend instead, put `EXPO_PUBLIC_API_URL=https://…` in `mobile/.env.local` (see `.env.example`) and restart Expo.

## Push alerts

New requests, acceptances and messages send push alerts once the app is linked to an Expo (EAS) project. To link it, run `npx eas-cli@latest init` in mobile/; this writes `extra.eas.projectId`.

- Android needs a development build for remote push.
- On iPhone, test with your build.
- Without push, the Inbox still refreshes every 20 seconds, and an open chat every 4 seconds.

## Privacy rules the backend enforces

- Location is snapped to a neighborhood center (never your address). It's stored only if you chose "Let people find me", and expires an hour after you last opened the app.
- Challenges, the people you're looking for, travel distance and free-text goals stay private. Others see your name, status, organization, field, interests, skills, languages and what you offer.
- Blocks work in both directions. A report also blocks. You can delete your account in Profile.
- An Open Door's exact venue is only sent to people in the audience you chose.
