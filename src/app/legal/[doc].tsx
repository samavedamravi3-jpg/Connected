import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LegalBody } from '@/components/Legal';
import { DOCS, type DocId } from '@/legal/documents';
import { C, S, T } from '@/theme';

/** /legal/terms, /legal/privacy, /legal/refunds, /legal/cookies. No account or sign-in needed. */
export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const insets = useSafeAreaInsets();
  const d = DOCS[doc as DocId];
  return (
    <>
      <Stack.Screen options={{ title: d?.title ?? 'Policy' }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xxl }}>
        {d ? <LegalBody doc={d} /> : <Text style={T.body}>That policy doesn’t exist.</Text>}
      </ScrollView>
    </>
  );
}
