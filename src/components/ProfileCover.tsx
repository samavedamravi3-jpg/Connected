import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AVATAR_COLORS, C } from '@/theme';

/** Same name, same quiet tint, so a profile without a cover still looks like itself. */
function tintFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * The banner behind someone's portrait: their own cover photo when they added one, otherwise a plain tint.
 * No stock imagery or gradients are substituted for a missing photo.
 */
export function ProfileCover({ uri, name, height, style, children }: { uri?: string | null; name: string; height: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <View style={[{ height, backgroundColor: tintFor(name), overflow: 'hidden' }, style]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessible={false} /> : null}
      {uri ? <View style={[StyleSheet.absoluteFill, { backgroundColor: C.ink, opacity: 0.08 }]} pointerEvents="none" /> : null}
      {children}
    </View>
  );
}
