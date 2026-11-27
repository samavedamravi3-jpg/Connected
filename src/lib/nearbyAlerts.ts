/**
 * Nearby "You should connect" recommendations and same-field event alerts, while the app is OPEN on the map with live
 * location on (foreground only: no background location, no push server; works in Expo Go). docs/nearby-alerts.md.
 *
 * Real path: `useNearbyRecommendations` saves your rounded position (set_my_area) and asks alert_candidates() who to
 * recommend. The server decides eligibility (real members, same field, fresh area, radius, blocks/mutes, a shared
 * interest/skill or a complementary intent); the pure controller in ./nearbyPolicy applies this phone's cooldown,
 * daily cap and gap, shows the in-app card and, if allowed, one local notification.
 * The demo ("Simulate a nearby match") never goes through this path.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { fieldLabel } from '@/data/options';
import type { CommunityEvent, FieldId, LatLng } from '@/data/types';
import { fetchNearbyRecs, isRemoteId, setMyArea } from './backend';
import { distanceMi } from './geo';
import { POLICY_DEFAULTS, createNearbyController, explainRec, type NearbyRec } from './nearbyPolicy';
import { warn } from './log';

const CHANNEL = 'nearby';
const EVENT_SOON_MS = 60 * 60_000;
const EVENT_RADIUS_MI = 1;
const POLL_MS = 60_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** granted (incl. iOS provisional), undetermined (we may ask), blocked (denied and the system won't ask again). */
export type NotifState = 'granted' | 'undetermined' | 'blocked';

export async function notificationState(): Promise<NotifState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    // iOS: rely on ios.status (SDK 58 docs); provisional (3) and ephemeral (4) deliver, quietly. Numbers because the
    // IosAuthorizationStatus enum is re-exported in a way the import linter can't follow (like AndroidImportance below).
    const iosOk = p.ios?.status === 3 || p.ios?.status === 4;
    if (p.granted || iosOk) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'blocked';
  } catch {
    return 'blocked';
  }
}

async function requestNotifications(): Promise<NotifState> {
  try {
    if (Platform.OS === 'android') {
      // 6 = AndroidImportance.HIGH (the enum is re-exported in a way the import linter can't follow).
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'People nearby', importance: 6 });
    }
    await Notifications.requestPermissionsAsync();
  } catch {}
  return notificationState();
}

const ask = (title: string, body: string, yes: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, body, [{ text: 'Not now', style: 'cancel', onPress: () => resolve(false) }, { text: yes, onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) }),
  );

/**
 * Turning alerts on: explain first, then ask for notification permission. Alerts stay on either way: without
 * permission you still get the in-app card while the map is open. Returns the notification state.
 */
export async function turnOnNearbyAlerts(radiusMi: number): Promise<NotifState> {
  let state = await notificationState();
  const what = `When a Connected member in your field is within about ${radiusMi} mi and you share an interest, skill or mentoring goal, you'll see a card on the map${state === 'granted' ? ' and a notification' : ''}. Only while the app is open on the map with live location on.`;
  if (state === 'undetermined') {
    if (await ask('Nearby recommendations', `${what}\n\nAllow notifications so you also get a banner? Nothing is ever sent to the other person automatically.`, 'Continue')) state = await requestNotifications();
  }
  if (state === 'blocked') {
    Alert.alert('In-app only', `${what}\n\nNotifications are off for Connected, so you'll only see the card in the app. You can allow them in Settings.`, [
      { text: 'OK', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
  } else if (state === 'granted') {
    Alert.alert('Nearby alerts on', what);
  }
  return state;
}

/** Sends a real local notification. Returns false (and logs why) instead of failing silently. */
export async function sendLocal(title: string, body: string, data: Record<string, string>): Promise<boolean> {
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null });
    return true;
  } catch (e) {
    warn('Could not send notification', e);
    return false;
  }
}

/** One notification for a recommendation; the text is the same shared-labels-only explanation as the card. */
export async function notifyRec(r: NearbyRec): Promise<boolean> {
  if ((await notificationState()) !== 'granted') return false;
  return r.demo
    ? sendLocal(`Demo · ${r.name} is nearby`, `${explainRec(r)} (Simulated for the demo, not a real member.)`, { demoPersonId: r.id })
    : sendLocal('You should connect', explainRec(r), { personId: r.id, nearby: '1' });
}

