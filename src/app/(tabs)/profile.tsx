import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Avatar, Button, Card, ChipGroup, KV, Note, Row, Section, Segmented, Tag } from '@/components/ui';
import { ProfileCover } from '@/components/ProfileCover';
import { ResumeExperienceCard } from '@/components/ResumeExperienceCard';
import { IdBadge, VerifiedBadge } from '@/components/VerifiedBadge';
import { AVAILABILITY, MEET_MODES, audienceLabel, challengeLabel, dietLabel, fieldLabel, foodLabel, goalLabel, statusLabel, traitLabel, venueById } from '@/data/options';
import { dataSource } from '@/data/source';
import { notificationState, turnOnNearbyAlerts, type NotifState } from '@/lib/nearbyAlerts';
import { COOLDOWN_OPTIONS_H, LOCATION_ROUNDING, POLICY_DEFAULTS, RADIUS_OPTIONS_MI } from '@/lib/nearbyPolicy';
import type { AvailabilityId } from '@/data/types';
import { doorState, fullName } from '@/lib/match';
import { pickCoverPhoto, pickProfilePhoto, removeProfilePhoto } from '@/lib/photo';
import { fmtWindow } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, F, S, T } from '@/theme';
import type { IdStatus } from '@/lib/idStatus';

// ID check (Stripe, government photo ID + selfie): required for real members. Separate from the email check above it.
const ID_TEXT: Record<IdStatus, string> = {
  unverified: 'Required to meet real people: a government photo ID and selfie check with Stripe.',
  started: 'You started a check but haven’t finished it. Real people stay locked until you do.',
  pending: 'Stripe is reviewing your check.',
  rejected: 'That attempt didn’t go through. You can try again.',
  canceled: 'Your last check was canceled. Start a new one to unlock real people.',
  test_verified: 'Test result — does not unlock Connected.',
  verified: 'Government ID and selfie checked. Real people are unlocked, and people see an ID badge.',
};
const ID_BUTTON: Record<IdStatus, string> = { unverified: 'Verify', started: 'Continue', pending: 'Status', rejected: 'Retry', canceled: 'Verify', test_verified: 'Details', verified: '' };

