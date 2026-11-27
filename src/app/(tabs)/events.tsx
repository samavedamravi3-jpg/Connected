import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventImage } from '@/components/EventImage';
import { MemberLock } from '@/components/MemberLock';
import { RoundTable } from '@/components/RoundTable';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { buildDemoCircles } from '@/data/circles';
import { TextTabs } from '@/components/TextTabs';
import { Button, IconButton, Segmented } from '@/components/ui';
import { EVENT_STYLE } from '@/data/eventVisuals';
import { CHARLOTTE_CENTER, venueById } from '@/data/options';
import { dataSource, type EventsResult } from '@/data/source';
import type { CommunityEvent, EventCategory } from '@/data/types';
import { eventsView } from '@/lib/eventsView';
import { distanceMi } from '@/lib/geo';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, F, R, S, T } from '@/theme';
import { warn } from '@/lib/log';

type When = 'any' | 'week' | 'month';
type Page = 'foryou' | 'week' | 'circles' | 'saved';
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

export default function Events() {
  const app = useApp();
  const { eventHidden } = app;
  const [loaded, setLoaded] = useState<{ res: EventsResult; withDemo: boolean } | null>(null);
  /** The demo setting whose newest request failed (cleared by a success, Retry, pull-to-refresh or a demo toggle here). */
  const [failedFor, setFailedFor] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const withDemo = app.showDemoEvents;
  // A result for the other demo setting is never shown as current while the new one loads.
  const res = loaded?.withDemo === withDemo ? loaded.res : null;
  const all = res?.events ?? null;
  const failed = failedFor === withDemo;
  // Pages are plain text tabs; category, date range, distance and demo live in one Filters sheet.
  const insets = useSafeAreaInsets();
  const [circles] = useState(() => buildDemoCircles(Date.now()));
  const [page, setPage] = useState<Page>('foryou');
  const [catSel, setCat] = useState<Cat>('all');
  const [whenSel, setWhen] = useState<When>('any');
  const [maxMi, setMaxMi] = useState(25);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const cat: Cat = page === 'saved' ? 'saved' : catSel;
  const when: When = page === 'week' ? 'week' : whenSel;
  const filterCount = Number(catSel !== 'all') + Number(whenSel !== 'any') + Number(maxMi !== 25) + Number(withDemo);

  // Only the newest request may land: a superseded one (demo toggled, pulled again) or one finishing after unmount is
  // ignored. The returned promise always settles, so refreshing always stops.
  const seq = useRef(0);
  const load = useCallback(
    (force: boolean) => {
      const id = ++seq.current;
      return dataSource.listEvents({ withDemo, force }).then(
        (r) => {
          if (id !== seq.current) return;
          setLoaded({ res: r, withDemo });
          setFailedFor(null);
        },
        (e) => {
          if (id !== seq.current) return;
          warn('Could not load events', e);
          setFailedFor(withDemo);
        },
      );
    },
    [withDemo],
  );
  useEffect(() => {
    load(false);
    const s = seq;
    return () => {
      s.current += 1;
    };
  }, [load]);
  const setDemo = (v: boolean) => {
    setFailedFor(null);
    app.setShowDemoEvents(v);
  };
  const retry = () => {
    setFailedFor(null);
    return load(true);
  };
  const refresh = () => {
    setRefreshing(true);
    setFailedFor(null);
    load(true).finally(() => setRefreshing(false));
  };

  const origin = app.here?.coord ?? CHARLOTTE_CENTER;

  // Live events are a real-member area; demo events stay available to everyone.
  const locked = app.memberLocked;
  const list: Ev[] = useMemo(() => {
    if (!all) return [];
    const now = app.now;
    const limit = when === 'week' ? now + 7 * 864e5 : when === 'month' ? now + 31 * 864e5 : Infinity;
    return all
      .filter((e) => e.end > now && !eventHidden(e) && (e.isDemo || !locked))
      .map((e) => ({ ...e, mi: e.online ? 0 : distanceMi(origin, e.coord) }))
      .filter((e) => (cat === 'all' || cat === 'saved' || e.category === cat) && (cat !== 'saved' || app.savedEvents.includes(e.id)))
      .filter((e) => e.start <= limit && e.mi <= maxMi)
      .sort((a, b) => Number(b.field === app.prefs.field && !!app.prefs.field) - Number(a.field === app.prefs.field && !!app.prefs.field) || a.start - b.start);
  }, [all, cat, when, maxMi, app.savedEvents, eventHidden, app.now, origin, app.prefs.field, locked]);

  const upcoming = (all ?? []).filter((e) => e.end > app.now && !eventHidden(e) && (e.isDemo || !locked)).length;
  const savedHidden = locked ? (all ?? []).filter((e) => !e.isDemo && e.end > app.now && !eventHidden(e) && app.savedEvents.includes(e.id)).length : 0;
  const view = eventsView({
    locked, withDemo, saved: cat === 'saved', savedCount: app.savedEvents.length, savedHidden,
    loaded: !!all, failed, shown: list.length, liveCount: res?.liveCount ?? 0,
  });
  // The ID gate hides live events and demo events are off: nothing can show until verification.
  const lockedOut = locked && !withDemo;
  // One featured event (the soonest with a real photo, else the soonest), a few curated picks for this week,
  // then everything else as compact rows. Hierarchy comes from layout, not from more decoration.
  const featured = page !== 'foryou' ? null : (list.find((e) => !!e.image && e.start <= app.now + 14 * 864e5) ?? list[0] ?? null);
  const rest = list.filter((e) => e.id !== featured?.id);
  const picks = page !== 'foryou' ? [] : rest.filter((e) => e.start <= app.now + 7 * 864e5).slice(0, 3);
  const later = rest.filter((e) => !picks.includes(e));

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: S.xxl, gap: S.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <TextTabs
            tabs={[
              { id: 'foryou', label: 'For you', count: upcoming },
              { id: 'week', label: 'This week', count: (all ?? []).filter((e) => e.end > app.now && e.start <= app.now + 7 * 864e5 && !eventHidden(e) && (e.isDemo || !locked)).length },
              { id: 'circles', label: 'Circles', count: circles.length },
              { id: 'saved', label: 'Saved', count: app.savedEvents.length },
            ]}
            value={page}
            onChange={setPage}
          />
        </View>
        <Pressable onPress={() => setFiltersOpen(true)} accessibilityRole="button" accessibilityLabel={`Filters${filterCount ? `, ${filterCount} on` : ''}`} hitSlop={6} style={styles.filterBtn}>
          <Ionicons name="options-outline" size={18} color={C.ink} />
          <Text style={styles.filterText}>Filters{filterCount ? ` · ${filterCount}` : ''}</Text>
        </Pressable>
      </View>
      <Text style={[styles.status, page === 'circles' && { display: 'none' }]}>
        {lockedOut
          ? 'Live events unlock after verification'
          : !all
            ? failed ? 'Couldn’t load events. Pull down to retry.' : 'Finding events in Charlotte…'
            : res && res.liveCount && !locked
              ? `${list.length} events · live from Meetup & Devpost · updated ${fmtTime(res.fetchedAt)}`
              : `${list.length} events${withDemo ? ' · includes demo events' : ''}`}
      </Text>

      <MemberLock what="events" style={{ paddingHorizontal: S.lg }} />

      {page === 'circles' ? (
        <View style={{ paddingHorizontal: S.lg }}>
          <Text style={styles.circlesIntro}>Small tables of 3 to 5 people around one topic, at a public place.</Text>
          {circles.map((c, i) => {
            const joined = (app.joinedCircles ?? []).includes(c.id);
            const seated = [...c.members.map((m) => dataSource.getPerson(m)).filter((x) => !!x).map((x) => ({ name: x!.name, uri: x!.photo })), ...(joined ? [{ name: 'You', uri: app.profile.photoUri, you: true }] : [])];
            const open = c.seats - seated.length;
            return (
              <Animated.View key={c.id} entering={FadeInDown.delay(i * 70).duration(320)}>
                <Pressable onPress={() => router.push({ pathname: '/circle/[id]', params: { id: c.id } })} accessibilityRole="button" accessibilityLabel={`${c.topic}, ${open} seats open`} style={({ pressed }) => [styles.circleRow, i > 0 && styles.rowDivider, pressed && { opacity: 0.7 }]}>
                  <RoundTable seats={c.seats} people={seated} size={104} animate={false} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{c.topic}</Text>
                    <Text style={styles.meta} numberOfLines={1}>{shortDay(c.start)} {fmtTime(c.start)} · {venueById(c.venueId).area}</Text>
                    <Text style={[styles.meta, { color: open > 0 ? C.accent : C.ink3, fontWeight: '600' }]}>
                      {joined ? 'You have a seat' : open > 0 ? `${open} seat${open === 1 ? '' : 's'} open` : 'Full'} · Demo
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      ) : view === 'loading' ? (
        <ActivityIndicator color={C.accent} style={{ marginTop: S.xl }} accessibilityLabel="Loading events" />
      ) : view === 'error' ? (
        <View style={styles.empty} accessibilityLiveRegion="polite">
          <Ionicons name="cloud-offline-outline" size={28} color={C.ink3} />
          <Text style={T.h3}>Couldn’t load events</Text>
          <Text style={[T.small, { textAlign: 'center' }]}>Check your connection, then try again.</Text>
          <Button label="Retry" small onPress={() => void retry()} style={{ marginTop: S.sm }} />
        </View>
      ) : view !== 'list' ? (
        <View style={styles.empty}>
          <Ionicons name={view === 'locked' || view === 'savedLocked' ? 'lock-closed-outline' : cat === 'saved' ? 'bookmark-outline' : 'calendar-clear-outline'} size={28} color={C.ink3} />
          <Text style={T.h3}>
            {view === 'locked' ? 'Live events are locked' : view === 'savedLocked' ? 'Your saved events are locked' : view === 'savedEmpty' ? 'Nothing saved yet' : view === 'noLive' ? 'No live events loaded' : 'Nothing matches'}
          </Text>
          <Text style={[T.small, { textAlign: 'center' }]}>
            {view === 'locked'
              ? 'Unlock them with the step above, or turn on demo events to look around.'
              : view === 'savedLocked'
                ? 'They’re still saved. They show here again once you finish the step above.'
                : view === 'savedEmpty'
                  ? 'Tap the bookmark on any event to keep it here.'
                  : view === 'noLive'
                    ? 'Meetup and Devpost could not be reached. Pull down to retry, or turn on demo events.'
                    : 'Try a wider distance or another date.'}
          </Text>
          {(view === 'noLive' || view === 'locked') && !withDemo ? (
            <Button label="Show demo events" small onPress={() => setDemo(true)} style={{ marginTop: S.sm }} />
          ) : null}
        </View>
      ) : (
        <View style={{ paddingHorizontal: S.lg, gap: S.xl }}>
          {featured ? <Animated.View entering={FadeInDown.duration(380)}><Featured e={featured} /></Animated.View> : null}
          {picks.length ? (
            <View>
              <Text style={styles.section} accessibilityRole="header">This week in Charlotte</Text>
              <Text style={styles.sectionSub}>A few picks for the next 7 days</Text>
              {picks.map((e, i) => <Animated.View key={e.id} entering={FadeInDown.delay(120 + i * 60).duration(320)}><Row e={e} first={i === 0} /></Animated.View>)}
            </View>
          ) : null}
          {later.length ? (
            <View>
              <Text style={styles.section} accessibilityRole="header">{cat === 'saved' ? 'Saved' : 'Coming up'}</Text>
              {later.map((e, i) => <Animated.View key={e.id} entering={FadeInDown.delay(Math.min(i, 8) * 45).duration(300)}><Row e={e} first={i === 0} /></Animated.View>)}
            </View>
          ) : null}
        </View>
      )}

      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setFiltersOpen(false)} accessibilityLabel="Close filters" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}>
          <View style={styles.sheetHead}>
            <Text style={T.h2} accessibilityRole="header">Filters</Text>
            <IconButton icon="close" label="Close filters" onPress={() => setFiltersOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={{ gap: S.xl, paddingBottom: S.lg }}>
            <View style={{ gap: S.sm }}>
              <Text style={styles.sheetLabel}>Type</Text>
              <Segmented label="Event type" options={CATS.filter((c) => c.id !== 'saved').map((c) => ({ id: c.id, label: c.label }))} value={catSel} onChange={setCat} />
            </View>
            <View style={{ gap: S.sm }}>
              <Text style={styles.sheetLabel}>When</Text>
              <Segmented label="When" options={WHEN} value={whenSel} onChange={setWhen} />
            </View>
            <View style={{ gap: S.sm }}>
              <Text style={styles.sheetLabel}>Distance (in-person events)</Text>
              <Segmented label="Distance" options={MILES.map((m) => ({ id: m, label: `${m} mi` }))} value={maxMi} onChange={setMaxMi} />
            </View>
            <View style={styles.sheetSwitch}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.label}>Include demo events</Text>
                <Text style={T.small}>Sample events for exploring. Always labeled Demo.</Text>
              </View>
              <Switch value={withDemo} onValueChange={setDemo} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Include demo events" />
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button label="Reset" variant="secondary" onPress={() => { setCat('all'); setWhen('any'); setMaxMi(25); setDemo(false); }} style={{ flex: 1 }} />
            <Button label={`Show ${list.length} event${list.length === 1 ? '' : 's'}`} onPress={() => setFiltersOpen(false)} style={{ flex: 2 }} />
          </View>
        </View>
      </Modal>
    </ScrollView>
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
      style={[styles.save, onImage && styles.saveOnImage]}
    >
      <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? C.accent : C.ink2} />
    </Pressable>
  );
}

