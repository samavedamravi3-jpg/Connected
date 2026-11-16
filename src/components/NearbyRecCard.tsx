import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Avatar, Button, Tag } from '@/components/ui';
import { distanceText, explainRec, type NearbyRec } from '@/lib/nearbyPolicy';
import { C, R, S, T, shadow } from '@/theme';

type Props = { rec: NearbyRec; onView: () => void; onNotNow: () => void; onMute: () => void };

/** "You should connect": the in-app recommendation. Text comes only from what the server said you share. */
export function NearbyRecCard({ rec, onView, onNotNow, onMute }: Props) {
  const first = rec.name.split(/\s+/)[0] || rec.name;
  return (
    <Animated.View entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(160)} style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.head}>
        <Avatar name={rec.name} size={40} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={T.label}>You should connect</Text>
          <View style={styles.meta}>
            <Ionicons name="location-outline" size={14} color={C.ink3} />
            <Text style={T.small}>{distanceText(rec.distanceBucketMi)}</Text>
          </View>
        </View>
        {rec.demo ? <Tag label="Demo" icon="flask-outline" /> : null}
      </View>
      <Text style={styles.body}>{explainRec(rec)}</Text>
      {rec.demo ? <Text style={T.small}>Simulated for the demo: a sample profile, not a real member.</Text> : null}
      <View style={styles.actions}>
        <Button label="View profile" small icon="person-outline" onPress={onView} style={{ flexGrow: 1 }} />
        <Button label="Not now" small variant="secondary" onPress={onNotNow} />
      </View>
      {rec.demo ? null : <Button label={`Mute alerts for ${first}`} small variant="quiet" icon="notifications-off-outline" onPress={onMute} accessibilityHint="Stops recommendations about this person on this phone. They aren't told." />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.accentLine, padding: S.md, gap: S.sm, ...shadow },
  head: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  body: { ...T.body, fontSize: 15, lineHeight: 21, color: C.ink },
  actions: { flexDirection: 'row', gap: S.sm, flexWrap: 'wrap' },
});
