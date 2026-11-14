# Plan: nearby alerts while the app is closed (not built)

**Status: plan only.** Today alerts fire only while the map is open (foreground location + local notifications), which works in Expo Go.
Closed-app alerts need background location and remote push. Both require a **development build**, not Expo Go (SDK 58 docs):
- Background location: "not supported in the Expo Go app". TaskManager is unavailable on Android Expo Go and has no background execution on iOS.
- Remote push: unavailable in Expo Go on Android since SDK 53; push needs FCM v1 (Android) and APNs keys (iOS, paid Apple Developer account) from `eas build`.

## Pieces
1. **Development build.** `eas build --profile development` for iOS and Android (`bunx`/`npx eas-cli@latest`). Add `eas.json` dev profile; set `extra.eas.projectId`.
2. **Config plugins (app.json).** `expo-location`: `isIosBackgroundLocationEnabled: true`, `isAndroidBackgroundLocationEnabled: true`, clear `locationAlwaysAndWhenInUsePermission` text. `expo-notifications` plugin; Android notification channel `nearby`.
3. **Background location task.** `src/tasks/nearby.ts` calls `TaskManager.defineTask` in global scope; import it first in `src/app/_layout.tsx`. After foreground permission, ask `requestBackgroundPermissionsAsync` (iOS "Always"; Android 11+ opens Settings). `startLocationUpdatesAsync` with `Accuracy.Balanced`, a large `distanceInterval` (~400 m) and `deferredUpdatesInterval`; Android foreground-service notification. The task calls the existing `set_my_area` RPC (rounded on the server). Only runs when "Nearby alerts" is on; stop it when off or signed out.
4. **Push token.** `getExpoPushTokenAsync({ projectId })` after the channel is created; store in new table `push_tokens (user_id, token, platform, updated_at)` with RLS own rows only; delete on sign-out; handle `DeviceNotRegistered`.
5. **Server matching + send.** Supabase Edge Function `nearby-push`, triggered when `area_seen_at` changes (database webhook / `pg_net`) or by `pg_cron` every few minutes. For each fresh position: find verified same-field members within 1 mile (reuse the `alert_candidates` logic as a service-role query, respecting blocks), skip pairs alerted in the last 3 h (new `alert_log (viewer, subject, sent_at)`), then POST batches of up to 100 to `https://exp.host/--/api/v2/push/send` (`to`, `title`, `body`, `data: { personId }`, `channelId: "nearby"`). Check receipts ~15 min later (`getReceipts`); prune dead tokens. Limit: 600 notifications/s per project.
6. **App handling.** Tapping a push reuses the existing `personId` listener. Keep the in-app local path for the foreground.

## Privacy and policy changes needed first
- Profile copy says location "is never tracked in the background"; this must change, with an explicit opt-in and an easy off switch.
- Apple and Google review: justify "Always" location; add purpose strings and a privacy policy update.
- Keep positions rounded (about a mile), keep the 30-minute freshness window, never store a location trail, delete `area_*` when alerts are turned off.
- Battery: coarse accuracy, large distance interval, stop when stationary.

## Test plan
Two physical devices on a development build, two verified same-field accounts about 0.5 mi apart. Check: app closed, screen locked, permission revoked mid-run, airplane mode, the 3-hour cooldown, blocked users never alert, and token cleanup.

## Decisions needed
Apple Developer account and FCM project ownership; whether background alerts are opt-in per user (recommended); cron interval vs database webhook; expected user volume (affects push batching).
