import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { ComponentProps } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Tag } from '@/components/ui';
import { EVENT_STYLE } from '@/data/eventVisuals';
import { CHARLOTTE_CENTER, fieldLabel } from '@/data/options';
import { dataSource } from '@/data/source';
import { approxDistance, distanceMi } from '@/lib/geo';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const e = dataSource.getEvent(id);
  if (!e) return <Text style={[T.body, { padding: S.lg }]}>Event not found.</Text>;

  const st = EVENT_STYLE[e.category];
  const saved = app.savedEvents.includes(e.id);
  const multiDay = dayLabel(e.start) !== dayLabel(e.end);
  const origin = app.here?.coord ?? CHARLOTTE_CENTER;
  const from = app.here?.isGps ? 'from you' : `from ${app.here?.label ?? 'Uptown'}`;
  const free = e.cost.toLowerCase().startsWith('free');
  const ll = `${e.coord.latitude},${e.coord.longitude}`;
  const directions = Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(e.venue)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${ll}`;

  const more = () =>
    Alert.alert(e.title, undefined, [
      {
        text: 'Report',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Report this event', 'What’s wrong? Reporting also hides it for you. Events reported by 3 people are hidden for everyone.', [
            { text: 'Spam or a scam', onPress: () => { app.reportEvent(e.id, 'Spam or a scam'); router.back(); } },
            { text: 'Unsafe or offensive', onPress: () => { app.reportEvent(e.id, 'Unsafe or offensive'); router.back(); } },
            { text: 'Cancel', style: 'cancel' },
          ]),
      },
      { text: 'Hide this event', onPress: () => { app.hideEvent(e.id); router.back(); } },
      { text: `Mute ${e.host}`, onPress: () => { app.muteHost(e.host); router.back(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const tiles: { icon: IconName; label: string; value: string; sub?: string }[] = [
    { icon: 'calendar-outline', label: 'Date', value: multiDay ? `${dayLabel(e.start)} – ${dayLabel(e.end)}` : dayLabel(e.start), sub: new Date(e.start).toLocaleDateString([], { month: 'long', day: 'numeric' }) },
    { icon: 'time-outline', label: 'Time', value: fmtTime(e.start), sub: multiDay ? 'Multi-day' : `until ${fmtTime(e.end)}` },
    e.online
      ? { icon: 'globe-outline', label: 'Where', value: 'Online', sub: 'Join from anywhere' }
      : { icon: 'location-outline', label: 'Where', value: e.areaName, sub: `${approxDistance(distanceMi(origin, e.coord)).replace('about ', '')} ${from}` },
    { icon: 'pricetag-outline', label: 'Cost', value: e.cost, sub: e.url ? 'RSVP on the listing' : free ? 'No ticket needed' : 'Pay at the door' },
  ];

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + S.xxl }}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Photo (or a plain category panel) with the controls on a scrim; the title sits below on a solid background. */}
      <View style={[styles.hero, { height: insets.top + 220, backgroundColor: st.soft }]}>
        {e.image ? (
          <Image source={{ uri: e.image }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Photo for ${e.title}`} />
        ) : (
          <Ionicons name={st.icon} size={56} color={st.solid} style={{ alignSelf: 'center', marginTop: insets.top + 70 }} />
        )}
        <LinearGradient colors={['rgba(28,27,23,0.5)', 'rgba(28,27,23,0)']} style={[styles.topScrim, { height: insets.top + 90 }]} pointerEvents="none" />
        <View style={[styles.heroBar, { top: insets.top + S.sm }]}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.heroBtn} hitSlop={4}>
            <Ionicons name="chevron-back" size={22} color={C.ink} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Pressable onPress={more} accessibilityRole="button" accessibilityLabel="Report, hide or mute this event" style={styles.heroBtn} hitSlop={4}>
              <Ionicons name="ellipsis-horizontal" size={20} color={C.ink} />
            </Pressable>
            <Pressable onPress={() => app.toggleSavedEvent(e.id)} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save event'} style={styles.heroBtn} hitSlop={4}>
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? C.accent : C.ink} />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.head}>
        <View style={styles.tagRow}>
          <Tag label={`${st.label}${e.field ? ` · ${fieldLabel(e.field)}` : ''}`} icon={st.icon} />
          {e.online ? <Tag label="Online" icon="globe-outline" tone="blue" /> : <Tag label="In person" icon="location-outline" />}
          {e.source ? <Tag label={`Live · ${e.source}`} tone="ok" /> : <Tag label="Demo" icon="flask-outline" />}
        </View>
        <Text style={T.title} accessibilityRole="header">{e.title}</Text>
        <Text style={styles.heroMeta}>{dayLabel(e.start)} · {fmtTime(e.start)} · {e.online ? 'Online' : e.areaName}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.grid}>
          {tiles.map((t) => (
            <View key={t.label} style={styles.tile}>
              <View style={[styles.tileIcon, { backgroundColor: st.soft }]}>
                <Ionicons name={t.icon} size={18} color={st.solid} />
              </View>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={styles.tileValue} numberOfLines={2}>{t.value}</Text>
              {t.sub ? <Text style={styles.tileSub} numberOfLines={2}>{t.sub}</Text> : null}
            </View>
          ))}
        </View>

        <View style={{ gap: S.sm }}>
          <Text style={T.h2} accessibilityRole="header">About</Text>
          <Text style={styles.desc}>{e.description}</Text>
        </View>

        <View style={styles.hostRow}>
          <View style={[styles.hostIcon, { backgroundColor: st.soft }]}><Ionicons name="megaphone-outline" size={18} color={st.solid} /></View>
          <View style={{ flex: 1 }}>
            <Text style={T.small}>Hosted by</Text>
            <Text style={styles.hostName}>{e.host}</Text>
          </View>
        </View>

        {!e.online ? (
          <Pressable onPress={() => Linking.openURL(directions)} accessibilityRole="link" accessibilityLabel={`Get directions to ${e.venue}`} style={({ pressed }) => [styles.venue, pressed && { backgroundColor: C.bg2 }]}>
            <Ionicons name="navigate-outline" size={22} color={C.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hostName} numberOfLines={2}>{e.venue}</Text>
              <Text style={T.small}>Get directions</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={C.ink3} />
          </Pressable>
        ) : null}

        <View style={{ gap: S.sm }}>
          {e.url ? <Button label={`Open on ${e.source ?? 'the web'}`} icon="open-outline" onPress={() => Linking.openURL(e.url!)} /> : null}
          <Button label={saved ? 'Saved to my plans' : 'Save to my plans'} icon={saved ? 'bookmark' : 'bookmark-outline'} variant={saved || e.url ? 'secondary' : 'primary'} onPress={() => app.toggleSavedEvent(e.id)} />
          <Button label="Find people in this field nearby" variant="secondary" icon="people-outline" onPress={() => router.navigate('/')} />
        </View>
        <Text style={[T.small, { textAlign: 'center' }]}>
          {e.source ? `Real event listed on ${e.source}. Details can change, so check the listing before you go.` : 'Demo event.'} Saving is private.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden' },
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0 },
  heroBar: { position: 'absolute', left: S.lg, right: S.lg, flexDirection: 'row', justifyContent: 'space-between' },
  heroBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  head: { paddingHorizontal: S.lg, paddingTop: S.lg, gap: S.sm },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroMeta: { fontSize: 15, lineHeight: 22, color: C.ink2 },
  body: { padding: S.lg, gap: S.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  tile: { width: '48.5%', padding: S.md, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, gap: 2 },
  tileIcon: { width: 32, height: 32, borderRadius: R.md - 2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  tileLabel: { fontSize: 12, lineHeight: 16, color: C.ink3, fontWeight: '500' },
  tileValue: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: C.ink },
  tileSub: { fontSize: 13, lineHeight: 18, color: C.ink3 },
  desc: { fontSize: 16, lineHeight: 24, color: C.ink2 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  hostIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  hostName: { fontSize: 15, fontWeight: '600', color: C.ink },
  venue: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md, minHeight: 56, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
});
