import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Tag } from '@/components/ui';
import { EVENT_STYLE } from '@/data/eventVisuals';
import { CHARLOTTE_CENTER } from '@/data/options';
import { dataSource, type EventsResult } from '@/data/source';
import type { CommunityEvent, EventCategory } from '@/data/types';
import { distanceMi } from '@/lib/geo';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, F, R, S, T } from '@/theme';

type When = 'any' | 'week' | 'month';
type Cat = 'all' | EventCategory | 'saved';
type IconName = ComponentProps<typeof Ionicons>['name'];
type Ev = CommunityEvent & { mi: number };

const CATS: { id: Cat; label: string; icon: IconName }[] = [
  { id: 'all', label: 'All', icon: 'apps-outline' },
  { id: 'networking', label: 'Networking', icon: EVENT_STYLE.networking.icon },
  { id: 'career', label: 'Career', icon: EVENT_STYLE.career.icon },
  { id: 'hackathon', label: 'Hackathons', icon: EVENT_STYLE.hackathon.icon },
  { id: 'saved', label: 'Saved', icon: 'bookmark-outline' },
];
const WHEN: { id: When; label: string }[] = [
  { id: 'any', label: 'Any time' },
  { id: 'week', label: 'Next 7 days' },
  { id: 'month', label: 'This month' },
];
const MILES = [5, 10, 25];

