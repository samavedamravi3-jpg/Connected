import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, IconButton, Segmented, Tag } from '@/components/ui';
import { audienceLabel, availabilityLabel, fieldLabel, venueById } from '@/data/options';
import { api } from '@/data/api';
import { dataSource } from '@/data/source';
import { approxDistance } from '@/lib/geo';
import {
  canSeeDoor, conversationStarter, doorActive, doorState, firstName, matchPoints, matchStrength, sharedInterests, sharedLanguages, sharedSkills, type Tone,
} from '@/lib/match';
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
  const scroll = useRef<ScrollViewInstance>(null);
  const [loaded, setLoaded] = useState(0);
  const p = dataSource.getPerson(id);
  const door = p?.door && doorActive(p.door) ? p.door : undefined;
  // The server withholds the venue from people outside the host's audience; never guess it.
  const seeDoor = !!(p && door && !door.venueHidden && canSeeDoor(door, p, app.prefs, app.profile));
  const [tone, setTone] = useState<Tone>('friendly');
  const suggestion = p ? conversationStarter(p, app.prefs, app.profile, tone, seeDoor) : '';
  const [msg, setMsg] = useState(suggestion);
  const [edited, setEdited] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [composeY, setComposeY] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [aiNote, setAiNote] = useState('');

  // Live data: refresh the profile from the server (also covers opening it from a notification).
  useEffect(() => {
    if (!app.live) return;
    let active = true;
    dataSource.fetchPerson(id).then((fresh) => {
      if (!active) return;
      if (fresh && !edited && !msg) setMsg(conversationStarter(fresh, app.prefs, app.profile, tone, false));
      setLoaded(Date.now());
    });
    return () => { active = false; };
  }, [app.live, id]);

  if (!p) {
    return (
      <View style={{ flex: 1, padding: S.lg, paddingTop: insets.top + S.lg, gap: S.md }}>
        <Text style={T.h2}>{app.live && !loaded ? 'Loading profile…' : 'This profile isn’t available'}</Text>
        <Button label="Back to map" onPress={() => router.back()} />
      </View>
    );
  }

  const first = firstName(p.name);
  const distance = d ? Number(d) : undefined;
  const points = matchPoints(p, app.prefs);
  const strength = matchStrength(p, app.prefs);
  const req = latestRequest(app.requests, p.id);
  const isBlocked = app.blocked.includes(p.id);
  const shared = new Set([...sharedInterests(p, app.prefs), ...sharedSkills(p, app.prefs), ...sharedLanguages(p, app.prefs)]);
  const venue = door ? venueById(door.venueId) : undefined;

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
    app.sendRequest(p.id, msg.trim(), seeDoor ? door?.id : undefined);
  };

  /** Ask Claude for a draft (live accounts). Keeps the on-device template if Claude isn't available. */
  const draftWithClaude = async () => {
    setDrafting(true);
    setAiNote('');
    try {
      const r = await api<{ text: string | null; source: string; note?: string }>('POST', '/api/v1/ai/opener', { personId: p.id, tone });
      if (r.text) { setMsg(r.text.slice(0, 500)); setEdited(true); setAiNote('Drafted with Claude. Make it sound like you before sending.'); }
      else setAiNote(r.note ?? 'Claude isn’t available right now. The template draft is still here.');
    } catch (e) {
      setAiNote((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  const more = () =>
    Alert.alert(p.name, undefined, [
      {
        text: `Block ${first}`,
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Block ${first}?`, `${first} won't appear on your map, and any pending request is cancelled. You can unblock in Profile.`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Block', style: 'destructive', onPress: () => { app.block(p.id); router.back(); } },
          ]),
      },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            `Report ${first}`,
            app.live ? 'What happened? Reporting also blocks them, and the Connected team reviews every report.' : 'What happened? Reporting also blocks them. In this demo, reports stay on your phone.',
            [
              { text: 'Made me uncomfortable', onPress: () => { app.report(p.id, 'uncomfortable'); router.back(); } },
              { text: 'Spam or selling something', onPress: () => { app.report(p.id, 'spam'); router.back(); } },
              { text: 'Fake profile', onPress: () => { app.report(p.id, 'fake'); router.back(); } },
              { text: 'I felt unsafe', onPress: () => { app.report(p.id, 'unsafe'); router.back(); } },
              { text: 'Cancel', style: 'cancel' },
            ],
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const facts = [
    distance !== undefined ? `${approxDistance(distance)} ${from ?? ''}`.trim() : p.areaName,
    p.yearsExp ? `${p.yearsExp} yr${p.yearsExp === 1 ? '' : 's'} experience` : 'Student',
    p.meets === 'video' ? 'Meets by video' : p.meets === 'public' ? 'Meets in person' : 'In person or video',
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: insets.bottom + S.xxl }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#EAE3FC', '#F6F3FE', C.bg]} style={[styles.hero, { paddingTop: Platform.OS === 'android' ? insets.top + S.sm : S.md }]}>
          <View style={styles.heroBar}>
            <IconButton icon="chevron-down" label="Close profile" onPress={() => router.back()} style={styles.heroBtn} />
            <IconButton icon="ellipsis-horizontal" label="More options" onPress={more} style={styles.heroBtn} />
          </View>
          <Avatar name={p.name} uri={p.photo} size={108} ring={!!door && seeDoor} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={styles.name} accessibilityRole="header">{p.name}</Text>
            <Text style={styles.role}>{p.role}</Text>
            <Text style={T.small}>{p.org} · {p.areaName}</Text>
          </View>
          <View style={styles.factRow}>
            {facts.map((f) => <Text key={f} style={styles.fact}>{f}</Text>)}
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {strength === 'strong' ? <Tag label="Strong match for you" tone="accent" icon="star" /> : strength === 'good' ? <Tag label="Good match" tone="accent" /> : null}
            {p.isDemo ? <Tag label="Demo profile" icon="flask-outline" /> : null}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {!req && !isBlocked ? (
            <Button label={`Message ${first}`} icon="chatbubble-outline" onPress={() => scroll.current?.scrollTo({ y: composeY - S.lg, animated: true })} />
          ) : null}

          <Block title={`About ${first}`}>
            <Text style={styles.bio}>{p.bio}</Text>
            <Text style={T.small}>Usually free {p.availability.map((a) => availabilityLabel(a).toLowerCase()).join(', ')}</Text>
          </Block>

          {points.length ? (
            <Block title="Why you might click">
              <View style={styles.listCard}>
                {points.slice(0, 4).map((pt, k) => (
                  <View key={pt.text} style={[styles.listRow, k > 0 && styles.listDivider]}>
                    <View style={styles.ptIcon}><Ionicons name={pt.icon} size={16} color={C.accent} /></View>
                    <Text style={[T.body, { flex: 1, fontSize: 15 }]}>{pt.text}</Text>
                  </View>
                ))}
              </View>
            </Block>
          ) : null}

          {door ? (
            <Block title="Open Door">
              <View style={styles.ticket}>
                <View style={styles.ticketSide}>
                  <Text style={styles.ticketDay}>{doorState(door) === 'live' ? 'NOW' : new Date(door.start).toLocaleDateString([], { weekday: 'short' }).toUpperCase()}</Text>
                  <Text style={styles.ticketTime}>{fmtTime(doorState(door) === 'live' ? door.end : door.start)}</Text>
                  <Text style={styles.ticketCap}>{doorState(door) === 'live' ? 'until' : 'starts'}</Text>
                </View>
                <View style={{ flex: 1, padding: S.md, gap: 4 }}>
                  {seeDoor && venue ? (
                    <>
                      <Text style={T.h3}>{venue.name}</Text>
                      <Text style={T.small}>{venue.detail} · {venue.area}</Text>
                      <Text style={[T.small, { color: C.ink }]}>{fmtWindow(door.start, door.end)} · {door.lengthMin} min each</Text>
                      <Text style={T.small}>Talking about: {door.topics.join(', ')}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={T.h3}>Place shared with certain groups</Text>
                      <Text style={T.small}>{first} chose to show the venue only to: {door.audience.map(audienceLabel).join(', ')}. You can still reach out.</Text>
                    </>
                  )}
                </View>
              </View>
            </Block>
          ) : null}

          <Block title="Happy to help with">
            <View style={styles.listCard}>
              {p.helpsWith.map((h, k) => (
                <View key={h} style={[styles.listRow, k > 0 && styles.listDivider]}>
                  <Text style={[T.body, { flex: 1, fontSize: 15 }]}>{h}</Text>
                </View>
              ))}
            </View>
          </Block>

          <Block title="Skills, interests & languages" hint={shared.size ? 'Purple = you share it' : undefined}>
            <View style={styles.chips}>
              {[...p.skills, ...p.interests, ...p.languages.filter((l) => l !== 'English')].map((x) => (
                <Text key={x} style={[styles.chip, shared.has(x) && styles.chipOn]}>{x}</Text>
              ))}
            </View>
            <Text style={T.small}>{fieldLabel(p.field)}</Text>
          </Block>

          <View onLayout={(e) => setComposeY(e.nativeEvent.layout.y)}>
            <Block title={req ? 'Your request' : 'Say hello'}>
              {isBlocked ? (
                <Text style={T.muted}>You blocked {first}. Unblock them in Profile to connect.</Text>
              ) : req ? (
                <RequestStatus
                  status={req.status}
                  first={first}
                  message={req.message}
                  incoming={req.direction === 'incoming'}
                  demo={!app.live}
                  onRespond={(s) => app.respondIncoming(req.id, s)}
                  onCancel={() => app.cancelRequest(req.id)}
                  onSim={(s) => app.simulateReply(req.id, s)}
                  onOpenChat={() => router.push({ pathname: '/chat/[id]', params: { id: req.id } })}
                />
              ) : (
                <View style={{ gap: S.md }}>
                  <Text style={T.muted}>We drafted an opener from what you both shared. Make it sound like you.</Text>
                  <Segmented label="Message style" options={TONES} value={tone} onChange={changeTone} />
                  <TextInput value={msg} onChangeText={(t) => { setMsg(t.slice(0, 500)); setEdited(true); }} multiline style={styles.msg} accessibilityLabel={`Message to ${first}`} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={T.small}>{msg.length}/500{edited ? ' · edited' : ''}</Text>
                    {edited ? <Button label="Use suggestion" variant="quiet" small onPress={() => { setMsg(suggestion); setEdited(false); }} /> : null}
                  </View>
                  {app.live ? (
                    <Button label={drafting ? 'Drafting…' : 'Write it with Claude'} icon="sparkles-outline" variant="secondary" small disabled={drafting} onPress={draftWithClaude} style={{ alignSelf: 'flex-start' }} />
                  ) : null}
                  {aiNote ? <Text style={T.small}>{aiNote}</Text> : null}
                  <Button label="Send request" icon="paper-plane-outline" onPress={send} />
                  <Pressable onPress={() => setShowIdeas((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showIdeas }} style={styles.ideasToggle}>
                    <Ionicons name="bulb-outline" size={17} color={C.accent} />
                    <Text style={[T.label, { flex: 1, color: C.accent }]}>Not sure what to ask?</Text>
                    <Ionicons name={showIdeas ? 'chevron-up' : 'chevron-down'} size={17} color={C.accent} />
                  </Pressable>
                  {showIdeas ? (
                    <View style={{ gap: 8 }}>
                      {p.questions.map((q) => <Text key={q} style={[T.body, { fontSize: 15 }]}>“{q}”</Text>)}
                    </View>
                  ) : null}
                  <Text style={T.small}>
                    {app.live
                      ? 'Nothing is sent until you tap Send. The first draft comes from simple templates; Claude only writes one if you ask, using just names, goals and what they offer.'
                      : 'Nothing is sent until you tap Send. The draft comes from simple templates, not an AI service.'}
                  </Text>
                </View>
              )}
            </Block>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: S.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={T.h2} accessibilityRole="header">{title}</Text>
        {hint ? <Text style={[T.small, { color: C.accent }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function RequestStatus({ status, first, message, incoming, demo, onRespond, onCancel, onSim, onOpenChat }: {
  status: 'requested' | 'accepted' | 'declined' | 'cancelled';
  first: string;
  message: string;
  incoming?: boolean;
  demo: boolean;
  onRespond: (s: 'accepted' | 'declined') => void;
  onCancel: () => void;
  onSim: (s: 'accepted' | 'declined') => void;
  onOpenChat: () => void;
}) {
  if (status === 'requested' && incoming)
    return (
      <View style={[styles.status, { backgroundColor: C.accentSoft, borderColor: '#D9CFF5' }]}>
        <Tag label="Asked to connect" tone="accent" icon="mail-unread-outline" />
        <Text style={T.body}>{first} would like a short conversation.</Text>
        <Text style={styles.quote} numberOfLines={6}>{message}</Text>
        <View style={{ flexDirection: 'row', gap: S.sm }}>
          <Button label="Accept" small onPress={() => onRespond('accepted')} />
          <Button label="Decline" variant="secondary" small onPress={() => onRespond('declined')} />
        </View>
      </View>
    );
  if (status === 'requested')
    return (
      <View style={[styles.status, { backgroundColor: C.warnSoft, borderColor: '#EAD9B2' }]}>
        <Tag label="Requested" tone="warn" icon="time-outline" />
        <Text style={T.body}>Waiting for {first} to reply. It isn&apos;t a confirmed meeting until they accept.</Text>
        <Text style={styles.quote} numberOfLines={4}>{message}</Text>
        <Button label="Cancel request" variant="secondary" small onPress={onCancel} style={{ alignSelf: 'flex-start' }} />
        {demo ? <View style={styles.demo}>
          <Text style={T.small}>Demo: a reply arrives in a few seconds, or</Text>
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button label="Accept now" variant="secondary" small onPress={() => onSim('accepted')} />
            <Button label="Decline now" variant="secondary" small onPress={() => onSim('declined')} />
          </View>
        </View> : null}
      </View>
    );
  if (status === 'accepted')
    return (
      <View style={[styles.status, { backgroundColor: C.okSoft, borderColor: '#BFDCC8' }]}>
        <Tag label="Accepted" tone="ok" icon="checkmark-circle-outline" />
        <Text style={T.body}>{first} said yes. Pick a time and a public place together.</Text>
        <Button label="Open conversation" icon="chatbubbles-outline" onPress={onOpenChat} />
      </View>
    );
  return (
    <View style={styles.status}>
      <Tag label="Declined" />
      <Text style={T.body}>{first} can&apos;t connect right now. It happens, and it isn&apos;t personal.</Text>
      <Button label="Find someone else" variant="secondary" small onPress={() => router.navigate('/')} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingBottom: S.xl },
  heroBar: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' },
  heroBtn: { backgroundColor: 'rgba(255,255,255,0.8)' },
  name: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.4, textAlign: 'center' },
  role: { fontSize: 16, color: C.ink, fontWeight: '500', textAlign: 'center' },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  fact: { fontSize: 13, color: C.ink2, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, overflow: 'hidden' },
  body: { paddingHorizontal: S.lg, gap: S.xl },
  bio: { fontSize: 17, lineHeight: 26, color: C.ink },
  listCard: { borderWidth: 1, borderColor: C.line, borderRadius: R.lg, overflow: 'hidden' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, paddingHorizontal: S.lg, paddingVertical: 14 },
  listDivider: { borderTopWidth: 1, borderTopColor: C.line },
  ptIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  ticket: { flexDirection: 'row', borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  ticketSide: { width: 86, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingVertical: S.md },
  ticketDay: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  ticketTime: { color: C.white, fontSize: 17, fontWeight: '800' },
  ticketCap: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { fontSize: 14, color: C.ink2, backgroundColor: C.bg2, paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.pill, overflow: 'hidden' },
  chipOn: { backgroundColor: C.accentSoft, color: C.accent, fontWeight: '700' },
  msg: { minHeight: 150, borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, padding: S.md, fontSize: 16, lineHeight: 23, color: C.ink, textAlignVertical: 'top', backgroundColor: C.bg },
  ideasToggle: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 44 },
  status: { gap: S.md, padding: S.lg, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2 },
  quote: { fontSize: 14, lineHeight: 20, color: C.ink2, borderLeftWidth: 2, borderLeftColor: C.line2, paddingLeft: S.md },
  demo: { gap: S.sm, borderTopWidth: 1, borderTopColor: C.line2, borderStyle: 'dashed', paddingTop: S.md },
});
