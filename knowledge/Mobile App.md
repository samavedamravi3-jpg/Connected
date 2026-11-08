# Mobile App

> [!NOTE]
> The main phone app is now the native Expo app in `mobile/`; see [[Mobile API]]. This note covers the installable **web** version, which stays available as a backup.

Connected installs as a **web app** (PWA): it gets its own home-screen icon, opens full screen with no browser bar, and shows a friendly page when offline. There's no App Store build. See [[Decisions]] (2026-11-08) for why.

## Install it
- **iPhone (Safari):** open the site → tap **Share** → **Add to Home Screen**. The app shows this tip once, after a few seconds.
- **Android / Chrome / Edge:** tap **Install** in the in-app banner, or use the browser menu → *Install app*.
- Once installed, the banner never shows again. Dismissing it is remembered on that device.

Installing needs the **hosted HTTPS URL**. Hosting is still blocked (see [[Build Status]]). `localhost` works for testing on the same computer only.

## What makes it an app
| Piece | File |
| --- | --- |
| Name, colors, icons, standalone display | `public/manifest.webmanifest`, `public/icons/` |
| iOS home-screen tags, theme color, notch-safe viewport | `app/layout.tsx` |
| Offline page and fast startup | `public/sw.js`, `public/offline.html` |
| Install banner and service-worker registration | `components/install-prompt.tsx` |
| Phone layout (search, place, map and people first; readable sizes; bottom sheets) | "Mobile app layer" at the end of `app/globals.css` |

## Privacy rules for the service worker
It caches **only** same-origin static files (`/_next/static`, icons, the map worker) and the generic offline page. It never caches API responses, sign-in routes, HTML pages, map tiles, photos, or anything from another site. So nothing personal is stored for offline use. The worker registers only in production builds, so it can't interfere with hot reload in dev.

## Map notes
- MapLibre's web worker is copied from `node_modules` to `public/vendor/` (gitignored) by `vite.config.ts` on every dev start and build. Vite's dev transform otherwise breaks the worker.
- Phones get a flat, north-up map with two-finger panning, so one finger scrolls the page. Desktop keeps the tilted view.

## Verified (2026-11-08)
- 390×844 phone viewport in dev: no horizontal scroll; the first screen shows search, place, tabs, a working map with 13 pins, and people.
- Production build (`wrangler dev` on `dist`): manifest, apple-touch icon, `viewport-fit=cover` and theme color are in the page; the service worker registers and activates.
- Offline navigation shows **Connected · Offline**. The cache held only static files, with no `/api`, sign-in or HTML entries.
- Signed-in flow with the local mock sign-in: icebreaker and coach both returned real Claude replies, a demo request was saved, discovery turned on with a rounded location, and Live mode called discover with the search area.

## Not verified / limits
- Not yet tested on a physical iPhone or Android phone, only in Chromium's phone viewport.
- iOS standalone sign-in: the ChatGPT sign-in redirect may open outside the installed app on some iOS versions. Check this once the app is hosted.
- No push notifications or App Store/Play Store builds. A Capacitor wrapper could add store builds later.
