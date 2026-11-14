/**
 * "Someone is nearby" alerts. Runs only while the map is open and live location is on:
 * no background location, no push server. Each real member alerts at most once every 3 hours.
 * Alerts are same-field only: your field must be set, and a person or event must match it.
 * Only verified people trigger person alerts.
 *
 * Real path: while the map is open, `useNearbyPresence` saves your rounded position (set_my_area) and asks
 * Supabase/PostGIS for verified same-field members within 1 mile (alert_candidates). Those, plus any
 * people already loaded for the map, feed `useNearbyAlerts`.
 * Alerts while the app is closed need background location + push (a development build): docs/background-alerts-plan.md.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { fieldLabel } from '@/data/options';
import type { CommunityEvent, FieldId, LatLng, Person, Prefs } from '@/data/types';
import { fetchAlertCandidates, setMyArea, type AlertHit } from './backend';
import { distanceMi } from './geo';
import { matchPoints } from './match';

export const ALERT_RADIUS_MI = 1; // keep in step with alert_candidates (radius default 1, capped at 5 in SQL)
const COOLDOWN_MS = 3 * 3_600_000;
const CHANNEL = 'nearby';
const EVENT_SOON_MS = 60 * 60_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Asks for notification permission. Returns true if alerts can be shown. */
export async function enableNearbyAlerts(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      // 6 = AndroidImportance.HIGH (the enum is re-exported in a way the import linter can't follow).
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'People nearby', importance: 6 });
    }
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export type AlertPermission = 'granted' | 'denied' | 'undetermined';

/** Reads the notification permission without prompting. */
export async function alertPermission(): Promise<AlertPermission> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'denied';
  }
}

/** Live, in-person events in your field that start within the hour and are within 1 mile of `me`. */
export function eventsStartingSoon(me: LatLng, events: CommunityEvent[], myField: FieldId | null | undefined, now: number, mi = ALERT_RADIUS_MI) {
  if (!myField) return [];
  return events.filter(
    (e) => !e.isDemo && !e.online && e.field === myField && e.start >= now - 15 * 60_000 && e.start <= now + EVENT_SOON_MS && e.end > now && distanceMi(me, e.coord) <= mi,
  );
}

/** Sends a real local notification. Returns false (and logs why) instead of failing silently. */
export async function sendLocal(title: string, body: string, data: Record<string, string>): Promise<boolean> {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null });
    return true;
  } catch (e) {
    console.warn('Could not send notification', e);
    return false;
  }
}

/** The notification for a nearby member. Shared by the real path and the demo so both look identical. */
export function notifyNearby(p: Person | AlertHit, prefs: Prefs | undefined, mi: number, demo = false): Promise<boolean> {
  // Lead with why they fit (shared skill, employer or role from experience) when there is one.
  const why = prefs && 'skills' in p ? matchPoints(p, prefs).find((x) => /^(Also worked at|Also skilled in|Has worked in)/.test(x.text))?.text : undefined;
  return sendLocal(
    `${demo ? 'Demo · ' : ''}${p.name} is nearby · ${fieldLabel(p.field)}`,
    `${why ? `${why}. ` : ''}${'role' in p ? `${p.role}${p.org ? ` at ${p.org}` : ''} · ` : ''}${mi < 0.3 ? 'right around you' : `about ${mi.toFixed(1)} mi away`}.${demo ? ' (Simulated for the demo.)' : ''} Tap to say hi.`,
    { personId: p.id },
  );
}

