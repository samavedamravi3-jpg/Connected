/**
 * The debounced profile save, plus a readiness signal. `ready` turns true only once the server has
 * confirmed the signed-in user's row exists: a save resolved without error, or the row was loaded.
 * No React and no Supabase here, so it can be unit tested (see __tests__/profileSync.test.ts).
 */
import { BLOCKED_MESSAGE } from './moderation';

export type SaveIssue = { message: string; rejected: boolean };
export type SyncState = { ready: boolean; saving: boolean; issue: SaveIssue | null };

export const NOT_SAVED_MESSAGE = 'Couldn’t save your profile. Check your connection, then try again.';
export const REJECTED_MESSAGE = 'Some of your profile details weren’t accepted. Edit your profile, then try again.';

/** Moderation or database validation said no (retrying alone won't help); anything else reads as a connection problem. */
export function saveIssue(e: unknown): SaveIssue {
  const err = e as { message?: string; code?: string } | null;
  if (err?.message === BLOCKED_MESSAGE) return { message: BLOCKED_MESSAGE, rejected: true };
  // Postgres classes 22 (data exception) and 23 (constraint violation).
  if (/^2[23]/.test(err?.code ?? '')) return { message: REJECTED_MESSAGE, rejected: true };
  return { message: NOT_SAVED_MESSAGE, rejected: false };
}

export function createProfileSync<R extends { id: string }>(save: (row: R) => Promise<void>, delayMs: number, onChange: (s: SyncState) => void) {
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
        () => {
          if (owner === me) set({ ready: true, saving: false, issue: null });
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
