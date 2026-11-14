import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, S, T } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type LookOption = { id: string; label: string; icon: IconName };
export type LayerToggle = { id: string; label: string; hint: string; icon: IconName; value: boolean; onChange: (v: boolean) => void };

type Props = {
  visible: boolean;
  onClose: () => void;
  looks: LookOption[];
  look: string;
  onLook: (id: string) => void;
  toggles: LayerToggle[];
};

/** One place for everything that changes what the map shows: map style plus on/off layers. */
export function LayersSheet({ visible, onClose, looks, look, onLook, toggles }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close layers" />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(240)} exiting={SlideOutDown.duration(180)} style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}>
          <View style={styles.head}>
            <Text style={T.h2} accessibilityRole="header">Layers</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close layers" hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={20} color={C.ink2} />
            </Pressable>
          </View>

          <View style={styles.looks} accessibilityRole="radiogroup" accessibilityLabel="Map style">
            {looks.map((l) => {
              const on = l.id === look;
              return (
                <Pressable key={l.id} onPress={() => onLook(l.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.look, on && styles.lookOn]}>
                  <Ionicons name={l.icon} size={20} color={on ? C.accent : C.ink2} />
                  <Text style={[styles.lookText, on && { color: C.accent }]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View>
            {toggles.map((t, i) => (
              <View key={t.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                <Ionicons name={t.icon} size={20} color={t.value ? C.accent : C.ink3} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{t.label}</Text>
                  <Text style={styles.rowHint}>{t.hint}</Text>
                </View>
                <Switch value={t.value} onValueChange={t.onChange} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel={t.label} />
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(27,23,38,0.35)' },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: S.lg, paddingTop: S.md, gap: S.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center' },
  looks: { flexDirection: 'row', gap: S.sm },
  look: { flex: 1, minHeight: 64, borderRadius: R.md, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 4 },
  lookOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  lookText: { fontSize: 13, fontWeight: '700', color: C.ink2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56, paddingVertical: 6 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  rowLabel: { fontSize: 15, fontWeight: '600', color: C.ink },
  rowHint: { fontSize: 12, color: C.ink3 },
});
