import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { dataSource } from '@/data/source';
import { conversations } from '@/lib/conversations';
import { useApp } from '@/state/AppState';
import { C, F } from '@/theme';

export default function TabLayout() {
  const { hydrated, onboarded, requests, incoming, messages, blocked, lastRead, now, showDemo } = useApp();
  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  if (!onboarded) return <Redirect href="/onboarding" />;

  // Same unread chats the Inbox "Chats" section shows; a just-accepted request that is also unread counts once.
  const unread = new Set(
    conversations({ requests, incoming, messages, showDemo, blocked, lastRead, nameOf: (id) => dataSource.getPerson(id)?.name ?? '' })
      .filter((c) => c.unread)
      .map((c) => c.id),
  );
  const waiting =
    (showDemo ? incoming.filter((i) => i.state === 'new').length : 0) +
    requests.filter((r) => r.incoming && r.status === 'requested').length +
    unread.size +
    requests.filter((r) => !r.incoming && r.status === 'accepted' && r.updatedAt > now - 60 * 60_000 && !unread.has(r.id)).length;

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
