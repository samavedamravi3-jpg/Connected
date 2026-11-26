import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { MeetSpots } from '@/components/MeetSpots';
import { ProfileCover } from '@/components/ProfileCover';
import { IdBadge, VerifiedBadge } from '@/components/VerifiedBadge';
import { Avatar, Button, IconButton, Note, Segmented, Tag } from '@/components/ui';
import { audienceLabel, availabilityLabel, statusLabel, venueById } from '@/data/options';
import { dataSource } from '@/data/source';
import type { Person } from '@/data/types';
import { approxDistance } from '@/lib/geo';
import { effectiveSkills, fmtRange, sortExperiences } from '@/lib/experience';
import { labelKey, uniqueLabels } from '@/lib/lists';
import { allowed } from '@/lib/guard';
import {
  canSeeDoor, conversationStarter, doorActive, doorState, firstName, matchPoints, sharedInterests, sharedLanguages, sharedSkills, type Tone,
} from '@/lib/match';
import type { MeetSpot } from '@/lib/places';
import { fetchNearbyRecs, isRemoteId } from '@/lib/backend';
import { idBlocks, isIdRequiredError } from '@/lib/idVerification';
import { fmtTime, fmtWindow } from '@/lib/time';
import { latestRequest, useApp } from '@/state/AppState';
import { C, F, R, S, T } from '@/theme';

const COVER_H = 168;
const PORTRAIT = 116;

/** The first sentence of their own intro, used as a short headline. Never rewritten or embellished. */
function headline(bio: string): string {
  const m = bio.trim().match(/^(.{20,160}?[.!?])(\s|$)/);
  return m ? m[1] : bio.trim().slice(0, 160);
}

const TONES: { id: Tone; label: string }[] = [
  { id: 'friendly', label: 'Friendly' },
  { id: 'direct', label: 'Direct' },
  { id: 'short', label: 'Short' },
];

