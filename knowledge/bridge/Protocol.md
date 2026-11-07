# Connected collaboration bridge

Codex and Claude Code share this repository and Obsidian vault. This is a durable, two-way task and report bridge. It does not merge accounts, bypass permissions, or run an unlimited background loop.

## Working agreement
- Codex owns integration, UI, validation, GitHub and publication.
- Claude owns the specific backend or review task assigned on [[Board]].
- Each agent reads `CLAUDE.md`/`AGENTS.md`, [[../Build Status|Build Status]], and [[Board]] before working.
- Claim a task before editing. Named files are the edit boundary; helper files must be named explicitly.
- Once claimed, an edit task holds its files until accepted, including while blocked or requeued. The bridge rejects overlapping claims, resolves symlink aliases, and conservatively ignores path case for portability.
- Review tasks are read-only. Source hashes detect a review becoming stale.
- The owner writes a report. Another agent verifies and accepts it using its own name. The CLI rejects acceptance under the owner’s name, but agent names are self-declared: this is a cooperative workflow, not an authentication or security boundary. The recorded reviewer and evidence provide an audit trail.
- Neither worker deploys or pushes independently. Codex integrates once checks pass.
- Keep secrets, unrelated personal information, and full chat transcripts out of the board.
- `tasks.json` is authoritative; `Board.md` is generated and readable in Obsidian. Updates use an atomic file lock and replace generated files atomically. Do not edit the JSON by hand or remove an active lock.

## Commands (run from the project root)
```sh
npm run bridge -- status
npm run bridge -- inbox codex
npm run bridge -- ack MESSAGE_ID --agent codex
npm run bridge -- prompt backend-privacy
npm run bridge -- claim backend-privacy --agent claude
npm run bridge -- complete backend-privacy --agent claude --report knowledge/bridge/reports/backend-privacy.md
npm run bridge -- accept backend-privacy --agent codex --evidence "Reviewed diff; typecheck and authorization tests passed."
npm run bridge -- send claude --to codex --message "Backend report ready; please review."
```

Use `add ID --owner AGENT --mode edit|review --files comma,separated,files --title "Title" --brief "Acceptance criteria"` for a new task. Optional `--depends task-id` waits until accepted. Use `block ID --agent AGENT --reason "..."` for a real blocker. Use `requeue ID --agent AGENT --reason "..."` to request another pass.

## Dispatch in this setup
Claude Code is signed in in VS Code. Codex sends a short dispatch there, pointing at `npm run bridge -- prompt TASK_ID`. Claude claims the task, works within scope, and writes a report here. Codex reads the report and tests the change. No API key is needed for this existing VS Code session. The separate shell CLI is not currently signed in, so unattended CLI dispatch is not enabled.

To hand work back to Codex, write a handoff using `send`; Codex reads `inbox codex` and acknowledges it with `ack` during the active work loop. `status` includes unread counts. The inbox retains every unread message; the board shows only the latest twelve. The board persists between sessions, but a file update does not independently wake an idle Codex chat. No claim is made that either agent runs while the app is closed.

## Recovery
If a process exits, its task remains active so another agent cannot silently take its files. Inspect the task/report and owner status first. A stale update lock can be removed only after confirming no bridge command is running. Requeue with a reason; file ownership remains reserved until the work is reviewed and accepted. Preserve the report and history.

## References
- [Claude Code programmatic interface](https://code.claude.com/docs/en/headless)
- [Claude project memory](https://code.claude.com/docs/en/memory)
- [Codex durable workflow guidance](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex)
