import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostItem } from '@/components/posts/PostItem';
import { RespondSheet } from '@/components/posts/RespondSheet';
import { TextTabs } from '@/components/TextTabs';
import { Avatar, Segmented } from '@/components/ui';
import { AREAS } from '@/data/options';
import { dataSource } from '@/data/source';
import { FILTERS, INTENTS, RADII, alertDigest, matchesFilter, postState, type FeedFilter, type NearbyPost, type PostIntent, type RadiusMi } from '@/lib/posts/model';
import { OfflineError, postsSource } from '@/lib/posts/source';
import { markActivitySeen, setAlerts, setArea, setRadius, toggleSaved, usePostsLocal } from '@/lib/posts/store';
import { useRelation, useViewerArea } from '@/lib/posts/viewer';
import { useApp } from '@/state/AppState';
import { C, F, S, T } from '@/theme';

type Load = { status: 'loading' | 'ready' | 'offline' | 'error'; posts: NearbyPost[] };

export default function Nearby() {
  const app = useApp();
  const local = usePostsLocal();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const viewer = useViewerArea();
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [load, setLoad] = useState<Load>({ status: 'loading', posts: [] });
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<'area' | 'activity' | null>(null);
  const [responding, setResponding] = useState<NearbyPost | null>(null);
  const myId = app.session?.userId ?? 'me';
  const blocked = useMemo(() => new Set([...app.blocked, ...app.muted]), [app.blocked, app.muted]);

  const fetchPosts = useCallback(async () => {
    const t = Date.now();
    setNow(t);
    try {
      const posts = await postsSource.list({ center: viewer.area.center, radiusMi: viewer.radiusMi }, t);
      setLoad({ status: 'ready', posts });
    } catch (e) {
      setLoad((l) => ({ status: e instanceof OfflineError ? 'offline' : 'error', posts: l.posts }));
    }
  }, [viewer.area.center, viewer.radiusMi]);

  // Reload when the area or radius changes; keep the clock fresh on focus without resetting scroll.
  useEffect(() => {
    void fetchPosts();
  }, [fetchPosts, local.mine]);
  useFocusEffect(useCallback(() => setNow(Date.now()), []));
  const refresh = () => {
    setRefreshing(true);
    fetchPosts().finally(() => setRefreshing(false));
  };

  // Opt-in alerts: one grouped, quiet notification at most every 6 hours, for intents you chose.
  const alerted = useRef(false);
  useEffect(() => {
    if (!local.alerts.on || alerted.current || load.status !== 'ready') return;
    const d = alertDigest(load.posts, { intents: local.alerts.intents, lastAt: local.alerts.lastAt, seen: local.alerts.seen, myId, now: Date.now() });
    if (!d) return;
    alerted.current = true;
    Notifications.scheduleNotificationAsync({
      content: { title: 'Nearby', body: `${d.count} new post${d.count === 1 ? '' : 's'} around ${viewer.area.name} you might want to see.`, data: { postId: d.ids[0] }, sound: false },
      trigger: null,
    }).catch(() => {});
    setAlerts({ lastAt: Date.now(), seen: [...local.alerts.seen, ...d.ids].slice(-200) });
  }, [local.alerts, load, myId, viewer.area.name]);

  // Tapping a Nearby notification opens the post, which re-checks that it's still available to you.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.postId;
      if (typeof id === 'string') router.push({ pathname: '/post/[id]', params: { id, from: 'notif' } });
    });
    return () => sub.remove();
  }, []);

  const visible = load.posts.filter((p) => !blocked.has(p.author.id) && postState(p, now) !== 'expired');
  const shown = visible.filter((p) => matchesFilter(p, filter));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, visible.filter((p) => matchesFilter(p, f.id)).length])) as Record<FeedFilter, number>;
  const wider = RADII.find((r) => r > viewer.radiusMi);
  const acceptances = Object.entries(local.responded)
    .map(([postId, personId]) => ({ postId, req: app.requests.find((r) => r.personId === personId && !r.incoming && r.status === 'accepted') }))
    .filter((a) => !!a.req);
  const unseen = acceptances.filter((a) => !local.activitySeen.includes(a.postId)).length;
  const publish = () => router.push('/post/new');

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + S.sm }]}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">Nearby</Text>
        <Pressable onPress={() => setSheet('activity')} accessibilityRole="button" accessibilityLabel={`Activity${unseen ? `, ${unseen} new` : ''}`} hitSlop={8} style={styles.iconBtn}>
          <Ionicons name="notifications-outline" size={22} color={C.ink} />
          {unseen ? <View style={styles.dot} /> : null}
        </Pressable>
        <Pressable onPress={publish} accessibilityRole="button" accessibilityLabel="Create a post" style={({ pressed }) => [styles.create, pressed && { transform: [{ scale: 0.94 }], backgroundColor: C.accentPressed }]}>
          <Ionicons name="add" size={26} color={C.white} />
        </Pressable>
      </View>
      <Pressable onPress={() => setSheet('area')} accessibilityRole="button" accessibilityLabel={`Area ${viewer.area.name}, within ${viewer.radiusMi} miles. Change`} hitSlop={6} style={styles.areaRow}>
        <Text style={styles.area}>{viewer.area.name} · within {viewer.radiusMi} mi</Text>
        <Ionicons name="chevron-down" size={14} color={C.ink3} />
      </Pressable>
      {viewer.perm === 'denied' && viewer.source !== 'manual' ? <Text style={styles.note}>Location is off, so you’re seeing {viewer.area.name}. Tap above to choose your area.</Text> : null}
      <TextTabs tabs={FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] }))} value={filter} onChange={setFilter} />
    </View>
  );

  const empty =
    load.status === 'loading' ? (
      <View style={styles.state}><ActivityIndicator color={C.accent} /></View>
    ) : load.status === 'offline' || load.status === 'error' ? (
      <State icon="cloud-offline-outline" title={load.status === 'offline' ? 'You’re offline' : 'Couldn’t load posts'} line="Pull down to try again." />
    ) : visible.length ? (
      <State icon="funnel-outline" title={`No ${FILTERS.find((f) => f.id === filter)!.label.toLowerCase()} posts right now`} line="Try All, or check back later." link="Show all" onLink={() => setFilter('all')} />
    ) : (
      <State
        icon="images-outline"
        title={`Quiet around ${viewer.area.name}`}
        line="Be the first to share what you’re up to."
        link={wider ? `Expand to ${wider} mi` : 'Create a post'}
        onLink={() => (wider ? setRadius(wider) : publish())}
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}
        renderItem={({ item, index }) => (
          <Animated.View entering={reduced ? undefined : FadeInDown.delay(Math.min(index, 5) * 60).duration(320)}>
            <PostItem
              p={item}
              now={now}
              width={width - S.lg * 2}
              saved={local.saved.includes(item.id)}
              responded={!!local.responded[item.id]}
              mine={item.id.startsWith('mine-')}
              onRespond={() => setResponding(item)}
              onSave={() => toggleSaved(item.id)}
            />
          </Animated.View>
        )}
        ListFooterComponent={
          shown.length ? (
            <View style={styles.end}>
              <Text style={styles.endText}>You’re all caught up around {viewer.area.name}.</Text>
              {wider ? (
                <Pressable onPress={() => setRadius(wider)} accessibilityRole="button" hitSlop={8}><Text style={styles.link}>Expand to {wider} mi</Text></Pressable>
              ) : null}
            </View>
          ) : undefined
        }
        contentContainerStyle={{ paddingBottom: S.xxl }}
      />

      {responding ? <RespondFor post={responding} onClose={() => setResponding(null)} /> : null}

      <Modal visible={sheet === 'area'} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable style={styles.scrim} onPress={() => setSheet(null)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Your area</Text>
          <Pressable
            onPress={async () => {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status === 'granted') { setArea(null); setSheet(null); }
            }}
            accessibilityRole="button"
            style={styles.optRow}
          >
            <Ionicons name="navigate-outline" size={18} color={C.accent} />
            <Text style={[styles.optText, { color: C.accent }]}>Use my neighborhood</Text>
            {viewer.source === 'location' ? <Ionicons name="checkmark" size={18} color={C.accent} /> : null}
          </Pressable>
          <ScrollView style={{ maxHeight: 280 }}>
            {AREAS.map((a) => {
              const on = viewer.source === 'manual' && viewer.area.id === a.id;
              return (
                <Pressable key={a.id} onPress={() => { setArea(a.id); setSheet(null); }} accessibilityRole="radio" accessibilityState={{ selected: on }} style={styles.optRow}>
                  <Text style={[styles.optText, on && { color: C.accent }]}>{a.name}</Text>
                  {on ? <Ionicons name="checkmark" size={18} color={C.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Segmented label="Distance" options={RADII.map((r) => ({ id: r, label: `${r} mi` }))} value={viewer.radiusMi as RadiusMi} onChange={setRadius} />
          <Text style={T.small}>Only neighborhoods are used, never your exact position.</Text>
        </View>
      </Modal>

      <Modal visible={sheet === 'activity'} transparent animationType="slide" onRequestClose={() => setSheet(null)} onShow={() => markActivitySeen(acceptances.map((a) => a.postId))}>
        <Pressable style={styles.scrim} onPress={() => setSheet(null)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + S.md, maxHeight: '80%' }]}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={{ gap: S.lg }}>
            <Text style={styles.sheetTitle}>Activity</Text>
            {acceptances.length ? (
              acceptances.map(({ postId, req }) => {
                const name = dataSource.getPerson(req!.personId)?.name ?? 'Someone';
                return (
                  <Pressable key={postId} onPress={() => { setSheet(null); router.push({ pathname: '/chat/[id]', params: { id: req!.id } }); }} accessibilityRole="button" style={styles.actRow}>
                    <Avatar name={name} size={40} />
                    <Text style={[T.body, { flex: 1 }]}><Text style={{ fontWeight: '600' }}>{name}</Text> accepted your response</Text>
                    <Ionicons name="chatbubble-outline" size={18} color={C.accent} />
                  </Pressable>
                );
              })
            ) : (
              <Text style={T.small}>Replies to your posts and accepted responses show up here.</Text>
            )}

            {local.saved.length ? (
              <View style={{ gap: S.sm }}>
                <Text style={styles.label}>SAVED</Text>
                <SavedList ids={local.saved} now={now} onOpen={(id) => { setSheet(null); router.push({ pathname: '/post/[id]', params: { id } }); }} />
              </View>
            ) : null}

            <View style={{ gap: S.sm }}>
              <View style={styles.optRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optText}>Quiet alerts</Text>
                  <Text style={T.small}>At most one grouped alert every few hours.</Text>
                </View>
                <Switch value={local.alerts.on} onValueChange={(on) => setAlerts({ on })} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Quiet alerts for nearby posts" />
              </View>
              {local.alerts.on ? (
                <View style={styles.intentRow}>
                  {INTENTS.map((i) => {
                    const on = local.alerts.intents.includes(i.id);
                    return (
                      <Pressable
                        key={i.id}
                        onPress={() => setAlerts({ intents: on ? local.alerts.intents.filter((x) => x !== i.id) : [...local.alerts.intents, i.id as PostIntent] })}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={[styles.intentChip, on && styles.intentChipOn]}
                      >
                        <Text style={[styles.intentText, on && { color: C.white }]}>{i.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function RespondFor({ post, onClose }: { post: NearbyPost; onClose: () => void }) {
  const rel = useRelation(post.author.id, post.id.startsWith('mine-'));
  return <RespondSheet post={post} rel={rel} onClose={onClose} />;
}

/** Saved posts that are still live; expired ones drop out of the list. */
function SavedList({ ids, now, onOpen }: { ids: string[]; now: number; onOpen: (id: string) => void }) {
  const [posts, setPosts] = useState<NearbyPost[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all(ids.map((id) => postsSource.get(id))).then((ps) => alive && setPosts(ps.filter((p): p is NearbyPost => !!p)));
    return () => { alive = false; };
  }, [ids]);
  const live = posts.filter((p) => postState(p, now) !== 'expired');
  if (!live.length) return <Text style={T.small}>Saved posts disappear when they expire.</Text>;
  return (
    <>
      {live.map((p) => (
        <Pressable key={p.id} onPress={() => onOpen(p.id)} accessibilityRole="button" style={styles.actRow}>
          <Avatar name={p.author.name} size={32} />
          <Text style={[T.body, { flex: 1, fontSize: 15 }]} numberOfLines={1}>{p.caption}</Text>
        </Pressable>
      ))}
    </>
  );
}

function State({ icon, title, line, link, onLink }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; line: string; link?: string; onLink?: () => void }) {
  return (
    <View style={styles.state}>
      <Ionicons name={icon} size={32} color={C.ink3} />
      <Text style={T.h3}>{title}</Text>
      <Text style={[T.small, { textAlign: 'center' }]}>{line}</Text>
      {link && onLink ? (
        <Pressable onPress={onLink} accessibilityRole="button" hitSlop={8}><Text style={styles.link}>{link}</Text></Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: S.lg, gap: 4, paddingBottom: S.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  title: { flex: 1, fontFamily: F.display, fontSize: 32, lineHeight: 38, color: C.ink, letterSpacing: -0.6 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },
  create: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 28 },
  area: { fontSize: 15, fontWeight: '600', color: C.ink2 },
  note: { fontSize: 13, lineHeight: 18, color: C.warn },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line2, marginHorizontal: S.lg },
  state: { alignItems: 'center', gap: S.sm, paddingVertical: S.xxl * 2, paddingHorizontal: S.xl },
  link: { fontSize: 15, fontWeight: '600', color: C.accent, marginTop: S.xs },
  end: { alignItems: 'center', gap: 4, paddingVertical: S.xxl },
  endText: { fontSize: 14, color: C.ink3 },
  scrim: { flex: 1, backgroundColor: 'rgba(27,26,33,0.3)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: S.lg, gap: S.md },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line2 },
  sheetTitle: { fontFamily: F.display, fontSize: 22, color: C.ink },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 48 },
  optText: { flex: 1, fontSize: 16, fontWeight: '500', color: C.ink },
  actRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 48 },
  label: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: C.ink3 },
  intentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  intentChip: { paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: 999, backgroundColor: C.bg2 },
  intentChipOn: { backgroundColor: C.ink },
  intentText: { fontSize: 14, fontWeight: '500', color: C.ink2 },
});
