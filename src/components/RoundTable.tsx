import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { C } from '@/theme';
import { Avatar } from './ui';

type Seat = { name: string; uri?: string | null; you?: boolean };

/**
 * People as portraits around a shared table; open seats are dashed circles.
 * Seats fill clockwise from the top. Purely visual: names are given by the screen around it.
 */
export function RoundTable({ seats, people, size = 220, icon = 'cafe-outline', animate = true }: {
  seats: number;
  people: Seat[];
  size?: number;
  icon?: ComponentProps<typeof Ionicons>['name'];
  animate?: boolean;
}) {
  const avatar = Math.round(size * 0.24);
  const table = size - avatar * 1.35;
  const r = size / 2 - avatar / 2;
  return (
    <View style={{ width: size, height: size }} accessible={false}>
      <View style={[styles.table, { width: table, height: table, borderRadius: table / 2, left: (size - table) / 2, top: (size - table) / 2 }]}>
        <Ionicons name={icon} size={Math.round(table * 0.28)} color={C.accent} />
      </View>
      {Array.from({ length: seats }, (_, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / seats;
        const left = size / 2 + r * Math.cos(a) - avatar / 2;
        const top = size / 2 + r * Math.sin(a) - avatar / 2;
        const person = people[i];
        return (
          <Animated.View
            key={i}
            entering={animate ? ZoomIn.delay(80 + i * 70).duration(260) : undefined}
            style={[styles.seat, { left, top, width: avatar, height: avatar, borderRadius: avatar / 2 }]}
          >
            {person ? (
              <Avatar name={person.name} uri={person.uri} size={avatar} ring={person.you} />
            ) : (
              <View style={[styles.open, { width: avatar - 4, height: avatar - 4, borderRadius: (avatar - 4) / 2 }]}>
                <Ionicons name="add" size={Math.round(avatar * 0.36)} color={C.ink3} />
              </View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { position: 'absolute', backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  seat: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  open: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
});
