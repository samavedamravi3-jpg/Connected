import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, DemoTag, Note, Row, Section, Segmented, Tag } from '@/components/ui';
import { audienceLabel, availabilityLabel, fieldLabel, venueById } from '@/data/options';
import { dataSource } from '@/data/source';
import { approxDistance } from '@/lib/geo';
import { canSeeDoor, conversationStarter, doorActive, doorState, firstName, matchReasons, sharedInterests, sharedSkills, type Tone } from '@/lib/match';
import { fmtTime, fmtWindow } from '@/lib/time';
import { latestRequest, useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

const TONES: { id: Tone; label: string }[] = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'direct', label: 'Direct' },
  { id: 'short', label: 'Short' },
];

export default function PersonScreen() {
  const { id, d, from } = useLocalSearchParams<{ id: string; d?: string; from?: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const p = dataSource.getPerson(id);
  const door = p?.door && doorActive(p.door) ? p.door : undefined;
  const seeDoor = !!(p && door && canSeeDoor(door, p, app.prefs, app.profile));
  const [tone, setTone] = useState<Tone>('friendly');
  const suggestion = p ? conversationStarter(p, app.prefs, app.profile, tone, seeDoor) : '';
  const [msg, setMsg] = useState(suggestion);
  const [edited, setEdited] = useState(false);

  if (!p) {
    return (
      <View style={{ flex: 1, padding: S.lg, gap: S.md }}>
        <Text style={T.h2}>This profile isn’t available</Text>
        <Button label="Back to map" onPress={() => router.back()} />
      </View>
    );
  }

  const first = firstName(p.name);
  const distance = d ? Number(d) : undefined;
  const reasons = matchReasons(p, app.prefs, distance);
  const req = latestRequest(app.requests, p.id);
  const isBlocked = app.blocked.includes(p.id);
  const shared = sharedInterests(p, app.prefs);
  const sharedSk = sharedSkills(p, app.prefs);

  const changeTone = (t: Tone) => {
    setTone(t);
    setMsg(conversationStarter(p, app.prefs, app.profile, t, seeDoor));
    setEdited(false);
  };

  const send = () => {
    if (msg.trim().length < 20) {
      Alert.alert('Add a little more', `A sentence or two helps ${first} know what you'd like to talk about.`);
      return;
    }
    app.sendRequest(p.id, msg.trim());
  };

  const block = () =>
    Alert.alert(`Block ${first}?`, `${first} won't appear on your map, and any pending request is cancelled. You can unblock in Profile.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => { app.block(p.id); router.back(); } },
    ]);

  const report = () =>
    Alert.alert(`Report ${first}`, 'What happened? Reporting also blocks them. In this demo, reports stay on your phone.', [
      { text: 'Made me uncomfortable', onPress: () => { app.block(p.id); router.back(); } },
      { text: 'Spam or selling something', onPress: () => { app.block(p.id); router.back(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
      <Stack.Screen options={{ title: p.name }} />
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: insets.bottom + S.xxl }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: S.md }}>
          <View style={{ flexDirection: 'row', gap: S.md, alignItems: 'center' }}>
            <Avatar name={p.name} size={64} />
            <View style={{ flex: 1 }}>
              <Text style={T.title} accessibilityRole="header">{p.name}</Text>
              <Text style={T.muted}>{p.role}</Text>
              <Text style={T.small}>{p.org}</Text>
            </View>
          </View>
          <Row>
            <DemoTag />
            <Tag label={fieldLabel(p.field)} icon="briefcase-outline" />
            {distance !== undefined ? <Tag label={`${approxDistance(distance)} ${from ?? ''}`.trim()} icon="navigate-outline" /> : null}
          </Row>
          <Text style={T.small}>
            Usually free: {p.availability.map(availabilityLabel).join(', ')} · Meets {p.meets === 'video' ? 'by video' : p.meets === 'public' ? 'in public places' : 'in public places or by video'} · Area: {p.areaName}
          </Text>
        </View>

        {reasons.length ? (
          <Section title={`Why ${first} could be a good match`}>
            <View style={{ gap: S.sm }}>
              {reasons.map((r) => (
                <View key={r} style={{ flexDirection: 'row', gap: S.sm }}>
                  <Ionicons name="checkmark-circle" size={18} color={C.accent} style={{ marginTop: 2 }} />
                  <Text style={[T.body, { flex: 1, fontSize: 15 }]}>{r}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {door ? (
          <View style={styles.door}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={T.h3}>Open Door</Text>
              <Tag label={doorState(door) === 'live' ? `Now until ${fmtTime(door.end)}` : 'Coming up'} tone={doorState(door) === 'live' ? 'ok' : 'warn'} />
            </Row>
            {seeDoor ? (
              <>
                <Text style={[T.body, { fontWeight: '600' }]}>{venueById(door.venueId).name}</Text>
                <Text style={T.small}>{venueById(door.venueId).detail} · {venueById(door.venueId).area}</Text>
                <Text style={T.body}>{fmtWindow(door.start, door.end)} · {door.lengthMin} minutes each</Text>
                <Text style={T.small}>Topics: {door.topics.join(', ')}</Text>
              </>
            ) : (
              <Text style={T.muted}>
                {first} is offering short conversations today, but chose to share the place only with: {door.audience.map(audienceLabel).join(', ')}. You can still send a request.
              </Text>
            )}
          </View>
        ) : null}

        <Section title="Can help with">
          <View style={{ gap: 6 }}>
            {p.helpsWith.map((h) => (
              <Text key={h} style={[T.body, { fontSize: 15 }]}>{'•'}  {h}</Text>
            ))}
          </View>
        </Section>

        <Section title="Interests and skills">
          <Row>
            {p.interests.map((i) => <Tag key={i} label={i} tone={shared.includes(i) ? 'accent' : 'neutral'} />)}
            {p.skills.map((s) => <Tag key={s} label={s} tone={sharedSk.includes(s) ? 'accent' : 'blue'} />)}
          </Row>
          {shared.length || sharedSk.length ? <Text style={T.small}>Green ones are things you have in common.</Text> : null}
        </Section>

        <Section title={req ? 'Your request' : `Start the conversation`}>
          {isBlocked ? (
            <Note icon="ban-outline">You blocked {first}. Unblock them in Profile to connect.</Note>
          ) : req ? (
            <RequestStatus
              status={req.status}
              first={first}
              message={req.message}
              onCancel={() => app.cancelRequest(req.id)}
              onSim={(s) => app.simulateReply(req.id, s)}
              onOpenChat={() => router.push({ pathname: '/chat/[id]', params: { id: req.id } })}
            />
          ) : (
            <View style={{ gap: S.md }}>
              <Text style={T.muted}>Here’s a suggested opener based on what you both shared. Make it sound like you.</Text>
              <Segmented label="Message style" options={TONES} value={tone} onChange={changeTone} />
              <TextInput
                value={msg}
                onChangeText={(t) => { setMsg(t.slice(0, 500)); setEdited(true); }}
                multiline
                style={styles.msg}
                accessibilityLabel={`Message to ${first}`}
              />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={T.small}>{msg.length}/500{edited ? ' · edited' : ' · suggested'}</Text>
                {edited ? <Button label="Use suggestion" variant="quiet" small onPress={() => { setMsg(suggestion); setEdited(false); }} /> : null}
              </Row>
              <Button label="Send connection request" icon="paper-plane-outline" onPress={send} />
              <Text style={T.small}>
                Suggestions come from simple templates using your profile and {first}’s, not an AI service. Nothing is sent until you tap the button, and {first} decides whether to connect.
              </Text>
              <View style={{ gap: 4 }}>
                <Text style={T.label}>Questions you could ask</Text>
                {p.questions.map((q) => <Text key={q} style={T.small}>{'•'}  {q}</Text>)}
              </View>
            </View>
          )}
        </Section>

        <Row style={{ justifyContent: 'center' }}>
          <Button label={`Block ${first}`} variant="danger" small onPress={block} />
          <Button label="Report" variant="danger" small onPress={report} />
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function RequestStatus({ status, first, message, onCancel, onSim, onOpenChat }: {
  status: 'requested' | 'accepted' | 'declined' | 'cancelled';
  first: string;
  message: string;
  onCancel: () => void;
  onSim: (s: 'accepted' | 'declined') => void;
  onOpenChat: () => void;
}) {
  if (status === 'requested')
    return (
      <View style={[styles.status, { backgroundColor: C.warnSoft, borderColor: '#EAD9B2' }]}>
        <Tag label="Requested" tone="warn" icon="time-outline" />
        <Text style={T.body}>Waiting for {first} to reply. Nothing is confirmed until they accept.</Text>
        <Text style={styles.quote} numberOfLines={4}>{message}</Text>
        <Row>
          <Button label="Cancel request" variant="secondary" small onPress={onCancel} />
        </Row>
        <View style={styles.demo}>
          <Text style={T.small}>Demo: a reply arrives in a few seconds, or</Text>
          <Row>
            <Button label="Accept now" variant="secondary" small onPress={() => onSim('accepted')} />
            <Button label="Decline now" variant="secondary" small onPress={() => onSim('declined')} />
          </Row>
        </View>
      </View>
    );
  if (status === 'accepted')
    return (
      <View style={[styles.status, { backgroundColor: C.okSoft, borderColor: '#BFDCC8' }]}>
        <Tag label="Accepted" tone="ok" icon="checkmark-circle-outline" />
        <Text style={T.body}>{first} accepted. Agree on a time and a public place in your conversation.</Text>
        <Button label="Open conversation" icon="chatbubbles-outline" onPress={onOpenChat} />
      </View>
    );
  return (
    <View style={styles.status}>
      <Tag label="Declined" />
      <Text style={T.body}>{first} can’t connect right now. It happens, and it isn’t personal. There are plenty of other people nearby.</Text>
      <Button label="Back to the map" variant="secondary" small onPress={() => router.navigate('/')} />
    </View>
  );
}

const styles = StyleSheet.create({
  door: { gap: 6, padding: S.lg, borderRadius: R.md, backgroundColor: C.accentSoft },
  msg: { minHeight: 150, borderWidth: 1, borderColor: C.line2, borderRadius: R.sm, padding: S.md, fontSize: 16, lineHeight: 23, color: C.ink, textAlignVertical: 'top', backgroundColor: C.bg },
  status: { gap: S.md, padding: S.lg, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2 },
  quote: { fontSize: 14, lineHeight: 20, color: C.ink2, borderLeftWidth: 2, borderLeftColor: C.line2, paddingLeft: S.md },
  demo: { gap: S.sm, borderTopWidth: 1, borderTopColor: C.line2, borderStyle: 'dashed', paddingTop: S.md },
});
