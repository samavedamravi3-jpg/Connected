import { router } from 'expo-router';
import { Linking, Pressable, Text, View } from 'react-native';
import { LEGAL } from '@/legal/config';
import type { DocId, LegalDoc } from '@/legal/documents';
import { C, S, T } from '@/theme';

/** One policy, rendered for reading: real headings for screen readers, selectable text, comfortable line length. */
export function LegalBody({ doc }: { doc: LegalDoc }) {
  return (
    <View style={{ gap: S.lg }}>
      <View style={{ gap: S.xs }}>
        <Text style={T.title} accessibilityRole="header">{doc.title}</Text>
        <Text style={T.small}>Version {doc.version} · in effect from {doc.version}</Text>
        <Text style={T.muted}>{doc.summary}</Text>
      </View>
      {doc.sections.map((s) => (
        <View key={s.id} style={{ gap: S.sm }}>
          <Text style={T.h2} accessibilityRole="header">{s.heading}</Text>
          {s.body.map((b, i) =>
            Array.isArray(b) ? (
              <View key={i} style={{ gap: S.sm }}>
                {b.map((item, j) => (
                  <View key={j} style={{ flexDirection: 'row', gap: S.sm }}>
                    <Text style={[T.body, { color: C.ink2 }]} accessibilityElementsHidden importantForAccessibility="no">•</Text>
                    <Text style={[T.body, { flex: 1 }]} selectable>{item}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text key={i} style={T.body} selectable>{b}</Text>
            ),
          )}
        </View>
      ))}
      <View style={{ gap: S.xs }}>
        <Text style={T.label}>Contact</Text>
        <ContactLink />
      </View>
    </View>
  );
}

const href = (id: DocId) => ({ pathname: '/legal/[doc]' as const, params: { doc: id } });

/** Plain inline links to the policies, for signup, onboarding and settings. They work before signup (no account needed). */
export function LegalLinks({ ids = ['terms', 'privacy'], style }: { ids?: DocId[]; style?: object }) {
  const label: Record<DocId, string> = { terms: 'Terms of Service', privacy: 'Privacy Policy', refunds: 'Refund and Cancellation Policy', cookies: 'Cookie and Tracking Policy' };
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: S.md }, style]}>
      {ids.map((id) => (
        <Pressable key={id} onPress={() => router.push(href(id))} accessibilityRole="link" accessibilityLabel={label[id]} hitSlop={6} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[T.small, { color: C.accent, fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' }]}>{label[id]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Tappable support/privacy address (opens the mail app). Renders nothing until an address is configured. */
export function ContactLink() {
  if (!LEGAL.contactEmail) return null;
  const mail = LEGAL.contactEmail;
  return (
    <Pressable onPress={() => Linking.openURL(`mailto:${mail}`)} accessibilityRole="link" accessibilityLabel={`Email ${mail}`} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={[T.body, { color: C.accent, fontWeight: '600', textDecorationLine: 'underline' }]}>{mail}</Text>
    </Pressable>
  );
}
