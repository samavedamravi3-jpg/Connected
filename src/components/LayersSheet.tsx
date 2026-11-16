import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, R, S, T, alpha } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type LookOption = { id: string; label: string; icon: IconName };
export type LayerToggle = { id: string; label: string; hint: string; icon: IconName; value: boolean; onChange: (v: boolean) => void };

/** One line of the "Alerts status" checklist. `warn` means worth knowing but not blocking. */
export type StatusItem = { id: string; label: string; state: 'ok' | 'off' | 'warn'; hint?: string };
export type AlertsPanel = {
  items: StatusItem[];
  /** Same-field verified people within 1 mile right now (the count alerts are based on). */
  nearby: number | null;
  /** Server problem finding nearby members, shown so a failure isn't silent. */
  error?: string | null;
  demo: { value: boolean; onChange: (v: boolean) => void };
};

type Props = {
  visible: boolean;
  onClose: () => void;
  looks: LookOption[];
  look: string;
  onLook: (id: string) => void;
  toggles: LayerToggle[];
  alerts?: AlertsPanel;
  /** Neighborhood-hub colour key, shown under the toggles while hubs are on. */
  legend?: { id: string; label: string; fill: string; color: string }[];
};

/** One place for everything that changes what the map shows: map style plus on/off layers. */
export function LayersSheet({ visible, onClose, looks, look, onLook, toggles, alerts, legend }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close layers" />
      </Animated.View>
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.duration(240)} exiting={SlideOutDown.duration(180)} style={[styles.sheet, { paddingBottom: insets.bottom + S.md, maxHeight: height * 0.88 }]}>
          <View style={styles.head}>
            <Text style={T.h2} accessibilityRole="header">Layers</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close layers" hitSlop={10} style={styles.close}>
              <Ionicons name="close" size={20} color={C.ink2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: S.md }} showsVerticalScrollIndicator={false}>
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

          {legend ? (
            <View style={styles.legend} accessibilityLabel="Neighborhood hub key">
              {legend.map((l) => (
                <View key={l.id} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: l.fill, borderColor: l.color }]} />
                  <Text style={styles.rowHint}>{l.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {alerts ? (
            <View style={styles.status} accessibilityLabel="Alerts status">
              <Text style={styles.statusTitle} accessibilityRole="header">Alerts status</Text>
              {alerts.items.map((it) => (
                <View key={it.id} style={styles.statusRow} accessible accessibilityLabel={`${it.label}: ${it.state === 'ok' ? 'yes' : it.state === 'warn' ? 'optional' : 'no'}${it.hint ? `. ${it.hint}` : ''}`}>
                  <Ionicons
                    name={it.state === 'ok' ? 'checkmark-circle' : it.state === 'warn' ? 'alert-circle' : 'close-circle'}
                    size={20}
                    color={it.state === 'ok' ? C.ok : it.state === 'warn' ? C.warn : C.bad}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{it.label}</Text>
                    {it.hint ? <Text style={styles.rowHint}>{it.hint}</Text> : null}
                  </View>
                </View>
              ))}
              <View style={styles.statusRow}>
                <Ionicons name="people-outline" size={20} color={C.accent} />
                <Text style={[styles.rowLabel, { flex: 1 }]}>
                  Same-field people within 1 mile: {alerts.nearby == null ? 'waiting for your location' : alerts.nearby}
                </Text>
              </View>
              {alerts.error ? <Text style={[styles.rowHint, { color: C.bad }]}>Couldn’t check for nearby members: {alerts.error}</Text> : null}
              <View style={[styles.row, styles.rowBorder, { paddingHorizontal: 0 }]}>
                <Ionicons name="flask-outline" size={20} color={alerts.demo.value ? C.accent : C.ink3} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>Demo: simulate a nearby match</Text>
                  <Text style={styles.rowHint}>Demo only. Puts a same-field demo person 0.2 mi away and sends a real notification.</Text>
                </View>
                <Switch value={alerts.demo.value} onValueChange={alerts.demo.onChange} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel="Demo: simulate a nearby match" />
              </View>
            </View>
          ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: S.lg, rowGap: S.xs, paddingHorizontal: S.xs },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: alpha(C.ink, 0.4) },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg, paddingHorizontal: S.lg, paddingTop: S.md, gap: S.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center' },
  looks: { flexDirection: 'row', gap: S.sm },
  look: { flex: 1, minHeight: 64, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 4 },
  lookOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  lookText: { fontSize: 13, fontWeight: '600', color: C.ink2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 56, paddingVertical: 6 },
  rowBorder: { borderTopWidth: 1, borderTopColor: C.line },
  status: { borderWidth: 1, borderColor: C.line, borderRadius: R.md, padding: S.md, gap: S.sm, backgroundColor: C.bg2 },
  statusTitle: { fontSize: 15, fontWeight: '600', color: C.ink },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 32 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: C.ink },
  rowHint: { fontSize: 13, lineHeight: 18, color: C.ink3 },
});
