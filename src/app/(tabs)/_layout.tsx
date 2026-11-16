import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useApp } from '@/state/AppState';
import { C, F } from '@/theme';

export default function TabLayout() {
  const { hydrated, onboarded, requests, incoming, now, showDemo } = useApp();
  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  if (!onboarded) return <Redirect href="/onboarding" />;

  const waiting =
    (showDemo ? incoming.filter((i) => i.state === 'new').length : 0) +
    requests.filter((r) => r.incoming && r.status === 'requested').length +
    requests.filter((r) => !r.incoming && r.status === 'accepted' && r.updatedAt > now - 60 * 60_000).length;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.ink3,
        tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.line },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: C.bg },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: F.displaySemi, fontSize: 18, color: C.ink },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Map', headerShown: false, tabBarIcon: ({ color }) => <Ionicons name="map-outline" size={22} color={String(color)} /> }} />
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: ({ color }) => <Ionicons name="calendar-outline" size={22} color={String(color)} /> }} />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarBadge: waiting || undefined,
          tabBarBadgeStyle: { backgroundColor: C.bad, fontSize: 11 },
          tabBarIcon: ({ color }) => <Ionicons name="chatbubbles-outline" size={22} color={String(color)} />,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Ionicons name="person-circle-outline" size={22} color={String(color)} /> }} />
    </Tabs>
  );
}
