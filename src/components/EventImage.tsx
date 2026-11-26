import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { EVENT_STYLE } from '@/data/eventVisuals';
import type { CommunityEvent } from '@/data/types';
import { eventImageFit, eventImageUrl } from '@/lib/eventImage';
import { C, F, R, alpha } from '@/theme';

/**
 * An event's photo from its listing. While loading, for demo events, and when there is no photo or it fails, a
 * restrained typographic cover shows instead: the category and the organizer's name on a quiet tint. We never
 * invent or substitute a stock photograph. The image is decorative (the card or title names the event); `credit`
 * adds a small source label once a photo is showing.
 */
export function EventImage({ e, style, size = 'large', padTop = 0, credit }: {
  e: Pick<CommunityEvent, 'image' | 'isDemo' | 'source' | 'category' | 'host'>;
  style?: StyleProp<ViewStyle>;
  /** 'large' covers show category + organizer; 'small' thumbnails show the organizer's initials only. */
  size?: 'large' | 'small';
  /** Space kept clear at the top (status bar under a full-bleed header). */
  padTop?: number;
  credit?: string;
  /** @deprecated kept for older call sites; ignored. */
  iconSize?: number;
}) {
  const st = EVENT_STYLE[e.category];
  const uri = eventImageUrl(e);
  const fit = eventImageFit(e);
  const [result, setResult] = useState<{ uri: string; ok: boolean } | null>(null);
  const settled = !!uri && result?.uri === uri;
  const shown = settled && result.ok;
  const failed = settled && !result.ok;
  const initials = e.host.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

  return (
    <View style={[styles.frame, { backgroundColor: st.soft }, style]}>
      {!shown ? (
        <View style={[StyleSheet.absoluteFill, size === 'small' ? styles.center : styles.cover, { paddingTop: padTop + (size === 'small' ? 0 : 16) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {size === 'small' ? (
            <Text style={[styles.initials, { color: st.solid }]} maxFontSizeMultiplier={1.2}>{initials || '·'}</Text>
          ) : (
            <>
              <Text style={[styles.coverKind, { color: st.solid }]} maxFontSizeMultiplier={1.2}>{st.label.toUpperCase()}</Text>
              <Text style={styles.coverHost} numberOfLines={2} maxFontSizeMultiplier={1.2}>{e.host}</Text>
            </>
          )}
        </View>
      ) : null}
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
  cover: { justifyContent: 'flex-end', paddingHorizontal: 18, paddingBottom: 16, gap: 4 },
  coverKind: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  coverHost: { fontFamily: F.display, fontSize: 24, lineHeight: 28, color: C.ink, letterSpacing: -0.3 },
  initials: { fontFamily: F.display, fontSize: 20, letterSpacing: 0.5 },
  credit: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.sm, backgroundColor: alpha(C.ink, 0.6) },
  creditText: { color: C.white, fontSize: 11, lineHeight: 14, fontWeight: '500' },
});
