import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, Row } from '@/components/ui';
import type { Experience } from '@/data/types';
import { EXP_LIMITS, experienceTexts, fmtRange, parseMonth, validateExperience } from '@/lib/experience';
import { allowed, allowedNow } from '@/lib/guard';
import { C, R, S, T } from '@/theme';

const toField = (m: string | null) => (m ? `${m.slice(5)}/${m.slice(0, 4)}` : '');

/** Add or edit one experience. Text is checked by our moderation before it is handed to `onSave`. */
export function ExperienceEditor({ initial, onSave, onClose }: { initial: Experience; onSave: (e: Experience) => void; onClose: () => void }) {
  const [e, setE] = useState<Experience>(initial);
  const [startText, setStartText] = useState(toField(initial.start));
  const [endText, setEndText] = useState(toField(initial.end));
  const [current, setCurrent] = useState(initial.end === null);
  const [skill, setSkill] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const addSkill = () => {
    const s = skill.trim().slice(0, EXP_LIMITS.skill);
    if (!s) return;
    if (!allowedNow(s)) return;
    if (e.skills.length >= EXP_LIMITS.skills) return setErr('Up to 15 skills.');
    if (!e.skills.some((x) => x.toLowerCase() === s.toLowerCase())) setE({ ...e, skills: [...e.skills, s] });
    setSkill('');
  };

  const save = async () => {
    const start = parseMonth(startText) ?? '';
    const end = current ? null : parseMonth(endText);
    if (!current && !end) return setErr('Add an end date like 08/2023, or mark it as present.');
    const next: Experience = { ...e, title: e.title.trim(), org: e.org.trim(), description: e.description.trim(), start, end };
    const problem = validateExperience(next);
    if (problem) return setErr(problem);
    setBusy(true);
    const ok = await allowed(...experienceTexts(next));
    setBusy(false);
    if (ok) onSave(next);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: S.xxl }} keyboardShouldPersistTaps="handled">
          <Text style={T.h2} accessibilityRole="header">{initial.title ? 'Edit experience' : 'Add experience'}</Text>

          <Field label="Title">
            <TextInput value={e.title} onChangeText={(t) => { setE({ ...e, title: t }); setErr(''); }} placeholder="Risk Analyst" placeholderTextColor={C.ink3} style={styles.input} maxLength={EXP_LIMITS.title} accessibilityLabel="Title" />
          </Field>
          <Field label="Organization">
            <TextInput value={e.org} onChangeText={(t) => { setE({ ...e, org: t }); setErr(''); }} placeholder="Company, school or program" placeholderTextColor={C.ink3} style={styles.input} maxLength={EXP_LIMITS.org} accessibilityLabel="Organization" />
          </Field>
          <Row style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <View style={{ flex: 1, gap: S.xs }}>
              <Text style={T.label}>Start</Text>
              <TextInput value={startText} onChangeText={(t) => { setStartText(t); setErr(''); }} placeholder="06/2021" placeholderTextColor={C.ink3} style={styles.input} keyboardType="numbers-and-punctuation" accessibilityLabel="Start date, month and year" />
            </View>
            <View style={{ flex: 1, gap: S.xs }}>
              <Text style={T.label}>End</Text>
              <TextInput value={current ? '' : endText} editable={!current} onChangeText={(t) => { setEndText(t); setErr(''); }} placeholder={current ? 'Present' : '08/2023'} placeholderTextColor={C.ink3} style={[styles.input, current && { backgroundColor: C.bg2 }]} keyboardType="numbers-and-punctuation" accessibilityLabel="End date, month and year" />
            </View>
          </Row>
          <View style={styles.switchRow}>
            <Text style={[T.body, { flex: 1 }]}>I currently work or study here</Text>
            <Switch value={current} onValueChange={(v) => { setCurrent(v); setErr(''); }} accessibilityLabel="I currently work or study here" trackColor={{ true: C.accent }} />
          </View>
          <Field label="What you did" hint={`${e.description.length}/${EXP_LIMITS.description}`}>
            <TextInput value={e.description} onChangeText={(t) => setE({ ...e, description: t })} placeholder="A sentence or two on what you worked on." placeholderTextColor={C.ink3} style={[styles.input, styles.area]} multiline maxLength={EXP_LIMITS.description} accessibilityLabel="Description" />
          </Field>
          <Field label="Skills used" hint={`${e.skills.length}/${EXP_LIMITS.skills}`}>
            <Row>
              {e.skills.map((s) => <Chip key={s} label={s} selected onPress={() => setE({ ...e, skills: e.skills.filter((x) => x !== s) })} />)}
            </Row>
            {e.skills.length ? <Text style={T.small}>Tap a skill to remove it.</Text> : null}
            <Row style={{ flexWrap: 'nowrap' }}>
              <TextInput value={skill} onChangeText={setSkill} placeholder="Add a skill" placeholderTextColor={C.ink3} style={[styles.input, { flex: 1 }]} returnKeyType="done" onSubmitEditing={addSkill} accessibilityLabel="Add a skill" />
              <Button label="Add" variant="secondary" onPress={addSkill} />
            </Row>
          </Field>

          {err ? <Text style={{ color: C.bad, fontSize: 14 }} accessibilityRole="alert">{err}</Text> : null}
          <Button label={busy ? 'Checking…' : 'Save'} onPress={save} disabled={busy} />
          <Button label="Cancel" variant="quiet" onPress={onClose} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Drafts from a resume. Nothing is saved until the user taps Save, after editing or removing entries. */
