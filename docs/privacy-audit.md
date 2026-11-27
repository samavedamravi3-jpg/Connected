# Privacy, agreements and transparency audit (branch `privacy-a11y-transparency`)

Date: 2026-11-27. Not legal advice and not a compliance claim: a lawyer should review `src/legal/documents.ts` before launch.
Policy text lives in `src/legal/` and renders both the in-app screens and `web-policies/` (`npm run legal:build`).

## What the app collects, and where it goes
| Data | Why | Where | Retention |
|---|---|---|---|
| Email, password hash | Sign-in | Supabase Auth | Until account deletion |
| Profile text, photo, experience | The product | Supabase tables, private bucket `profile-photos` | Until edited or account deletion |
| Rough area (~1 km), only if discoverable | Nearby discovery | `area_checkins` | Replaced on each update; deleted with account |
| Requests, messages, notes | The product | Supabase | Until account deletion |
| Blocks, mutes, reports, moderation decisions, spam signals | Safety | Supabase | With the account; audit log de-identified on deletion |
| Chat/assistant text, profile summary | AI suggestions (opt-in) | Own proxy -> Anthropic | Not stored by us |
| Profile/chat/note text | Safety screening | Edge functions -> Groq / Anthropic | Not stored by us (only decision + reason code) |
| Resume PDF | One-off extraction | Server -> Anthropic | File not kept |
| ID check result | Real-member badge | `id_verifications`, `profiles.id_verified` | With the account |
| ID images, selfie, face data | ID check | **Stripe only** (never Connected) | Stripe: <= 1 year; redacted on account deletion |
| Draft, prefs, session | App function | Phone local storage | Cleared on sign-out/deletion |
No analytics, advertising SDK, advertising ID, push token or background location. A test (`legal.test.ts`) fails if one is added to `package.json` or if the source contacts a host the privacy policy does not list.

## Changes made
- Terms/Privacy acceptance (version + time) recorded locally and, once signed in, on the server (`record_consent`, prepared migration).
- 18+ confirmation required to create an account (nothing pre-ticked); the ID check button is disabled without it. No date of birth is collected.
- AI suggestions are off until the user allows them in **Privacy & data**; nothing leaves the phone otherwise.
- **Privacy & data** screen (location visibility, rough-area sharing, nearby alerts, AI, links, deletion) and **Delete my account** (password re-entry + typed DELETE; prepared `delete-account` function redacts the Stripe session, removes photos, de-identifies the audit log, deletes the user; all tables cascade).
- Policies reachable before signup (welcome screen, `/legal`) and from sign-up, Profile and Privacy & data.
- Removed: the `picsum.photos` reachability probe on every Nearby load; duplicate Android permissions; the "once" and "nobody else sees it" wording that did not match behavior; raw error objects in logs (`src/lib/log.ts` logs only kind/code/status).

## Not applied (needs review before anything goes live)
- `supabase/migrations/20261127120000_consent_records.sql` and `supabase/functions/delete-account` (deploy needs the existing Stripe secret; nothing was deployed).
- Until the migration is applied, consent saves fail quietly (logged) and retry on the next launch; until the function is deployed, "Delete my account" shows the generic failure message.

## Founder / legal decisions
1. ~~Support/privacy email~~ set to connectedks@gmail.com (a shared Gmail mailbox: confirm both founders can read it).
2. ~~Operator~~ set to Shritan Samavedam and Kartik Shinde, individuals; update if a company is formed.
3. **Governing law and venue**, limitation-of-liability wording, and state privacy-law rights handling (CCPA etc.).
4. **Retention:** confirm audit-log purge period (none today), backup window, and keep-or-erase of the last saved area when sharing is turned off (currently kept until deletion).
5. **Minors:** the gate is a self-declaration. Decide whether that is enough for a US-only launch; Stripe does not verify minors. No parental-consent flow exists.
6. **Stripe:** confirm Identity terms/biometric-consent wording with counsel; the live pilot stays restricted to one account.
7. **Fonts/images:** Bricolage Grotesque is OFL and bundled. Demo post photos load from picsum.photos (Unsplash licence); event photos come from Meetup/Devpost. The locally-added `assets/events` pack from the main checkout is not on this branch: prove each image's licence before merging it.
8. Any future billing, marketing email, analytics or push needs a policy update, separate opt-in and an unsubscribe path first.
