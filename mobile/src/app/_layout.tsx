import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Intro } from '@/components/Intro';
import { routeForNotification } from '@/lib/push';
import { AppProvider } from '@/state/AppState';
import { C } from '@/theme';

// Keep the native purple splash up until the animated intro is on screen (store builds only;
// Expo Go shows the app icon instead and this call is harmless there).
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Open the right screen when someone taps a push alert (also when the tap launched the app). */
function useNotificationRouting() {
  useEffect(() => {
    const open = (data: Record<string, unknown> | undefined) => {
      const to = routeForNotification(data);
      if (to) router.push(to as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      open(last.notification.request.content.data);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const [introDone, setIntroDone] = useState(false);
  useNotificationRouting();
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style={introDone ? 'dark' : 'light'} />
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <Stack
            screenOptions={{
              headerTintColor: C.ink,
              headerStyle: { backgroundColor: C.bg },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: C.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="person/[id]" options={{ headerShown: false, presentation: 'modal' }} />
            <Stack.Screen name="open-door" options={{ title: 'Open Door', presentation: 'modal' }} />
            <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
            <Stack.Screen name="chat/[id]" options={{ title: 'Conversation' }} />
            <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
          </Stack>
          {introDone ? null : <Intro onDone={() => setIntroDone(true)} />}
        </View>
      </AppProvider>
    </SafeAreaProvider>
  );
}
