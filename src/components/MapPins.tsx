import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, StyleSheet, Text, View } from 'react-native';
import { EVENT_STYLE } from '@/data/eventVisuals';
import type { EventCategory } from '@/data/types';
import { initials } from '@/lib/match';
import { C, R, alpha } from '@/theme';

const ACCENT = (a: number) => alpha(C.accent, a);

export type Strength = 'strong' | 'good' | 'some';

const NODE: Record<Strength, number> = { strong: 40, good: 34, some: 28 };
const CARD_H = 44;
const GAP = 6;
const WIDTH = 176;

/**
 * Where the coordinate sits inside a NodePin, for the Marker `anchor` prop.
 * With the name card showing, the node is lower in the view, so the anchor moves down.
 */
export function nodeAnchor(strength: Strength, selected: boolean) {
  const size = NODE[strength] + (selected ? 6 : 0);
  if (!selected) return { x: 0.5, y: 0.5 };
  return { x: 0.5, y: (CARD_H + GAP + size / 2) / (CARD_H + GAP + size) };
}

// Pin text is capped for font scaling: markers are fixed-size views (CARD_H drives the anchor maths); the sheet list carries the scalable text.
/**
 * A person as a node in your network. Solid purple = strong match, purple ring = good match,
 * quiet gray = other. Selected nodes grow and show a small name-and-role card above.
 */
export function NodePin({ name, role, uri, strength, selected, door, real }: { name: string; role: string; uri?: string | null; strength: Strength; selected: boolean; door: boolean; real?: boolean }) {
  const size = NODE[strength] + (selected ? 6 : 0);
  const solid = strength === 'strong' || selected;
  const ring = selected ? C.accent : strength === 'some' ? C.line2 : C.accent;
  const node = (
    <View
      style={[
        styles.node,
        { width: size, height: size, borderRadius: size / 2, borderColor: solid ? C.white : ring, backgroundColor: solid ? C.accent : C.white },
        strength === 'some' && !selected && { borderWidth: 1.5 },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }} />
      ) : (
        <Text maxFontSizeMultiplier={1} style={[styles.initials, { fontSize: size * 0.34, color: solid ? C.white : strength === 'some' ? C.ink3 : C.accent }]}>{initials(name)}</Text>
      )}
      {real ? <View style={styles.real} accessibilityLabel="Connected member" /> : null}
      {door ? (
        <View style={styles.door}>
          <Ionicons name="enter-outline" size={10} color={C.white} />
        </View>
      ) : null}
    </View>
  );

  if (!selected) return <View collapsable={false} style={{ padding: 4 }}>{node}</View>;

  return (
    <View collapsable={false} style={{ width: WIDTH, alignItems: 'center' }}>
      <View style={styles.card}>
        <Text style={styles.cardName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{name}{real ? '  ·  Member' : ''}</Text>
        <Text style={styles.cardRole} numberOfLines={1} maxFontSizeMultiplier={1.2}>{role}</Text>
      </View>
      <View style={styles.cardTip} />
      {/* The tip adds 4px below the card (10px tall, pulled up 6px); this spacer makes the gap exactly GAP. */}
      <View style={{ height: GAP - 4 }} />
      {node}
    </View>
  );
}

/** An in-person event: a rounded-square badge with the category icon, clearly different from round people nodes. */
export function EventPin({ category }: { category: EventCategory }) {
  const st = EVENT_STYLE[category];
  return (
    <View collapsable={false} style={{ padding: 4 }}>
      <View style={[styles.eventPin, { backgroundColor: st.solid }]}>
        <Ionicons name={st.icon} size={16} color={C.white} />
      </View>
      <View style={[styles.eventTip, { borderTopColor: st.solid }]} />
    </View>
  );
}

/** A group of nearby pins. Tap to zoom in and break it apart. */
export function ClusterPin({ count, tone = 'people' }: { count: number; tone?: 'people' | 'events' }) {
  const size = count > 99 ? 48 : count > 9 ? 44 : 38;
  return (
    <View collapsable={false} style={{ padding: 4 }}>
      <View style={[styles.cluster, { width: size, height: size, borderRadius: tone === 'people' ? size / 2 : R.md, backgroundColor: tone === 'people' ? C.accent : C.blue }]}>
        <Text style={styles.clusterText} maxFontSizeMultiplier={1}>{count > 99 ? '99+' : count}</Text>
      </View>
    </View>
  );
}

/** You: the center node of your network, like the intro animation. */
export function YouNode({ live }: { live: boolean }) {
  return (
    <View collapsable={false} style={styles.youWrap}>
      <View style={[styles.youRing, !live && { borderColor: ACCENT(0.25), backgroundColor: ACCENT(0.06) }]} />
      <View style={styles.youDot}>
        <View style={styles.youCore} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: { borderWidth: 3, borderColor: alpha(C.white, 0.95), alignItems: 'center', justifyContent: 'center', shadowColor: C.ink, shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  clusterText: { color: C.white, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  eventPin: { width: 32, height: 32, borderRadius: R.sm + 2, borderWidth: 2, borderColor: C.white, alignItems: 'center', justifyContent: 'center' },
  eventTip: { alignSelf: 'center', width: 0, height: 0, marginTop: -1, borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  node: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    shadowColor: C.ink,
    shadowOpacity: 0.16,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  initials: { fontWeight: '600', letterSpacing: 0.3 },
  real: { position: 'absolute', right: -2, bottom: -2, width: 13, height: 13, borderRadius: 7, backgroundColor: C.ok, borderWidth: 2, borderColor: C.white },
  door: { position: 'absolute', right: -4, top: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: C.blue, borderWidth: 2, borderColor: C.white, alignItems: 'center', justifyContent: 'center' },
  card: {
    height: CARD_H,
    maxWidth: WIDTH,
    paddingHorizontal: 12,
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    shadowColor: C.ink,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardName: { fontSize: 13, fontWeight: '600', color: C.ink },
  cardRole: { fontSize: 11, color: C.ink2 },
  cardTip: { width: 10, height: 10, backgroundColor: C.surface, transform: [{ rotate: '45deg' }], marginTop: -6, borderRightWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  youWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  youRing: { position: 'absolute', width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, borderColor: ACCENT(0.45), backgroundColor: ACCENT(0.1) },
  youDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, borderWidth: 3, borderColor: C.white, alignItems: 'center', justifyContent: 'center', shadowColor: C.ink, shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  youCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.white },
});
