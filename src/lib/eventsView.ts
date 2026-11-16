/** Which body the Events tab shows. No React here, so it can be unit tested (see __tests__/eventsView.test.ts). */
export type EventsView = 'locked' | 'savedLocked' | 'error' | 'loading' | 'list' | 'savedEmpty' | 'noLive' | 'noMatch';

export type EventsViewInput = {
  /** Live events are hidden until the member check (demo events stay open). */
  locked: boolean;
  withDemo: boolean;
  /** The Saved category is selected. */
  saved: boolean;
  /** Saved event ids (kept whatever the lock). */
  savedCount: number;
  /** Saved live events the lock is hiding right now (0 until loaded). */
  savedHidden: number;
  /** A result for the current demo setting has arrived. */
  loaded: boolean;
  /** The latest request failed. */
  failed: boolean;
  /** Events left after the filters. */
  shown: number;
  liveCount: number;
};

/**
 * The lock wins over loading and empty states: when it hides everything that could show (demo events off), waiting
 * for the fetch or suggesting other filters would be misleading. Saved ids are never dropped, only hidden.
 */
export function eventsView(s: EventsViewInput): EventsView {
  if (s.locked && !s.withDemo) return s.saved ? (s.savedCount ? 'savedLocked' : 'savedEmpty') : 'locked';
  if (!s.loaded) return s.failed ? 'error' : 'loading';
  if (s.shown) return 'list';
  if (s.saved) return s.locked && s.savedHidden ? 'savedLocked' : 'savedEmpty';
  if (!s.liveCount && !s.withDemo) return 'noLive';
  return 'noMatch';
}
