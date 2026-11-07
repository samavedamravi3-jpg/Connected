import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { Button, KV, Note, Row, Tag } from '@/components/ui';
import { CHARLOTTE_CENTER, EVENT_CATEGORIES, fieldLabel } from '@/data/options';
import { dataSource } from '@/data/source';
import { approxDistance, distanceMi } from '@/lib/geo';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, S, T } from '@/theme';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const e = dataSource.getEvent(id);
  if (!e) return <Text style={[T.body, { padding: S.lg }]}>Event not found.</Text>;
  const saved = app.savedEvents.includes(e.id);
  const multiDay = dayLabel(e.start) !== dayLabel(e.end);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, gap: S.xl }}>
      <Stack.Screen options={{ title: EVENT_CATEGORIES.find((c) => c.id === e.category)?.label ?? 'Event' }} />
      <View style={{ gap: S.sm }}>
        <Text style={T.title} accessibilityRole="header">{e.title}</Text>
        <Row>
          <Tag label="Demo event" icon="flask-outline" />
          {e.field ? <Tag label={fieldLabel(e.field)} /> : null}
        </Row>
      </View>
      <View style={{ gap: S.sm }}>
        <KV k="When" v={multiDay ? `${dayLabel(e.start)} ${fmtTime(e.start)} to ${dayLabel(e.end)} ${fmtTime(e.end)}` : `${dayLabel(e.start)}, ${fmtTime(e.start)}–${fmtTime(e.end)}`} />
        <KV k="Where" v={e.venue} />
        <KV k="Distance" v={`${approxDistance(distanceMi(CHARLOTTE_CENTER, e.coord))} from Uptown`} />
        <KV k="Cost" v={e.cost} />
        <KV k="Hosted by" v={e.host} />
      </View>
      <Text style={T.body}>{e.description}</Text>
      <View style={{ gap: S.sm }}>
        <Button label={saved ? 'Saved to my plans' : 'Save to my plans'} icon={saved ? 'bookmark' : 'bookmark-outline'} variant={saved ? 'secondary' : 'primary'} onPress={() => app.toggleSavedEvent(e.id)} />
        <Button label="Find people in this field nearby" variant="secondary" icon="map-outline" onPress={() => router.navigate('/')} />
      </View>
      <Note icon="information-circle-outline">Saving is private. Connected never shows who is going to an event.</Note>
    </ScrollView>
  );
}
