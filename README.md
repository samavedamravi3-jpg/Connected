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

- Tiles: free CARTO basemap built on OpenStreetMap data, with attribution on the map. No API key is needed in Expo Go. Store builds that use Google Maps on Android need a key in the `react-native-maps` config plugin.
- Location: one foreground fix with `expo-location` after you allow it. There are no watchers and no background location (disabled in `app.json`).

## Data

All people and events are **demo data** (`src/data/demo.ts`), clearly labeled in the app. Demo pins sit at rounded neighborhood points, never anyone's live location. To connect a backend, implement the `DataSource` interface in `src/data/source.ts`. Screens only talk to `dataSource`.

App state (preferences, profile, requests, Open Doors, saved events) is stored on the device with AsyncStorage (`src/state/AppState.tsx`).
