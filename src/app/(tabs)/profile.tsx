import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar, Button, Card, ChipGroup, KV, Note, Row, Section, Tag } from '@/components/ui';
import { AVAILABILITY, MEET_MODES, audienceLabel, challengeLabel, dietLabel, fieldLabel, foodLabel, goalLabel, statusLabel, traitLabel, venueById } from '@/data/options';
import { dataSource } from '@/data/source';
import type { AvailabilityId } from '@/data/types';
import { doorState, fullName } from '@/lib/match';
import { pickProfilePhoto, removeProfilePhoto } from '@/lib/photo';
import { fmtWindow } from '@/lib/time';
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
    app.setProfile({ photoUri: res.uri });
  };
  const photoMenu = () =>
    profile.photoUri
      ? Alert.alert('Profile photo', undefined, [
          { text: 'Choose a new photo', onPress: changePhoto },
          { text: 'Remove photo', style: 'destructive', onPress: () => { removeProfilePhoto(profile.photoUri); app.setProfile({ photoUri: null }); } },
          { text: 'Cancel', style: 'cancel' },
        ])
      : changePhoto();

  const toggleAvail = (id: AvailabilityId) =>
    app.setPrefs({ availability: prefs.availability.includes(id) ? prefs.availability.filter((x) => x !== id) : [...prefs.availability, id] });

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: S.xxl }}>
      <View style={{ flexDirection: 'row', gap: S.md, alignItems: 'center' }}>
        <Pressable onPress={photoMenu} accessibilityRole="button" accessibilityLabel={profile.photoUri ? 'Change profile photo' : 'Add a profile photo'}>
          <Avatar name={fullName(profile) || '?'} uri={profile.photoUri} size={72} />
          <View style={styles.camBadge}><Ionicons name={profile.photoUri ? 'pencil' : 'camera'} size={13} color={C.white} /></View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={T.title}>{fullName(profile) || 'Your profile'}</Text>
          <Text style={T.muted}>{statusLabel(profile.status)}{profile.org ? ` · ${profile.org}` : ''}</Text>
        </View>
      </View>
      {profile.intro ? <Text style={T.body}>{profile.intro}</Text> : null}

      {app.backendEnabled ? (
        <Card>
          {app.session ? (
            <>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.label}>Signed in</Text>
                  <Text style={T.small} numberOfLines={1}>{app.session.email}</Text>
                </View>
                <Button
                  label="Sign out"
                  variant="secondary"
                  small
                  onPress={() =>
                    Alert.alert('Sign out?', 'You won’t receive requests on this phone until you sign in again.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Sign out', style: 'destructive', onPress: () => { app.signOut(); } },
                    ])
                  }
                />
              </View>
              <Text style={T.small}>
                {prefs.shareMode === 'area'
                  ? 'Your profile is saved to your account. People see your neighborhood on the map, never your exact location.'
                  : 'Your profile is saved to your account. You chose public places only, so you appear in search but not on the map.'}
              </Text>
            </>
          ) : (
            <>
              <Text style={T.label}>Create an account</Text>
              <Text style={T.small}>Save your profile so real people nearby can find you, and send real requests and messages.</Text>
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <Button label="Create account" small onPress={() => router.push({ pathname: '/onboarding', params: { edit: 'account' } })} style={{ flex: 1 }} />
                <Button label="Sign in" small variant="secondary" onPress={() => router.push('/auth')} style={{ flex: 1 }} />
              </View>
            </>
          )}
          <View style={styles.divider} />
          <View style={styles.switchRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={T.label}>Show demo people</Text>
              <Text style={T.small}>Built-in sample profiles, marked &quot;Demo&quot;. Turn off once real people are on.</Text>
            </View>
            <Switch value={app.showDemo} onValueChange={app.setShowDemoPeople} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Show demo people" />
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.label}>Show me in nearby discovery</Text>
            <Text style={T.small}>{prefs.discoverable ? 'People who match can find your profile.' : 'You’re hidden. You can still browse and send requests.'}</Text>
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
          <KV k="Food & drink" v={[...prefs.foods.map(foodLabel), ...prefs.diet.map(dietLabel)].join(', ') || 'Not set'} />
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
          <KV k="Name" v={fullName(profile) || 'Not set'} />
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
              <Text style={T.body}>{dataSource.getPerson(id)?.name ?? id}</Text>
              <Button label="Unblock" variant="quiet" small onPress={() => app.unblock(id)} />
            </Row>
          ))
        ) : (
          <Text style={T.small}>You haven’t blocked anyone.</Text>
        )}
      </Section>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  camBadge: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  divider: { height: 1, backgroundColor: C.line, marginVertical: S.xs, borderRadius: R.sm },
});