export function useNearbyAlerts(enabled: boolean, me: LatLng | null, people: AlertHit[], myField: FieldId | null | undefined, events: CommunityEvent[] = [], prefs?: Prefs) {
  const lastAlert = useRef(new Map<string, number>());
  const lat = me?.latitude;
  const lng = me?.longitude;

  useEffect(() => {
    if (!enabled || lat == null || lng == null || !myField) return;
    const here = { latitude: lat, longitude: lng };
    const now = Date.now();
    // The server already filtered by field, verified and radius.
    for (const p of people) {
      if (now - (lastAlert.current.get(p.id) ?? 0) < COOLDOWN_MS) continue;
      lastAlert.current.set(p.id, now);
      // A failed send must not burn the 3-hour cooldown.
      void notifyNearby(p, prefs, p.distanceMi).then((ok) => { if (!ok) lastAlert.current.delete(p.id); });
    }
    for (const e of eventsStartingSoon(here, events, myField, now)) {
      const key = `event:${e.id}`;
      if (now - (lastAlert.current.get(key) ?? 0) < COOLDOWN_MS) continue;
      lastAlert.current.set(key, now);
      const mins = Math.max(0, Math.round((e.start - now) / 60_000));
      void sendLocal(`${e.title} · ${fieldLabel(e.field)}`, `${mins <= 0 ? 'Starting now' : `Starts in ${mins} min`} at ${e.venue}, within ${ALERT_RADIUS_MI} mile of you.`, { eventId: e.id });
    }
  }, [enabled, lat, lng, people, myField, events, prefs]);

  // Tapping an alert opens that person's profile or event.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const data = r.notification.request.content.data;
      if (typeof data?.eventId === 'string') router.push({ pathname: '/event/[id]', params: { id: data.eventId } });
      else if (typeof data?.personId === 'string') router.push({ pathname: '/person/[id]', params: { id: data.personId } });
    });
    return () => sub.remove();
  }, []);
}

const PRESENCE_EVERY_MS = 60_000;
const PRESENCE_MIN_GAP_MS = 20_000;

export type Presence = { candidates: AlertHit[]; error: string | null; syncedAt: number | null };

/**
 * Real path. While `active` (map open, live location on, signed in): saves your rounded position and loads
 * verified same-field members within 1 mile from Supabase (PostGIS). Runs on the first fix, when you move,
 * and once a minute. Your exact position is never stored: the database rounds it to about a mile.
 */
export function useNearbyPresence(active: boolean, me: LatLng | null, userId: string | undefined, shareArea: boolean): Presence {
  const [state, setState] = useState<Presence>({ candidates: [], error: null, syncedAt: null });
  const meRef = useRef(me);
  const lastRun = useRef(0);
  const inFlight = useRef(false);
  const runRef = useRef<() => void>(() => {});
  const lat = me?.latitude;
  const lng = me?.longitude;
  const hasFix = lat != null && lng != null;

  useEffect(() => {
    meRef.current = hasFix ? { latitude: lat, longitude: lng } : null;
  }, [hasFix, lat, lng]);

  // One stable timer per session: GPS fixes arrive every few seconds and must not reset it.
  useEffect(() => {
    if (!active || !userId || !hasFix) return;
    let alive = true;
    runRef.current = async () => {
      const at = meRef.current;
      if (!alive || !at || inFlight.current || AppState.currentState !== 'active') return;
      inFlight.current = true;
      lastRun.current = Date.now();
      try {
        if (shareArea) await setMyArea(at);
        const candidates = await fetchAlertCandidates(at, ALERT_RADIUS_MI);
        if (alive) setState({ candidates, error: null, syncedAt: Date.now() });
      } catch (e) {
        console.warn('Nearby check failed', e);
        // Drop old candidates on failure so stale people can't keep alerting.
        if (alive) setState({ candidates: [], error: e instanceof Error ? e.message : 'Nearby check failed', syncedAt: null });
      } finally {
        inFlight.current = false;
      }
    };
    const first = setTimeout(() => runRef.current(), Math.max(0, PRESENCE_MIN_GAP_MS - (Date.now() - lastRun.current)));
    const every = setInterval(() => runRef.current(), PRESENCE_EVERY_MS);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [active, userId, shareArea, hasFix]);

  // Moving: re-check on a fix if the last check is at least 20 s old (no timers to reset).
  useEffect(() => {
    if (active && userId && Date.now() - lastRun.current >= PRESENCE_MIN_GAP_MS) runRef.current();
  }, [active, userId, lat, lng]);

  // Nothing to show once the map closes or you sign out.
  return active && userId ? state : { candidates: [], error: null, syncedAt: null };
}