const shortDay = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short' });
const month = (t: number) => new Date(t).toLocaleDateString([], { month: 'short' });
const miLabel = (mi: number) => (mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`);

export default function Events() {
  const app = useApp();
  const { eventHidden } = app;
  const [res, setRes] = useState<EventsResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const all = res?.events ?? null;
  const withDemo = app.showDemoEvents;
  const [cat, setCat] = useState<Cat>('all');
  const [when, setWhen] = useState<When>('any');
  const [maxMi, setMaxMi] = useState(25);

  const load = useCallback((force: boolean) => dataSource.listEvents({ withDemo, force }).then(setRes), [withDemo]);
  useEffect(() => {
    load(false);
  }, [load]);
  const refresh = () => {
    setRefreshing(true);
    load(true).finally(() => setRefreshing(false));
  };

  const origin = app.here?.coord ?? CHARLOTTE_CENTER;
  const fromLabel = app.here?.isGps ? 'from you' : `from ${app.here?.label ?? 'Uptown'}`;

  const list: Ev[] = useMemo(() => {
    if (!all) return [];
    const now = app.now;
    const limit = when === 'week' ? now + 7 * 864e5 : when === 'month' ? now + 31 * 864e5 : Infinity;
    return all
      .filter((e) => e.end > now && !eventHidden(e))
      .map((e) => ({ ...e, mi: e.online ? 0 : distanceMi(origin, e.coord) }))
      .filter((e) => (cat === 'all' || cat === 'saved' || e.category === cat) && (cat !== 'saved' || app.savedEvents.includes(e.id)))
      .filter((e) => e.start <= limit && e.mi <= maxMi)
      .sort((a, b) => Number(b.field === app.prefs.field && !!app.prefs.field) - Number(a.field === app.prefs.field && !!app.prefs.field) || a.start - b.start);
  }, [all, cat, when, maxMi, app.savedEvents, eventHidden, app.now, origin, app.prefs.field]);

  const upcoming = (all ?? []).filter((e) => e.end > app.now && !eventHidden(e)).length;
  const online = list.filter((e) => e.online).length;
  const inPerson = list.length - online;
  const noLive = !!res && !res.liveCount && !withDemo;
  const thisWeek = list.filter((e) => e.start <= app.now + 7 * 864e5);
  const later = list.filter((e) => !thisWeek.includes(e));

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: S.xxl, gap: S.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}
    >
      <View style={styles.intro}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.count}>{all ? `${list.length} event${list.length === 1 ? '' : 's'} shown${list.length !== upcoming ? ` of ${upcoming}` : ''}` : 'Finding live events…'}</Text>
          {all ? <Text style={styles.liveText}>{inPerson} in person within {maxMi} mi {fromLabel} · {online} online</Text> : null}
          {res ? (
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, !res.liveCount && { backgroundColor: C.ink3 }]} />
              <Text style={styles.liveText}>
                {res.liveCount ? `${res.liveCount} live from Meetup & Devpost · ${fmtTime(res.fetchedAt)}` : 'Live listings unavailable right now'}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.demoToggle}>
          <Text style={styles.demoText}>Demo events</Text>
          <Switch value={withDemo} onValueChange={app.setShowDemoEvents} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Show demo events" />
        </View>
      </View>

      {/* Category */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingHorizontal: S.lg }}>
        {CATS.map((c) => (
          <Pill key={c.id} label={c.label} icon={c.icon} on={cat === c.id} onPress={() => setCat(c.id)} />
        ))}
      </ScrollView>

      {/* When + distance */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingHorizontal: S.lg }}>
        {WHEN.map((w) => (
          <Pill key={w.id} label={w.label} on={when === w.id} onPress={() => setWhen(w.id)} />
        ))}
        <View style={styles.pillDivider} />
        {MILES.map((m) => (
          <Pill key={m} label={`${m} mi`} icon="navigate-outline" on={maxMi === m} onPress={() => setMaxMi(m)} />
        ))}
      </ScrollView>

      {!all ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: S.xl }} />
      ) : !list.length ? (
        <View style={styles.empty}>
          <Ionicons name={cat === 'saved' ? 'bookmark-outline' : 'calendar-clear-outline'} size={28} color={C.ink3} />
          <Text style={T.h3}>{cat === 'saved' ? 'Nothing saved yet' : noLive ? 'No live events loaded' : 'Nothing matches'}</Text>
          <Text style={[T.small, { textAlign: 'center' }]}>
            {cat === 'saved'
              ? 'Tap the bookmark on any event to keep it here.'
              : noLive
                ? 'Meetup and Devpost could not be reached. Pull down to retry, or turn on demo events.'
                : 'Try a wider distance or another date.'}
          </Text>
          {noLive && cat !== 'saved' ? (
            <Button label="Show demo events" small onPress={() => app.setShowDemoEvents(true)} style={{ marginTop: S.sm }} />
          ) : null}
        </View>
      ) : (
        <>
          {thisWeek.length ? (
            <View style={{ gap: S.md }}>
              <Text style={styles.section} accessibilityRole="header">Next 7 days</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={284} decelerationRate="fast" contentContainerStyle={{ gap: S.md, paddingHorizontal: S.lg }}>
                {thisWeek.map((e) => <BigCard key={e.id} e={e} fromLabel={fromLabel} />)}
              </ScrollView>
            </View>
          ) : null}
          {later.length ? (
            <View style={{ gap: S.sm, paddingHorizontal: S.lg }}>
              <Text style={[styles.section, { paddingHorizontal: 0 }]} accessibilityRole="header">Later</Text>
              {later.map((e) => <Row key={e.id} e={e} />)}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function Pill({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} hitSlop={4} style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && !on && { backgroundColor: C.bg2 }]}>
      {icon ? <Ionicons name={icon} size={16} color={on ? C.white : C.ink2} /> : null}
      <Text style={[styles.pillText, on && { color: C.white, fontWeight: '600' }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function SaveButton({ id, onImage }: { id: string; onImage?: boolean }) {
  const app = useApp();
  const saved = app.savedEvents.includes(id);
  return (
    <Pressable
      onPress={() => app.toggleSavedEvent(id)}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove from saved' : 'Save event'}
      hitSlop={4}
      style={[styles.save, onImage && styles.saveOnImage, saved && !onImage && { backgroundColor: C.accentSoft }]}
    >
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? C.accent : C.ink2} />
    </Pressable>
  );
}

/** Online vs in person, as a small tag so it reads at a glance. */
function WhereTag({ e }: { e: Ev }) {
  return e.online ? <Tag label="Online" icon="globe-outline" tone="blue" /> : <Tag label="In person" icon="location-outline" />;
}

/** Card for the "Next 7 days" carousel: photo on top, title and details on a solid panel below it. */
function BigCard({ e, fromLabel }: { e: Ev; fromLabel: string }) {
  const st = EVENT_STYLE[e.category];
  // The save button is a sibling of the card's button (not nested) so screen readers can reach it.
  return (
    <View style={styles.big}>
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${dayLabel(e.start)} ${fmtTime(e.start)}, ${e.online ? 'online' : 'in person'}`}
      style={({ pressed }) => pressed && { opacity: 0.92 }}
    >
      <View style={[styles.bigMedia, { backgroundColor: st.soft }]}>
        {e.image ? <Image source={{ uri: e.image }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : <Ionicons name={st.icon} size={40} color={st.solid} />}
        <View style={styles.datePill}>
          <Text style={styles.datePillDay} maxFontSizeMultiplier={1.3}>{shortDay(e.start)}</Text>
          <Text style={styles.datePillNum} maxFontSizeMultiplier={1.3}>{new Date(e.start).getDate()}</Text>
        </View>
      </View>
      <View style={styles.bigBody}>
        <Text style={[styles.kind, { color: st.solid }]} numberOfLines={1}>
          {st.label}{e.cost.toLowerCase().startsWith('free') ? ' · Free' : ''}{e.source ? ` · ${e.source}` : ' · Demo'}
        </Text>
        <Text style={styles.bigTitle} numberOfLines={2}>{e.title}</Text>
        <View style={styles.metaRow}>
          <WhereTag e={e} />
          <Text style={styles.meta} numberOfLines={1}>
            {e.online ? fmtTime(e.start) : `${fmtTime(e.start)} · ${e.areaName} · ${miLabel(e.mi)}${fromLabel.startsWith('from you') ? ' away' : ''}`}
          </Text>
        </View>
      </View>
    </Pressable>
    <View style={styles.bigSave}><SaveButton id={e.id} onImage /></View>
    </View>
  );
}

