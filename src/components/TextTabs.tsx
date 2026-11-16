import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, S } from '@/theme';

export type TextTab<Id extends string> = { id: Id; label: string; count: number };

/**
 * Plain text tabs with inline muted counts: the selected one is ink with a purple underline, the rest muted.
 * The weight never changes and the underline slot is always there, so switching never shifts the row.
 * The row wraps instead of clipping when large text no longer fits on one line (font scaling stays on).
 */
export function TextTabs<Id extends string>({ tabs, value, onChange }: { tabs: readonly TextTab<Id>[]; value: Id; onChange: (id: Id) => void }) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${t.label}, ${t.count}`}
            hitSlop={{ left: S.sm, right: S.sm }}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>
              {t.label} <Text style={styles.count}>{t.count}</Text>
            </Text>
            <View style={[styles.bar, on && styles.barOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', columnGap: S.lg },
  tab: { minHeight: 44, justifyContent: 'center' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: C.ink3 },
  labelOn: { color: C.ink },
  count: { fontWeight: '500', color: C.ink3, fontVariant: ['tabular-nums'] },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 4, height: 2, borderRadius: 1 },
  barOn: { backgroundColor: C.accent },
});
