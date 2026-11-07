import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { availabilityLabel, fieldLabel, venueById } from '@/data/options';
import type { NearbyPerson, Prefs, Profile } from '@/data/types';
import { approxDistance } from '@/lib/geo';
import { canSeeDoor, doorActive, doorState, matchReasons } from '@/lib/match';
import { fmtTime, fmtWindow } from '@/lib/time';
import { C, R, S, T, shadow } from '@/theme';
import { Avatar, Button, DemoTag, IconButton } from './ui';

type Props = {
  person: NearbyPerson;
  distanceFromLabel: string;
  prefs: Prefs;
  profile: Profile;
  onOpen: () => void;
  onClose: () => void;
};

/** Compact card shown over the map for the selected pin. */
export function PersonCard({ person: p, distanceFromLabel, prefs, profile, onOpen, onClose }: Props) {
  const reason = matchReasons(p, prefs)[0];
  const door = p.door && doorActive(p.door) ? p.door : undefined;
  const seeDoor = door ? canSeeDoor(door, p, prefs, profile) : false;

  return (
    <View style={[styles.card, shadow]} accessibilityViewIsModal={false}>
      <View style={styles.head}>
        <Avatar name={p.name} size={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={T.h3} numberOfLines={1}>{p.name}</Text>
          <Text style={T.small} numberOfLines={1}>{p.role} · {p.org}</Text>
        </View>
        <IconButton icon="close" label="Close profile card" onPress={onClose} style={{ marginTop: -6, marginRight: -8 }} />
      </View>

      <View style={styles.metaRow}>
        <Meta icon="briefcase-outline" text={fieldLabel(p.field)} />
        <Meta icon="navigate-outline" text={`${approxDistance(p.distanceMi)} ${distanceFromLabel}`} />
        <Meta icon="time-outline" text={p.availability.map(availabilityLabel).join(', ')} />
      </View>

      {door ? (
        <View style={styles.door}>
          <Ionicons name="enter-outline" size={18} color={C.accent} />
          <Text style={[T.small, { color: C.ink, flex: 1, fontSize: 14 }]}>
            {seeDoor
              ? `Open Door ${doorState(door) === 'live' ? `now until ${fmtTime(door.end)}` : fmtWindow(door.start, door.end).toLowerCase()} at ${venueById(door.venueId).name}`
              : 'Has an Open Door for a different group today'}
          </Text>
        </View>
      ) : null}

      <Text style={[T.body, { fontSize: 15, lineHeight: 21 }]} numberOfLines={2}>
        <Text style={{ fontWeight: '600' }}>Can help with: </Text>
        {p.helpsWith.slice(0, 2).join('; ')}
      </Text>

      <View style={styles.tags}>
        {p.interests.slice(0, 3).map((i) => (
          <Text key={i} style={[styles.pill, prefs.interests.includes(i) && styles.pillShared]}>{i}</Text>
        ))}
        {p.skills.slice(0, 2).map((s) => (
          <Text key={s} style={[styles.pill, styles.skill]}>{s}</Text>
        ))}
      </View>

      {reason ? (
        <Text style={[T.small, { color: C.accent }]} numberOfLines={1}>
          <Ionicons name="sparkles-outline" size={13} color={C.accent} /> {reason}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: S.sm }}>
        <Button label="View profile" onPress={onOpen} style={{ flex: 1 }} />
        <DemoTag />
      </View>
    </View>
  );
}

function Meta({ icon, text }: { icon: 'briefcase-outline' | 'navigate-outline' | 'time-outline'; text: string }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={14} color={C.ink3} />
      <Text style={[T.small, { fontSize: 13 }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.bg, borderRadius: R.lg, padding: S.lg, gap: S.md, borderWidth: 1, borderColor: C.line },
  head: { flexDirection: 'row', gap: S.md, alignItems: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: S.md, rowGap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  door: { flexDirection: 'row', gap: S.sm, alignItems: 'center', backgroundColor: C.accentSoft, borderRadius: R.sm, padding: S.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { fontSize: 13, color: C.ink2, backgroundColor: C.bg2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  pillShared: { backgroundColor: C.accentSoft, color: C.accent, fontWeight: '600' },
  skill: { backgroundColor: C.blueSoft, color: C.blue },
});
