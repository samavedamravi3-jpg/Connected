# Nearby recommendations (phase 5)

"Kayla S. is nearby. You both selected Fintech. Kayla is open to mentoring, which you're looking for. Want to connect?"

**Foreground only.** Recommendations run only while Connected is open on the Map tab, with live location on. This
works in Expo Go. Expo Go **cannot** give reliable alerts when the app is closed or in the background, and this build
doesn't try to. See "What background alerts would need" below.

## Who can be recommended (server, authoritative)

The rules live in `public.alert_candidates()` (`supabase/migrations/20261116200000_nearby_recommendations.sql`, mirrored
in `schema.sql`). The function is a SECURITY DEFINER with `search_path = ''`, uses `auth.uid()`, is granted to
`authenticated` only, and allows 12 calls a minute per user (`alert_rate`, server-only since phase 6: the app can't read,
reset or delete its counter).

Both people must:
- be real members (`is_real_member`: a live ID + selfie check)
- be in nearby discovery (`discoverable`) and share their rough area (`share_mode = 'area'`)
- not be hidden. Auto-hide after 3 reports is the only suspension that exists today.
- have a stored area seen in the last **30 minutes** (the existing freshness policy)
- not be blocked by, or muted by, the other person (both directions checked)

The viewer must also:
- have switched nearby alerts on (`nearby_alert_prefs.alerts_enabled`). This is opt-in: with no row there are no results.
- have a field set. The candidate must have the same field.

Distance:
- The candidate must be within the viewer's alert radius (`alert_radius_mi`, default 1 mi).
- The radius is measured from the **viewer's own stored coarse area**. Its freshness (`area_seen_at`) comes only from
  `set_my_area`; a position written any other way (profile-write) clears it, so alerts never measure from a point
  `set_my_area` didn't check (phase 6).
- There is no origin parameter. The old `alert_candidates(lat, lng, radius_mi)` is dropped, so the app can't ask "who is near this point". The map's panned centre and search distance are never used.

There must be a reason. At least one of:
- **Shared label.** The same interest or skill chip from the public profile (`interests`, `skills`). Labels are compared like the app's `labelKey`: NFKC, trimmed, single spaces, lower case, and deduped. Generic social labels on their own never count: coffee, tea, lunch, drinks, networking and the rest of the list in `nearby_label_meaningful`. Meet mode, availability, food and diet are never used.
- **Complementary intent.**
  - `they_offer_mentorship` / `they_offer_advice`: you want mentorship or advice (your goals), and they're open to helping (mode offering or both).
  - `they_seek_mentorship` / `they_seek_advice`: the same the other way round.
  - Two people who both only want "peers" is not a complementary intent.

Experience entries and resume data are **never read**, whatever `show_experience` says. So hidden experience can never leak into an explanation.

The function returns only:
- `id`
- first name + last initial
- `distance_bucket_mi`: 0.5, 1, 2 or 5
- `shared_labels`: up to 5, in the viewer's spelling
- `shared_intents`

It returns no score, no field, no coordinates and no raw distance. The order is deterministic: shared labels × 2 + intents × 3, then distance, then id. At most 20 rows.

## Settings

`nearby_alert_prefs` (owner can read). It's written only by `set_nearby_alert_prefs(enabled, radius_mi, cooldown_hours)`, which:
- checks the radius is one of 0.25 / 0.5 / 1 / 2 / 5 mi
- checks the cooldown is 1–168 h
- rate-limits through `rate_check`

The app has no table write grants.

Profile > Visibility & alerts has:
- the on/off switch
- **Alert distance**: separate from the map's Filters search distance, and labelled that way
- **Same person again after**: 4 h / 12 h / 1 day / 3 days
- the accuracy limit
- what is shared
- the note that alerts only work while the app is open

The app keeps these values on the phone (AsyncStorage) and syncs them to the server. After sign-in it pulls the server's values first; if it can't load them, nothing is pushed.

