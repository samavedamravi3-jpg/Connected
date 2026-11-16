/**
 * The debounced profile save, plus a readiness signal. `ready` turns true only once the server has
 * confirmed the signed-in user's row exists: a save resolved without error, or the row was loaded.
 * No React and no Supabase here, so it can be unit tested (see __tests__/profileSync.test.ts).
 */
import { BLOCKED_MESSAGE, ContentRejectedError, FIELD_LABELS, messagesFor } from './moderation';

/**
 * rejected: the rules or the review said no (retrying alone won't help); `fields` has a message per column.
 * draft: saved, but some text is kept private until the server can review it (retrying later helps).
 */
export type SaveIssue = { message: string; rejected: boolean; draft?: boolean; fields?: Record<string, string> };
export type SyncState = { ready: boolean; saving: boolean; issue: SaveIssue | null };

export const NOT_SAVED_MESSAGE = 'Couldn’t save your profile. Check your connection, then try again.';
export const REJECTED_MESSAGE = 'Some of your profile details weren’t accepted. Edit your profile, then try again.';

/** Why profile-write held text back (its 202 `reason`); older deployments send none. */
export type DraftReason = 'not_configured' | 'provider_error' | 'rate_limited';
export const DRAFT_REASONS: readonly string[] = ['not_configured', 'provider_error', 'rate_limited'];

/** The save went through, except `held` text that waits for review. Nothing in it is public yet; the copy never says otherwise. */
export function draftIssue(held: string[], reason?: DraftReason): SaveIssue {
  const what = held.map((f) => FIELD_LABELS[f] ?? f).join(', ') || 'Some of your text';
  const message =
    reason === 'provider_error'
      ? `Saved. We couldn’t check ${what} just now, so it’s kept as a private draft only you can see. Try again in a moment.`
      : reason === 'not_configured'
        ? `Saved privately. Checking isn’t available right now, so ${what} is kept as a private draft only you can see. It goes public once it’s been checked; saving again retries.`
        : reason === 'rate_limited'
          ? `Saved privately. You’ve made a lot of edits this hour, so ${what} is kept as a private draft only you can see. Try again later.`
          : `Saved. We couldn’t check ${what} yet, so it’s kept as a private draft only you can see. Try again later.`;
  return { message, rejected: false, draft: true };
}

/** Moderation or database validation said no (retrying alone won't help); anything else reads as a connection problem. */
export function saveIssue(e: unknown): SaveIssue {
  if (e instanceof ContentRejectedError) return { message: e.message, rejected: true, fields: messagesFor(e.fields) };
  const err = e as { message?: string; code?: string } | null;
  if (err?.message === BLOCKED_MESSAGE) return { message: BLOCKED_MESSAGE, rejected: true };
  if (err?.code === 'rate_limited' && err.message) return { message: err.message, rejected: false };
  // Postgres classes 22 (data exception) and 23 (constraint violation).
  if (/^2[23]/.test(err?.code ?? '')) return { message: REJECTED_MESSAGE, rejected: true };
  return { message: NOT_SAVED_MESSAGE, rejected: false };
}

/** `save` resolves `{ held, reason? }` when the row was saved but some text is held back as a draft (see draftIssue). */
export function createProfileSync<R extends { id: string }>(save: (row: R) => Promise<{ held: string[]; reason?: DraftReason } | void>, delayMs: number, onChange: (s: SyncState) => void) {
  let owner: string | null = null;
  let pending: R | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<boolean> | null = null;
  let state: SyncState = { ready: false, saving: false, issue: null };
  const set = (p: Partial<SyncState>) => {
    state = { ...state, ...p };
    onChange(state);
  };

  /** Another signed-in user (or none): drops whatever was queued for the previous one. */
  function setOwner(id: string | null) {
    if (id === owner) return;
    owner = id;
    pending = null;
    clearTimeout(timer);
    set({ ready: false, saving: false, issue: null });
  }

  /** The server returned this user's row, so it exists. */
  function confirm(id: string) {
    if (id === owner && !state.ready) set({ ready: true });
  }

  /** Queue `row` and save it after `delayMs` of quiet. */
  function schedule(row: R) {
    setOwner(row.id);
    pending = row;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  }

  /** Save now (with `row` as the latest, if given). Resolves true once the server has confirmed the row. */
  async function flush(row?: R | null): Promise<boolean> {
    if (row) {
      setOwner(row.id);
      pending = row;
    }
    clearTimeout(timer);
    while (inflight) await inflight;
    if (!pending) return state.ready;
    const next = pending;
    const me = owner;
    pending = null;
    set({ saving: true, issue: null }); // a retry clears the old reason while it runs
    inflight = save(next)
      .then(
        (result) => {
          if (owner === me) {
            const held = result?.held ?? [];
            if (held.length) pending ??= next; // the row exists; keep it so "Try again" re-sends the held text
            set({ ready: true, saving: false, issue: held.length ? draftIssue(held, result?.reason) : null });
          }
          return owner === me;
        },
        (e) => {
          if (owner === me) {
            pending ??= next; // keep it for "Try again"
            set({ saving: false, issue: saveIssue(e) });
          }
          return false;
        },
      )
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  return { setOwner, confirm, schedule, flush };
}
