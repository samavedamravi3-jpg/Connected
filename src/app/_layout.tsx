import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Intro } from '@/components/Intro';
import { AppProvider } from '@/state/AppState';
import { C } from '@/theme';

// Keep the native purple splash up until the animated intro is on screen (store builds only;
// Expo Go shows the app icon instead and this call is harmless there).
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [introDone, setIntroDone] = useState(false);
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
          </Stack>
          {introDone ? null : <Intro onDone={() => setIntroDone(true)} />}
        </View>
      </AppProvider>
    </SafeAreaProvider>
  );
}
