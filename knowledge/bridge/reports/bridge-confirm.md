# bridge-confirm — report

Owner: claude · Mode: review (read-only) · Date: 2026-11-07 · Result: **all six bridge-review findings fixed**

I re-read `scripts/bridge.mjs` and `knowledge/bridge/Protocol.md`, then replayed every original reproduction (plus edge cases) against an unmodified copy of the current script in a scratchpad sandbox. No source or real bridge state was edited; the only writes were this report plus my own `complete`, `send` and `ack` commands.

| # | Finding | Fix | Verified |
|---|---|---|---|
| 1 | Block/requeue released file reservations | Conflict check covers any started, unaccepted edit task | A second claim was rejected after `block` and after `requeue`. The original owner can re-claim, and the files are released only on `accept`. |
| 2 | Case/alias overlap not detected | `fileKey` realpaths the nearest existing parent, then lowercases | `lib/Server.ts` vs `lib/server.ts` rejected. A symlinked dir alias was rejected for an existing file **and** a not-yet-created file. |
| 3 | Self-asserted identity overstated | Protocol line 12 states that names are self-declared, the bridge is not a security boundary, and `acceptedBy`/evidence form the audit trail | Text matches behavior |
| 4 | No inbox; `status` didn't show handoffs | `inbox`, `ack` (recipient only), unread counts in `status`, stable IDs (`legacy-N` for old messages) | Wrong-agent ack rejected. Recipient ack cleared the inbox. The board header no longer claims `status` generates it. |
| 5 | Unescaped board text | `oneLine` collapses whitespace and strips <code>&#124; ` < > [ ]</code> in titles and messages; board written via temp + rename | A multiline message and a crafted title each stayed on one row. The only `##` line left is the real "Recent handoffs" heading. |
| 6 | Secret filter top-level only | Any segment matching `.env*`/`.dev.vars*`, or named `.git`/`.wrangler`/`.sites-runtime`/`.aws` | Rejected: `sub/.env`, `sub/.ENV.local`, `app/.dev.vars`, `.wrangler/state/x.sqlite`, `sub/.git/config`, `.aws/credentials` |

**Tests:** `npm test` → 12/12 pass, including the new `bridge retains paused ownership, detects aliases, rejects secret scopes, and tracks handoffs`.

## Residual notes (non-blocking, no action required)
- **No release path for abandoned tasks.** An edit task that is abandoned and never accepted keeps its files indefinitely, because there is no cancel or reset command. Protocol documents "reserved until accepted", so this is consistent; the human owner would need to intervene.
- **Case folding is deliberately conservative.** On a case-sensitive filesystem, two distinct files that differ only by case would be treated as overlapping. The comment in the code documents this.
- **`.npmrc` is still an allowed scope.** The repo's copy holds no credentials (only `audit`/`fund`/`update-notifier`), and the bridge only hashes scoped files.

Not run: typecheck and build. No source changed in this task.
