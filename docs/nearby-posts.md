# Nearby posts

Short-lived, image-first posts seen by people around a broad Charlotte neighborhood. Frontend is built; the backend is not. Until it exists, `src/lib/posts/source.ts` (`mockSource`) runs on the phone.

## Files
| Piece | File |
| --- | --- |
| Types and rules (pure, tested) | `src/lib/posts/model.ts`, `src/lib/__tests__/posts.test.ts` |
| Data access interface + mock | `src/lib/posts/source.ts` (`PostsSource`) |
| Local state (saved, responded, area, alerts, draft) | `src/lib/posts/store.ts` |
| Viewer area and relationship | `src/lib/posts/viewer.ts` |
| Demo content | `src/data/demoPosts.ts` (Unsplash photos via picsum.photos) |
| Feed tab | `src/app/(tabs)/nearby.tsx` |
| Composer | `src/app/post/new.tsx` |
| Post detail | `src/app/post/[id].tsx` |
| Components | `src/components/posts/PostItem.tsx`, `PostPhoto.tsx`, `RespondSheet.tsx` |

## What is mocked today
- Demo posts are generated on the phone from demo people and labeled Demo.
- Your own posts are saved on this phone only; nobody else sees them.
- Responses use the app's existing connection-request flow. Demo authors reply through the existing demo simulation.
- "Replies to your posts" in Activity stays empty: there is no backend to link an incoming request to a post.
- Offline detection is a quick reachability check before listing.

## Backend requirements

### Tables
- `nearby_posts`: `id, author_id, image_path, image_w, image_h, image_alt, caption (<=280), intent, area_id, area_lat, area_lng (neighborhood centre, never the author's position), radius_mi in (1,3,5), created_at, expires_at, closed_reason null|found|sorted|paused, deleted_at`.
- `nearby_post_responses`: `post_id, responder_id, request_id, created_at`. Links a connection request to the post it answers.
- `nearby_alert_prefs`: `user_id, enabled, intents[], last_sent_at`.

### Media upload
- Private storage bucket. The client already re-encodes to JPEG (no EXIF/GPS) and caps width at 1600 px. The server must still strip metadata, verify the MIME type and size, and generate a thumbnail.
- Signed, short-lived URLs only, issued to viewers who pass the audience check below.
- Retention: hiding at expiry is not deletion. Decide and document how long media is kept after expiry or deletion, and run a scheduled purge.

### Audience enforcement (server-side, not UI)
- `list_nearby_posts(area_id, radius_mi)`: a security-definer RPC that returns only posts where the distance between neighborhood centres is within both the post's radius and the viewer's radius, `now() < expires_at`, `deleted_at is null`, not hidden, and no block in either direction.
- The viewer's area must be a neighborhood id or a server-rounded position, rate-limited like `set_my_area`, so the radius can't be used to triangulate.
- `get_nearby_post(id)` runs the same checks; the app treats `null` as unavailable and re-checks after notification taps.
- Never return author coordinates. Show neighborhood names only.

### Expiration
- `expires_at` is set by the server from the chosen 2/6/24 hours; the client value is advisory.
- Expired posts leave discovery and reject new responses. Accepted conversations (requests and messages) are untouched.
- Saved posts resolve through `get_nearby_post`, so expired ones disappear from saved lists.

### Moderation
- Caption and image description go through the existing `profile-write`-style check (rules + AI review), and images through an image-safety check, before a post becomes visible.
- Reports: one per reporter per post. Auto-hide after N reports from verified members, like profiles. An admin review queue.
- Rate limits: posts per user per day, responses per hour.
- Blocks hide posts both ways.

### Requests
- A response creates a normal `connection_requests` row plus a `nearby_post_responses` link, in one transaction that rejects it if the post is closed, expired, deleted or blocked, or a request is already pending.
- Accepted connections continue in chat. Posting never opens unrestricted messaging.

### Notifications
- In-app: responses to your posts (from `nearby_post_responses`) and acceptances of your responses.
- Push: only for responses and acceptances, plus opt-in nearby alerts as one grouped digest, at most every 6 hours, matching the chosen intents. Never one push per new post.
- Notification payloads carry only the post id. Opening a post re-checks availability.

## Not verified
- Not yet tested on a physical phone, only type-checked, linted, unit-tested and bundled.
- Camera use in builds needs the updated `cameraPermission` text in `app.json`. Expo Go already has camera access.
