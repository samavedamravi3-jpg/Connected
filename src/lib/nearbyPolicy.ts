/**
 * Nearby "You should connect" recommendations: pure rules, no React Native imports (tested with node:test).
 * The server (alert_candidates) decides who is eligible; this file only parses its answer, words the explanation from
 * the returned shared labels / intents, and applies the per-phone limits (cooldown, daily cap, gap, alert mutes).
 * See docs/nearby-alerts.md.
 */
import { labelKey, uniqueLabels } from './lists';

export const INTENTS = ['they_offer_mentorship', 'they_offer_advice', 'they_seek_mentorship', 'they_seek_advice'] as const;
export type IntentKey = (typeof INTENTS)[number];

export type NearbyRec = {
  id: string;
  /** First name + last initial, as the server returns it. */
  name: string;
  /** Upper bound of a coarse bucket (0.5, 1, 2 or 5 mi). */
  distanceBucketMi: number;
  sharedLabels: string[];
  sharedIntents: IntentKey[];
  /** Simulated for the demo: never from the server, never recorded, never routed to real flows. */
  demo?: boolean;
};

export const RADIUS_OPTIONS_MI = [0.25, 0.5, 1, 2, 5] as const;
export const COOLDOWN_OPTIONS_H = [4, 12, 24, 72] as const;
/** profiles_before_write rounds positions to 0.01 degrees: about 1.1 km north-south. */
export const LOCATION_ROUNDING = 'about 1 km (0.7 mi)';

export type Policy = { cooldownH: number; dailyCap: number; minGapMin: number };
export const POLICY_DEFAULTS: Policy = { cooldownH: 24, dailyCap: 3, minGapMin: 15 };

const H = 3_600_000;

// Same list as public.nearby_label_meaningful: generic social labels are never a reason on their own.
const NOT_A_REASON = new Set([
  'coffee', 'tea', 'lunch', 'dinner', 'breakfast', 'brunch', 'drinks', 'food', 'beer', 'wine', 'chat', 'chatting',
  'hanging out', 'meeting up', 'meetups', 'networking', 'socializing', 'friends', 'making friends', 'walks',
]);
export const isMeaningfulLabel = (s: string) => !!labelKey(s) && !NOT_A_REASON.has(labelKey(s));

/** Labels both lists contain, in `mine`'s spelling, deduped and filtered like the server. Used only by the demo. */
export function sharedLabels(mine: readonly string[], theirs: readonly string[]): string[] {
  const have = new Set(theirs.map(labelKey));
  return uniqueLabels(mine).filter((l) => isMeaningfulLabel(l) && have.has(labelKey(l))).slice(0, 5);
}

/** Validates RPC rows (trust boundary): drops malformed rows and rows without a reason, dedupes by id. */
export function parseRecs(rows: unknown): NearbyRec[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: NearbyRec[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    if (!r || typeof r.id !== 'string' || typeof r.name !== 'string' || seen.has(r.id)) continue;
    const labels = uniqueLabels(Array.isArray(r.shared_labels) ? (r.shared_labels as unknown[]).filter((x): x is string => typeof x === 'string') : []).filter(isMeaningfulLabel);
    const intents = (Array.isArray(r.shared_intents) ? r.shared_intents : []).filter((x): x is IntentKey => (INTENTS as readonly unknown[]).includes(x));
    const d = Number(r.distance_bucket_mi);
    if (!labels.length && !intents.length) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name.trim() || 'A member', distanceBucketMi: Number.isFinite(d) && d > 0 ? d : 1, sharedLabels: labels, sharedIntents: [...new Set(intents)] });
  }
  return out;
}

const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

const INTENT_TEXT: Record<IntentKey, (first: string) => string> = {
  they_offer_mentorship: (f) => `${f} is open to mentoring, which you're looking for.`,
  they_offer_advice: (f) => `${f} offers career advice, which you're looking for.`,
  they_seek_mentorship: (f) => `${f} is looking for a mentor, and you offer help.`,
  they_seek_advice: (f) => `${f} is looking for career advice, and you offer help.`,
};

/** The card / notification text, built only from what the server said you share. Never a score or percentage. */
export function explainRec(r: Pick<NearbyRec, 'name' | 'sharedLabels' | 'sharedIntents'>): string {
  const first = r.name.split(/\s+/)[0] || r.name;
  const parts = [`${r.name} is nearby.`];
  if (r.sharedLabels.length) parts.push(`You both selected ${listJoin(r.sharedLabels)}.`);
  // Mentorship says more than advice; one intent line keeps it short.
  const intent = INTENTS.find((k) => r.sharedIntents.includes(k));
  if (intent) parts.push(INTENT_TEXT[intent](first));
  parts.push('Want to connect?');
  return parts.join(' ');
}

export const distanceText = (mi: number) => (mi <= 0.5 ? 'within about half a mile' : `within about ${mi} mi`);

// ---------------------------------------------------------------------------------------------------------------
// Per-phone limits. Stored per signed-in user in AsyncStorage, so they survive restarts.
// ---------------------------------------------------------------------------------------------------------------

export type Ledger = { last: Record<string, number>; sent: number[]; muted: string[] };
export const emptyLedger = (): Ledger => ({ last: {}, sent: [], muted: [] });
export const ledgerKey = (userId: string) => `nearby.ledger.v1:${userId}`;