/** Where, in one short phrase: neighborhood for in-person events, "Online" otherwise. */
const whereLabel = (e: Ev) => (e.online ? 'Online' : e.areaName);
const priceLabel = (e: Ev) => (e.cost.toLowerCase().startsWith('free') ? 'Free' : e.cost);

/** NOV / 28: the date gets its own small block so a list scans by date. */
function DateTile({ t, onImage }: { t: number; onImage?: boolean }) {
  return (
    <View style={[styles.dateTile, onImage && styles.dateTileOnImage]} accessible={false}>
      <Text style={styles.dateMonth} maxFontSizeMultiplier={1.2}>{month(t).toUpperCase()}</Text>
      <Text style={styles.dateNum} maxFontSizeMultiplier={1.2}>{new Date(t).getDate()}</Text>
    </View>
  );
}

/** The one featured event: wide photograph, small category label, strong title, then date, place and price. */
function Featured({ e }: { e: Ev }) {
  const st = EVENT_STYLE[e.category];
  return (
    <View>
      <Pressable
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Featured: ${e.title}, ${dayLabel(e.start)} ${fmtTime(e.start)}, ${whereLabel(e)}, ${priceLabel(e)}`}
        style={({ pressed }) => pressed && { opacity: 0.92 }}
      >
        <EventImage e={e} style={styles.featuredImg} />
        <View style={styles.featuredBody}>
          <DateTile t={e.start} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={[styles.kind, { color: st.solid }]}>{st.label.toUpperCase()}{e.isDemo ? ' · DEMO' : ''}</Text>
            <Text style={styles.featuredTitle} numberOfLines={3}>{e.title}</Text>
            <Text style={styles.meta} numberOfLines={1}>{shortDay(e.start)} {fmtTime(e.start)} · {whereLabel(e)} · {priceLabel(e)}</Text>
          </View>
        </View>
      </Pressable>
      <View style={styles.featuredSave}><SaveButton id={e.id} onImage /></View>
    </View>
  );
}

/** A compact row: photo on the left, the essentials on the right, bookmark in the corner. */
function Row({ e, first }: { e: Ev; first?: boolean }) {
  return (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <Pressable
        onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${e.title}, ${dayLabel(e.start)} ${fmtTime(e.start)}, ${whereLabel(e)}, ${priceLabel(e)}`}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}
      >
        <View>
          <EventImage e={e} size="small" style={styles.thumb} />
          <View style={styles.thumbDate}><DateTile t={e.start} onImage /></View>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={styles.rowTitle} numberOfLines={2}>{e.title}</Text>
          <Text style={styles.meta} numberOfLines={1}>{shortDay(e.start)} {fmtTime(e.start)} · {whereLabel(e)}</Text>
          <Text style={[styles.meta, priceLabel(e) === 'Free' && { color: C.ok, fontWeight: '600' }]} numberOfLines={1}>
            {priceLabel(e)}{e.isDemo ? ' · Demo' : ''}
          </Text>
        </View>
      </Pressable>
      <SaveButton id={e.id} />
    </View>
  );
}

