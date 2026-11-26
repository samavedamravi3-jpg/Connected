import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOutDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetSpots } from '@/components/MeetSpots';
import { MemberLock } from '@/components/MemberLock';
import { Avatar, IconButton } from '@/components/ui';
import { dataSource } from '@/data/source';
import { isRemoteId } from '@/lib/backend';
import { allowed } from '@/lib/guard';
import { ASSIST_KINDS, chatAssist, type AssistKind, type AssistResult } from '@/lib/chatAssist';
import { firstName } from '@/lib/match';
import { fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

export default function Chat() {
  const { id, draft } = useLocalSearchParams<{ id: string; draft?: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(draft ?? '');
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  // Assistant: opens on its own in a new chat; suggestions only, nothing is sent for you.
  const [assistOpen, setAssistOpen] = useState<boolean | null>(null);
  const [kind, setKind] = useState<AssistKind | null>(null);
  const [result, setResult] = useState<(AssistResult & { kind: AssistKind }) | null>(null);
  const [thinking, setThinking] = useState(false);
  const reduced = useReducedMotion();
  const askSeq = useRef(0);
  const req = app.requests.find((r) => r.id === id);
  const p = req ? dataSource.getPerson(req.personId) : undefined;
  // Demo requests sent to you have no person record; only accepted ones have a chat.
  const demoIn = req || !app.showDemo ? undefined : app.incoming.find((i) => i.id === id && i.state === 'accepted');
  const msgs = app.messages[id] ?? [];
  const lastAt = msgs.at(-1)?.at ?? 0;
  const { markRead } = app;
  useEffect(() => {
    // Message times share one clock (server or this phone), so compare against the newest one rather than Date.now().
    if (id && lastAt) markRead(id, lastAt);
  }, [id, lastAt, markRead]);

  const name = p?.name ?? demoIn?.name;
  // Real chats need real membership (the database hides them otherwise); demo chats stay on this phone.
  if (app.memberLocked && isRemoteId(id)) return <MemberLock what="chats" style={{ padding: S.lg }} />;
  if (!name || (req && !p)) return <Text style={[T.body, { padding: S.lg }]}>{app.session ? 'Loading conversation…' : 'Conversation not found.'}</Text>;
  const isBlocked = !!req && app.blocked.includes(req.personId);
  const canWrite = (req ? req.status === 'accepted' : !!demoIn) && !isBlocked;
  const first = firstName(name);
  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (!(await allowed('Your message', body))) return;
    setSending(true);
    try {
      await app.sendMessage(id, body);
      setText('');
      setResult(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch (e) {
      Alert.alert('Message not sent', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const showAssist = assistOpen ?? msgs.length === 0;
  const ask = async (k: AssistKind) => {
    const n = ++askSeq.current;
    setKind(k);
    setThinking(true);
    Haptics.selectionAsync().catch(() => {});
    const r = await chatAssist(k, { person: p ?? null, name, prefs: app.prefs, profile: app.profile, messages: msgs, draft: text });
    if (n !== askSeq.current) return;
    setResult({ ...r, kind: k });
    setThinking(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {/* The person in the header opens their full profile. */}
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable
              onPress={() => (p ? router.push({ pathname: '/person/[id]', params: { id: p.id } }) : undefined)}
              disabled={!p}
              accessibilityRole="button"
              accessibilityLabel={p ? `${name}. View profile` : name}
              hitSlop={8}
              style={({ pressed }) => [styles.headerWho, pressed && { opacity: 0.6 }]}
            >
              <Avatar name={name} uri={p?.photo} size={32} />
              <View>
                <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
                {p ? <Text style={styles.headerSub} numberOfLines={1}>View profile</Text> : null}
              </View>
            </Pressable>
          ),
          headerRight: p
            ? () => (
                <Pressable onPress={() => router.push({ pathname: '/person/[id]', params: { id: p.id } })} accessibilityRole="button" accessibilityLabel={`${first}'s profile`} hitSlop={10}>
                  <Ionicons name="person-circle-outline" size={26} color={C.accent} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <FlatList
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: S.lg, gap: S.md }}
        ListHeaderComponent={
          <Text style={styles.safety}>
            <Ionicons name="lock-closed-outline" size={12} color={C.ink3} />{' '}
            {req?.remote ? `Only you and ${first} can see this chat. Meet somewhere public.` : `${first} is a demo profile. Messages stay on your phone.`}
          </Text>
        }
        renderItem={({ item, index }) => {
          const mine = item.from === 'me';
          return (
            <Animated.View entering={reduced || index < msgs.length - 3 ? undefined : FadeInUp.duration(220)} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[T.body, { fontSize: 15, color: mine ? C.white : C.ink }]}>{item.text}</Text>
              <Text style={[T.small, { fontSize: 11, color: mine ? C.accentSoft : C.ink3 }]}>
                {fmtTime(item.at)}{item.demo ? ' · demo reply' : ''}
              </Text>
            </Animated.View>
          );
        }}
      />
      {canWrite ? (
        <View style={[styles.composerWrap, { paddingBottom: insets.bottom + S.sm }]}>
          {showAssist ? (
            <Animated.View entering={reduced ? undefined : FadeInDown.duration(220)} exiting={reduced ? undefined : FadeOutDown.duration(160)} style={styles.assist}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingHorizontal: S.md }}>
                {ASSIST_KINDS.map((k) => (
                  <Pressable key={k.id} onPress={() => ask(k.id)} accessibilityRole="button" accessibilityState={{ selected: kind === k.id }} style={({ pressed }) => [styles.kind, kind === k.id && styles.kindOn, pressed && { transform: [{ scale: 0.96 }] }]}>
                    <Text style={[styles.kindText, kind === k.id && { color: C.white }]}>{k.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {thinking ? (
                <View style={styles.sugs}><Thinking /></View>
              ) : result ? (
                <View style={styles.sugs}>
                  {result.note ? <Text style={T.small}>{result.note}</Text> : null}
                  {result.suggestions.map((sg, i) => (
                    <Animated.View key={sg} entering={reduced ? undefined : FadeInDown.delay(i * 70).duration(220)}>
                      <Pressable
                        onPress={() => { setText(sg); Haptics.selectionAsync().catch(() => {}); }}
                        accessibilityRole="button"
                        accessibilityHint="Puts this in your message box to edit"
                        style={({ pressed }) => [styles.sug, pressed && { backgroundColor: C.accentLine }]}
                      >
                        <Text style={styles.sugText}>{sg}</Text>
                      </Pressable>
                    </Animated.View>
                  ))}
                  <Text style={styles.sugNote}>{result.source === 'claude' ? 'Claude' : 'Built-in assistant'} · tap to edit, nothing sends until you do</Text>
                </View>
              ) : null}
            </Animated.View>
          ) : null}
          <View style={styles.tools}>
            <Pressable onPress={() => setAssistOpen(!showAssist)} accessibilityRole="button" accessibilityState={{ expanded: showAssist }} accessibilityLabel="Assistant" style={({ pressed }) => [styles.tool, showAssist && styles.toolOn, pressed && { transform: [{ scale: 0.95 }] }]}>
              <Ionicons name="color-wand-outline" size={16} color={showAssist ? C.white : C.accent} />
              <Text style={[styles.toolText, showAssist && { color: C.white }]}>Assist</Text>
            </Pressable>
            {p ? (
              <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={({ pressed }) => [styles.tool, pressed && { transform: [{ scale: 0.95 }] }]}>
                <Ionicons name="location-outline" size={16} color={C.accent} />
                <Text style={styles.toolText}>Where to meet</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.composer}>
            <TextInput value={text} onChangeText={setText} placeholder={`Message ${first}`} placeholderTextColor={C.ink3} style={styles.input} multiline accessibilityLabel="Message" />
            <Pressable
              onPress={send}
              disabled={!text.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [styles.send, (!text.trim() || sending) && { backgroundColor: C.line2 }, pressed && { transform: [{ scale: 0.92 }] }]}
            >
              <Ionicons name="arrow-up" size={20} color={C.white} />
            </Pressable>
          </View>
        </View>
      ) : (
        <Text style={[T.small, { padding: S.lg }]}>{isBlocked ? `You blocked ${first}. Unblock them in Profile to message.` : `You can write here once ${first} accepts.`}</Text>
      )}

      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={[styles.sheetHead, { paddingTop: Platform.OS === 'android' ? insets.top + S.sm : S.lg }]}>
            <Text style={T.h2}>Where to meet {first}</Text>
            <IconButton icon="close" label="Close" onPress={() => setPicking(false)} />
          </View>
          <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xl }}>
            {p ? (
              <MeetSpots
                person={p}
                useLabel="Use in message"
                onUse={(s) => {
                  setText((t) => `${t.trim() ? `${t.trim()} ` : ''}How about ${s.name}${s.area ? ` in ${s.area}` : ''}?`);
                  setPicking(false);
                }}
                onSuggestArea={(a) => {
                  setText((t) => `${t.trim() ? `${t.trim()} ` : ''}Would ${a.name} work for you to meet? Happy to pick another area if not.`);
                  setPicking(false);
                }}
              />
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** Three soft bars that breathe while the assistant thinks. */
function Thinking() {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View entering={FadeIn} style={[{ gap: 6 }, st]} accessibilityLabel="Thinking">
      {[0.92, 0.78, 0.6].map((w) => <View key={w} style={{ height: 34, width: `${w * 100}%`, borderRadius: 12, backgroundColor: C.accentSoft }} />)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  assist: { gap: S.sm, paddingBottom: S.xs },
  kind: { paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: 999, backgroundColor: C.accentSoft },
  kindOn: { backgroundColor: C.accent },
  kindText: { fontSize: 13, fontWeight: '600', color: C.accent },
  sugs: { gap: 6, paddingHorizontal: S.md },
  sug: { alignSelf: 'flex-start', maxWidth: '92%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderBottomLeftRadius: 4, backgroundColor: C.accentSoft },
  sugText: { fontSize: 15, lineHeight: 20, color: C.ink },
  sugNote: { fontSize: 11, color: C.ink3 },
  tools: { flexDirection: 'row', gap: S.sm, paddingHorizontal: S.md },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 32, borderRadius: 999, backgroundColor: C.bg2 },
  toolOn: { backgroundColor: C.accent },
  toolText: { fontSize: 13, fontWeight: '600', color: C.accent },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  headerWho: { flexDirection: 'row', alignItems: 'center', gap: S.sm, maxWidth: 240 },
  headerName: { fontSize: 16, fontWeight: '600', color: C.ink },
  headerSub: { fontSize: 11, color: C.accent, fontWeight: '600' },
  safety: { fontSize: 12, lineHeight: 17, color: C.ink3, textAlign: 'center', marginBottom: S.sm },
  bubble: { maxWidth: '85%', padding: S.md, borderRadius: R.md, gap: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.accent, borderBottomRightRadius: R.sm - 2 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderBottomLeftRadius: R.sm - 2 },
  composerWrap: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.sm, gap: S.sm },
  meetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: S.md, paddingHorizontal: S.md, minHeight: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface, alignSelf: 'flex-start', flexWrap: 'wrap' },
  meetText: { fontSize: 14, fontWeight: '600', color: C.accent },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: S.sm, paddingHorizontal: S.md },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: C.line2, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 10, fontSize: 16, color: C.ink, backgroundColor: C.surface },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingBottom: S.sm, borderBottomWidth: 1, borderBottomColor: C.line },
});
