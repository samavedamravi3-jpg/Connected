import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState, type ComponentProps } from 'react';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition, ZoomIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SwipeRow } from '@/components/SwipeRow';
import { MemberLock } from '@/components/MemberLock';
import { TextTabs } from '@/components/TextTabs';
import { Avatar } from '@/components/ui';
import { dataSource } from '@/data/source';
import type { ConnectionRequest, IncomingRequest } from '@/data/types';
import { conversations, type Conversation } from '@/lib/conversations';
import { firstName } from '@/lib/match';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, F, S, T } from '@/theme';

type Tab = 'chats' | 'requests' | 'sent';
type IconName = ComponentProps<typeof Ionicons>['name'];

const failed = (what: string) => (e: unknown) => Alert.alert(`Couldn’t ${what}`, e instanceof Error ? e.message : 'Check your connection and try again.');
const when = (t: number) => (dayLabel(t) === 'Today' ? fmtTime(t) : dayLabel(t));

/** A short menu: native action sheet on iOS, an alert elsewhere. */
function menu(title: string, items: { label: string; destructive?: boolean; onPress: () => void }[]) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...items.map((i) => i.label), 'Cancel'], cancelButtonIndex: items.length, destructiveButtonIndex: items.findIndex((i) => i.destructive) },
      (k) => items[k]?.onPress(),
    );
  } else {
    Alert.alert(title, undefined, [...items.map((i) => ({ text: i.label, style: i.destructive ? ('destructive' as const) : undefined, onPress: i.onPress })), { text: 'Cancel', style: 'cancel' }]);
  }
}

