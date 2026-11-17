import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { EVENT_STYLE } from '@/data/eventVisuals';
import type { CommunityEvent } from '@/data/types';
import { eventImageFit, eventImageUrl } from '@/lib/eventImage';
import { C, R, alpha } from '@/theme';

/**
 * An event's photo from its listing, on the category tile. The tile (soft category colour + icon) is what shows while
 * loading, for demo events, and when there is no photo or it fails, so the frame never changes size. The image is
 * decorative (the card or title names the event); `credit` adds a small source label once a photo is showing.
 */
export function EventImage({ e, style, iconSize = 40, padTop = 0, credit }: {
  e: Pick<CommunityEvent, 'image' | 'isDemo' | 'source' | 'category'>;
  style?: StyleProp<ViewStyle>;
  iconSize?: number;
  /** Space kept clear at the top (status bar under a full-bleed header) for the icon and contained logos. */
  padTop?: number;
  credit?: string;
}) {
  const st = EVENT_STYLE[e.category];
  const uri = eventImageUrl(e);
  const fit = eventImageFit(e);
  const [result, setResult] = useState<{ uri: string; ok: boolean } | null>(null);
  const settled = !!uri && result?.uri === uri;
  const shown = settled && result.ok;
  const failed = settled && !result.ok;

  return (
    <View style={[styles.frame, { backgroundColor: st.soft, paddingTop: padTop }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.center, { paddingTop: padTop }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {!shown ? <Ionicons name={st.icon} size={iconSize} color={st.solid} /> : null}
      </View>
      {uri && !failed ? (
        <View style={[StyleSheet.absoluteFill, fit === 'contain' && { paddingTop: padTop + 16, paddingBottom: 16, paddingHorizontal: 24 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Image
            source={{ uri }}
            style={[{ flex: 1 }, fit === 'contain' && { borderRadius: R.md }]}
            contentFit={fit}
            cachePolicy="disk"
            recyclingKey={uri}
            transition={200}
            onLoad={() => setResult({ uri, ok: true })}
            onError={() => setResult({ uri, ok: false })}
            accessible={false}
          />
        </View>
      ) : null}
      {shown && credit ? (
        <View style={styles.credit}>
          <Text style={styles.creditText} maxFontSizeMultiplier={1.4}>{credit}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  credit: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.sm, backgroundColor: alpha(C.ink, 0.6) },
  creditText: { color: C.white, fontSize: 11, lineHeight: 14, fontWeight: '500' },
});