export default function PersonScreen() {
  const { id, d, nearby } = useLocalSearchParams<{ id: string; d?: string; from?: string; nearby?: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollViewInstance>(null);
  // Demo people and already-loaded real people are instant; others are fetched from the backend.
  const [fetched, setFetched] = useState<{ id: string; person: Person | undefined } | null>(null);
  const cached = dataSource.getPerson(id);
  useEffect(() => {
    if (dataSource.getPerson(id)) return;
    let alive = true;
    dataSource.fetchPerson(id).then((person) => alive && setFetched({ id, person }));
    return () => { alive = false; };
  }, [id]);
  // Opened from a nearby recommendation: ask the server again whether they're still eligible right now.
  const [recheck, setRecheck] = useState<{ id: string; state: 'nearby' | 'gone' | 'error' } | null>(null);
  useEffect(() => {
    if (nearby !== '1' || !isRemoteId(id)) return;
    let alive = true;
    fetchNearbyRecs()
      .then((rs) => alive && setRecheck({ id, state: rs.some((r) => r.id === id) ? 'nearby' : 'gone' }))
      .catch(() => alive && setRecheck({ id, state: 'error' }));
    return () => { alive = false; };
  }, [id, nearby]);
  const nearbyState = nearby === 'demo' ? 'demo' : nearby === '1' && isRemoteId(id) ? (recheck?.id === id ? recheck.state : 'checking') : null;
  const p = cached ?? (fetched?.id === id ? fetched.person : undefined);
  const loadingPerson = !cached && fetched?.id !== id;
  const door = p?.door && doorActive(p.door) ? p.door : undefined;
  const seeDoor = !!(p && door && canSeeDoor(door, p, app.prefs, app.profile));
  const [tone, setTone] = useState<Tone>('friendly');
  const suggestion = p ? conversationStarter(p, app.prefs, app.profile, tone, seeDoor) : '';
  const [msg, setMsg] = useState(suggestion);
  const [edited, setEdited] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [meetOpen, setMeetOpen] = useState(false);

  if (!p) {
    return (
      <View style={{ flex: 1, padding: S.lg, paddingTop: insets.top + S.lg, gap: S.md }}>
        <Text style={T.h2}>{loadingPerson ? 'Loading profile…' : 'This profile isn’t available'}</Text>
        <Button label="Back to map" onPress={() => router.back()} />
      </View>
    );
  }

  const first = firstName(p.name);
  const distance = d ? Number(d) : undefined;
  const points = matchPoints(p, app.prefs);
  const req = latestRequest(app.requests, p.id);
  const isBlocked = app.blocked.includes(p.id);
  const shared = new Set([...sharedInterests(p, app.prefs), ...sharedSkills(p, app.prefs), ...sharedLanguages(p, app.prefs)].map(labelKey));
  const experience = sortExperiences(p.experience ?? []);
  const venue = door ? venueById(door.venueId) : undefined;
  const allSkills = uniqueLabels([...effectiveSkills(p.skills, p.experience), ...p.languages.filter((l) => l !== 'English')]);

  const canSuggest = !isBlocked && (!req || req.status === 'accepted');
  const useSpot = (s: MeetSpot) => {
    const line = `Would you be up for meeting at ${s.name}${s.area ? ` in ${s.area}` : ''}?`;
    if (req?.status === 'accepted') {
      router.push({ pathname: '/chat/[id]', params: { id: req.id, draft: line } });
      return;
    }
    setMsg((m) => `${m.trim()} ${line}`.slice(0, 500));
    setEdited(true);
    setMeetOpen(false);
    setComposeOpen(true);
  };

  const changeTone = (t: Tone) => {
    setTone(t);
    setMsg(conversationStarter(p, app.prefs, app.profile, t, seeDoor));
    setEdited(false);
  };

  const send = async () => {
    if (msg.trim().length < 20) {
      Alert.alert('Add a little more', `A sentence or two helps ${first} know what you'd like to talk about.`);
      return;
    }
    if (!(await allowed('Your note', msg))) return;
    // Real people need real membership (enforced by the database too); demo people stay a simulation for everyone.
    if (app.backendEnabled && isRemoteId(p.id) && idBlocks(app.idStatus, 'send connection requests')) return;
    try {
      await app.sendRequest(p.id, msg.trim());
      setComposeOpen(false);
    } catch (e) {
      if (isIdRequiredError(e)) return void idBlocks('unverified', 'send connection requests');
      Alert.alert('Couldn’t send your request', e instanceof Error ? e.message : 'Check your connection and try again.');
    }
  };
  const reportAndBlock = (reason: string) => {
    app.report(p.id, reason);
    app.block(p.id);
    router.back();
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
        text: `Mute ${first}`,
        onPress: () => Alert.alert(`Mute ${first}?`, `${first} won't appear on your map, in search or in alerts, and won't be told. You can unmute in Profile.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mute', onPress: () => { app.mute(p.id); router.back(); } },
        ]),
      },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Report ${first}`, p.isDemo ? 'What happened? Reporting also blocks them. Demo profiles’ reports stay on your phone.' : 'What happened? Reporting also blocks them, and the report is sent for review.', [
            { text: 'Made me uncomfortable', onPress: () => reportAndBlock('Made me uncomfortable') },
            { text: 'Spam or selling something', onPress: () => reportAndBlock('Spam or selling something') },
            ...(p.photo ? [{ text: 'Inappropriate photo', onPress: () => reportAndBlock('Inappropriate photo') }] : []),
            { text: 'Cancel', style: 'cancel' as const },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);


  const facts: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
    { icon: 'location-outline', label: distance !== undefined ? approxDistance(distance).replace('about ', '') : p.areaName },
    { icon: 'briefcase-outline', label: p.yearsExp ? `${p.yearsExp} yr${p.yearsExp === 1 ? '' : 's'} exp` : statusLabel(p.status) },
    { icon: 'calendar-outline', label: p.availability[0] ? availabilityLabel(p.availability[0]) : 'Flexible' },
    { icon: p.meets === 'video' ? 'videocam-outline' : 'cafe-outline', label: p.meets === 'video' ? 'Video' : p.meets === 'public' ? 'In person' : 'Either' },
  ];
  const incoming = !!req?.incoming && req.status === 'requested';

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        {/* Intro card: cover behind them, portrait in the middle, then a row of quick facts. */}
        <View style={styles.card0}>
          <ProfileCover uri={p.cover} name={p.name} height={COVER_H + insets.top}>
            <View style={[styles.heroBar, { paddingTop: insets.top + S.sm }]}>
              <IconButton icon="chevron-down" label="Close profile" onPress={() => router.back()} style={styles.heroBtn} />
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <IconButton icon="share-outline" label={`Share ${first}'s profile`} onPress={() => Share.share({ message: `${p.name}, ${p.role}${p.org ? ` at ${p.org}` : ''}, on Connected.` })} style={styles.heroBtn} />
                <IconButton icon="ellipsis-horizontal" label="More options: block, mute or report" onPress={more} style={styles.heroBtn} />
              </View>
            </View>
          </ProfileCover>
          <View style={styles.intro}>
            <Animated.View entering={ZoomIn.duration(320)} style={styles.portrait}>
              <Avatar name={p.name} uri={p.photo} size={PORTRAIT} ring={!!door && seeDoor} />
            </Animated.View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name} accessibilityRole="header">{p.name}</Text>
              {p.idVerified ? <IdBadge size={20} /> : p.verified ? <VerifiedBadge size={20} /> : null}
            </View>
            <Text style={styles.role}>{p.role}{p.org ? ` · ${p.org}` : ''}</Text>
            <Text style={styles.place}>{p.areaName}{p.isDemo ? ' · Demo profile' : ''}</Text>
            {p.bio ? <Text style={styles.headline} numberOfLines={2}>{headline(p.bio)}</Text> : null}
          </View>
          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.icon} style={styles.fact}>
                <Ionicons name={f.icon} size={20} color={C.accent} />
                <Text style={styles.factText} numberOfLines={1}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {nearbyState ? (
          <View style={{ paddingHorizontal: S.lg }}>
            {nearbyState === 'checking' ? <Note icon="time-outline">Checking that {first} is still nearby…</Note> : null}
            {nearbyState === 'nearby' ? <Note tone="accent" icon="location-outline">{first} is still nearby.</Note> : null}
            {nearbyState === 'gone' ? <Note tone="warn" icon="navigate-outline">{first} isn’t nearby right now.</Note> : null}
            {nearbyState === 'error' ? <Note tone="warn" icon="cloud-offline-outline">Couldn’t check whether {first} is nearby.</Note> : null}
            {nearbyState === 'demo' ? <Note icon="flask-outline">Demo: from a simulated nearby alert.</Note> : null}
          </View>
        ) : null}

        {req && !isBlocked ? (
          <Card title={incoming ? `${first} wants to connect` : 'Your request'}>
            {incoming ? (
              <>
                <Text style={styles.quote}>{req.message}</Text>
                <View style={{ flexDirection: 'row', gap: S.sm }}>
                  <Button label="Accept" icon="checkmark" onPress={() => app.respondRemote(req.id, 'accepted').catch((e) => Alert.alert('Couldn’t accept', e instanceof Error ? e.message : 'Try again.'))} style={{ flex: 1 }} />
                  <Button label="Decline" variant="secondary" onPress={() => app.respondRemote(req.id, 'declined').catch((e) => Alert.alert('Couldn’t decline', e instanceof Error ? e.message : 'Try again.'))} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <RequestStatus
                status={req.status}
                first={first}
                message={req.message}
                demo={!req.remote}
                onCancel={() => app.cancelRequest(req.id).catch((e) => Alert.alert('Couldn’t cancel', e instanceof Error ? e.message : 'Try again.'))}
                onSim={(st) => app.simulateReply(req.id, st)}
                onOpenChat={() => router.push({ pathname: '/chat/[id]', params: { id: req.id } })}
              />
            )}
          </Card>
        ) : null}

        {points.length ? (
          <Card title="Why connect">
            {points.slice(0, 3).map((pt) => (
              <View key={pt.text} style={styles.hl}>
                <View style={styles.hlIcon}><Ionicons name={pt.icon} size={18} color={C.accent} /></View>
                <Text style={styles.hlText}>{pt.text}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        {p.helpsWith.length ? (
          <Card title="Can help with" flush>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm, paddingHorizontal: S.lg }}>
              {p.helpsWith.slice(0, 5).map((h) => (
                <View key={h} style={styles.tile}>
                  <Ionicons name="hand-right-outline" size={20} color={C.accent} />
                  <Text style={styles.tileText} numberOfLines={3}>{h}</Text>
                </View>
              ))}
            </ScrollView>
          </Card>
        ) : null}

        {door ? (
          <Card title="Open Door">
            <View style={styles.ticket}>
              <View style={styles.ticketSide}>
                <Text style={styles.ticketDay}>{doorState(door) === 'live' ? 'Now' : new Date(door.start).toLocaleDateString([], { weekday: 'short' })}</Text>
                <Text style={styles.ticketTime}>{fmtTime(doorState(door) === 'live' ? door.end : door.start)}</Text>
                <Text style={styles.ticketCap}>{doorState(door) === 'live' ? 'until' : 'starts'}</Text>
              </View>
              <View style={{ flex: 1, padding: S.md, gap: 4 }}>
                {seeDoor && venue ? (
                  <>
                    <Text style={T.h3}>{venue.name}</Text>
                    <Text style={T.small}>{fmtWindow(door.start, door.end)} · {door.lengthMin} min each</Text>
                  </>
                ) : (
                  <>
                    <Text style={T.h3}>Venue shared with certain groups</Text>
                    <Text style={T.small}>Only for: {door.audience.map(audienceLabel).join(', ')}</Text>
                  </>
                )}
              </View>
            </View>
          </Card>
        ) : null}

        {p.bio ? (
          <Card title="About">
            <Text style={styles.bio} numberOfLines={aboutOpen ? undefined : 3}>{p.bio}</Text>
            {p.bio.length > 150 ? (
              <Pressable onPress={() => setAboutOpen((v) => !v)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.more}>{aboutOpen ? 'Show less' : '…see more'}</Text>
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        {experience.length ? (
          <Card title="Experience">
            {experience.map((e, k) => (
              <View key={e.id} style={[styles.expRow, k > 0 && styles.hair]}>
                <View style={styles.logo}><Text style={styles.logoText}>{(e.org.trim()[0] ?? '·').toUpperCase()}</Text></View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={styles.expTitle}>{e.title}</Text>
                  <Text style={styles.expOrg}>{e.org}</Text>
                  <Text style={T.small}>{fmtRange(e)}</Text>
                  {e.description ? <Text style={styles.expDesc} numberOfLines={2}>{e.description}</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {allSkills.length ? (
          <Card title="Skills">
            {(showSkills ? allSkills : allSkills.slice(0, 3)).map((x, k) => (
              <View key={x} style={[styles.skillRow, k > 0 && styles.hair]}>
                <Text style={styles.skill}>{x}</Text>
                {shared.has(labelKey(x)) ? <Text style={styles.sharedTag}>You share this</Text> : null}
              </View>
            ))}
            {allSkills.length > 3 ? (
              <Pressable onPress={() => setShowSkills((v) => !v)} accessibilityRole="button" style={styles.showAll}>
                <Text style={styles.more}>{showSkills ? 'Show fewer' : `Show all ${allSkills.length} skills`}</Text>
                <Ionicons name={showSkills ? 'chevron-up' : 'arrow-forward'} size={16} color={C.accent} />
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        {p.interests.length ? (
          <Card title="Interests">
            <View style={styles.grid}>
              {p.interests.slice(0, 4).map((x) => (
                <View key={x} style={styles.gridItem}>
                  <View style={styles.hlIcon}><Ionicons name="heart-outline" size={16} color={C.accent} /></View>
                  <Text style={styles.gridText} numberOfLines={2}>{x}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Pressable onPress={() => setMeetOpen(true)} accessibilityRole="button" style={({ pressed }) => [styles.meetRow, pressed && { opacity: 0.8 }]}>
          <View style={styles.hlIcon}><Ionicons name="map-outline" size={18} color={C.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.expTitle}>Where to meet</Text>
            <Text style={T.small}>Pick a neighborhood, see public places there</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.ink3} />
        </Pressable>
      </ScrollView>

      {/* One primary action. */}
      {!isBlocked ? (
        <View style={[styles.bar, { paddingBottom: insets.bottom + S.sm }]}>
          {req?.status === 'accepted' ? (
            <Button label={`Message ${first}`} icon="chatbubble-outline" onPress={() => router.push({ pathname: '/chat/[id]', params: { id: req.id } })} style={{ flex: 1 }} />
          ) : incoming ? (
            <Button label={`Reply to ${first}`} icon="mail-unread-outline" onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} style={{ flex: 1 }} />
          ) : req?.status === 'requested' ? (
            <Button label="Request sent" icon="time-outline" variant="secondary" onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} style={{ flex: 1 }} />
          ) : (
            <Button label="Request a conversation" icon="paper-plane-outline" onPress={() => setComposeOpen(true)} style={{ flex: 1 }} />
          )}
        </View>
      ) : null}

      {/* Compose sheet */}
      <Modal visible={composeOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setComposeOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheetHead, { paddingTop: Platform.OS === 'android' ? insets.top + S.sm : S.lg }]}>
            <Text style={T.h2}>Message to {first}</Text>
            <IconButton icon="close" label="Close" onPress={() => setComposeOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md }} keyboardShouldPersistTaps="handled">
            <Segmented label="Message style" options={TONES} value={tone} onChange={changeTone} />
            <TextInput value={msg} onChangeText={(t) => { setMsg(t.slice(0, 500)); setEdited(true); }} multiline style={styles.msg} accessibilityLabel={`Message to ${first}`} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={T.small}>{msg.length}/500{edited ? ' · edited' : ''}</Text>
              {edited ? <Button label="Use suggestion" variant="quiet" small onPress={() => { setMsg(suggestion); setEdited(false); }} /> : null}
            </View>
            <Button label="Send request" icon="paper-plane-outline" onPress={send} />
            <Pressable onPress={() => setShowIdeas((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showIdeas }} style={styles.ideasToggle}>
              <Ionicons name="bulb-outline" size={20} color={C.accent} />
              <Text style={[T.label, { flex: 1, color: C.accent }]}>Not sure what to ask?</Text>
              <Ionicons name={showIdeas ? 'chevron-up' : 'chevron-down'} size={20} color={C.accent} />
            </Pressable>
            {showIdeas ? p.questions.map((q) => <Text key={q} style={[T.body, { fontSize: 15 }]}>“{q}”</Text>) : null}
            <Text style={T.small}>Nothing is sent until you tap Send.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Where to meet sheet */}
      <Modal visible={meetOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMeetOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={[styles.sheetHead, { paddingTop: Platform.OS === 'android' ? insets.top + S.sm : S.lg }]}>
            <Text style={T.h2}>Where to meet {first}</Text>
            <IconButton icon="close" label="Close" onPress={() => setMeetOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xl }}>
            <MeetSpots person={p} onUse={canSuggest ? useSpot : undefined} useLabel={req?.status === 'accepted' ? 'Suggest in chat' : 'Add to message'} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

/** A LinkedIn-style section: a white band on the grey page, a bold title, then content. */
function Card({ title, children, flush }: { title: string; children: ReactNode; flush?: boolean }) {
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={[styles.card, flush && { marginHorizontal: 0, paddingHorizontal: 0, borderTopWidth: 0 }]}>
      {flush ? <View style={styles.flushRule} /> : null}
      <Text style={[styles.cardTitle, flush && { paddingHorizontal: S.lg }]} accessibilityRole="header">{title}</Text>
      {children}
    </Animated.View>
  );
}

function RequestStatus({ status, first, message, demo, onCancel, onSim, onOpenChat }: {
  status: 'requested' | 'accepted' | 'declined' | 'cancelled';
  first: string;
  message: string;
  demo: boolean;
  onCancel: () => void;
  onSim: (s: 'accepted' | 'declined') => void;
  onOpenChat: () => void;
}) {
  if (status === 'requested')
    return (
      <View style={[styles.status, { backgroundColor: C.warnSoft, borderColor: C.line }]}>
        <Tag label="Requested" tone="warn" icon="time-outline" />
        <Text style={T.body}>Waiting for {first} to reply. It isn&apos;t a confirmed meeting until they accept.</Text>
        <Text style={styles.quote} numberOfLines={4}>{message}</Text>
        <Button label="Cancel request" variant="secondary" small onPress={onCancel} style={{ alignSelf: 'flex-start' }} />
        {demo ? (
          <View style={styles.demo}>
            <Text style={T.small}>Demo: a reply arrives in a few seconds, or</Text>
            <View style={{ flexDirection: 'row', gap: S.sm }}>
              <Button label="Accept now" variant="secondary" small onPress={() => onSim('accepted')} />
              <Button label="Decline now" variant="secondary" small onPress={() => onSim('declined')} />
            </View>
          </View>
        ) : (
          <Text style={T.small}>You&apos;ll get their reply here as soon as they respond.</Text>
        )}
      </View>
    );
  if (status === 'accepted')
    return (
      <View style={[styles.status, { backgroundColor: C.okSoft, borderColor: C.line }]}>
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
  card0: { backgroundColor: C.surface, paddingBottom: S.md },
  card: { marginHorizontal: S.lg, paddingVertical: S.xl, gap: S.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
  cardTitle: { fontFamily: F.displaySemi, fontSize: 19, lineHeight: 24, color: C.ink },
  facts: { flexDirection: 'row', marginHorizontal: S.lg, paddingVertical: S.sm },
  fact: { flex: 1, alignItems: 'center', gap: 4 },
  factText: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: C.ink2 },
  hl: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  hlIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  hlText: { flex: 1, fontSize: 15, lineHeight: 21, color: C.ink, fontWeight: '500' },
  tile: { width: 132, gap: S.sm },
  flushRule: { position: 'absolute', top: 0, left: S.lg, right: S.lg, height: StyleSheet.hairlineWidth, backgroundColor: C.line2 },
  tileText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: C.ink },
  more: { fontSize: 14, fontWeight: '600', color: C.accent },
  expRow: { flexDirection: 'row', gap: S.md, paddingTop: S.md },
  expTitle: { fontSize: 16, lineHeight: 21, fontWeight: '600', color: C.ink },
  expOrg: { fontSize: 14, lineHeight: 19, color: C.ink },
  skillRow: { paddingVertical: S.sm, gap: 2 },
  skill: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: C.ink },
  sharedTag: { fontSize: 12, color: C.accent, fontWeight: '600' },
  showAll: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: S.md },
  gridItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingRight: S.sm },
  gridText: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '500', color: C.ink },
  meetRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, marginHorizontal: S.lg, paddingVertical: S.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: S.lg, paddingBottom: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line2 },
  heroBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: S.lg },
  heroBtn: { backgroundColor: C.surface },
  intro: { alignItems: 'center', paddingHorizontal: S.lg, marginTop: -PORTRAIT / 2, gap: 4, paddingBottom: S.lg },
  portrait: { borderRadius: PORTRAIT / 2 + 4, padding: 4, backgroundColor: C.surface, marginBottom: S.sm },
  name: { ...T.title, textAlign: 'center', flexShrink: 1 },
  role: { fontSize: 16, lineHeight: 22, color: C.ink, fontWeight: '500', textAlign: 'center' },
  place: { fontSize: 14, lineHeight: 20, color: C.ink3, textAlign: 'center' },
  headline: { fontSize: 16, lineHeight: 23, color: C.ink2, textAlign: 'center', marginTop: S.sm, maxWidth: 340 },
  why: { fontSize: 16, lineHeight: 24, color: C.ink },
  offerRow: { paddingVertical: S.sm, gap: 2 },
  offerTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: C.ink },
  hair: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
  tlRow: { flexDirection: 'row', gap: S.md },
  tlRail: { alignItems: 'center', width: 36 },
  logo: { width: 36, height: 36, borderRadius: R.md, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontFamily: F.display, fontSize: 16, color: C.ink2 },
  tlLine: { flex: 1, width: StyleSheet.hairlineWidth * 2, backgroundColor: C.line2, marginVertical: 4 },
  expDesc: { fontSize: 15, lineHeight: 22, color: C.ink2, marginTop: 2 },
  expandHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingHorizontal: S.lg, paddingTop: S.sm, backgroundColor: C.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
  body: { paddingHorizontal: S.lg, gap: S.xl },
  bio: { fontSize: 16, lineHeight: 24, color: C.ink2 },
  blockTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: C.ink3, letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 1 },
  ticket: { flexDirection: 'row', borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.bg },
  ticketSide: { width: 86, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingVertical: S.md },
  ticketDay: { color: C.accentSoft, fontSize: 13, fontWeight: '600' },
  ticketTime: { fontFamily: F.display, color: C.white, fontSize: 18, lineHeight: 23 },
  ticketCap: { color: C.accentSoft, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { fontSize: 14, color: C.ink2, backgroundColor: C.bg2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.sm, overflow: 'hidden' },
  chipOn: { backgroundColor: C.accentSoft, color: C.accent, fontWeight: '600' },
  msg: { minHeight: 150, borderWidth: 1, borderColor: C.line2, borderRadius: R.md, padding: S.md, fontSize: 16, lineHeight: 23, color: C.ink, textAlignVertical: 'top', backgroundColor: C.surface },
  ideasToggle: { flexDirection: 'row', alignItems: 'center', gap: S.sm, minHeight: 44 },
  status: { gap: S.md, padding: S.lg, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.bg2 },
  quote: { fontSize: 14, lineHeight: 20, color: C.ink2, borderLeftWidth: 2, borderLeftColor: C.line2, paddingLeft: S.md },
  demo: { gap: S.sm, borderTopWidth: 1, borderTopColor: C.line2, borderStyle: 'dashed', paddingTop: S.md },
});
