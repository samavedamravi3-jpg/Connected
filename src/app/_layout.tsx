import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/state/AppState';
import { C } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
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
          <Stack.Screen name="person/[id]" options={{ title: '', presentation: 'modal' }} />
          <Stack.Screen name="open-door" options={{ title: 'Open Door', presentation: 'modal' }} />
          <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
          <Stack.Screen name="chat/[id]" options={{ title: 'Conversation' }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
