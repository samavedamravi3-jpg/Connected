import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Note } from '@/components/ui';
import { dataSource } from '@/data/source';
import { firstName } from '@/lib/match';
import { fmtTime } from '@/lib/time';
import type { Message } from '@/data/types';
import { useApp, useChatSync } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [, rerender] = useState(0);
  const list = useRef<ComponentRef<typeof FlatList<Message>>>(null);
  const req = app.requests.find((r) => r.id === id);
  const p = req ? dataSource.getPerson(req.personId) : undefined;
  const msgs = app.messages[id] ?? [];
  useChatSync(id);

  // Opened from a notification before the inbox loaded: fetch the inbox, then the person.
  useEffect(() => {
    if (!app.live) return;
    if (!req) { app.refresh().catch(() => {}); return; }
    if (!p) dataSource.fetchPerson(req.personId).then(() => rerender((n) => n + 1));
  }, [app.live, req?.id, p?.id]);

  if (!req || !p) return <Text style={[T.body, { padding: S.lg }]}>{app.live ? 'Loading conversation…' : 'Conversation not found.'}</Text>;
  const canWrite = req.status === 'accepted';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <Stack.Screen options={{ title: p.name }} />
      <FlatList
        ref={list}
        data={msgs}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: S.lg, gap: S.md }}
        ListHeaderComponent={
          <Note icon="shield-checkmark-outline">
            {app.live
              ? `Meet somewhere public, like a library or café, and tell a friend where you’ll be. If anything feels off, you can block or report ${firstName(p.name)} from their profile.`
              : `Meet somewhere public, like a library or café. Messages in this demo stay on your phone, and ${firstName(p.name)}'s replies are simulated.`}
          </Note>
        }
        renderItem={({ item }) => {
          const mine = item.from === 'me';
          return (
            <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[T.body, { fontSize: 15, color: mine ? C.white : C.ink }]}>{item.text}</Text>
              <Text style={[T.small, { fontSize: 11, color: mine ? 'rgba(255,255,255,0.8)' : C.ink3 }]}>
                {fmtTime(item.at)}{item.demo ? ' · demo reply' : ''}
              </Text>
            </View>
          );
        }}
      />
      {canWrite ? (
        <View style={[styles.composer, { paddingBottom: insets.bottom + S.sm }]}>
          <TextInput value={text} onChangeText={setText} placeholder={`Message ${firstName(p.name)}`} placeholderTextColor={C.ink3} style={styles.input} multiline accessibilityLabel="Message" />
          <Button label="Send" small disabled={!text.trim()} onPress={() => { app.sendMessage(req.id, text.trim()); setText(''); }} />
        </View>
      ) : (
        <Text style={[T.small, { padding: S.lg }]}>You can write here once {firstName(p.name)} accepts.</Text>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '85%', padding: S.md, borderRadius: R.md, gap: 4 },
  mine: { alignSelf: 'flex-end', backgroundColor: C.accent, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: C.bg2, borderBottomLeftRadius: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: S.sm, paddingHorizontal: S.md, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: C.line2, borderRadius: R.sm, paddingHorizontal: S.md, paddingVertical: 10, fontSize: 16, color: C.ink },
});
