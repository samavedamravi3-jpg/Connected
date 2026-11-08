/**
 * Push alerts for new requests, acceptances and messages (sent by the backend through Expo's push service).
 * Optional by design: it needs an EAS project id (run `npx eas-cli@latest init` in mobile/) and, on Android,
 * a development build. Without those it quietly does nothing; the Inbox still updates by polling.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '@/data/api';

let registeredToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function registerForPush() {
  try {
    const id = projectId();
    if (!id || registeredToken) return;
    if (Platform.OS === 'android') {
      // eslint-disable-next-line import/namespace -- AndroidImportance is re-exported by expo-notifications (tsc resolves it); the lint resolver can't follow the re-export.
      await Notifications.setNotificationChannelAsync('default', { name: 'Connection alerts', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await api('POST', '/api/v1/push-tokens', { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    registeredToken = data;
  } catch {
    // Unsupported here (e.g. Expo Go on Android) or permission denied: polling keeps the Inbox current.
  }
}

export async function unregisterPush() {
  if (!registeredToken) return;
  await api('DELETE', '/api/v1/push-tokens', { token: registeredToken }).catch(() => {});
  registeredToken = null;
}

/** Where a tapped alert should open: the conversation for messages/acceptances, else the Inbox. */
export function routeForNotification(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const id = typeof data.connectionId === 'string' && /^[0-9a-f-]{36}$/.test(data.connectionId) ? data.connectionId : null;
  if ((data.type === 'message' || data.type === 'accepted') && id) return `/chat/${id}`;
  if (data.type === 'request') return '/inbox';
  return null;
}
