import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Intro } from '@/components/Intro';
import { useNotificationRouting } from '@/lib/nearbyAlerts';
import { AppProvider } from '@/state/AppState';
import { C, F } from '@/theme';

// Keep the native splash up until the fonts settle and the intro is on screen (Intro hides it on mount;
// Expo Go shows the app icon instead and this call is harmless there).
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Notification taps (including one that launched the app) open the right screen. */
function NotificationRouting() {
  useNotificationRouting();
  return null;
}

export default function RootLayout() {
  const [introDone, setIntroDone] = useState(false);
  // Display face for headings. On error we carry on: unknown font families fall back to the system font.
  const [fontsLoaded, fontError] = useFonts({ BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold });
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style={introDone ? 'dark' : 'light'} />
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <Stack
            screenOptions={{
              headerTintColor: C.ink,
              headerStyle: { backgroundColor: C.bg },
              headerShadowVisible: false,
              headerTitleStyle: { fontFamily: F.displaySemi, fontSize: 18, color: C.ink },
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
            <Stack.Screen name="post/new" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
            <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="circle/[id]" options={{ title: '', headerShadowVisible: false }} />
            <Stack.Screen name="search" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="verify" options={{ title: 'Get verified', presentation: 'modal' }} />
            <Stack.Screen name="verify-id" options={{ title: 'Verify your ID', presentation: 'modal' }} />
            <Stack.Screen name="legal/index" options={{ title: 'Terms and policies' }} />
            <Stack.Screen name="legal/[doc]" options={{ title: 'Policy' }} />
            <Stack.Screen name="privacy" options={{ title: 'Privacy & data' }} />
            <Stack.Screen name="delete-account" options={{ title: 'Delete my account', presentation: 'modal' }} />
            <Stack.Screen name="assistant" options={{ headerShown: false, presentation: 'modal' }} />
          </Stack>
          <NotificationRouting />
          {introDone ? null : <Intro onDone={() => setIntroDone(true)} />}
        </View>
      </AppProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
