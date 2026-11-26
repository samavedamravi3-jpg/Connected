import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/ui';
import { CLOSE_LABEL, INTENTS, RESPONSE_LABEL, ago, postState, responseAction, timeLeft, type NearbyPost } from '@/lib/posts/model';
import { C, F, S } from '@/theme';
import { PostPhoto } from './PostPhoto';

/** One post in the feed: who and where, the photo, the caption, one response action and a quiet save. */
export function PostItem({ p, now, width, saved, responded, mine, onRespond, onSave }: {
  p: NearbyPost;
  now: number;
  width: number;
  saved: boolean;
  responded: boolean;
  mine: boolean;
  onRespond: () => void;
  onSave: () => void;
}) {
  const [more, setMore] = useState(false);
  const st = postState(p, now);
  const intent = INTENTS.find((i) => i.id === p.intent);
  const open = () => router.push({ pathname: '/post/[id]', params: { id: p.id } });
  const long = p.caption.length > 120;
  const action = RESPONSE_LABEL[responseAction(p.intent)];

  return (
    <View style={styles.item}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Post by ${p.author.name}`} style={styles.head}>
        <Avatar name={p.author.name} uri={p.author.photo} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{p.author.name}<Text style={styles.role}>  {p.author.role}</Text></Text>
          <Text style={styles.meta} numberOfLines={1}>{p.area.name} · {ago(p.createdAt, now)}{p.isDemo ? ' · Demo' : mine ? ' · Your post' : ''}</Text>
        </View>
        <Text style={[styles.left, st === 'closed' && { color: C.ink3 }]}>{st === 'closed' ? 'Closed' : timeLeft(p, now)}</Text>
      </Pressable>

      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel="Open post" style={({ pressed }) => [{ paddingHorizontal: S.lg }, pressed && { opacity: 0.92 }]}>
        <PostPhoto image={p.image} width={width} />
      </Pressable>

      <View style={styles.body}>
        {intent ? <Text style={styles.intent}>{intent.label.toUpperCase()}</Text> : null}
        <Text style={styles.caption} numberOfLines={more ? undefined : 3}>{p.caption}</Text>
        {long && !more ? (
          <Pressable onPress={() => setMore(true)} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.more}>More</Text>
          </Pressable>
        ) : null}
        <View style={styles.actions}>
          {st === 'closed' ? (
            <Text style={styles.closed}>{CLOSE_LABEL[p.closed!]}</Text>
          ) : mine ? (
            <Pressable onPress={open} accessibilityRole="button" hitSlop={8}><Text style={styles.respond}>Manage</Text></Pressable>
          ) : responded ? (
            <Text style={styles.closed}>Request sent</Text>
          ) : (
            <Pressable onPress={onRespond} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.respondBtn, pressed && { opacity: 0.6, transform: [{ scale: 0.97 }] }]}>
              <Text style={styles.respond}>{action}</Text>
              <Ionicons name="arrow-forward" size={16} color={C.accent} />
            </Pressable>
          )}
          <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved' : 'Save post'} hitSlop={10}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? C.accent : C.ink3} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { paddingVertical: S.lg, gap: S.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.lg },
  name: { fontSize: 15, fontWeight: '600', color: C.ink },
  role: { fontSize: 13, fontWeight: '400', color: C.ink3 },
  meta: { fontSize: 12, color: C.ink3, marginTop: 1 },
  left: { fontSize: 12, fontWeight: '600', color: C.accent },
  body: { paddingHorizontal: S.lg, gap: 6 },
  intent: { fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.accent },
  caption: { fontFamily: F.displaySemi, fontSize: 17, lineHeight: 24, color: C.ink },
  more: { fontSize: 14, fontWeight: '600', color: C.ink3 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, minHeight: 32 },
  respondBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  respond: { fontSize: 15, fontWeight: '600', color: C.accent },
  closed: { fontSize: 14, fontWeight: '600', color: C.ink3 },
});