## On the phone (src/lib/nearbyPolicy.ts, pure, tested)

| Limit | Default | Where |
|---|---|---|
| Same person again | 24 h (configurable 4 h–3 days) | `blockedReason`, per person id |
| Alerts per day | 3, rolling 24 h | `POLICY_DEFAULTS.dailyCap` |
| Gap between any two alerts | 15 min | `POLICY_DEFAULTS.minGapMin` |
| Poll | every 60 s while the map is open | `useNearbyRecommendations` |

- The ledger is stored per signed-in user at `nearby.ledger.v1:<userId>` in AsyncStorage, so it survives restarts.
- "Mute alerts for this person" adds them to the ledger. It stops recommendations about them on this phone only. They're not told, and it's not a block or a map mute; the existing Mute/Block in the profile menu do more.

Recommendations stop when any of these happens:
- alerts are switched off
- you sign out
- you're not a real member
- discovery or area sharing is paused
- your field isn't set
- location permission is revoked
- live location is turned off
- the map loses focus
- the app goes to the background

Stopping clears the timer and throws away any in-flight answer (tested with injected fakes). The location watcher is `useLiveLocation`'s foreground watcher, which also stops on blur or background.

A failed check shows nothing and leaves nothing behind.

Notifications are optional:
1. The app explains what alerts do first, then asks for permission.
2. If notifications are denied or blocked, you still get the in-app card. Profile shows "in-app only" and an Open Settings button.
3. The notification text is exactly the card's explanation.

Tapping a notification goes through `useNotificationRouting` at the root, which also handles a tap that launched the app. It opens `/person/[id]?nearby=1`. The person screen calls `alert_candidates()` again and shows one of:
- "still nearby"
- "No longer nearby"
- "Couldn't check"

The card's **View profile** does the same. Nothing is ever sent automatically: requests and messages go through the person screen's existing compose flow, which the user starts.

## Demo

"Demo: simulate a nearby match" (Layers sheet) places a sample person 0.2 mi away and shows a card tagged **Demo**. The card's labels are computed on the phone from the sample person's chips. If notifications are allowed, it also sends a notification titled "Demo · …".

The demo is isolated:
- It never calls the RPC.
- It never touches the ledger, cooldown or cap.
- Its notification carries `demoPersonId`, not `personId`.
- It opens the demo profile (`nearby=demo`), where requests are the existing local simulation.

## Privacy

- Positions are rounded to 0.01° by `profiles_before_write`, about 1.1 km north-south (0.7 mi). The UI says "rounded to about 1 km (0.7 mi)", and distances are buckets ("within about half a mile"). Because of the rounding, a 0.25 mi radius effectively means "the same rounded area".
- Shared with the other person when you're recommended to them:
  - your first name + last initial
  - the bucket
  - the labels or intent you both have
- Never shared: your exact location, experience, resume, or a score.
- `set_my_area` (phase 6) is a SECURITY DEFINER function and the only way to set your position (the app has no UPDATE
  on `profiles`). Refreshing the same rounded spot is free; **30 position changes an hour** (`rate_check('area_move')`);
  a move of **more than 25 miles within 10 minutes** of your last check-in is refused (`implausible_move`). The last
  check-in is kept in the private `area_checkins` table, so writing a position through profile-write doesn't reset it.
  These limits fit walking, transit and driving across town (the app polls once a minute); a long fast drive can hit
  the 30-an-hour limit, which pauses recommendations until the hour rolls over.
- Known limit (residual): a modified app can still lie about its own GPS position. Within the limits above it can
  place itself anywhere up to 25 miles from its last check-in every 10 minutes, or anywhere at all after 10 quiet
  minutes, and look up who is near that point (about 6 arbitrary origins an hour, 30 nearby cells an hour). That is
  inherent to client-reported location.
