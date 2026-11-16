import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui';
import { dataSource } from '@/data/source';
import type { Person } from '@/data/types';
import { STARTER_SUGGESTIONS, builtInReply, claudeConfigured, claudeReply, type AssistantAction, type AssistantContext, type AssistantMsg } from '@/lib/assistant';
import { allowed } from '@/lib/guard';
import { firstName, matchStrength } from '@/lib/match';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

export default function AssistantScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<AssistantMsg>>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const usingClaude = claudeConfigured();
  const [msgs, setMsgs] = useState<AssistantMsg[]>(() => [
    {
      id: 'hello',
      role: 'assistant',
      text: `Hi${app.profile.name ? ` ${firstName(app.profile.name)}` : ''}! I'm your Connected assistant. Ask me who to connect with, how to start a conversation, where to meet, or how anything in the app works.`,
      suggestions: STARTER_SUGGESTIONS,
      source: usingClaude ? 'claude' : 'built-in',
    },
  ]);

  useEffect(() => {
    let alive = true;
    dataSource.listPeople().then((ps) => alive && setPeople(ps));
    return () => { alive = false; };
  }, []);

  const ctx: AssistantContext = { prefs: app.prefs, profile: app.profile, people, requests: app.requests, blocked: [...app.blocked, ...app.muted] };

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || thinking) return;
    if (!(await allowed(q))) return;
    // The conversation only grows, so its length makes a unique id.
    const userMsg: AssistantMsg = { id: `u${msgs.length}`, role: 'user', text: q };
    const history = [...msgs, userMsg];
    setMsgs(history);
    setText('');
    setThinking(true);
    let reply = usingClaude ? await claudeReply(history, ctx) : null;
    if (!reply) {
      // A short pause so the built-in reply doesn't feel jarring.
      await new Promise((r) => setTimeout(r, 450));
      reply = builtInReply(q, ctx);
      if (usingClaude) reply = { ...reply, text: `${reply.text}\n\n(Couldn’t reach the AI service, so this answer came from the built-in assistant.)` };
    }
    setMsgs((m) => [...m, reply!]);
    setThinking(false);
  };

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [msgs.length, thinking]);

  const go = (a: AssistantAction) => {
    if (a.href.startsWith('/(tabs)')) router.dismissTo(a.href as '/(tabs)/inbox');
    else router.push({ pathname: a.href, params: a.params } as never);
  };

  const last = msgs[msgs.length - 1];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? insets.top + S.sm : S.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={T.h2} accessibilityRole="header">Connected assistant</Text>
          <Text style={T.small}>{usingClaude ? 'Powered by Claude' : 'Built-in assistant · works offline, no AI service'}</Text>
        </View>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close assistant" hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={22} color={C.ink} />
        </Pressable>
      </View>

      <FlatList
        ref={list}
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: S.lg, gap: S.md }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const mine = item.role === 'user';
          const cards = (item.people ?? []).map((id) => people.find((p) => p.id === id)).filter((p): p is Person => !!p);
          return (
            <View style={{ gap: S.sm, alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.bubbleText, mine && { color: C.white }]}>{item.text}</Text>
              </View>
              {cards.length ? (
                <View style={{ gap: S.sm, alignSelf: 'stretch' }}>
                  {cards.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => router.push({ pathname: '/person/[id]', params: { id: p.id } })}
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.card, pressed && { backgroundColor: C.bg2 }]}
                    >
                      <Avatar name={p.name} uri={p.photo} size={42} ring={matchStrength(p, app.prefs) === 'strong'} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cardName} numberOfLines={1}>{p.name}</Text>
                        <Text style={T.small} numberOfLines={1}>{p.role} · {p.areaName}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={C.ink3} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {item.actions?.length ? (
                <View style={styles.row}>
                  {item.actions.map((a) => (
                    <Pressable key={a.label} onPress={() => go(a)} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}>
                      <Text style={styles.actionText}>{a.label}</Text>
                      <Ionicons name="arrow-forward" size={16} color={C.white} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        }}
        ListFooterComponent={
          thinking ? (
            <View style={[styles.bubble, styles.theirs, { marginTop: S.md }]} accessibilityLabel="Assistant is typing">
              <Text style={[styles.bubbleText, { color: C.ink3 }]}>Thinking…</Text>
            </View>
          ) : undefined
        }
      />

      {last?.role === 'assistant' && last.suggestions?.length && !thinking ? (
        <View style={styles.suggestWrap}>
          {last.suggestions.map((s) => (
            <Pressable key={s} onPress={() => send(s)} accessibilityRole="button" style={({ pressed }) => [styles.suggest, pressed && { backgroundColor: C.accentSoft }]}>
              <Text style={styles.suggestText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={[styles.composer, { paddingBottom: insets.bottom + S.sm }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask about people, messages, or the app"
          placeholderTextColor={C.ink3}
          style={styles.input}
          multiline
          onSubmitEditing={() => send(text)}
          accessibilityLabel="Message the assistant"
        />
        <Pressable onPress={() => send(text)} disabled={!text.trim() || thinking} accessibilityRole="button" accessibilityLabel="Send" style={[styles.sendBtn, (!text.trim() || thinking) && { opacity: 0.4 }]}>
          <Ionicons name="arrow-up" size={20} color={C.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingBottom: S.md, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.bg },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg2 },
  bubble: { maxWidth: '88%', paddingHorizontal: S.md, paddingVertical: 10, borderRadius: R.lg },
  mine: { backgroundColor: C.accent, borderBottomRightRadius: R.sm - 2 },
  theirs: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderBottomLeftRadius: R.sm - 2 },
  bubbleText: { fontSize: 15, lineHeight: 22, color: C.ink },
  card: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.sm, paddingRight: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  cardName: { fontSize: 15, fontWeight: '600', color: C.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent, paddingHorizontal: S.md, minHeight: 40, borderRadius: R.md },
  actionText: { color: C.white, fontWeight: '600', fontSize: 14 },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, paddingHorizontal: S.lg, paddingBottom: S.sm },
  suggest: { paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', borderRadius: R.md, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface },
  suggestText: { fontSize: 14, color: C.accent, fontWeight: '600' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: S.sm, paddingHorizontal: S.md, paddingTop: S.sm, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.surface },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: C.line2, borderRadius: R.lg, paddingHorizontal: S.md, paddingVertical: 11, fontSize: 16, color: C.ink, backgroundColor: C.bg },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
