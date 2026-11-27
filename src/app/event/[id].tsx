import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventImage } from '@/components/EventImage';
import { Button } from '@/components/ui';
import { EVENT_STYLE } from '@/data/eventVisuals';
import { CHARLOTTE_CENTER } from '@/data/options';
import { dataSource } from '@/data/source';
import { approxDistance, distanceMi } from '@/lib/geo';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, F, R, S, T, alpha } from '@/theme';

/** The first sentence or two of the listing, as a short "why go". Nothing is written for the organizer. */
function lead(text: string): { lead: string; rest: string } {
  const clean = text.trim();
  const m = clean.match(/^(.{40,260}?[.!?])(\s|$)/s);
  if (!m) return { lead: clean.slice(0, 260), rest: clean.length > 260 ? clean : '' };
  const rest = clean.slice(m[1].length).trim();
  return { lead: m[1], rest };
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const e = dataSource.getEvent(id);
  if (!e) return <Text style={[T.body, { padding: S.lg }]}>Event not found.</Text>;

  const st = EVENT_STYLE[e.category];
  const saved = app.savedEvents.includes(e.id);
  const multiDay = dayLabel(e.start) !== dayLabel(e.end);
  const origin = app.here?.coord ?? CHARLOTTE_CENTER;
  const from = app.here?.isGps ? 'from you' : `from ${app.here?.label ?? 'Uptown'}`;
  const price = e.cost.toLowerCase().startsWith('free') ? 'Free' : e.cost;
  const ll = `${e.coord.latitude},${e.coord.longitude}`;
  const directions = Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${ll}&q=${encodeURIComponent(e.venue)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${ll}`;
  const { lead: why, rest } = lead(e.description);

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

  const info: { k: string; v: string; sub?: string }[] = [
    { k: 'When', v: multiDay ? `${dayLabel(e.start)} – ${dayLabel(e.end)}` : `${dayLabel(e.start)}, ${new Date(e.start).toLocaleDateString([], { month: 'long', day: 'numeric' })}`, sub: multiDay ? `Starts ${fmtTime(e.start)}` : `${fmtTime(e.start)} – ${fmtTime(e.end)}` },
    e.online
      ? { k: 'Where', v: 'Online', sub: 'Link on the listing' }
      : { k: 'Where', v: e.venue || e.areaName, sub: `${e.areaName} · ${approxDistance(distanceMi(origin, e.coord)).replace('about ', '')} ${from}` },
    { k: 'Price', v: price },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        {/* 1. Large cover */}
        <View style={{ height: insets.top + 280 }}>
          <EventImage e={e} style={StyleSheet.absoluteFill} padTop={insets.top} credit={e.source ? `Photo: ${e.source} listing` : undefined} />
          <LinearGradient colors={[alpha(C.ink, 0.45), alpha(C.ink, 0)]} style={[styles.topScrim, { height: insets.top + 90 }]} pointerEvents="none" />
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

        <View style={styles.body}>
          {/* 2. Title and organizer */}
          <View style={{ gap: 6 }}>
            <Text style={[styles.kind, { color: st.solid }]}>{st.label.toUpperCase()}{e.isDemo ? ' · DEMO EVENT' : e.source ? ` · LISTED ON ${e.source.toUpperCase()}` : ''}</Text>
            <Text style={styles.title} accessibilityRole="header">{e.title}</Text>
            <Text style={styles.by}>by {e.host}</Text>
          </View>

          {/* 3. Compact information block */}
          <View style={styles.info}>
            {info.map((row, i) => (
              <View key={row.k} style={[styles.infoRow, i > 0 && styles.infoDivider]}>
                <Text style={styles.infoKey}>{row.k}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.infoVal}>{row.v}</Text>
                  {row.sub ? <Text style={T.small}>{row.sub}</Text> : null}
                </View>
              </View>
            ))}
          </View>

          {/* 4. Why go: the organizer's own opening lines */}
          {why ? (
            <View style={{ gap: S.sm }}>
              <Text style={T.h2} accessibilityRole="header">Why go</Text>
              <Text style={styles.desc}>{why}</Text>
            </View>
          ) : null}

          {/* 5. Host */}
          <View style={styles.hostRow}>
            <View style={[styles.hostMark, { backgroundColor: st.soft }]}>
              <Text style={[styles.hostInitials, { color: st.solid }]}>{e.host.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={T.small}>Hosted by</Text>
              <Text style={styles.infoVal}>{e.host}</Text>
            </View>
          </View>

          {/* 6. Venue map preview */}
          {!e.online ? (
            <Pressable onPress={() => Linking.openURL(directions)} accessibilityRole="link" accessibilityLabel={`Get directions to ${e.venue}`}>
              <View style={styles.mapWrap} pointerEvents="none">
                <MapView
                  style={StyleSheet.absoluteFill}
                  liteMode
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  toolbarEnabled={false}
                  initialRegion={{ ...e.coord, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
                >
                  <Marker coordinate={e.coord} />
                </MapView>
              </View>
              <View style={styles.mapCaption}>
                <Text style={styles.infoVal} numberOfLines={1}>{e.venue || e.areaName}</Text>
                <Text style={styles.link}>Directions</Text>
              </View>
            </Pressable>
          ) : null}

          {/* 7. Full description, expandable */}
          {rest ? (
            <View style={{ gap: S.sm }}>
              <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded }} style={styles.expandHead}>
                <Text style={T.h3}>Full description</Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={C.ink3} />
              </Pressable>
              {expanded ? <Text style={styles.desc}>{rest}</Text> : null}
            </View>
          ) : null}

          <Pressable onPress={() => router.navigate('/')} accessibilityRole="link">
            <Text style={styles.link}>Find people in this field nearby</Text>
          </Pressable>
          <Text style={T.small}>
            {e.source ? `Listed on ${e.source}. Details can change, so check the listing before you go.` : 'This is a demo event for exploring the app.'} Saving is private.
          </Text>
        </View>
      </ScrollView>

      {/* 8. One persistent action that says exactly what it does. */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + S.sm }]}>
        {e.url ? (
          <Button label={`Register on ${e.source ?? 'the listing'}`} icon="open-outline" onPress={() => Linking.openURL(e.url!)} style={{ flex: 1 }} />
        ) : (
          <Button label={saved ? 'Saved to my plans' : 'Save to my plans'} icon={saved ? 'bookmark' : 'bookmark-outline'} variant={saved ? 'secondary' : 'primary'} onPress={() => app.toggleSavedEvent(e.id)} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topScrim: { position: 'absolute', left: 0, right: 0, top: 0 },
  heroBar: { position: 'absolute', left: S.lg, right: S.lg, flexDirection: 'row', justifyContent: 'space-between' },
  heroBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  body: { padding: S.lg, paddingTop: S.xl, gap: S.xl },
  kind: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1 },
  title: { fontFamily: F.display, fontSize: 30, lineHeight: 35, color: C.ink, letterSpacing: -0.5 },
  by: { fontSize: 15, lineHeight: 20, color: C.ink2 },
  info: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line2 },
  infoRow: { flexDirection: 'row', gap: S.md, paddingVertical: S.md },
  infoDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  infoKey: { width: 56, fontSize: 13, lineHeight: 20, color: C.ink3, fontWeight: '600' },
  infoVal: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: C.ink },
  desc: { fontSize: 16, lineHeight: 24, color: C.ink2 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  hostMark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hostInitials: { fontFamily: F.display, fontSize: 16 },
  mapWrap: { height: 150, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.bg2 },
  mapCaption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.md, paddingTop: S.sm },
  link: { fontSize: 15, fontWeight: '600', color: C.accent },
  expandHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingHorizontal: S.lg, paddingTop: S.sm, backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
});