export function parseLedger(raw: string | null | undefined): Ledger {
  try {
    const j = JSON.parse(raw ?? '') as Partial<Ledger>;
    const last: Record<string, number> = {};
    for (const [k, v] of Object.entries(j.last ?? {})) if (typeof v === 'number' && Number.isFinite(v)) last[k] = v;
    return {
      last,
      sent: Array.isArray(j.sent) ? j.sent.filter((x) => typeof x === 'number' && Number.isFinite(x)) : [],
      muted: Array.isArray(j.muted) ? [...new Set(j.muted.filter((x) => typeof x === 'string'))] : [],
    };
  } catch {
    return emptyLedger();
  }
}

/** Why `rec` can't be shown now, or null when it can. */
export function blockedReason(l: Ledger, id: string, now: number, p: Policy): 'muted' | 'cooldown' | 'daily_cap' | 'gap' | null {
  if (l.muted.includes(id)) return 'muted';
  if (now - (l.last[id] ?? -Infinity) < p.cooldownH * H) return 'cooldown';
  const today = l.sent.filter((t) => now - t < 24 * H);
  if (today.length >= p.dailyCap) return 'daily_cap';
  if (today.length && now - Math.max(...today) < p.minGapMin * 60_000) return 'gap';
  return null;
}

/** The first recommendation allowed right now (server order = best first), or null. */
export const pickRec = (recs: NearbyRec[], l: Ledger, now: number, p: Policy) => recs.find((r) => !r.demo && !blockedReason(l, r.id, now, p)) ?? null;

/** Records a shown alert and forgets entries older than a week (the longest cooldown allowed). */
export function recordShown(l: Ledger, id: string, now: number): Ledger {
  const last: Record<string, number> = {};
  for (const [k, t] of Object.entries({ ...l.last, [id]: now })) if (now - t < 168 * H) last[k] = t;
  return { last, sent: [...l.sent.filter((t) => now - t < 24 * H), now], muted: l.muted };
}

export const muteInLedger = (l: Ledger, id: string): Ledger => ({ ...l, muted: l.muted.includes(id) ? l.muted : [...l.muted, id] });

// ---------------------------------------------------------------------------------------------------------------
// Controller: one poll loop per active session. Everything platform-specific is injected, so cleanup is testable.
// ---------------------------------------------------------------------------------------------------------------

export type Storage = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };
export type ControllerDeps = {
  userId: string;
  policy: Policy;
  everyMs: number;
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(h: unknown): void;
  storage: Storage;
  /** Saves your coarse position first (set_my_area). Optional: off when you don't share an area. */
  beforeFetch?: () => Promise<void>;
  fetchRecs(): Promise<NearbyRec[]>;
  /** Shows the in-app card. Always called for an allowed recommendation. */
  onRecommend(r: NearbyRec): void;
  /** System notification; resolves false when not allowed (the card is the fallback). */
  notify(r: NearbyRec): Promise<boolean>;
  onResult?(recs: NearbyRec[], error: string | null): void;
};

export function createNearbyController(d: ControllerDeps) {
  let timer: unknown = null;
  let alive = false;
  let busy = false;
  const key = ledgerKey(d.userId);

  async function tick() {
    if (!alive || busy) return;
    busy = true;
    try {
      if (d.beforeFetch) await d.beforeFetch();
      const recs = await d.fetchRecs();
      if (!alive) return; // stopped while waiting: drop the answer
      d.onResult?.(recs, null);
      const ledger = parseLedger(await d.storage.getItem(key));
      if (!alive) return;
      const now = d.now();
      const rec = pickRec(recs, ledger, now, d.policy);
      if (!rec) return;
      await d.storage.setItem(key, JSON.stringify(recordShown(ledger, rec.id, now)));
      if (!alive) return;
      d.onRecommend(rec);
      await d.notify(rec);
    } catch (e) {
      // A failure shows nothing and keeps nothing: stale people must not keep alerting.
      if (alive) d.onResult?.([], e instanceof Error ? e.message : 'Nearby check failed');
    } finally {
      busy = false;
    }
  }

  return {
    /** Starts polling; resolves when the first check is done. */
    start(): Promise<void> {
      if (alive) return Promise.resolve();
      alive = true;
      timer = d.setInterval(() => void tick(), d.everyMs);
      return tick();
    },
    stop() {
      alive = false;
      if (timer != null) d.clearInterval(timer);
      timer = null;
    },
    tick,
    get running() {
      return alive;
    },
  };
}

/** "Mute alerts for this person": only stops recommendations about them on this phone (not a block or a map mute). */
export async function muteAlertsFor(storage: Storage, userId: string, personId: string): Promise<void> {
  const key = ledgerKey(userId);
  await storage.setItem(key, JSON.stringify(muteInLedger(parseLedger(await storage.getItem(key)), personId)));
}

/** Why recommendations are paused, in plain words, or null when they can run. Order = what to fix first. */
export function pausedReason(s: {
  signedIn: boolean; realMember: boolean; alertsOn: boolean; discoverable: boolean; sharingArea: boolean; fieldSet: boolean; locationGranted: boolean; mapLive: boolean;
}): string | null {
  if (!s.alertsOn) return 'Nearby alerts are off.';
  if (!s.signedIn) return 'Sign in to get nearby recommendations.';
  if (!s.realMember) return 'Verify your ID to get recommendations about real members.';
  if (!s.discoverable || !s.sharingArea) return 'Discovery is paused: turn on "Show me in nearby discovery" and "Show my rough area".';
  if (!s.fieldSet) return 'Set your field in Preferences: recommendations are same-field only.';
  if (!s.locationGranted) return 'Allow location while using the app.';
  if (!s.mapLive) return 'Keep the Map tab open with live location on.';
  return null;
}
