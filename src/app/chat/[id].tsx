import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetSpots } from '@/components/MeetSpots';
import { MemberLock } from '@/components/MemberLock';
import { Button, IconButton, Note } from '@/components/ui';
import { dataSource } from '@/data/source';
import { isRemoteId } from '@/lib/backend';
import { allowed } from '@/lib/guard';
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
    } catch (e) {
      Alert.alert('Message not sent', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title: name }} />
      <FlatList
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: S.lg, gap: S.md }}
        ListHeaderComponent={
          <Note icon="shield-checkmark-outline">
            {req?.remote
              ? `Meet somewhere public, like a library or café, and tell a friend where you'll be. Only you and ${first} can see this chat.`
              : `Meet somewhere public, like a library or café. ${first} is a demo profile, so messages stay on your phone and ${demoIn ? 'no one will reply' : 'replies are simulated'}.`}
          </Note>
        }
        renderItem={({ item }) => {
          const mine = item.from === 'me';
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[T.body, { fontSize: 15, color: mine ? C.white : C.ink }]}>{item.text}</Text>
              <Text style={[T.small, { fontSize: 11, color: mine ? C.accentSoft : C.ink3 }]}>
                {fmtTime(item.at)}{item.demo ? ' · demo reply' : ''}
              </Text>
            </View>
          );
        }}
      />
      {canWrite ? (
        <View style={[styles.composerWrap, { paddingBottom: insets.bottom + S.sm }]}>
          {p ? (
            <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={({ pressed }) => [styles.meetBtn, pressed && { backgroundColor: C.accentSoft }]}>
              <Ionicons name="restaurant-outline" size={16} color={C.accent} />
              <Text style={styles.meetText}>Where to meet?</Text>
              <Text style={T.small}>Spots you&apos;d both like, halfway between you</Text>
            </Pressable>
          ) : null}
          <View style={styles.composer}>
            <TextInput value={text} onChangeText={setText} placeholder={`Message ${first}`} placeholderTextColor={C.ink3} style={styles.input} multiline accessibilityLabel="Message" />
            <Button label={sending ? '…' : 'Send'} small disabled={!text.trim() || sending} onPress={send} />
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
                  setText((t) => `${t.trim() ? `${t.trim()} ` : ''}How about ${s.name} in ${s.area}? It's about halfway between us.`);
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

const styles = StyleSheet.create({
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