export default function Inbox() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const hit = (name: string) => !q.trim() || name.toLowerCase().includes(q.trim().toLowerCase());
  const nameOf = (id: string) => dataSource.getPerson(id)?.name ?? 'Connected member';
  const enter = (i: number) => (reduced ? undefined : FadeInDown.delay(Math.min(i, 8) * 50).duration(300));
  const layout = reduced ? undefined : LinearTransition.duration(220);
  const byNewest = (a: ConnectionRequest, b: ConnectionRequest) => b.updatedAt - a.updatedAt;
  const sent = app.requests.filter((r) => !r.incoming).sort(byNewest);
  const received = app.requests.filter((r) => r.incoming && r.status === 'requested').sort(byNewest);
  const demoIncoming = app.showDemo ? app.incoming.filter((i) => i.state === 'new') : [];
  const newCount = received.length + demoIncoming.length;
  const allChats = conversations({ ...app, nameOf });
  const chats = allChats.filter((c) => hit(c.name));
  // "Your turn": the last message in the chat came from them.
  const yourTurn = (id: string) => app.messages[id]?.at(-1)?.from === 'them';
  const unreadCount = allChats.filter((c) => c.unread).length;

  const [tab, setTab] = useState<Tab>(newCount > 0 ? 'requests' : unreadCount > 0 || chats.length ? 'chats' : 'sent');
  const openChat = (id: string) => {
    setTab('chats');
    router.push({ pathname: '/chat/[id]', params: { id } });
  };
  const refresh = () => {
    setRefreshing(true);
    app.refreshRemote();
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <ScrollView
      style={{ backgroundColor: C.surface }}
      contentContainerStyle={{ paddingBottom: S.xxl, paddingTop: insets.top }}
      keyboardShouldPersistTaps="handled"
      refreshControl={app.session ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} /> : undefined}
    >
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Inbox</Text>
        {unreadCount ? <Animated.View entering={ZoomIn} style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></Animated.View> : null}
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => { setSearching((v) => !v); setQ(''); }} accessibilityRole="button" accessibilityLabel={searching ? 'Close search' : 'Search inbox'} hitSlop={8} style={({ pressed }) => [styles.headBtn, pressed && { transform: [{ scale: 0.92 }] }]}>
          <Ionicons name={searching ? 'close' : 'search'} size={20} color={C.ink} />
        </Pressable>
      </View>
      {searching ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(180)} exiting={reduced ? undefined : FadeOut.duration(120)} style={styles.search}>
          <Ionicons name="search" size={16} color={C.ink3} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search by name" placeholderTextColor={C.ink3} autoFocus style={styles.searchInput} accessibilityLabel="Search by name" />
        </Animated.View>
      ) : null}
      <View style={styles.tabs}>
        <TextTabs
          tabs={[
            { id: 'chats', label: 'Chats', count: allChats.length },
            { id: 'requests', label: 'Requests', count: newCount },
            { id: 'sent', label: 'Sent', count: sent.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      <MemberLock what="requests and chats" style={{ marginHorizontal: S.lg, marginBottom: S.md }} />

      {tab === 'chats' ? (
        chats.length ? (
          <>
            {/* Your connections as faces, then the conversations. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faces}>
              {chats.map((c) => {
                const p = c.personId ? dataSource.getPerson(c.personId) : undefined;
                return (
                  <Pressable key={c.id} onPress={() => openChat(c.id)} accessibilityRole="button" accessibilityLabel={`Open chat with ${c.name}`} style={styles.face}>
                    <Animated.View entering={ZoomIn.duration(260)}>
                      <Avatar name={c.name} uri={p?.photo} size={60} ring={c.unread} />
                    </Animated.View>
                    <Text style={styles.faceName} numberOfLines={1}>{firstName(c.name)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {chats.map((c, i) => (
              <Animated.View key={c.id} entering={enter(i)} layout={layout}>
                <SwipeRow right={c.personId ? { label: 'Profile', icon: 'person-outline', color: C.ink2, onPress: () => router.push({ pathname: '/person/[id]', params: { id: c.personId! } }) } : undefined}>
                  <ChatRow c={c} turn={yourTurn(c.id)} onPress={() => openChat(c.id)} />
                </SwipeRow>
              </Animated.View>
            ))}
            {q && !chats.length ? <Text style={styles.noHits}>No chats match “{q}”.</Text> : null}
            <Text style={styles.hint}>Swipe left on a chat for their profile. Tap Assist in any chat for reply ideas.</Text>
          </>
        ) : (
          <Empty icon="chatbubbles-outline" title="No chats yet" line="Chats open once a request is accepted." link={newCount ? 'See requests' : 'Find people on the map'} onLink={() => (newCount ? setTab('requests') : router.navigate('/'))} />
        )
      ) : tab === 'requests' ? (
        newCount ? (
          <>
            {received.filter((r) => hit(nameOf(r.personId))).map((r, k) => (
              <Animated.View key={r.id} entering={enter(k)} exiting={reduced ? undefined : FadeOut.duration(180)} layout={layout}>
                <SwipeRow
                  left={{ label: 'Accept', icon: 'checkmark', color: C.accent, onPress: () => void app.respondRemote(r.id, 'accepted').catch(failed('accept')) }}
                  right={{ label: 'Decline', icon: 'close', color: C.ink3, onPress: () => void app.respondRemote(r.id, 'declined').catch(failed('decline')) }}
                >
                  <IncomingRow r={r} />
                </SwipeRow>
              </Animated.View>
            ))}
            {demoIncoming.filter((i) => hit(i.name)).map((i, k) => (
              <Animated.View key={i.id} entering={enter(received.length + k)} exiting={reduced ? undefined : FadeOut.duration(180)} layout={layout}>
                <SwipeRow
                  left={{ label: 'Accept', icon: 'checkmark', color: C.accent, onPress: () => app.respondIncoming(i.id, 'accepted') }}
                  right={{ label: 'Decline', icon: 'close', color: C.ink3, onPress: () => app.respondIncoming(i.id, 'declined') }}
                >
                  <DemoIncomingRow i={i} />
                </SwipeRow>
              </Animated.View>
            ))}
            <Text style={styles.hint}>Swipe right to accept, left to decline.</Text>
          </>
        ) : (
          <Empty
            icon="mail-open-outline"
            title="No new requests"
            line={app.session ? 'Stay visible on the map so people can find you.' : 'Sign in to get requests from real people.'}
            link={app.session ? 'Check my visibility' : 'Go to Profile'}
            onLink={() => router.navigate('/profile')}
          />
        )
      ) : sent.length ? (
        sent.filter((r) => hit(nameOf(r.personId))).map((r, i) => (
          <Animated.View key={r.id} entering={enter(i)} layout={layout}>
            <SwipeRow right={r.status === 'requested' ? { label: 'Cancel', icon: 'close-circle-outline', color: C.bad, onPress: () => void app.cancelRequest(r.id).catch(failed('cancel')) } : undefined}>
              <SentRow r={r} onMessage={() => openChat(r.id)} />
            </SwipeRow>
          </Animated.View>
        ))
      ) : (
        <Empty icon="paper-plane-outline" title="Nothing sent yet" line="Open someone on the map to say hello." link="Go to the map" onLink={() => router.navigate('/')} />
      )}
    </ScrollView>
  );
}

function Empty({ icon, title, line, link, onLink }: { icon: IconName; title: string; line: string; link: string; onLink: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={30} color={C.accent} /></View>
      <Text style={T.h3}>{title}</Text>
      <Text style={[T.small, { textAlign: 'center' }]}>{line}</Text>
      <Pressable onPress={onLink} accessibilityRole="link" hitSlop={8}>
        <Text style={styles.link}>{link}</Text>
      </Pressable>
    </View>
  );
}

/** One conversation, like any messaging app: face, name, time, last line, unread dot. */
function ChatRow({ c, onPress, turn }: { c: Conversation; onPress: () => void; turn?: boolean }) {
  const p = c.personId ? dataSource.getPerson(c.personId) : undefined;
  const preview = c.preview.replace(/\s+/g, ' ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${c.name}${c.demo ? ', demo' : ''}${c.unread ? ', unread' : ''}. ${preview}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.bg2 }]}
    >
      <Avatar name={c.name} uri={p?.photo} size={52} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.name, c.unread && { fontWeight: '700' }]} numberOfLines={1}>{c.name}</Text>
          {turn && !c.unread ? <Text style={styles.turn}>Your turn</Text> : null}
          {c.at ? <Text style={[styles.time, c.unread && { color: C.accent, fontWeight: '600' }]}>{when(c.at)}</Text> : null}
        </View>
        <View style={styles.rowTop}>
          <Text style={[styles.preview, c.unread && { color: C.ink, fontWeight: '600' }]} numberOfLines={1}>{c.demo ? 'Demo · ' : ''}{preview}</Text>
          {c.unread ? <View style={styles.dot} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Round accept / decline marks instead of text buttons. */
function Marks({ onAccept, onDecline, name }: { onAccept: () => void; onDecline: () => void; name: string }) {
  return (
    <View style={styles.marks}>
      <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onDecline(); }} accessibilityRole="button" accessibilityLabel={`Decline ${name}`} hitSlop={6} style={({ pressed }) => [styles.mark, styles.markNo, pressed && { opacity: 0.7 }]}>
        <Ionicons name="close" size={22} color={C.ink2} />
      </Pressable>
      <Pressable onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); onAccept(); }} accessibilityRole="button" accessibilityLabel={`Accept ${name}`} hitSlop={6} style={({ pressed }) => [styles.mark, styles.markYes, pressed && { opacity: 0.85 }]}>
        <Ionicons name="checkmark" size={22} color={C.white} />
      </Pressable>
    </View>
  );
}

function IncomingRow({ r }: { r: ConnectionRequest }) {
  const app = useApp();
  const p = dataSource.getPerson(r.personId);
  const name = p?.name ?? 'Connected member';
  return (
    <View style={styles.row}>
      <Pressable onPress={() => router.push({ pathname: '/person/[id]', params: { id: r.personId } })} accessibilityRole="button" accessibilityLabel={`${name}'s profile`} style={styles.rowLead}>
        <Avatar name={name} uri={p?.photo} size={52} />
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {p?.role ? <Text style={styles.sub} numberOfLines={1}>{p.role}{p.org ? ` · ${p.org}` : ''}</Text> : null}
          <Text style={styles.preview} numberOfLines={1}>“{r.message.replace(/\s+/g, ' ')}”</Text>
        </View>
      </Pressable>
      <Marks
        name={firstName(name)}
        onAccept={() => app.respondRemote(r.id, 'accepted').catch(failed('accept'))}
        onDecline={() => app.respondRemote(r.id, 'declined').catch(failed('decline'))}
      />
    </View>
  );
}

function DemoIncomingRow({ i }: { i: IncomingRequest }) {
  const app = useApp();
  return (
    <View style={styles.row}>
      <View style={styles.rowLead}>
        <Avatar name={i.name} size={52} />
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>{i.name}</Text>
          <Text style={styles.sub} numberOfLines={1}>{i.role} · Demo</Text>
          <Text style={styles.preview} numberOfLines={1}>“{i.message.replace(/\s+/g, ' ')}”</Text>
        </View>
      </View>
      <Marks name={firstName(i.name)} onAccept={() => app.respondIncoming(i.id, 'accepted')} onDecline={() => app.respondIncoming(i.id, 'declined')} />
    </View>
  );
}

const STATUS: Record<ConnectionRequest['status'], { label: string; color: string }> = {
  requested: { label: 'Waiting', color: C.warn },
  accepted: { label: 'Accepted', color: C.ok },
  declined: { label: 'Declined', color: C.ink3 },
  cancelled: { label: 'Cancelled', color: C.ink3 },
};

/** A request you sent. Tap to open; hold for options (cancel). */
function SentRow({ r, onMessage }: { r: ConnectionRequest; onMessage: () => void }) {
  const app = useApp();
  const p = dataSource.getPerson(r.personId);
  const name = p?.name ?? 'Connected member';
  const st = STATUS[r.status];
  const options = () =>
    r.status === 'requested'
      ? menu(name, [
          { label: 'View profile', onPress: () => router.push({ pathname: '/person/[id]', params: { id: r.personId } }) },
          ...(r.remote ? [] : [{ label: 'Demo: they accept', onPress: () => app.simulateReply(r.id, 'accepted') }]),
          { label: 'Cancel request', destructive: true, onPress: () => void app.cancelRequest(r.id).catch(failed('cancel')) },
        ])
      : undefined;
  return (
    <Pressable
      onPress={() => (r.status === 'accepted' ? onMessage() : router.push({ pathname: '/person/[id]', params: { id: r.personId } }))}
      onLongPress={options}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${st.label}`}
      accessibilityHint={r.status === 'requested' ? 'Hold for options, like cancelling' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.bg2 }]}
    >
      <Avatar name={name} uri={p?.photo} size={52} />
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.time}>{when(r.updatedAt)}</Text>
        </View>
        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: st.color }]} />
          <Text style={[styles.sub, { color: st.color, fontWeight: '600' }]}>{st.label}{r.remote ? '' : ' · demo'}</Text>
        </View>
      </View>
      {r.status === 'requested' ? (
        <Pressable onPress={options} accessibilityRole="button" accessibilityLabel={`Options for ${name}`} hitSlop={8} style={styles.more}>
          <Ionicons name="ellipsis-horizontal" size={18} color={C.ink3} />
        </Pressable>
      ) : r.status === 'accepted' ? (
        <Ionicons name="chatbubble-outline" size={20} color={C.accent} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: S.lg, paddingTop: S.sm, paddingBottom: S.xs },
  faces: { gap: S.lg, paddingHorizontal: S.lg, paddingVertical: S.md },
  face: { alignItems: 'center', gap: 6, width: 64 },
  faceName: { fontSize: 12, fontWeight: '600', color: C.ink2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingVertical: S.md, backgroundColor: C.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.lg, paddingTop: S.md },
  title: { fontFamily: F.display, fontSize: 32, lineHeight: 38, color: C.ink, letterSpacing: -0.6 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: C.white, fontSize: 13, fontWeight: '700' },
  headBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginHorizontal: S.lg, marginTop: S.sm, paddingHorizontal: S.md, minHeight: 42, borderRadius: 12, backgroundColor: C.bg2 },
  searchInput: { flex: 1, fontSize: 16, color: C.ink, paddingVertical: 8 },
  turn: { fontSize: 11, fontWeight: '700', color: C.accent, letterSpacing: 0.3 },
  noHits: { fontSize: 14, color: C.ink3, textAlign: 'center', paddingVertical: S.xl },
  hint: { fontSize: 12, color: C.ink3, textAlign: 'center', paddingTop: S.lg, paddingHorizontal: S.xl },
  rowLead: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: S.md },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  name: { flex: 1, fontFamily: F.displaySemi, fontSize: 16, lineHeight: 21, color: C.ink },
  sub: { fontSize: 13, lineHeight: 18, color: C.ink3 },
  preview: { flex: 1, fontSize: 14, lineHeight: 19, color: C.ink3 },
  time: { fontSize: 12, color: C.ink3, fontVariant: ['tabular-nums'] },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  marks: { flexDirection: 'row', gap: S.sm },
  mark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  markNo: { backgroundColor: C.bg2 },
  markYes: { backgroundColor: C.accent },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  more: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: S.sm, paddingVertical: S.xxl * 1.5, paddingHorizontal: S.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: S.sm },
  link: { fontSize: 15, fontWeight: '600', color: C.accent, marginTop: S.xs },
});