export function ResumeReview({ initial, onSaveAll, onClose }: { initial: Experience[]; onSaveAll: (xs: Experience[]) => void; onClose: () => void }) {
  const [drafts, setDrafts] = useState(initial);
  const [editing, setEditing] = useState<Experience | null>(null);
  const [busy, setBusy] = useState(false);

  const saveAll = async () => {
    const bad = drafts.find((d) => validateExperience(d));
    if (bad) return Alert.alert('Finish this entry first', `${bad.title || 'An entry'}: ${validateExperience(bad)}`);
    setBusy(true);
    const ok = await allowed(...drafts.flatMap(experienceTexts));
    setBusy(false);
    if (ok) onSaveAll(drafts);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: S.xxl }}>
          <Text style={T.h2} accessibilityRole="header">Review what we found</Text>
          <Text style={T.muted}>Resume import can make mistakes. Edit or remove anything that’s off. Nothing is saved until you tap Save.</Text>
          {drafts.map((d) => {
            const problem = validateExperience(d);
            return (
              <Card key={d.id} style={{ gap: S.xs }}>
                <Text style={T.h3}>{d.title}</Text>
                <Text style={T.muted}>{d.org}{d.start ? ` · ${fmtRange(d)}` : ''}</Text>
                {problem ? <Text style={{ color: C.warn, fontSize: 13 }}>Needs a fix: {problem}</Text> : null}
                <Row style={{ marginTop: S.xs }}>
                  <Button label="Edit" variant="secondary" small onPress={() => setEditing(d)} />
                  <Button label="Remove" variant="danger" small onPress={() => setDrafts(drafts.filter((x) => x.id !== d.id))} />
                </Row>
              </Card>
            );
          })}
          {!drafts.length ? <Text style={T.muted}>Nothing left to save.</Text> : null}
          <Button label={busy ? 'Checking…' : `Save ${drafts.length} ${drafts.length === 1 ? 'entry' : 'entries'}`} onPress={saveAll} disabled={busy || !drafts.length} />
          <Button label="Discard" variant="quiet" onPress={onClose} />
        </ScrollView>
        {editing ? (
          <ExperienceEditor
            initial={editing}
            onClose={() => setEditing(null)}
            onSave={(x) => { setDrafts((ds) => ds.map((d) => (d.id === x.id ? x : d))); setEditing(null); }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: S.xs }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={T.label}>{label}</Text>
        {hint ? <Text style={T.small}>{hint}</Text> : null}
      </Row>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1.5, borderColor: C.line, borderRadius: R.md, paddingHorizontal: S.md, fontSize: 16, color: C.ink, backgroundColor: C.bg },
  area: { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: S.md },
});
