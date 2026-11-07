# Connected

**Your next connection is closer than you think.**

Connected helps people starting with zero connections meet nearby people who are willing to help. A mobile-friendly hackathon app with goal-based onboarding, an interactive map, company and distance filters, community events, saved profiles, and consensual chat requests.

## Run locally

Requires Node 22.13+ and npm.

```sh
npm ci
npm run build
npm run db:local
npm run dev
```

Open the Local URL printed by the server (normally http://127.0.0.1:5173). Explore the NYC demo without signing in, or complete onboarding and use the development sign-in to save a profile. Local development uses a synthetic account; hosted Sites uses its real sign-in boundary.

## Included

- Four-step onboarding: career goal, background, help offered, privacy preferences.
- Leaflet map with company markers, people, event pins, and demo hotspots.
- Search, industry/company/distance filters, availability filter.
- Explainable profile matching using explicitly offered help.
- Saved people/events and authenticated request, accept, decline, cancel actions.
- Public-venue event creation.
- Approximate opt-in discovery that expires in one hour.
- Server-side Claude introduction drafts with editable, labeled template fallback.
- Persistent D1/Drizzle data and server-side authorization.

NYC demo people, affiliations, activity counts, and event listings are fictional and labeled. Live community mode contains only consenting profiles and user-created events. Hotspot counts are illustrative, not live density data.

## Claude setup

Claude Code is recommended in `.vscode/extensions.json` and reads `CLAUDE.md`. Project context lives in the Obsidian vault at `knowledge/`.

The Codex–Claude bridge is in `knowledge/bridge/`. Run `npm run bridge -- status` for assignments, read `Protocol.md`, and claim a task before editing. The task board provides file ownership, persistent handoffs, source snapshots, and independent acceptance. VS Code is the authenticated Claude dispatch surface; this does not run agents unattended or require an API key.

For app-generated drafts, create an Anthropic API key in the Anthropic Console. Copy `.env.example` to `.dev.vars` and set `ANTHROPIC_API_KEY`. Never paste keys into source or commit them. `ANTHROPIC_MODEL` optionally overrides the default. Restart the local server after changing settings. Configure the same key as a hosted runtime secret for the deployed site. The key stays on the server; only profile names, goal, and offered help go to Claude. There is a 20-draft/user/day limit. Without the key, the UI clearly labels its template fallback.

## Team workflow

Repository: https://github.com/samavedamravi3-jpg/Connected

```sh
git clone https://github.com/samavedamravi3-jpg/Connected.git
cd Connected
git switch -c feature/your-feature
```

Open the folder in VS Code. In Obsidian, choose **Open folder as vault** and select `knowledge/`. Read `knowledge/Home.md`, `knowledge/Build Status.md`, and `CLAUDE.md`. Keep notes with code so every teammate and agent has the same decisions. Use pull requests for integration.

```sh
npm run typecheck
npm test
npm run build
```

Schema changes: edit `db/schema.ts`, run `npm run db:generate`, inspect the SQL, rebuild, then run `npm run db:local`. Applied migrations are immutable. Local and production data are separate. Production Sites applies migrations during publication.

## Deployment and limits

The tracked `.openai/hosting.json` identifies the private Sites project. The application compiles to a Cloudflare Worker. Production identity depends on Sites-injected headers; do not deploy the Worker directly to the public internet without replacing that trusted authentication boundary. Third-party map tiles and fonts require network access.

Real event provider ingestion, verified employer affiliations, full messaging, moderation/reporting, and consent-based multi-hop introductions are future work. This version uses short chat requests and a shared public-venue recommendation, not a messaging service or guaranteed referral.

## References

- [Leaflet 1.9.4](https://leafletjs.com/reference-1.9.4.html)
- [Claude Messages API](https://platform.claude.com/docs/en/api/overview)
- [Claude model IDs](https://platform.claude.com/docs/en/models/overview)
