import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Section } from '@/components/ui';
import { CREDITS, DOCS, DOC_ORDER } from '@/legal/documents';
import { C, S, T } from '@/theme';

/** Every policy in one list. Linked from sign-up, onboarding, Profile and Privacy & data. */
export default function LegalIndex() {
  const insets = useSafeAreaInsets();
  return (
    <>
      <Stack.Screen options={{ title: 'Terms and policies' }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xxl, gap: S.xl }}>
        <Section>
          <Text style={T.muted}>These apply to everyone who uses Connected. You can read them without an account.</Text>
          <Card style={{ padding: 0 }}>
            {DOC_ORDER.map((id, i) => (
              <Pressable
                key={id}
                onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: id } })}
                accessibilityRole="link"
                accessibilityLabel={DOCS[id].title}
                accessibilityHint={DOCS[id].summary}
                style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.lg, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.label}>{DOCS[id].title}</Text>
                  <Text style={T.small}>{DOCS[id].summary}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.ink3} />
              </Pressable>
            ))}
          </Card>
        </Section>
        <Section title="Credits">
          {CREDITS.map((c) => (
            <Text key={c} style={T.small} selectable>{c}</Text>
          ))}
        </Section>
      </ScrollView>
    </>
  );
}
