import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RoundTable } from '@/components/RoundTable';
import { Avatar, Button } from '@/components/ui';
import { buildDemoCircles } from '@/data/circles';
import { venueById } from '@/data/options';
import { dataSource } from '@/data/source';
import { fullName } from '@/lib/match';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, F, S, T } from '@/theme';

export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [circles] = useState(() => buildDemoCircles(Date.now()));
  const c = circles.find((x) => x.id === id);
  if (!c) return <Text style={[T.body, { padding: S.lg }]}>This circle isn’t available.</Text>;

  const joined = (app.joinedCircles ?? []).includes(c.id);
  const members = c.members.map((m) => dataSource.getPerson(m)).filter((p): p is NonNullable<typeof p> => !!p);
  const me = fullName(app.profile) || 'You';
  const seated = [...members.map((p) => ({ name: p.name, uri: p.photo })), ...(joined ? [{ name: me, uri: app.profile.photoUri, you: true }] : [])];
  const open = c.seats - seated.length;
  const venue = venueById(c.venueId);
  const ll = venue ? `${venue.coord.latitude},${venue.coord.longitude}` : '';
  const directions = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(venue?.name ?? '')}` : `https://www.google.com/maps/dir/?api=1&destination=${ll}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <Stack.Screen options={{ title: '' }} />
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 110, gap: S.xl }}>
        <View style={{ alignItems: 'center', gap: S.lg }}>
          <RoundTable seats={c.seats} people={seated} size={260} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.kind}>COLLAB CIRCLE · DEMO</Text>
            <Text style={styles.title}>{c.topic}</Text>
            <Text style={styles.seats}>{open > 0 ? `${open} seat${open === 1 ? '' : 's'} open` : 'Table full'} · {c.seats} people max</Text>
          </View>
        </View>

        <Animated.View entering={FadeInDown.delay(150).duration(300)} style={styles.info}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color={C.accent} />
            <Text style={styles.infoText}>{dayLabel(c.start)} · {fmtTime(c.start)} · {c.lengthMin} min</Text>
          </View>
          {venue ? (
            <Pressable onPress={() => Linking.openURL(directions)} accessibilityRole="link" style={styles.infoRow}>
              <Ionicons name="location-outline" size={20} color={C.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoText}>{venue.name}</Text>
                <Text style={T.small}>{venue.area} · {venue.detail}</Text>
              </View>
              <Ionicons name="navigate-outline" size={18} color={C.ink3} />
            </Pressable>
          ) : null}
        </Animated.View>

        <Animated.Text entering={FadeInDown.delay(220).duration(300)} style={styles.blurb}>{c.blurb}</Animated.Text>

        <View style={{ gap: S.xs }}>
          <Text style={styles.section}>At the table</Text>
          {members.map((p, i) => (
            <Animated.View key={p.id} entering={FadeInDown.delay(280 + i * 60).duration(280)}>
              <Pressable onPress={() => router.push({ pathname: '/person/[id]', params: { id: p.id } })} accessibilityRole="button" style={({ pressed }) => [styles.member, pressed && { opacity: 0.6 }]}>
                <Avatar name={p.name} uri={p.photo} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.memberName}>{p.name}{i === 0 ? ' · host' : ''}</Text>
                  <Text style={T.small} numberOfLines={1}>{p.role}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.ink3} />
              </Pressable>
            </Animated.View>
          ))}
          {joined ? (
            <View style={styles.member}>
              <Avatar name={me} uri={app.profile.photoUri} size={44} ring />
              <Text style={[styles.memberName, { flex: 1 }]}>You</Text>
            </View>
          ) : null}
        </View>
        <Text style={T.small}>Demo circle: the people seated are sample profiles. Joining is saved on this phone only.</Text>
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + S.sm }]}>
        {joined ? (
          <Button label="Leave this circle" variant="secondary" onPress={() => app.toggleCircle(c.id)} style={{ flex: 1 }} />
        ) : (
          <Button label={open > 0 ? 'Take a seat' : 'Table is full'} disabled={open <= 0} onPress={() => app.toggleCircle(c.id)} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kind: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: C.accent },
  title: { fontFamily: F.display, fontSize: 28, lineHeight: 33, color: C.ink, textAlign: 'center', letterSpacing: -0.4 },
  seats: { fontSize: 14, color: C.ink3 },
  info: { gap: S.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  infoText: { fontSize: 16, fontWeight: '600', color: C.ink },
  blurb: { fontSize: 16, lineHeight: 24, color: C.ink2 },
  section: { fontSize: 13, fontWeight: '700', color: C.ink3, letterSpacing: 0.8, textTransform: 'uppercase' },
  member: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm },
  memberName: { fontSize: 16, fontWeight: '600', color: C.ink },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingHorizontal: S.lg, paddingTop: S.sm, backgroundColor: C.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
});
