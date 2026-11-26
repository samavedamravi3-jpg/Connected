import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { C } from '@/theme';

type Action = { label: string; icon: ComponentProps<typeof Ionicons>['name']; color: string; onPress: () => void };

function Panel({ a, progress, methods }: { a: Action; progress: SharedValue<number>; methods: SwipeableMethods }) {
  const st = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: interpolate(progress.value, [0, 1], [0.7, 1]) }] }));
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        methods.close();
        a.onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a.label}
      style={[styles.panel, { backgroundColor: a.color }]}
    >
      <Animated.View style={[styles.inner, st]}>
        <Ionicons name={a.icon} size={22} color={C.white} />
        <Text style={styles.label}>{a.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * A row you can swipe to reveal one action on each side. Actions still need a tap, so nothing happens by accident,
 * and the same actions stay available without swiping (screen readers, long-press menus).
 */
export function SwipeRow({ children, left, right }: { children: ReactNode; left?: Action; right?: Action }) {
  return (
    <ReanimatedSwipeable
      friction={1.6}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={48}
      rightThreshold={48}
      onSwipeableWillOpen={() => Haptics.selectionAsync().catch(() => {})}
      renderLeftActions={left ? (p, _t, m) => <Panel a={left} progress={p} methods={m} /> : undefined}
      renderRightActions={right ? (p, _t, m) => <Panel a={right} progress={p} methods={m} /> : undefined}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  panel: { width: 92, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 4 },
  label: { color: C.white, fontSize: 12, fontWeight: '700' },
});
