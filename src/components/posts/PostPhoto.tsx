import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { imageFrame, type PostImage } from '@/lib/posts/model';
import { C, R } from '@/theme';

/** A post's photo at its natural proportions (clamped 4:5 to 1.91:1) and never taller than `maxH`. */
export function PostPhoto({ image, width, maxH = 440, radius = R.md }: { image: PostImage; width: number; maxH?: number; radius?: number }) {
  const frame = imageFrame(image.width, image.height, width, maxH);
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={[styles.frame, frame, { borderRadius: radius }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={image.description ? `Photo: ${image.description}` : 'Photo shared with the post'}
    >
      {failed ? (
        <Text style={styles.failed}>Photo couldn’t load</Text>
      ) : (
        <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={220} cachePolicy="memory-disk" onError={() => setFailed(true)} accessible={false} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center' },
  failed: { fontSize: 13, color: C.ink3 },
});
