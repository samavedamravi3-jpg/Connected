import Ionicons from '@expo/vector-icons/Ionicons';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostPhoto } from '@/components/posts/PostPhoto';
import { Button, Segmented } from '@/components/ui';
import { AREAS, statusLabel } from '@/data/options';
import { fullName } from '@/lib/match';
import { CAPTION_MAX, EXPIRIES, INTENTS, RADII, draftHasContent, emptyDraft, validateDraft, type Draft, type ExpiryHours, type RadiusMi } from '@/lib/posts/model';
import { postsSource } from '@/lib/posts/source';
import { getPosts, setDraft } from '@/lib/posts/store';
import { useViewerArea } from '@/lib/posts/viewer';
import { fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, F, R, S, T } from '@/theme';

type Crop = 'original' | 'square' | 'portrait' | 'wide';
const CROPS: { id: Crop; label: string; ratio: number | null }[] = [
  { id: 'original', label: 'Original', ratio: null },
  { id: 'square', label: 'Square', ratio: 1 },
  { id: 'portrait', label: '4:5', ratio: 0.8 },
  { id: 'wide', label: '16:9', ratio: 16 / 9 },
];

export default function NewPost() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const viewer = useViewerArea();
  const [d, setD] = useState<Draft>(() => getPosts().draft ?? emptyDraft(null));
  const [orig, setOrig] = useState<{ uri: string; width: number; height: number } | null>(d.image ? { uri: d.image.uri, width: d.image.width, height: d.image.height } : null);
  const [crop, setCrop] = useState<Crop>('original');
  const [cropping, setCropping] = useState(false);
  const [showAlt, setShowAlt] = useState(!!d.image?.description);
  const [pickArea, setPickArea] = useState(false);
  const [upload, setUpload] = useState<{ state: 'idle' | 'sending' | 'failed'; progress: number; error?: string }>({ state: 'idle', progress: 0 });
  const needsSignIn = app.backendEnabled && !app.session;
  const areaId = d.areaId ?? viewer.area.id;
  const area = AREAS.find((a) => a.id === areaId) ?? viewer.area;
  const full = { ...d, areaId };
  const valid = validateDraft(full);

  // Keep the draft if the composer closes by accident.
  useEffect(() => {
    setDraft(draftHasContent(d) ? d : null);
  }, [d]);
  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const pick = async (from: 'library' | 'camera') => {
    const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert(from === 'camera' ? 'Camera access is off' : 'Photo access is off', 'You can allow it in Settings, or pick a different way to add a photo.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, exif: false, allowsEditing: false };
    const r = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets?.length) return;
    const a = r.assets[0];
    setOrig({ uri: a.uri, width: a.width, height: a.height });
    setCrop('original');
    patch({ image: { uri: a.uri, width: a.width, height: a.height, description: d.image?.description } });
  };

  const applyCrop = async (c: Crop) => {
    setCrop(c);
    if (!orig) return;
    const ratio = CROPS.find((x) => x.id === c)!.ratio;
    if (!ratio) return patch({ image: { ...orig, description: d.image?.description } });
    // Centre crop to the chosen shape.
    let w = orig.width;
    let h = Math.round(w / ratio);
    if (h > orig.height) { h = orig.height; w = Math.round(h * ratio); }
    try {
      const out = await ImageManipulator.manipulate(orig.uri).crop({ originX: Math.round((orig.width - w) / 2), originY: Math.round((orig.height - h) / 2), width: w, height: h }).renderAsync();
      const saved = await out.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      out.release();
      patch({ image: { uri: saved.uri, width: saved.width, height: saved.height, description: d.image?.description } });
    } catch {
      Alert.alert('Couldn’t crop that photo', 'Try another shape or a different photo.');
    }
  };

  const close = () => {
    if (!draftHasContent(d) || upload.state === 'sending') return router.back();
    Alert.alert('Keep this draft?', 'You can finish it next time you open New post.', [
      { text: 'Keep draft', onPress: () => router.back() },
      { text: 'Discard', style: 'destructive', onPress: () => { setDraft(null); setD(emptyDraft(null)); router.back(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const publish = async () => {
    if (!valid.ok || upload.state === 'sending') return;
    setUpload({ state: 'sending', progress: 0.05 });
    try {
      const author = {
        id: app.session?.userId ?? 'me',
        name: fullName(app.profile) || 'You',
        role: [statusLabel(app.profile.status) === 'Not set' ? '' : statusLabel(app.profile.status), app.profile.org].filter(Boolean).join(' · '),
        photo: app.profile.photoUri,
        isDemo: false,
      };
      const post = await postsSource.publish(full, author, area, (progress) => setUpload({ state: 'sending', progress }));
      setDraft(null);
      router.replace({ pathname: '/post/[id]', params: { id: post.id } });
    } catch (e) {
      setUpload({ state: 'failed', progress: 0, error: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  };

  if (needsSignIn) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Ionicons name="images-outline" size={32} color={C.ink3} />
        <Text style={T.h3}>Sign in to post</Text>
        <Text style={[T.small, { textAlign: 'center' }]}>You can browse Nearby as a guest. Posting needs an account.</Text>
        <Button label="Sign in" onPress={() => router.replace('/auth')} />
        <Pressable onPress={() => router.back()} hitSlop={8}><Text style={styles.link}>Not now</Text></Pressable>
      </View>
    );
  }

  const ends = fmtTime(app.now + d.expiresH * 3_600_000);
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.top, { paddingTop: insets.top + S.sm }]}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10}>
          <Ionicons name="close" size={26} color={C.ink} />
        </Pressable>
        <Text style={styles.topTitle}>New post</Text>
        <Pressable onPress={publish} disabled={!valid.ok || upload.state === 'sending'} accessibilityRole="button" accessibilityState={{ disabled: !valid.ok }} hitSlop={10}>
          <Text style={[styles.post, (!valid.ok || upload.state === 'sending') && { color: C.ink3 }]}>{upload.state === 'sending' ? 'Posting…' : 'Post'}</Text>
        </Pressable>
      </View>
      {upload.state === 'sending' ? <View style={styles.track}><View style={[styles.bar, { width: `${Math.round(upload.progress * 100)}%` }]} /></View> : null}

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xxl, gap: S.lg }} keyboardShouldPersistTaps="handled">
        {upload.state === 'failed' ? (
          <Animated.View entering={FadeIn} style={styles.failed} accessibilityLiveRegion="polite">
            <Text style={[T.small, { flex: 1, color: C.bad }]}>Couldn’t post. {upload.error}</Text>
            <Pressable onPress={publish} hitSlop={8}><Text style={styles.link}>Retry</Text></Pressable>
          </Animated.View>
        ) : null}

        {/* 1-2. Photo, with replace and crop */}
        {d.image ? (
          <View style={{ gap: S.sm }}>
            <PostPhoto image={d.image} width={width - S.lg * 2} maxH={380} />
            <View style={styles.photoRow}>
              <Pressable onPress={() => pick('library')} hitSlop={8}><Text style={styles.link}>Replace</Text></Pressable>
              <Pressable onPress={() => setCropping((v) => !v)} hitSlop={8}><Text style={styles.link}>Crop</Text></Pressable>
              <Pressable onPress={() => setShowAlt((v) => !v)} hitSlop={8}><Text style={styles.link}>{d.image.description ? 'Edit description' : 'Add description'}</Text></Pressable>
            </View>
            {cropping ? <Segmented label="Crop shape" options={CROPS} value={crop} onChange={applyCrop} /> : null}
            {showAlt ? (
              <TextInput
                value={d.image.description ?? ''}
                onChangeText={(t) => patch({ image: { ...d.image!, description: t.slice(0, 200) } })}
                placeholder="Describe the photo for people using screen readers"
                placeholderTextColor={C.ink3}
                style={styles.alt}
                accessibilityLabel="Image description"
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.empty}>
            <View style={styles.pickRow}>
              <Pressable onPress={() => pick('library')} accessibilityRole="button" style={({ pressed }) => [styles.pick, pressed && { opacity: 0.6 }]}>
                <Ionicons name="images-outline" size={28} color={C.accent} />
                <Text style={styles.pickText}>Choose photo</Text>
              </Pressable>
              <Pressable onPress={() => pick('camera')} accessibilityRole="button" style={({ pressed }) => [styles.pick, pressed && { opacity: 0.6 }]}>
                <Ionicons name="camera-outline" size={28} color={C.accent} />
                <Text style={styles.pickText}>Take photo</Text>
              </Pressable>
            </View>
            <Text style={T.small}>Photos, project screenshots or sketches.</Text>
          </View>
        )}

        {/* 3. Caption */}
        <TextInput
          value={d.caption}
          onChangeText={(t) => patch({ caption: t.slice(0, CAPTION_MAX + 20) })}
          placeholder="What are you up to?"
          placeholderTextColor={C.ink3}
          multiline
          style={styles.caption}
          accessibilityLabel="Caption"
        />
        {d.caption.length > CAPTION_MAX - 40 ? <Text style={[T.small, d.caption.length > CAPTION_MAX && { color: C.bad }]}>{d.caption.length}/{CAPTION_MAX}</Text> : null}

        {/* 4. Optional intent */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
          {INTENTS.map((i) => {
            const on = d.intent === i.id;
            return (
              <Pressable key={i.id} onPress={() => patch({ intent: on ? null : i.id })} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && { color: C.white }]}>{i.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 5-6. How long and who */}
        <View style={{ gap: S.sm }}>
          <Text style={styles.label}>Lasts</Text>
          <Segmented label="How long the post lasts" options={EXPIRIES.map((h) => ({ id: h, label: `${h} hours` }))} value={d.expiresH} onChange={(v) => patch({ expiresH: v as ExpiryHours })} />
        </View>
        <View style={{ gap: S.sm }}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Around {area.name}</Text>
            <Pressable onPress={() => setPickArea((v) => !v)} hitSlop={8}><Text style={styles.link}>Change</Text></Pressable>
          </View>
          {pickArea ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>
              {AREAS.map((a) => (
                <Pressable key={a.id} onPress={() => { patch({ areaId: a.id }); setPickArea(false); }} style={[styles.chip, a.id === areaId && styles.chipOn]}>
                  <Text style={[styles.chipText, a.id === areaId && { color: C.white }]}>{a.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Segmented label="Audience radius" options={RADII.map((r) => ({ id: r, label: `${r} mi` }))} value={d.radiusMi} onChange={(v) => patch({ radiusMi: v as RadiusMi })} />
        </View>

        {/* 7. Plain-language audience summary */}
        <Text style={styles.summary}>
          People browsing within about {d.radiusMi} mi of {area.name} may see this until {ends}{d.expiresH === 24 ? ' tomorrow' : ''}. Not everyone nearby will see it, and it won’t be added to your profile.
          {app.backendEnabled ? '' : ' Demo: saved on this phone only.'}
        </Text>
        {!valid.ok ? <Text style={styles.reason}>{valid.reason}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: S.md, padding: S.xl, backgroundColor: C.surface },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, paddingBottom: S.sm },
  topTitle: { fontFamily: F.displaySemi, fontSize: 18, color: C.ink },
  post: { fontSize: 17, fontWeight: '700', color: C.accent },
  track: { height: 3, backgroundColor: C.bg2 },
  bar: { height: 3, backgroundColor: C.accent },
  failed: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  empty: { aspectRatio: 4 / 3, borderRadius: R.md, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: S.md },
  pickRow: { flexDirection: 'row', gap: S.xxl },
  pick: { alignItems: 'center', gap: 6, minWidth: 96, minHeight: 64, justifyContent: 'center' },
  pickText: { fontSize: 15, fontWeight: '600', color: C.ink },
  photoRow: { flexDirection: 'row', gap: S.lg },
  alt: { fontSize: 15, color: C.ink, paddingVertical: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line2 },
  caption: { fontFamily: F.displaySemi, fontSize: 20, lineHeight: 27, color: C.ink, minHeight: 80, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', borderRadius: 999, backgroundColor: C.bg2 },
  chipOn: { backgroundColor: C.ink },
  chipText: { fontSize: 14, fontWeight: '500', color: C.ink2 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink3, letterSpacing: 0.4 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontSize: 15, fontWeight: '600', color: C.accent },
  summary: { fontSize: 14, lineHeight: 20, color: C.ink2 },
  reason: { fontSize: 13, color: C.ink3 },
});
