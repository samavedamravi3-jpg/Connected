import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip, Note, Segmented, Tag } from '@/components/ui';
import { CHARLOTTE_CENTER, EVENT_CATEGORIES, TRAVEL_MI } from '@/data/options';
import { dataSource } from '@/data/source';
import type { CommunityEvent, EventCategory } from '@/data/types';
import { approxDistance, distanceMi } from '@/lib/geo';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

type When = 'any' | 'week' | 'month';
const CAT_ICON: Record<EventCategory, 'people-outline' | 'briefcase-outline' | 'code-slash-outline'> = {
  networking: 'people-outline',
  career: 'briefcase-outline',
  hackathon: 'code-slash-outline',
};

export default function Events() {
  const app = useApp();
  const [all, setAll] = useState<CommunityEvent[] | null>(null);
  const [cats, setCats] = useState<EventCategory[]>([]);
  const [when, setWhen] = useState<When>('any');
  const [maxMi, setMaxMi] = useState(25);
  const [savedOnly, setSavedOnly] = useState(false);

  useEffect(() => { dataSource.listEvents().then(setAll); }, []);

  const list = useMemo(() => {
    if (!all) return [];
    const now = app.now;
    const limit = when === 'week' ? now + 7 * 864e5 : when === 'month' ? now + 31 * 864e5 : Infinity;
    return all
      .map((e) => ({ ...e, mi: distanceMi(CHARLOTTE_CENTER, e.coord) }))
      .filter((e) => (!cats.length || cats.includes(e.category)) && e.start <= limit && e.mi <= maxMi && (!savedOnly || app.savedEvents.includes(e.id)))
      .sort((a, b) => a.start - b.start);
  }, [all, cats, when, maxMi, savedOnly, app.savedEvents, app.now]);

  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      data={list}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ padding: S.lg, gap: S.md, paddingBottom: S.xxl }}
      ListHeaderComponent={
        <View style={{ gap: S.md, marginBottom: S.sm }}>
          <Text style={T.muted}>Networking nights, career events and hackathons around Charlotte. Distances are from Uptown.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
            {EVENT_CATEGORIES.map((c) => (
              <Chip key={c.id} label={c.label} icon={CAT_ICON[c.id]} selected={cats.includes(c.id)} onPress={() => setCats((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))} />
            ))}
            <Chip label="Saved" icon="bookmark-outline" selected={savedOnly} onPress={() => setSavedOnly((v) => !v)} />
          </ScrollView>
          <Segmented label="Date" options={[{ id: 'any' as When, label: 'Any date' }, { id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }]} value={when} onChange={setWhen} />
          <Segmented label="Distance" options={TRAVEL_MI.map((m) => ({ id: m, label: `${m} mi` }))} value={maxMi} onChange={setMaxMi} />
          <Note icon="flask-outline">Demo events. No event service is connected yet, so these are examples, not real listings.</Note>
        </View>
      }
      ListEmptyComponent={
        all ? (
          <View style={{ alignItems: 'center', gap: S.sm, paddingVertical: S.xl }}>
            <Ionicons name="calendar-clear-outline" size={32} color={C.ink3} />
            <Text style={T.h3}>Nothing matches</Text>
            <Text style={T.small}>Try a wider distance or a different date.</Text>
          </View>
        ) : (
          <ActivityIndicator color={C.accent} />
        )
      }
      renderItem={({ item: e }) => {
        const d = new Date(e.start);
        const saved = app.savedEvents.includes(e.id);
        return (
          <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: e.id } })} accessibilityRole="button" style={({ pressed }) => [styles.card, pressed && { backgroundColor: C.bg2 }]}>
            <View style={styles.date}>
              <Text style={styles.month}>{d.toLocaleDateString([], { month: 'short' }).toUpperCase()}</Text>
              <Text style={styles.day}>{d.getDate()}</Text>
            </View>
            <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
              <Text style={T.h3}>{e.title}</Text>
              <Text style={T.small}>{dayLabel(e.start)} · {fmtTime(e.start)} · {e.cost}</Text>
              <Text style={T.small} numberOfLines={1}>{e.venue}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <Tag label={EVENT_CATEGORIES.find((c) => c.id === e.category)!.label} icon={CAT_ICON[e.category]} tone={e.category === 'hackathon' ? 'blue' : 'neutral'} />
                <Tag label={approxDistance(e.mi)} icon="navigate-outline" />
                {saved ? <Tag label="Saved" tone="accent" icon="bookmark" /> : null}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: S.md, padding: S.md, borderRadius: R.md, borderWidth: 1, borderColor: C.line },
  date: { width: 52, alignItems: 'center', paddingVertical: 6, borderRadius: R.sm, backgroundColor: C.bg2 },
  month: { fontSize: 11, fontWeight: '700', color: C.accent, letterSpacing: 0.6 },
  day: { fontSize: 22, fontWeight: '700', color: C.ink },
});
