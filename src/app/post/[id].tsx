import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostPhoto } from '@/components/posts/PostPhoto';
import { RespondSheet } from '@/components/posts/RespondSheet';
import { Avatar, Button } from '@/components/ui';
import { dataSource } from '@/data/source';
import { firstName } from '@/lib/match';
import { CLOSE_LABEL, INTENTS, RESPONSE_LABEL, ago, canRespond, isDiscoverable, postState, responseAction, timeLeft, type CloseReason, type NearbyPost } from '@/lib/posts/model';
import { postsSource } from '@/lib/posts/source';
import { hidePost, toggleSaved, usePostsLocal } from '@/lib/posts/store';
import { useRelation, useViewerArea } from '@/lib/posts/viewer';
import { useApp } from '@/state/AppState';
import { C, F, S, T } from '@/theme';

function menu(title: string, items: { label: string; destructive?: boolean; onPress: () => void }[]) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...items.map((i) => i.label), 'Cancel'], cancelButtonIndex: items.length, destructiveButtonIndex: items.flatMap((i, k) => (i.destructive ? [k] : [])) },
      (k) => items[k]?.onPress(),
    );
  } else {
    Alert.alert(title, undefined, [...items.map((i) => ({ text: i.label, style: i.destructive ? ('destructive' as const) : undefined, onPress: i.onPress })), { text: 'Cancel', style: 'cancel' }]);
  }
}

