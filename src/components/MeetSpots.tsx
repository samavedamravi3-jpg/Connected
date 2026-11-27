import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AREAS, FOODS, dietLabel, foodLabel } from '@/data/options';
import type { Area, DietId, Person } from '@/data/types';
import { firstName } from '@/lib/match';
import { directionsUrl, findMeetSpots, type MeetPlan, type MeetSpot } from '@/lib/places';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';
import { Button } from './ui';

type Props = {
  person: Person;
  /** Called with a spot when the user wants to propose it. Omit to hide the button. */
  onUse?: (spot: MeetSpot) => void;
  useLabel?: string;
  /** Called when the user wants to propose the area itself (so the other person can agree or pick another). */
  onSuggestArea?: (area: Area) => void;
};

/**
 * Meeting spots in an area YOU choose. Nothing is derived from either person's location: you pick a neighborhood
 * you're comfortable with, suggest it, and the other person can agree or choose a different one. Venues are public
 * places in that neighborhood serving food you both like.
 */
export function MeetSpots({ person, onUse, useLabel = 'Suggest this', onSuggestArea }: Props) {
  const app = useApp();
  const first = firstName(person.name);
  const [area, setArea] = useState<Area | null>(null);
  const diets = [...new Set<DietId>([...app.prefs.diet, ...person.diet])];
  const key = `${area?.id ?? ''}|${app.prefs.foods.join(',')}|${person.foods.join(',')}|${diets.join(',')}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; plan: MeetPlan } | null>(null);
  const loading = !!area && result?.key !== `${key}#${attempt}`;

  useEffect(() => {
    if (!area) return;
    let alive = true;
    // Both ends are the chosen neighborhood, so the search is centered there and never on a person.
    findMeetSpots(area.center, area.center, app.prefs.foods, person.foods, diets).then((plan) => {
      if (alive) setResult({ key: `${key}#${attempt}`, plan });
    });
    return () => { alive = false; };
    // `key` captures every input that changes the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const plan = area ? result?.plan : undefined;
  const shared = app.prefs.foods.filter((f) => person.foods.includes(f));

  return (
    <View style={{ gap: S.md }}>
      <View style={{ gap: 4 }}>
        <Text style={styles.step}>1 · Choose an area</Text>
        <Text style={T.small}>Pick a neighborhood you’re comfortable meeting in. {first} can agree or suggest a different one.</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
        {AREAS.map((a) => {
          const on = area?.id === a.id;
          return (
            <Pressable
              key={a.id}
              onPress={() => setArea(on ? null : a)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.areaChip, on && styles.areaChipOn]}
            >
              <Text style={[styles.areaText, on && { color: C.white }]}>{a.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {area && onSuggestArea ? (
        <Button label={`Suggest ${area.name} to ${first}`} icon="chatbubble-outline" variant="secondary" small onPress={() => onSuggestArea(area)} />
      ) : null}

      {area ? (
        <>
          <View style={{ gap: 4 }}>
            <Text style={styles.step}>2 · Public places in {area.name}</Text>
            {shared.length ? (
              <View style={styles.sharedRow}>
                <Text style={T.small}>You both like</Text>
                {shared.map((f) => (
                  <View key={f} style={styles.foodChip}>
                    <Ionicons name={FOODS.find((x) => x.id === f)!.icon} size={13} color={C.accent} />
                    <Text style={styles.foodChipText}>{foodLabel(f)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={T.small}>You haven’t picked the same food yet, so here are easy cafés and libraries.</Text>
            )}
            {diets.length ? <Text style={T.small}>Suits: {diets.map((d) => dietLabel(d).toLowerCase()).join(', ')}</Text> : null}
          </View>

          {loading ? (
            <View style={{ gap: S.sm }} accessibilityLabel={`Finding places in ${area.name}`}>
              {[0, 1, 2].map((i) => <View key={i} style={styles.skeleton} />)}
            </View>
          ) : plan && plan.spots.length ? (
            <View>
              {plan.spots.map((s, k) => (
                <View key={s.id} style={[styles.spot, k > 0 && styles.divider]}>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={styles.spotName} numberOfLines={1}>{s.name}</Text>
                    <Text style={T.small} numberOfLines={1}>{s.kind}{s.area ? ` · ${s.area}` : ''}</Text>
                    {s.dietOk.length ? <Text style={styles.diet}>✓ {s.dietOk.map((d) => dietLabel(d)).join(', ')}</Text> : null}
                    <View style={styles.actions}>
                      <Button label="Directions" icon="navigate-outline" variant="secondary" small onPress={() => Linking.openURL(directionsUrl(s, Platform.OS === 'ios'))} />
                      {onUse ? <Button label={useLabel} variant="secondary" small onPress={() => onUse(s)} /> : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={T.small}>No places found in {area.name} right now.</Text>
              <Button label="Try again" variant="secondary" small onPress={() => setAttempt((n) => n + 1)} />
            </View>
          )}
          {diets.length && plan?.spots.some((s) => s.source === 'osm' && s.dietOk.length < diets.filter((d) => d !== 'no_alcohol').length) && !loading ? (
            <Text style={T.small}>Not every place lists dietary options, so check the menu first.</Text>
          ) : null}
        </>
      ) : null}

      <Pressable onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')} accessibilityRole="link">
        <Text style={styles.attrib}>Places from OpenStreetMap (© contributors). We only search the neighborhood you choose, never anyone’s location.</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { fontSize: 13, fontWeight: '700', color: C.ink2, letterSpacing: 0.2 },
  areaChip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: R.pill, borderWidth: 1, borderColor: C.line2, backgroundColor: C.surface },
  areaChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  areaText: { fontSize: 14, fontWeight: '600', color: C.ink },
  sharedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  foodChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.sm },
  foodChipText: { fontSize: 13, fontWeight: '600', color: C.accent },
  skeleton: { height: 56, borderRadius: R.md, backgroundColor: C.bg2 },
  spot: { paddingVertical: S.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line2 },
  spotName: { fontSize: 16, fontWeight: '600', color: C.ink },
  diet: { fontSize: 12, color: C.ok, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: S.sm, marginTop: 6 },
  emptyBox: { gap: S.sm, alignItems: 'flex-start', padding: S.md, borderRadius: R.md, backgroundColor: C.bg2 },
  attrib: { fontSize: 11, color: C.ink3, lineHeight: 15 },
});
