import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar, Button, Card, ChipGroup, KV, Note, Row, Section, Tag } from '@/components/ui';
import { AVAILABILITY, MEET_MODES, audienceLabel, challengeLabel, fieldLabel, goalLabel, statusLabel, traitLabel, venueById } from '@/data/options';
import { dataSource } from '@/data/source';
import type { AvailabilityId } from '@/data/types';
import { doorState } from '@/lib/match';
import { pickProfilePhoto, removeProfilePhoto } from '@/lib/photo';
import { fmtTime, fmtWindow } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

export default function ProfileTab() {
  const app = useApp();
  const { prefs, profile } = app;
  const active = app.doors.filter((d) => ['live', 'upcoming'].includes(doorState(d, app.now)));
  const past = app.doors.filter((d) => !active.includes(d));

  const changePhoto = async () => {
    const res = await pickProfilePhoto(profile.photoUri);
    if (!res) return;
    if ('error' in res) return Alert.alert('Can’t open photos', res.error);
    if (!app.live) return app.setProfile({ photoUri: res.uri });
    try { await app.setPhoto(res.uri); } catch (e) { Alert.alert('Your photo didn’t upload', (e as Error).message); }
  };
  const removePhoto = async () => {
    if (!app.live) { removeProfilePhoto(profile.photoUri); return app.setProfile({ photoUri: null }); }
    try { await app.setPhoto(null); } catch (e) { Alert.alert('Couldn’t remove your photo', (e as Error).message); }
  };
  const photoMenu = () =>
    profile.photoUri
      ? Alert.alert('Profile photo', undefined, [
          { text: 'Choose a new photo', onPress: changePhoto },
          { text: 'Remove photo', style: 'destructive', onPress: removePhoto },
          { text: 'Cancel', style: 'cancel' },
        ])
      : changePhoto();

  const toggleAvail = (id: AvailabilityId) =>
    app.setPrefs({ availability: prefs.availability.includes(id) ? prefs.availability.filter((x) => x !== id) : [...prefs.availability, id] });

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: S.xxl }}>
      <View style={{ flexDirection: 'row', gap: S.md, alignItems: 'center' }}>
        <Pressable onPress={photoMenu} accessibilityRole="button" accessibilityLabel={profile.photoUri ? 'Change profile photo' : 'Add a profile photo'}>
          <Avatar name={profile.name || '?'} uri={profile.photoUri} size={72} />
          <View style={styles.camBadge}><Ionicons name={profile.photoUri ? 'pencil' : 'camera'} size={13} color={C.white} /></View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={T.title}>{profile.name || 'Your profile'}</Text>
          <Text style={T.muted}>{statusLabel(profile.status)}{profile.org ? ` · ${profile.org}` : ''}</Text>
        </View>
      </View>
      {profile.intro ? <Text style={T.body}>{profile.intro}</Text> : null}

      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.label}>Show me in nearby discovery</Text>
            <Text style={T.small}>
              {!prefs.discoverable
                ? 'You’re hidden. You can still browse and send requests.'
                : !app.live
                  ? 'People who match can find your profile.'
                  : app.visibleUntil > app.now
                    ? `Visible around ${app.areaName ?? 'your area'} until ${fmtTime(app.visibleUntil)}. Opening the app keeps you visible; only your neighborhood is shared.`
                    : 'Open the map with location on to show up nearby for an hour. Only your neighborhood is shared.'}
            </Text>
          </View>
          <Switch value={prefs.discoverable} onValueChange={(v) => app.setPrefs({ discoverable: v })} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Show me in nearby discovery" />
        </View>
        <View style={styles.divider} />
        <Text style={T.label}>When I’m usually free</Text>
        <ChipGroup options={AVAILABILITY} selected={prefs.availability} onToggle={toggleAvail} />
      </Card>

      <Section title="Open Door" right={<Button label="Offer one" small icon="add" onPress={() => router.push('/open-door')} />}>
        <Text style={T.muted}>Offer a short, in-person chat at a public place and time you choose. Only people you pick can see where.</Text>
        {active.map((d) => (
          <Card key={d.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={T.h3}>{venueById(d.venueId).name}</Text>
              <Tag label={doorState(d, app.now) === 'live' ? 'Open now' : 'Coming up'} tone={doorState(d, app.now) === 'live' ? 'ok' : 'warn'} />
            </Row>
            <Text style={T.small}>{fmtWindow(d.start, d.end)} · {d.lengthMin} min each</Text>
            <Text style={T.small}>Visible to: {d.audience.map(audienceLabel).join(', ')}</Text>
            <Row>
              <Button label="Edit" variant="secondary" small onPress={() => router.push({ pathname: '/open-door', params: { id: d.id } })} />
              <Button label="End now" variant="secondary" small onPress={() => app.endDoor(d.id)} />
            </Row>
          </Card>
        ))}
        {past.length ? <Text style={T.small}>{past.length} past session{past.length > 1 ? 's' : ''} ended or expired automatically.</Text> : null}
      </Section>

      <Section title="Preferences" right={<Button label="Edit" variant="secondary" small onPress={() => router.push({ pathname: '/onboarding', params: { edit: 'prefs' } })} />}>
        <View style={{ gap: S.sm }}>
          <KV k="Growing in" v={fieldLabel(prefs.field)} />
          {prefs.fromField ? <KV k="Coming from" v={fieldLabel(prefs.fromField)} /> : null}
          <KV k="In my way" v={prefs.challenges.map(challengeLabel).join('; ') || 'Not set'} />
          <KV k="Click with" v={prefs.wantTraits.map(traitLabel).join(', ') || 'Anyone'} />
          <KV k="Languages" v={prefs.languages.join(', ') || 'Not set'} />
          <KV k="Looking for" v={prefs.goals.map((g) => (g === 'other' && prefs.goalOther ? prefs.goalOther : goalLabel(g))).join(', ') || 'Not set'} />
          <KV k="Interests" v={prefs.interests.join(', ') || 'Not set'} />
          <KV k="Skills" v={prefs.skills.join(', ') || 'Not set'} />
          <KV k="Meeting" v={`${MEET_MODES.find((m) => m.id === prefs.meetMode)?.label ?? 'Either'}, up to ${prefs.travelMi} mi`} />
          <KV k="Here to" v={{ seeking: 'Find connections', offering: 'Offer help', both: 'Both' }[prefs.mode]} />
          <KV k="Sharing" v={prefs.shareMode === 'area' ? 'Approximate area' : 'Public meeting place only'} />
        </View>
      </Section>

      <Section title="Profile" right={<Button label="Edit" variant="secondary" small onPress={() => router.push({ pathname: '/onboarding', params: { edit: 'profile' } })} />}>
        <View style={{ gap: S.sm }}>
          <KV k="Name" v={profile.name || 'Not set'} />
          <KV k="Status" v={statusLabel(profile.status)} />
          <KV k="Organization" v={profile.org || 'Not set'} />
          {profile.offer ? <KV k="Can offer" v={profile.offer} /> : null}
        </View>
      </Section>

      <Section title="Privacy">
        <Note icon="lock-closed-outline">
          Location is used once, while the app is open, to center your map. It’s never tracked in the background. Other people see an approximate area at most, never your position.
        </Note>
        {app.blocked.length ? (
          app.blocked.map((id) => (
            <Row key={id} style={{ justifyContent: 'space-between' }}>
              <Text style={T.body}>{app.blockedNames[id] ?? dataSource.getPerson(id)?.name ?? 'Blocked member'}</Text>
              <Button label="Unblock" variant="quiet" small onPress={() => app.unblock(id)} />
            </Row>
          ))
        ) : (
          <Text style={T.small}>You haven’t blocked anyone.</Text>
        )}
      </Section>

      {app.live ? (
        <Section title="Account">
          <KV k="Signed in as" v={app.account?.email ?? ''} />
          <Text style={T.small}>Your email is only used to sign in. Other members never see it.</Text>
          <Button
            label="Sign out"
            variant="secondary"
            onPress={() =>
              Alert.alert('Sign out?', 'Your profile, requests and conversations stay saved. You can sign back in with your email.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: async () => { await app.signOut(); router.replace('/onboarding'); } },
              ])
            }
          />
          <Button
            label="Delete my account"
            variant="danger"
            onPress={() =>
              Alert.alert('Delete your account?', 'This permanently deletes your profile, photo, requests, conversations and Open Doors. It can’t be undone.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: async () => {
                    try { await app.deleteAccount(); router.replace('/onboarding'); }
                    catch (e) { Alert.alert('Couldn’t delete your account', (e as Error).message); }
                  },
                },
              ])
            }
          />
        </Section>
      ) : (
        <View style={{ gap: S.sm }}>
          <Button label="Sign in or create a real account" icon="person-add-outline" onPress={() => router.push('/sign-in')} />
          <Button
            label="Start the demo over"
            variant="danger"
            onPress={() =>
              Alert.alert('Start over?', 'This clears your preferences, profile, requests and Open Doors on this phone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Start over', style: 'destructive', onPress: async () => { await app.reset(); router.replace('/onboarding'); } },
              ])
            }
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  camBadge: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  divider: { height: 1, backgroundColor: C.line, marginVertical: S.xs, borderRadius: R.sm },
});