export default function PostScreen() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const local = usePostsLocal();
  const viewer = useViewerArea();
  const [loaded, setLoaded] = useState<{ id: string; post: NearbyPost | null } | null>(null);
  const [responding, setResponding] = useState(false);
  const [now] = useState(() => Date.now());

  // Re-read the post each time (it may have closed, expired or been deleted since a notification was sent).
  const mineVersion = local.mine.find((p) => p.id === id);
  useEffect(() => {
    let alive = true;
    postsSource.get(id).then((post) => alive && setLoaded({ id, post }));
    return () => { alive = false; };
  }, [id, mineVersion]);

  const p = loaded?.id === id ? loaded.post : undefined;
  const isMine = !!p && p.id.startsWith('mine-');
  const rel = useRelation(p?.author.id, isMine);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/nearby'));

  const shell = (body: React.ReactNode) => (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}><Ionicons name="chevron-back" size={26} color={C.ink} /></Pressable>
      </View>
      {body}
    </View>
  );
  if (p === undefined) return shell(<View style={styles.center}><ActivityIndicator color={C.accent} /></View>);

  const st = postState(p, now);
  // Opened from an old notification: it must still be discoverable from where you are now.
  const outOfArea = from === 'notif' && !!p && st !== 'deleted' && st !== 'expired' && !isMine && !isDiscoverable(p, { center: viewer.area.center, radiusMi: viewer.radiusMi }, now);
  if (!p || st === 'deleted' || local.hidden.includes(p.id) || rel.blocked) return shell(<Gone icon="trash-outline" title="This post isn’t available" line="It was removed or is no longer shared with you." />);
  if (st === 'expired') return shell(<Gone icon="time-outline" title="This post has expired" line="It’s no longer in Nearby. Conversations you already started stay in your Inbox." />);
  if (outOfArea) return shell(<Gone icon="navigate-outline" title="Not available in your area" line={`This post isn’t shared around ${viewer.area.name}.`} />);

  const intent = INTENTS.find((i) => i.id === p.intent);
  const check = canRespond(p, rel, now);
  const first = firstName(p.author.name);
  const saved = local.saved.includes(p.id);
  const known = !isMine && !!dataSource.getPerson(p.author.id);

  const setClosed = (reason: CloseReason | null) => postsSource.close(p.id, reason);
  const manage = () =>
    menu('Your post', [
      ...(p.closed
        ? [{ label: 'Reopen', onPress: () => void setClosed(null) }]
        : [
            { label: 'Found someone', onPress: () => void setClosed('found') },
            { label: 'Sorted', onPress: () => void setClosed('sorted') },
            { label: 'Stop new responses', onPress: () => void setClosed('paused') },
          ]),
      {
        label: 'Delete post',
        destructive: true,
        onPress: () =>
          Alert.alert('Delete this post?', 'It disappears from Nearby right away. Conversations already started stay in your Inbox.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => void postsSource.remove(p.id).then(back) },
          ]),
      },
    ]);
  const more = () =>
    menu(p.author.name, [
      { label: saved ? 'Remove from saved' : 'Save post', onPress: () => toggleSaved(p.id) },
      {
        label: 'Report post',
        destructive: true,
        onPress: () =>
          Alert.alert('Report this post', 'What’s wrong? It’s hidden for you right away.', [
            ...['Spam or a scam', 'Inappropriate photo', 'Harassment or unsafe'].map((reason) => ({
              text: reason,
              onPress: () => { app.report(p.author.id, `Nearby post ${p.id}: ${reason}`); hidePost(p.id); back(); },
            })),
            { text: 'Cancel', style: 'cancel' as const },
          ]),
      },
      {
        label: `Block ${first}`,
        destructive: true,
        onPress: () =>
          Alert.alert(`Block ${first}?`, `You won’t see ${first}’s posts or profile. You can unblock in Profile.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Block', style: 'destructive', onPress: () => { app.block(p.author.id); back(); } },
          ]),
      },
    ]);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10}><Ionicons name="chevron-back" size={26} color={C.ink} /></Pressable>
        <Pressable onPress={isMine ? manage : more} accessibilityRole="button" accessibilityLabel={isMine ? 'Manage your post' : 'Save, report or block'} hitSlop={10}>
          <Ionicons name="ellipsis-horizontal" size={22} color={C.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110, gap: S.md }}>
        <Pressable
          onPress={() => (known ? router.push({ pathname: '/person/[id]', params: { id: p.author.id } }) : undefined)}
          disabled={!known}
          accessibilityRole={known ? 'button' : undefined}
          accessibilityLabel={known ? `${p.author.name}. View profile` : p.author.name}
          style={styles.author}
        >
          <Avatar name={p.author.name} uri={p.author.photo} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>{isMine ? 'You' : p.author.name}</Text>
            <Text style={T.small} numberOfLines={1}>{p.author.role}{p.isDemo ? ' · Demo' : ''}</Text>
          </View>
        </Pressable>

        <Animated.View entering={reduced ? undefined : FadeIn.duration(260)} style={{ paddingHorizontal: S.lg }}>
          <PostPhoto image={p.image} width={width - S.lg * 2} maxH={520} />
        </Animated.View>

        <View style={styles.body}>
          {intent ? <Text style={styles.intent}>{intent.label.toUpperCase()}</Text> : null}
          <Text style={styles.caption}>{p.caption}</Text>
          <Text style={styles.meta}>
            {p.area.name} · {ago(p.createdAt, now)} ago · {st === 'closed' ? `Closed · ${CLOSE_LABEL[p.closed!]}` : timeLeft(p, now)}
          </Text>
          {isMine ? <Text style={T.small}>Shared with people browsing within about {p.radiusMi} mi of {p.area.name}. Not on your profile.</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + S.sm }]}>
        {isMine ? (
          <Button label={st === 'closed' ? `Closed · ${CLOSE_LABEL[p.closed!]}` : 'Manage post'} variant="secondary" onPress={manage} style={{ flex: 1 }} />
        ) : local.responded[p.id] && !rel.connected ? (
          <Text style={styles.footNote}>Request sent. You’ll see {first}’s reply in your Inbox.</Text>
        ) : check.ok ? (
          <Button label={check.via === 'chat' ? `Message ${first}` : RESPONSE_LABEL[responseAction(p.intent)]} onPress={() => setResponding(true)} style={{ flex: 1 }} />
        ) : !rel.signedIn ? (
          <Button label="Sign in to respond" onPress={() => router.push('/auth')} style={{ flex: 1 }} />
        ) : (
          <Text style={styles.footNote}>{check.reason}</Text>
        )}
        {!isMine ? (
          <Pressable onPress={() => toggleSaved(p.id)} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save post'} hitSlop={10} style={styles.save}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={22} color={saved ? C.accent : C.ink3} />
          </Pressable>
        ) : null}
      </View>

      {responding ? <RespondSheet post={p} rel={rel} onClose={() => setResponding(false)} /> : null}
    </View>
  );
}

function Gone({ icon, title, line }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; line: string }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={32} color={C.ink3} />
      <Text style={T.h3}>{title}</Text>
      <Text style={[T.small, { textAlign: 'center' }]}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.surface },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, minHeight: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.sm, padding: S.xl },
  author: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg },
  name: { fontSize: 16, fontWeight: '600', color: C.ink },
  body: { paddingHorizontal: S.lg, gap: S.sm },
  intent: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.accent },
  caption: { fontFamily: F.displaySemi, fontSize: 21, lineHeight: 29, color: C.ink },
  meta: { fontSize: 13, color: C.ink3 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingTop: S.sm, backgroundColor: C.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
  footNote: { flex: 1, fontSize: 14, color: C.ink2, minHeight: 48, textAlignVertical: 'center', paddingVertical: 14 },
  save: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
});
