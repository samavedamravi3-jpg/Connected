import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Switch, Text, View } from 'react-native';
import { ExperienceEditor, ResumeReview } from '@/components/ExperienceEditor';
import { StepTitle } from '@/components/OnboardingParts';
import { Button, Card, Note } from '@/components/ui';
import type { Experience } from '@/data/types';
import { emptyExperience, fmtRange, sortExperiences } from '@/lib/experience';
import { importResumePdf } from '@/lib/resumeImport';
import { useApp } from '@/state/AppState';
import { C, S, T } from '@/theme';

/**
 * Shared by onboarding and the Profile card: resume import (with a friendly manual-entry fallback) plus the
 * add/edit and review modals. Render `modals` once next to the buttons that call `importResume` / `edit`.
 */
export function useExperienceFlow(): { importing: boolean; importResume: () => Promise<void>; edit: (e?: Experience) => void; modals: ReactNode } {
  const app = useApp();
  const [editing, setEditing] = useState<Experience | null>(null);
  const [drafts, setDrafts] = useState<Experience[] | null>(null);
  const [importing, setImporting] = useState(false);

  const importResume = async () => {
    setImporting(true);
    const res = await importResumePdf().catch(() => ({ status: 'unavailable' as const, message: 'Something went wrong reading that file. You can add your experience by hand instead.' }));
    setImporting(false);
    if (res.status === 'cancelled') return;
    if (res.status === 'ok') return setDrafts(res.drafts);
    Alert.alert('Couldn’t import', res.message, [{ text: 'Add by hand', onPress: () => setEditing(emptyExperience()) }, { text: 'Not now', style: 'cancel' }]);
  };

  const modals = (
    <>
      {editing ? <ExperienceEditor initial={editing} onClose={() => setEditing(null)} onSave={(e) => { app.saveExperiences([e]); setEditing(null); }} /> : null}
      {drafts ? <ResumeReview initial={drafts} onClose={() => setDrafts(null)} onSaveAll={(xs) => { app.saveExperiences(xs); setDrafts(null); }} /> : null}
    </>
  );
  return { importing, importResume, edit: (e) => setEditing(e ?? emptyExperience()), modals };
}

const ONBOARDING_MAX = 3;

/** Two optional onboarding steps. Both are skippable from the footer. */
export function ExperienceStep({ mode }: { mode: 'resume' | 'experience' }) {
  const app = useApp();
  const flow = useExperienceFlow();
  const list = sortExperiences(app.prefs.experience);
  const full = list.length >= ONBOARDING_MAX;

  if (mode === 'resume') {
    return (
      <>
        <StepTitle icon="document-text-outline" section="Your background" title="Import your resume" sub="Optional. We read a PDF and suggest roles for you to review. Nothing is saved until you confirm." />
        <Button label={flow.importing ? 'Reading your resume…' : 'Choose a PDF'} icon="document-text-outline" disabled={flow.importing} onPress={flow.importResume} />
        {flow.importing ? <ActivityIndicator color={C.accent} /> : null}
        <Button label="Add by hand instead" variant="secondary" onPress={() => flow.edit()} />
        {list.length ? <Note tone="accent" icon="checkmark-circle-outline">{list.length} {list.length === 1 ? 'role' : 'roles'} added. Tap Continue to review or add more.</Note> : null}
        <Text style={T.small}>The PDF text goes to our assistant server only to be read, and isn’t stored.</Text>
        {flow.modals}
      </>
    );
  }
  return (
    <>
      <StepTitle icon="briefcase-outline" section="Your background" title="Add your experience" sub="Optional. Up to 3 jobs, internships or schools. The roles and skills you list help us find people who’ve been where you are." />
      {list.map((e) => (
        <Card key={e.id} style={{ gap: S.xs }}>
          <Text style={T.h3}>{e.title}</Text>
          <Text style={T.muted}>{e.org} · {fmtRange(e)}</Text>
          <View style={{ flexDirection: 'row', gap: S.sm, marginTop: S.xs }}>
            <Button label="Edit" variant="secondary" small onPress={() => flow.edit(e)} />
            <Button label="Delete" variant="danger" small onPress={() => app.removeExperience(e.id)} />
          </View>
        </Card>
      ))}
      <Button label={full ? 'Up to 3 for now' : 'Add experience'} icon="add" variant={list.length ? 'secondary' : 'primary'} disabled={full} onPress={() => flow.edit()} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.md }}>
        <View style={{ flex: 1 }}>
          <Text style={T.label}>Show my experience</Text>
          <Text style={T.small}>Off by default. Turn on to let signed-in members see these on your profile. They still improve your own matches.</Text>
        </View>
        <Switch value={app.prefs.showExperience} onValueChange={(v) => app.setPrefs({ showExperience: v })} accessibilityLabel="Show my experience" trackColor={{ true: C.accent }} />
      </View>
      {flow.modals}
    </>
  );
}
