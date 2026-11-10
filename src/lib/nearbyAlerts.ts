/**
 * "Someone is nearby" alerts. Runs only while the map is open and live location is on:
 * no background location, no push server. Each real member alerts at most once every 3 hours.
 * Alerts are same-field only: your field must be set, and a person or event must match it.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { fieldLabel } from '@/data/options';
import type { CommunityEvent, FieldId, LatLng, Person } from '@/data/types';
import { distanceMi } from './geo';

export const ALERT_RADIUS_MI = 1;
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

/** Real (non-demo) members in your own field who share an area within 1 mile of `me`. */
export function peopleWithin(me: LatLng, people: Person[], myField: FieldId | null | undefined, mi = ALERT_RADIUS_MI) {
  if (!myField) return [];
  return people.filter((p) => !p.isDemo && !p.areaHidden && p.field === myField && distanceMi(me, p.coord) <= mi);
}

/** Live, in-person events in your field that start within the hour and are within 1 mile of `me`. */
export function eventsStartingSoon(me: LatLng, events: CommunityEvent[], myField: FieldId | null | undefined, now: number, mi = ALERT_RADIUS_MI) {
  if (!myField) return [];
  return events.filter(
    (e) => !e.isDemo && !e.online && e.field === myField && e.start >= now - 15 * 60_000 && e.start <= now + EVENT_SOON_MS && e.end > now && distanceMi(me, e.coord) <= mi,
  );
}

const send = (title: string, body: string, data: Record<string, string>) =>
  Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  }).catch(() => {});

export function useNearbyAlerts(enabled: boolean, me: LatLng | null, people: Person[], myField: FieldId | null | undefined, events: CommunityEvent[] = []) {
  const lastAlert = useRef(new Map<string, number>());
  const lat = me?.latitude;
  const lng = me?.longitude;

  useEffect(() => {
    if (!enabled || lat == null || lng == null || !myField) return;
    const here = { latitude: lat, longitude: lng };
    const now = Date.now();
    for (const p of peopleWithin(here, people, myField)) {
      if (now - (lastAlert.current.get(p.id) ?? 0) < COOLDOWN_MS) continue;
      lastAlert.current.set(p.id, now);
      const mi = distanceMi(here, p.coord);
      send(
        `${p.name} is nearby · ${fieldLabel(p.field)}`,
        `${p.role}${p.org ? ` at ${p.org}` : ''} · ${mi < 0.3 ? 'right around you' : `about ${mi.toFixed(1)} mi away`}. Tap to say hi.`,
        { personId: p.id },
      );
    }
    for (const e of eventsStartingSoon(here, events, myField, now)) {
      const key = `event:${e.id}`;
      if (now - (lastAlert.current.get(key) ?? 0) < COOLDOWN_MS) continue;
      lastAlert.current.set(key, now);
      const mins = Math.max(0, Math.round((e.start - now) / 60_000));
      send(`${e.title} · ${fieldLabel(e.field)}`, `${mins <= 0 ? 'Starting now' : `Starts in ${mins} min`} at ${e.venue}, within ${ALERT_RADIUS_MI} mile of you.`, { eventId: e.id });
    }
  }, [enabled, lat, lng, people, myField, events]);

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