- **Map positions of others.** Any real member can read other visible members' rounded area (`area_lat`, `area_lng`,
  `area_name`): the map needs them, and they are the same 0.01° cells shown on the map. `nearby_profiles` takes any
  map centre (the map pans anywhere) but returns only the readable columns, clamps the radius to **25 miles** and is
  rate limited (200 calls an hour; the map refreshes every 45 s). Not readable by other members since phase 6:
  `area_seen_at` (no "online now" signal), `hidden`, `created_at`, `updated_at`, badge details, goals, challenges,
  traits, previous field, share mode. Residual: because the area cell updates while someone has the map open, a
  member can still follow another member's movement at about 1 km resolution. Your own full row comes from
  `my_profile()`.

## Apply (owner)

1. Phases 3 and 4 first: `20261116120000_mandatory_id_gate.sql`, then `20261116180000_moderation_write_path.sql`.
2. `supabase/migrations/20261116200000_nearby_recommendations.sql`. It's idempotent. Older app builds that call `alert_candidates(lat, lng, radius_mi)` then get "function not found" and show no alerts (fail closed).
3. `supabase/migrations/20261116220000_review_fixes.sql` (phase 6). Older app builds that read profiles with `select *` then get "permission denied" (fail closed: no people shown, own profile not loaded); ship the matching app build.
4. Run `supabase/tests/id_gate.sql`, `moderation.sql`, `nearby.sql` and `review_fixes.sql`. All roll back and must end with `… all checks passed`.
5. Reload the app.

No secrets are needed.

Local check: run these against a fresh database in a throwaway `postgis/postgis:16-3.4` container:
1. `local_stub.sql`
2. `schema.sql`
3. the four migrations
4. the tests

Create the database with `create database t template template0`, because the image's default database already has PostGIS in `public`.

## What background alerts would need (described, not built)

None of this works in Expo Go.

1. **Development build.** `npx eas-cli@latest build --profile development` for iOS and Android. SDK 58 docs say:
   - iOS background location "is not supported in the Expo Go app".
   - "Foreground and background services are not available in Expo Go for Android."
2. **Background location.** `expo-location` `startLocationUpdatesAsync` with a task defined at the top level via `TaskManager.defineTask`.
   - Use coarse accuracy and a large distance interval.
   - Ask for **Always** permission (`requestBackgroundPermissionsAsync`) after foreground permission. On Android 11+ that opens Settings, and iOS "Allow Once" can't be upgraded in the same session.
   - Config plugin: `isIosBackgroundLocationEnabled` (adds the `location` UIBackgroundMode) and `isAndroidBackgroundLocationEnabled` (`ACCESS_BACKGROUND_LOCATION`). Android 14+ also needs `FOREGROUND_SERVICE_LOCATION`, plus a visible foreground-service notification.
   - Add clear purpose strings.
3. **Or geofencing.** `startGeofencingAsync` is cheaper on battery but limited: up to 20 regions on iOS and 100 on Android. It suits "near a venue", not "near a moving person".
4. **Server-side evaluation.** Phones can't see each other, so the server must run the same `alert_candidates` rules per pair when an `area_seen_at` changes (database webhook or `pg_cron`). Apply the cooldown and cap in a server `alert_log`.
5. **Push notifications.** Use Expo push tokens (`getExpoPushTokenAsync`, `projectId`) in a `push_tokens` table, an FCM v1 key for Android, and APNs for iOS (paid Apple Developer account). Check receipts and prune dead tokens. Remote push isn't available in Expo Go on Android (SDK 53+).
6. **Store review and privacy.**
   - Apple and Google both scrutinise "Always" location. Expect to justify it, update the privacy policy and the in-app copy ("never tracked in the background" would no longer be true), and offer an easy off switch.
   - Delete `area_*` when alerts are turned off, and keep no location trail.
7. **Battery and privacy cost.** Continuous background location drains the battery and creates a movement history on the server. Keep the 0.01° rounding and the 30-minute freshness window, and store only the latest area.

Earlier notes on the same plan: `docs/background-alerts-plan.md`.