const styles = StyleSheet.create({
  circlesIntro: { fontSize: 14, lineHeight: 20, color: C.ink3, marginBottom: S.sm },
  circleRow: { flexDirection: 'row', alignItems: 'center', gap: S.lg, paddingVertical: S.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingTop: S.sm },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  filterText: { fontSize: 14, fontWeight: '600', color: C.ink },
  status: { fontSize: 13, lineHeight: 18, color: C.ink3, paddingHorizontal: S.lg, marginTop: -S.sm },
  scrim: { flex: 1, backgroundColor: 'rgba(27,26,33,0.35)' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: S.lg, gap: S.lg, maxHeight: '85%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetLabel: { fontSize: 13, fontWeight: '700', color: C.ink3, letterSpacing: 0.6, textTransform: 'uppercase' },
  sheetSwitch: { flexDirection: 'row', alignItems: 'center', gap: S.md },
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
  section: { ...T.h2 },
  sectionSub: { fontSize: 13, lineHeight: 18, color: C.ink3, marginTop: 2, marginBottom: S.xs },
  featuredImg: { width: '100%', aspectRatio: 16 / 9, borderRadius: R.lg },
  featuredBody: { flexDirection: 'row', gap: S.md, paddingTop: S.md },
  featuredSave: { position: 'absolute', top: S.sm, right: S.sm },
  featuredTitle: { fontFamily: F.display, fontSize: 24, lineHeight: 29, color: C.ink, letterSpacing: -0.3 },
  kind: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1 },
  save: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  saveOnImage: { backgroundColor: C.surface },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: S.md },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: S.md },
  thumb: { width: 84, height: 84, borderRadius: R.md },
  thumbDate: { position: 'absolute', left: 4, bottom: 4 },
  dateTile: { width: 48, paddingVertical: 5, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg2, alignSelf: 'flex-start' },
  dateTileOnImage: { width: 38, paddingVertical: 2, borderRadius: R.sm, backgroundColor: C.surface },
  dateMonth: { color: C.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  dateNum: { fontFamily: F.display, color: C.ink, fontSize: 18, lineHeight: 22 },
  rowTitle: { fontFamily: F.displaySemi, fontSize: 16, lineHeight: 21, color: C.ink },
  meta: { fontSize: 13, lineHeight: 18, color: C.ink3, flexShrink: 1 },
  empty: { alignItems: 'center', gap: S.sm, paddingVertical: S.xxl, paddingHorizontal: S.xl },
});
