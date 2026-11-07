import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, ChipGroup, Choice, Note, Segmented } from '@/components/ui';
import { FIELDS, GOALS, INTERESTS, SKILLS, STATUSES, TRAVEL_MI } from '@/data/options';
import type { GoalId } from '@/data/types';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

const LAST_PREF_STEP = 4;
const PROFILE_STEP = 5;

export default function Onboarding() {
  const { edit } = useLocalSearchParams<{ edit?: 'prefs' | 'profile' }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(edit === 'profile' ? PROFILE_STEP : edit === 'prefs' ? 1 : 0);
  const [err, setErr] = useState('');
  const [customSkill, setCustomSkill] = useState('');
  const { prefs, profile, setPrefs, setProfile } = app;

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  function validate(): string {
    if (step === 1 && !prefs.field) return 'Pick the field closest to yours.';
    if (step === 2 && !prefs.goals.length) return 'Pick at least one thing you want from Connected.';
    if (step === 2 && prefs.goals.includes('other') && !prefs.goalOther.trim()) return 'Tell us briefly what you’re looking for.';
    if (step === PROFILE_STEP && !profile.name.trim()) return 'Add your first name so people know what to call you.';
    if (step === PROFILE_STEP && !profile.status) return 'Choose the option that describes you best.';
    return '';
  }

  function next() {
    const e = validate();
    setErr(e);
    if (e) return;
    if (edit === 'prefs' && step === LAST_PREF_STEP) return router.back();
    if (edit === 'profile') return router.back();
    if (step === PROFILE_STEP) {
      app.finishOnboarding();
      return router.replace('/');
    }
    setStep(step + 1);
  }

  function back() {
    setErr('');
    if (edit && (step === 1 || edit === 'profile')) return router.back();
    setStep(Math.max(1, step - 1));
  }

  if (step === 0) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={[styles.pad, { paddingTop: insets.top + S.xl, paddingBottom: insets.bottom + S.xl, gap: S.xl }]}>
        <View style={styles.brand}>
          <Ionicons name="people-circle" size={26} color={C.accent} />
          <Text style={styles.brandText}>Connected.</Text>
        </View>
        <View style={{ gap: S.md }}>
          <Text style={[T.title, { fontSize: 30 }]} accessibilityRole="header">Find the right people around you.</Text>
          <Text style={T.muted}>
            Some people can text a parent, a professor or an old boss for career advice. Many can{"'"}t. Connected shows you people nearby in your field who have said they{"'"}re happy to talk, and helps you write the first message.
          </Text>
        </View>
        <View style={{ gap: S.lg }}>
          {[
            ['options-outline', 'Tell us what you’re looking for', 'Your field, goals and how far you’ll travel. Your profile comes after.'],
            ['map-outline', 'See who’s nearby in Charlotte', 'Only people who opted in. Pins show a rough area, never a live location.'],
            ['chatbubble-ellipses-outline', 'Send a short, friendly request', 'We suggest an opener. You edit it, and nothing sends until you tap Send.'],
          ].map(([icon, t, d]) => (
            <View key={t} style={{ flexDirection: 'row', gap: S.md }}>
              <View style={styles.howIcon}><Ionicons name={icon as 'map-outline'} size={20} color={C.accent} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.label}>{t}</Text>
                <Text style={T.small}>{d}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ gap: S.sm }}>
          <Button label="Get started" onPress={() => setStep(1)} />
          <Button label="Try it with a sample profile" variant="secondary" onPress={() => { app.loadSample(); router.replace('/'); }} />
          <Text style={[T.small, { textAlign: 'center' }]}>The people and events in this build are demo data.</Text>
        </View>
      </ScrollView>
    );
  }

  const totalSteps = PROFILE_STEP;
  const isLast = edit === 'prefs' ? step === LAST_PREF_STEP : edit === 'profile' || step === PROFILE_STEP;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.pad, { paddingTop: insets.top + S.md, gap: S.sm }]}>
        {edit ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={T.small}>{edit === 'profile' ? 'Edit profile' : `Edit preferences · ${step} of ${LAST_PREF_STEP}`}</Text>
            <Button label="Cancel" variant="quiet" small onPress={() => router.back()} />
          </View>
        ) : (
          <>
            <View style={styles.progress} accessibilityLabel={`Step ${step} of ${totalSteps}`}>
              {Array.from({ length: totalSteps }, (_, i) => <View key={i} style={[styles.bar, i < step && { backgroundColor: C.accent }]} />)}
            </View>
            <Text style={T.small}>{step < PROFILE_STEP ? `Step ${step} of ${totalSteps} · Preferences` : `Step ${step} of ${totalSteps} · Profile`}</Text>
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.pad, { paddingTop: S.lg, paddingBottom: 120, gap: S.xl }]} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            <Header title="What are you into?" sub="This decides who shows up on your map. You can change it anytime." />
            <Group label="Your field">
              <ChipGroup options={FIELDS} selected={prefs.field ? [prefs.field] : []} onToggle={(id) => { setPrefs({ field: id }); setErr(''); }} />
            </Group>
            <Group label="Interests" hint="Pick a few">
              <View style={styles.chips}>
                {INTERESTS.map((i) => <Chip key={i} label={i} selected={prefs.interests.includes(i)} onPress={() => setPrefs({ interests: toggle(prefs.interests, i) })} />)}
              </View>
            </Group>
            <Group label="Skills" hint="What you're good at, or learning">
              <View style={styles.chips}>
                {[...SKILLS, ...prefs.skills.filter((s) => !SKILLS.includes(s))].map((s) => (
                  <Chip key={s} label={s} selected={prefs.skills.includes(s)} onPress={() => setPrefs({ skills: toggle(prefs.skills, s) })} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: S.sm }}>
                <TextInput
                  value={customSkill}
                  onChangeText={setCustomSkill}
                  placeholder="Add another skill"
                  placeholderTextColor={C.ink3}
                  style={[styles.input, { flex: 1 }]}
                  accessibilityLabel="Add another skill"
                  returnKeyType="done"
                  onSubmitEditing={() => { const s = customSkill.trim(); if (s && !prefs.skills.includes(s)) setPrefs({ skills: [...prefs.skills, s] }); setCustomSkill(''); }}
                />
                <Button label="Add" variant="secondary" small onPress={() => { const s = customSkill.trim(); if (s && !prefs.skills.includes(s)) setPrefs({ skills: [...prefs.skills, s] }); setCustomSkill(''); }} />
              </View>
            </Group>
          </>
        )}

        {step === 2 && (
          <>
            <Header title="What do you want from Connected?" sub="Pick everything that applies." />
            <View style={{ gap: S.sm }}>
              {GOALS.map((g) => (
                <Choice key={g.id} multi title={g.label} hint={g.hint} selected={prefs.goals.includes(g.id)} onPress={() => { setPrefs({ goals: toggle<GoalId>(prefs.goals, g.id) }); setErr(''); }} />
              ))}
            </View>
            {prefs.goals.includes('other') && (
              <Group label="What are you looking for?">
                <TextInput value={prefs.goalOther} onChangeText={(t) => setPrefs({ goalOther: t })} placeholder="e.g. Finding a study group for the CPA exam" placeholderTextColor={C.ink3} style={styles.input} accessibilityLabel="What are you looking for?" />
              </Group>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Header title="How far would you go to meet someone?" sub="We'll show people and events within this distance." />
            <Segmented label="Travel distance" options={TRAVEL_MI.map((m) => ({ id: m, label: `${m} mi` }))} value={prefs.travelMi} onChange={(v) => setPrefs({ travelMi: v })} />
            <Group label="Are you here to get help, give it, or both?">
              <View style={{ gap: S.sm }}>
                <Choice title="Looking for connections" hint="Advice, mentors, peers" selected={prefs.mode === 'seeking'} onPress={() => setPrefs({ mode: 'seeking' })} />
                <Choice title="Offering help" hint="Share what you know with people starting out" selected={prefs.mode === 'offering'} onPress={() => setPrefs({ mode: 'offering' })} />
                <Choice title="Both" selected={prefs.mode === 'both'} onPress={() => setPrefs({ mode: 'both' })} />
              </View>
            </Group>
          </>
        )}

        {step === 4 && (
          <>
            <Header title="How visible do you want to be?" sub="You're in control, and you can change this later in Profile." />
            <Note icon="navigate-circle-outline" tone="accent">
              Connected asks for your location only while the app is open, to center the map near you. It’s never tracked in the background, and other people never see your exact position.
            </Note>
            <Group label="When you meet people, share">
              <View style={{ gap: S.sm }}>
                <Choice title="My approximate area" hint="Like 'South End'. Your pin is placed at the neighborhood, not your address." selected={prefs.shareMode === 'area'} onPress={() => setPrefs({ shareMode: 'area' })} />
                <Choice title="Only a public meeting place" hint="No area at all. You choose a library, café or campus spot when you meet." selected={prefs.shareMode === 'public'} onPress={() => setPrefs({ shareMode: 'public' })} />
              </View>
            </Group>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.label}>Show me in nearby discovery</Text>
                <Text style={T.small}>Others who match can find your profile. Turn it off anytime.</Text>
              </View>
              <Switch value={prefs.discoverable} onValueChange={(v) => setPrefs({ discoverable: v })} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Show me in nearby discovery" />
            </View>
          </>
        )}

        {step === PROFILE_STEP && (
          <>
            <Header title={edit ? 'Your profile' : 'Last step: a bit about you'} sub="Keep it short. People see this when you send them a request." />
            <Field label="First name">
              <TextInput value={profile.name} onChangeText={(t) => { setProfile({ name: t }); setErr(''); }} placeholder="Alex" placeholderTextColor={C.ink3} style={styles.input} autoComplete="given-name" accessibilityLabel="First name" />
            </Field>
            <Group label="Where are you right now?">
              <ChipGroup options={STATUSES} selected={profile.status ? [profile.status] : []} onToggle={(id) => { setProfile({ status: id }); setErr(''); }} />
            </Group>
            <Field label="School or organization" hint="Optional">
              <TextInput value={profile.org} onChangeText={(t) => setProfile({ org: t })} placeholder="UNC Charlotte" placeholderTextColor={C.ink3} style={styles.input} accessibilityLabel="School or organization, optional" />
            </Field>
            <Field label="A short intro" hint={`${profile.intro.length}/280`}>
              <TextInput
                value={profile.intro}
                onChangeText={(t) => setProfile({ intro: t.slice(0, 280) })}
                placeholder="What you're working toward, and what you could help others with."
                placeholderTextColor={C.ink3}
                style={[styles.input, { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 }]}
                multiline
                accessibilityLabel="A short intro"
              />
            </Field>
          </>
        )}
        {err ? <Text style={styles.err} accessibilityRole="alert">{err}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + S.md }]}>
        {step > 1 || edit ? <Button label="Back" variant="secondary" onPress={back} /> : null}
        <Button label={isLast ? (edit ? 'Save' : 'Show me the map') : 'Continue'} onPress={next} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={{ gap: S.sm }}>
      <Text style={T.title} accessibilityRole="header">{title}</Text>
      <Text style={T.muted}>{sub}</Text>
    </View>
  );
}
function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: S.md }}>
      <Text style={T.label}>{label}{hint ? <Text style={[T.small, { fontWeight: '400' }]}>  {hint}</Text> : null}</Text>
      {children}
    </View>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={T.label}>{label}</Text>
        {hint ? <Text style={T.small}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: S.lg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: S.sm },
  brandText: { fontSize: 20, fontWeight: '700', color: C.ink },
  howIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: C.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line2, borderRadius: R.sm, paddingHorizontal: S.md, fontSize: 16, color: C.ink, backgroundColor: C.bg },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.lg, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  err: { color: C.bad, fontWeight: '600', fontSize: 15 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: S.sm, paddingHorizontal: S.lg, paddingTop: S.md, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
});