export default function ProfileTab() {
  const app = useApp();
  const { prefs, profile } = app;
  const active = app.doors.filter((d) => ['live', 'upcoming'].includes(doorState(d, app.now)));
  const past = app.doors.filter((d) => !active.includes(d));
  const [notif, setNotif] = useState<NotifState>('undetermined');
  useEffect(() => {
    notificationState().then(setNotif);
  }, []);

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

  const changeCover = async () => {
    const res = await pickCoverPhoto(profile.coverUri);
    if (!res) return;
    if ('error' in res) return Alert.alert('Can’t open photos', res.error);
    app.setProfile({ coverUri: res.uri });
  };
  const coverMenu = () =>
    profile.coverUri
      ? Alert.alert('Cover photo', 'Shown behind your portrait. It stays on this phone for now.', [
          { text: 'Choose a new photo', onPress: changeCover },
          { text: 'Remove cover', style: 'destructive', onPress: () => { removeProfilePhoto(profile.coverUri); app.setProfile({ coverUri: null }); } },
          { text: 'Cancel', style: 'cancel' },
        ])
      : changeCover();

  const toggleAvail = (id: AvailabilityId) =>
    app.setPrefs({ availability: prefs.availability.includes(id) ? prefs.availability.filter((x) => x !== id) : [...prefs.availability, id] });

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, gap: S.xl, paddingBottom: S.xxl }}>
      <View style={styles.header}>
        {/* Your cover photo behind your portrait, the same way other people see a profile. */}
        <ProfileCover uri={profile.coverUri} name={fullName(profile) || 'You'} height={140} style={styles.cover}>
          <Pressable onPress={coverMenu} accessibilityRole="button" accessibilityLabel={profile.coverUri ? 'Change cover photo' : 'Add a cover photo'} style={styles.coverBtn} hitSlop={6}>
            <Ionicons name="image-outline" size={16} color={C.ink} />
            <Text style={styles.coverBtnText}>{profile.coverUri ? 'Edit cover' : 'Add cover'}</Text>
          </Pressable>
        </ProfileCover>
        <View style={styles.idRow}>
          <Pressable onPress={photoMenu} accessibilityRole="button" accessibilityLabel={profile.photoUri ? 'Change profile photo' : 'Add a profile photo'} style={styles.avatarWrap}>
            <Avatar name={fullName(profile) || '?'} uri={profile.photoUri} size={96} />
            <View style={styles.camBadge}><Ionicons name={profile.photoUri ? 'pencil-outline' : 'camera-outline'} size={14} color={C.white} /></View>
          </Pressable>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text style={styles.name} accessibilityRole="header">{fullName(profile) || 'Your profile'}</Text>
              {app.verification.verified ? <VerifiedBadge size={18} kind={app.verification.kind} /> : null}
              {app.idStatus === 'verified' ? <IdBadge size={18} /> : null}
            </View>
            <Text style={T.muted}>{statusLabel(profile.status)}{profile.org ? ` · ${profile.org}` : ''}{prefs.field ? ` · ${fieldLabel(prefs.field)}` : ''}</Text>
            <View style={styles.visibleRow}>
              {prefs.discoverable ? <View style={styles.visibleDot} /> : <Ionicons name="eye-off-outline" size={14} color={C.ink3} />}
              <Text style={[styles.visibleText, prefs.discoverable && { color: C.ok }]}>{prefs.discoverable ? 'Visible nearby' : 'Hidden'}</Text>
            </View>
          </View>
        </View>
        {profile.intro ? <Text style={styles.intro} numberOfLines={3}>{profile.intro}</Text> : null}
        <View style={styles.stats}>
          {[
            { n: app.requests.filter((r) => r.status === 'accepted').length, label: 'Connections' },
            { n: app.requests.filter((r) => !r.incoming && r.status !== 'cancelled').length, label: 'Requests' },
            { n: app.savedEvents.length, label: 'Saved events' },
          ].map((s, k) => (
            <View key={s.label} style={[styles.stat, k > 0 && styles.statDivider]} accessible accessibilityLabel={`${s.n} ${s.label}`}>
              <Text style={styles.statNum}>{s.n}</Text>
              <Text style={styles.statLabel} numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {app.backendEnabled ? (
        <Section title="Account">
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
              <View style={styles.switchRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.label}>{app.verification.verified ? 'Email verified' : 'Verify your email'}</Text>
                  <Text style={T.small}>
                    {app.verification.verified ? `Confirmed with a ${app.verification.kind ?? ''} email. This email badge is separate from ID verification.` : 'Confirm a school or work email for an email badge. It’s separate from ID verification and doesn’t unlock real people.'}
                  </Text>
                </View>
                {app.verification.verified ? <VerifiedBadge label size={18} /> : <Button label="Verify" small onPress={() => router.push('/verify')} />}
              </View>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.label}>{app.idStatus === 'verified' ? 'ID verified' : 'Verify your ID'}</Text>
                  <Text style={T.small}>
                    {ID_TEXT[app.idStatus]}
                  </Text>
                </View>
                {app.idStatus === 'verified' ? <IdBadge label size={18} /> : <Button label={ID_BUTTON[app.idStatus]} small onPress={() => router.push('/verify-id')} />}
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
              <Text style={T.small}>Real people, requests and chats need an account and a government photo ID + selfie check.</Text>
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
        </Section>
      ) : null}

      <Section title="Profile" right={<Button label="Edit" variant="secondary" small onPress={() => router.push({ pathname: '/onboarding', params: { edit: 'profile' } })} />}>
        <View style={{ gap: S.sm }}>
          <KV k="Name" v={fullName(profile) || 'Not set'} />
          <KV k="Status" v={statusLabel(profile.status)} />
          <KV k="Organization" v={profile.org || 'Not set'} />
          {profile.offer ? <KV k="Can offer" v={profile.offer} /> : null}
          {app.profileSaveIssue ? (
            <View style={{ gap: S.sm }} accessibilityRole="alert">
              <Note tone={app.profileSaveIssue.draft ? 'neutral' : 'warn'} icon={app.profileSaveIssue.draft ? 'time-outline' : 'alert-circle-outline'}>{app.profileSaveIssue.message}</Note>
              {app.profileSaveIssue.rejected ? (
                <Button label="Edit profile" small variant="secondary" onPress={() => router.push({ pathname: '/onboarding', params: { edit: 'profile' } })} />
              ) : (
                <Button label="Try again" small variant="secondary" icon="refresh" onPress={() => { app.ensureProfileSaved(); }} />
              )}
            </View>
          ) : null}
        </View>
      </Section>

      {!app.session ? (
        <Note icon="flask-outline">{app.backendEnabled ? 'Guest mode: this profile lives on this phone and you only see demo people. Create an account under Account above to meet real members.' : 'Demo mode: this profile lives on this phone.'}</Note>
      ) : null}

      <ResumeExperienceCard />

      <Section title="When I’m usually free">
        <ChipGroup options={AVAILABILITY} selected={prefs.availability} onToggle={toggleAvail} />
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

      <Section title="Open Door" right={<Button label="Offer one" small icon="add-outline" onPress={() => router.push('/open-door')} />}>
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

      <Section title="Visibility & alerts">
      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.label}>Show me in nearby discovery</Text>
            <Text style={T.small}>{prefs.discoverable ? 'People who match can find your profile.' : 'You’re hidden. You can still browse and send requests.'}</Text>
          </View>
          <Switch value={prefs.discoverable} onValueChange={(v) => app.setPrefs({ discoverable: v })} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Show me in nearby discovery" />
        </View>
        <View style={styles.divider} />
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.label}>Show my rough area on the map</Text>
            <Text style={T.small}>{prefs.shareMode === 'area' ? 'Members see you near your neighborhood (about 1 km), never your exact spot.' : 'Off: you appear in search, but not on anyone’s map.'}</Text>
          </View>
          <Switch value={prefs.shareMode === 'area'} onValueChange={(v) => app.setPrefs({ shareMode: v ? 'area' : 'public' })} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Show my rough area on the map" />
        </View>
        <View style={styles.divider} />
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.label}>Nearby alerts</Text>
            <Text style={T.small}>“You should connect” cards about real members in your field nearby who share an interest, skill or mentoring goal with you. Nothing is ever sent to them automatically.</Text>
          </View>
          <Switch
            value={app.nearbyAlerts}
            onValueChange={async (v) => {
              app.setNearbyAlerts(v);
              setNotif(v ? await turnOnNearbyAlerts(app.nearbyRadiusMi) : await notificationState());
            }}
            trackColor={{ true: C.accent, false: C.line2 }}
            accessibilityLabel="Nearby alerts"
          />
        </View>
        {app.nearbyAlerts ? (
          <View style={{ gap: S.md }}>
            <View style={{ gap: S.xs }}>
              <Text style={T.label}>Alert distance</Text>
              <Segmented label="Alert distance" options={RADIUS_OPTIONS_MI.map((mi) => ({ id: mi, label: `${mi} mi` }))} value={app.nearbyRadiusMi} onChange={(mi) => app.setNearbyPrefs({ radiusMi: mi })} />
              <Text style={T.small}>Only for these alerts. The map’s search distance (Filters) is separate and doesn’t change who you’re alerted about.</Text>
            </View>
            <View style={{ gap: S.xs }}>
              <Text style={T.label}>Same person again after</Text>
              <Segmented label="Same person again after" options={COOLDOWN_OPTIONS_H.map((h) => ({ id: h, label: h < 24 ? `${h} h` : h === 24 ? '1 day' : `${h / 24} days` }))} value={app.nearbyCooldownH} onChange={(h) => app.setNearbyPrefs({ cooldownH: h })} />
              <Text style={T.small}>At most {POLICY_DEFAULTS.dailyCap} alerts a day and one every {POLICY_DEFAULTS.minGapMin} minutes.</Text>
            </View>
            {notif !== 'granted' ? (
              <Note tone="warn" icon="notifications-off-outline">
                {notif === 'blocked' ? 'Notifications are off for Connected, so you’ll only see the card in the app.' : 'Notifications aren’t allowed yet, so you’ll only see the card in the app.'}
              </Note>
            ) : null}
            {notif === 'blocked' ? <Button label="Open Settings" small variant="secondary" icon="settings-outline" onPress={() => Linking.openSettings()} /> : null}
            <Note icon="information-circle-outline">
              Works only while Connected is open on the Map tab with live location on. It can’t alert you when the app is closed or in the background.
              {'\n\n'}Location is approximate: rounded to {LOCATION_ROUNDING}, so distances are rough (“within about half a mile”).
              {'\n\n'}What’s shared: when you’re recommended to someone, they see your first name and last initial, a rough distance, and only the interests, skills or mentoring goal you both listed. Never your exact location, your experience or your resume. You must be ID-verified, in nearby discovery and sharing your rough area, and so must they.
            </Note>
          </View>
        ) : null}
        <View style={styles.divider} />
        <View style={styles.switchRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.label}>Show demo events</Text>
            <Text style={T.small}>Events load live from Meetup and Devpost. Turn this on to mix in sample events.</Text>
          </View>
          <Switch value={app.showDemoEvents} onValueChange={app.setShowDemoEvents} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Show demo events" />
        </View>
      </Card>
      </Section>

      <Section title="Privacy">
        <Note icon="lock-closed-outline">
          Location is used only while the app is open: to center your map and, if nearby alerts are on, to save your rough area (about 1 km) while the map is open. It’s never tracked in the background. Other people see an approximate area at most, never your position.
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
        {app.muted.map((id) => (
          <Row key={id} style={{ justifyContent: 'space-between' }}>
            <Text style={T.body}>{dataSource.getPerson(id)?.name ?? id} (muted)</Text>
            <Button label="Unmute" variant="quiet" small onPress={() => app.unmute(id)} />
          </Row>
        ))}
        {app.hiddenEvents.length || app.mutedHosts.length ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={[T.body, { flex: 1 }]}>{app.hiddenEvents.length} hidden events, {app.mutedHosts.length} muted hosts</Text>
            <Button label="Show again" variant="quiet" small onPress={app.restoreEvents} />
          </Row>
        ) : null}
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
  header: { gap: S.md },
  cover: { marginHorizontal: -S.lg, marginTop: -S.lg, justifyContent: 'flex-end', alignItems: 'flex-end', padding: S.md },
  coverBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.surface },
  coverBtnText: { fontSize: 13, fontWeight: '600', color: C.ink },
  idRow: { alignItems: 'center', gap: S.sm, marginTop: -64 },
  avatarWrap: { borderRadius: 52, padding: 4, backgroundColor: C.bg },
  name: { ...T.title, flexShrink: 1, textAlign: 'center' },
  visibleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  visibleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.ok },
  visibleText: { fontSize: 13, fontWeight: '600', color: C.ink3 },
  intro: { fontSize: 15, lineHeight: 22, color: C.ink2 },
  stats: { flexDirection: 'row', paddingVertical: S.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: C.line },
  statNum: { fontFamily: F.display, fontSize: 22, lineHeight: 28, color: C.ink, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, color: C.ink3 },
  camBadge: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 44 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: S.xs },
});