/** Live, in-person events in your field that start within the hour and are within 1 mile of `me`. */
export function eventsStartingSoon(me: LatLng, events: CommunityEvent[], myField: FieldId | null | undefined, now: number, mi = EVENT_RADIUS_MI) {
  if (!myField) return [];
  return events.filter(
    (e) => !e.isDemo && !e.online && e.field === myField && e.start >= now - 15 * 60_000 && e.start <= now + EVENT_SOON_MS && e.end > now && distanceMi(me, e.coord) <= mi,
  );
}

/** Same-field events starting soon nearby (3-hour cooldown per event, in memory). */
export function useEventAlerts(enabled: boolean, me: LatLng | null, myField: FieldId | null | undefined, events: CommunityEvent[]) {
  const lastAlert = useRef(new Map<string, number>());
  const lat = me?.latitude;
  const lng = me?.longitude;
  useEffect(() => {
    if (!enabled || lat == null || lng == null || !myField) return;
    const now = Date.now();
    for (const e of eventsStartingSoon({ latitude: lat, longitude: lng }, events, myField, now)) {
      const key = `event:${e.id}`;
      if (now - (lastAlert.current.get(key) ?? 0) < 3 * 3_600_000) continue;
      lastAlert.current.set(key, now);
      const mins = Math.max(0, Math.round((e.start - now) / 60_000));
      void notificationState().then((s) => s === 'granted' && sendLocal(`${e.title} · ${fieldLabel(e.field)}`, `${mins <= 0 ? 'Starting now' : `Starts in ${mins} min`} at ${e.venue}, within ${EVENT_RADIUS_MI} mile of you.`, { eventId: e.id }));
    }
  }, [enabled, lat, lng, myField, events]);
}

/**
 * Notification taps, mounted once at the root so a tap that opened the app (cold start) is handled too.
 * Real people open with `nearby=1`, which makes the person screen re-check eligibility. Demo taps open the demo
 * profile without it. Each response is handled once and then cleared.
 */
export function useNotificationRouting() {
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!last || handled.current === last.notification.request.identifier) return;
    handled.current = last.notification.request.identifier;
    const data = last.notification.request.content.data;
    if (typeof data?.eventId === 'string') router.push({ pathname: '/event/[id]', params: { id: data.eventId } });
    else if (typeof data?.personId === 'string' && isRemoteId(data.personId)) router.push({ pathname: '/person/[id]', params: { id: data.personId, nearby: '1' } });
    else if (typeof data?.demoPersonId === 'string' && !isRemoteId(data.demoPersonId)) router.push({ pathname: '/person/[id]', params: { id: data.demoPersonId, nearby: 'demo' } });
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [last]);
}

export type RecState = { rec: NearbyRec | null; count: number; error: string | null; dismiss: () => void };

/**
 * Real path. Runs only while `active` (map focused, app in foreground, live location granted and on, signed in, real
 * member, alerts on, discovery on, field set). Leaving any of those stops the timer and drops in-flight answers.
 */
export function useNearbyRecommendations(active: boolean, me: LatLng | null, userId: string | undefined, shareArea: boolean, cooldownH: number): RecState {
  const [rec, setRec] = useState<NearbyRec | null>(null);
  const [res, setRes] = useState<{ count: number; error: string | null }>({ count: 0, error: null });
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  const hasFix = me != null;

  useEffect(() => {
    if (!active || !userId || !hasFix) return;
    const c = createNearbyController({
      userId,
      policy: { ...POLICY_DEFAULTS, cooldownH },
      everyMs: POLL_MS,
      now: Date.now,
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
      storage: AsyncStorage,
      beforeFetch: shareArea ? async () => { if (meRef.current) await setMyArea(meRef.current); } : undefined,
      fetchRecs: fetchNearbyRecs,
      onRecommend: setRec,
      notify: notifyRec,
      onResult: (recs, error) => setRes({ count: recs.length, error }),
    });
    void c.start();
    return () => {
      c.stop();
      setRec(null);
      setRes({ count: 0, error: null });
    };
  }, [active, userId, hasFix, shareArea, cooldownH]);

  return active && userId ? { rec, ...res, dismiss: () => setRec(null) } : { rec: null, count: 0, error: null, dismiss: () => {} };
}
