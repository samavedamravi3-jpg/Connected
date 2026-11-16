import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useExperienceFlow } from '@/components/ExperienceFlow';
import { Button } from '@/components/ui';
import { fmtRange, sortExperiences } from '@/lib/experience';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

/** Share of a basic profile that is filled in, with what is still missing (shown as the next step). */
function completeness(app: ReturnType<typeof useApp>) {
  const { profile, prefs } = app;
  const items = [
    { ok: !!profile.photoUri, todo: 'Add a photo' },
    { ok: !!profile.intro.trim(), todo: 'Write a short intro' },
    { ok: !!prefs.field, todo: 'Pick your field' },
    { ok: !!profile.org.trim(), todo: 'Add your school or workplace' },
    { ok: prefs.experience.length > 0, todo: 'Add your experience' },
    { ok: prefs.interests.length + prefs.skills.length > 0, todo: 'Add skills or interests' },
  ];
  return { pct: Math.round((items.filter((i) => i.ok).length / items.length) * 100), next: items.find((i) => !i.ok)?.todo };
}

/** Resume & Experience, directly under the Profile header: meter, empty state or timeline, privacy toggle. */
export function ResumeExperienceCard() {
  const app = useApp();
  const flow = useExperienceFlow();
  const list = sortExperiences(app.prefs.experience);
  const { pct, next } = completeness(app);

  const confirmDelete = (id: string, title: string, org: string) =>
    Alert.alert('Delete this experience?', `${title} at ${org}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => app.removeExperience(id) },
    ]);

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={T.h2} accessibilityRole="header">Resume & Experience</Text>
        <Text style={styles.pct}>{pct}%</Text>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityLabel={`Profile ${pct}% complete`} accessibilityValue={{ min: 0, max: 100, now: pct }}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={T.small}>{next ? `Next: ${next}` : 'Your profile is complete.'}</Text>

      {list.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="briefcase-outline" size={28} color={C.ink3} />
          <Text style={T.h3}>Show where you’ve been</Text>
          <Text style={[T.muted, { textAlign: 'center' }]}>Jobs, internships and school help us find people who’ve walked your path.</Text>
          <View style={{ alignSelf: 'stretch', gap: S.sm }}>
            <Button label={flow.importing ? 'Reading your resume…' : 'Add resume (PDF)'} icon="document-text-outline" disabled={flow.importing} onPress={flow.importResume} />
            <Button label="Add experience" icon="add-outline" variant="secondary" onPress={() => flow.edit()} />
          </View>
          {flow.importing ? <ActivityIndicator color={C.accent} /> : null}
        </View>
      ) : (
        <View style={{ marginTop: S.sm }}>
          {list.map((e, k) => (
            <View key={e.id} style={styles.item}>
              <View style={styles.rail}>
                <View style={styles.dot} />
                {k < list.length - 1 ? <View style={styles.line} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2, paddingBottom: S.lg }}>
                <Text style={T.h3}>{e.title}</Text>
                <Text style={T.muted}>{e.org}</Text>
                <Text style={T.small}>{fmtRange(e)}</Text>
              </View>
              <Pressable onPress={() => flow.edit(e)} accessibilityRole="button" accessibilityLabel={`Edit ${e.title}`} style={styles.iconBtn}><Ionicons name="pencil-outline" size={20} color={C.ink2} /></Pressable>
              <Pressable onPress={() => confirmDelete(e.id, e.title, e.org)} accessibilityRole="button" accessibilityLabel={`Delete ${e.title}`} style={styles.iconBtn}><Ionicons name="trash-outline" size={20} color={C.ink2} /></Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: S.sm }}>
            <Button label="Add experience" icon="add-outline" variant="secondary" onPress={() => flow.edit()} style={{ flex: 1 }} />
            <Button label={flow.importing ? 'Reading…' : 'Import resume'} icon="document-text-outline" variant="secondary" disabled={flow.importing} onPress={flow.importResume} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      <View style={styles.privacy}>
        <Ionicons name={app.prefs.showExperience ? 'eye-outline' : 'eye-off-outline'} size={22} color={C.ink2} />
        <View style={{ flex: 1 }}>
          <Text style={T.label}>Show my experience</Text>
          <Text style={T.small}>{app.prefs.showExperience ? 'Signed-in members can see it on your profile.' : 'Private. It still improves your own matches.'}</Text>
        </View>
        <Switch value={app.prefs.showExperience} onValueChange={(v) => app.setPrefs({ showExperience: v })} accessibilityLabel="Show my experience" trackColor={{ true: C.accent, false: C.line2 }} />
      </View>
      {flow.modals}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: C.line, borderRadius: R.lg, backgroundColor: C.surface, padding: S.lg, gap: S.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pct: { fontSize: 15, fontWeight: '600', color: C.accent, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: C.bg2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: C.accent },
  empty: { alignItems: 'center', gap: S.sm, paddingVertical: S.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: S.sm },
  rail: { width: 16, alignItems: 'center', alignSelf: 'stretch', paddingTop: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  line: { flex: 1, width: 2, backgroundColor: C.line, marginTop: 2 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: S.md, borderTopWidth: 1, borderTopColor: C.line, paddingTop: S.md, marginTop: S.sm },
});