/** Compact row for later events: a plain date block, then title and details. */
function Row({ e }: { e: Ev }) {
  const st = EVENT_STYLE[e.category];
  const free = e.cost.toLowerCase().startsWith('free');
  return (
    <View style={styles.row}>
    <Pressable
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${e.title}, ${dayLabel(e.start)} ${fmtTime(e.start)}, ${e.online ? 'online' : 'in person'}`}
      style={({ pressed }) => [styles.rowMain, pressed && { backgroundColor: C.bg2 }]}
    >
      <View style={styles.dateTile}>
        <Text style={styles.dateMonth}>{month(e.start)}</Text>
        <Text style={styles.dateNum}>{new Date(e.start).getDate()}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={[styles.kind, { color: st.solid }]} numberOfLines={1}>{st.label} · {fmtTime(e.start)}</Text>
        <Text style={styles.rowTitle} numberOfLines={2}>{e.title}</Text>
        <View style={styles.metaRow}>
          <WhereTag e={e} />
          {!e.online ? <Text style={styles.meta} numberOfLines={1}>{miLabel(e.mi)}</Text> : null}
          <Text style={[styles.meta, free && { color: C.ok, fontWeight: '600' }]} numberOfLines={1}>{e.cost}</Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>{e.source ? `${e.source} · ${e.host}` : `${e.areaName} · Demo`}</Text>
      </View>
    </Pressable>
    <View style={styles.rowSave}><SaveButton id={e.id} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.md, paddingHorizontal: S.lg, paddingTop: S.md },
  count: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: C.ink },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.ok },
  liveText: { fontSize: 13, lineHeight: 18, color: C.ink3, flexShrink: 1 },
  demoToggle: { alignItems: 'center', gap: 2 },
  demoText: { fontSize: 12, color: C.ink2, fontWeight: '500' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 40, borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface },
  pillOn: { backgroundColor: C.accent, borderColor: C.accent },
  pillText: { fontSize: 14, color: C.ink },
  pillDivider: { width: 1, backgroundColor: C.line, marginVertical: 6 },
  section: { ...T.h2, paddingHorizontal: S.lg },
  big: { width: 272, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  bigMedia: { height: 136, alignItems: 'center', justifyContent: 'center' },
  bigSave: { position: 'absolute', top: S.sm, right: S.sm },
  bigBody: { padding: S.md, gap: 6 },
  datePill: { position: 'absolute', top: S.sm, left: S.sm, backgroundColor: C.surface, borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 4, alignItems: 'center', minWidth: 48 },
  datePillDay: { color: C.ink2, fontSize: 12, fontWeight: '600' },
  datePillNum: { fontFamily: F.display, color: C.ink, fontSize: 20, lineHeight: 24 },
  kind: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  bigTitle: { fontFamily: F.displaySemi, color: C.ink, fontSize: 18, lineHeight: 23, minHeight: 46 },
  save: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg2 },
  saveOnImage: { backgroundColor: C.surface },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.md },
  rowSave: { paddingRight: S.md },
  dateTile: { width: 56, paddingVertical: S.sm, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg2, alignSelf: 'flex-start' },
  dateMonth: { color: C.ink2, fontSize: 12, fontWeight: '600' },
  dateNum: { fontFamily: F.display, color: C.ink, fontSize: 22, lineHeight: 26 },
  rowTitle: { fontFamily: F.displaySemi, fontSize: 16, lineHeight: 21, color: C.ink },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { fontSize: 13, lineHeight: 18, color: C.ink3, flexShrink: 1 },
  empty: { alignItems: 'center', gap: S.sm, paddingVertical: S.xxl, paddingHorizontal: S.xl },
});
