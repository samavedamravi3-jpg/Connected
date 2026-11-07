# Connected — shared project instructions

Read `knowledge/Home.md`, `knowledge/Build Status.md`, and `knowledge/Decisions.md` before changing code. The Obsidian vault in `knowledge/` is the project's durable context, committed alongside source.

## Product
Help a person with zero connections find someone nearby who has explicitly offered help. Preserve the Connected name, mobile-friendly UI, NYC sample mode, and separate live community mode.

## Guardrails
- Keep demo people, affiliations, counts, events and requests clearly labeled.
- Never invent professional relationships, hiring promises, match percentages, or accepted requests.
- Discovery is opt-in, approximate, and expires in one hour. Never retain precise location trails.
- Authorize every private write and request transition server-side.
- Keep Anthropic keys server-only in ignored local files or hosted secrets.
- Read before changing other teammates' work; use a feature branch and pull request.

## Workflows
`npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run dev`.
Database changes: `npm run db:generate`, inspect generated SQL, and apply new local migrations. Never rewrite applied migrations.

Update `knowledge/Build Status.md` and relevant decision notes after meaningful changes. State any setup or verification limits honestly.

## Coordination with the other agent
Read `knowledge/bridge/Protocol.md` and run `npm run bridge -- status` before starting. Claim your assigned task before editing. Respect file ownership; use `send` for handoffs. Write a report and mark ready for review; the other agent accepts after verification. Do not edit the bridge state directly or spawn more workers unless the owner requests it.
