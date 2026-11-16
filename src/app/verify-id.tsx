import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { IdVerifyPanel } from '@/components/IdVerifyPanel';
import { Button } from '@/components/ui';
import { C, S, T } from '@/theme';

export default function VerifyIdScreen() {
  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, gap: S.lg }}>
      <View style={{ alignItems: 'center', gap: S.sm }}>
        <Ionicons name="shield-checkmark" size={44} color={C.accent} />
        <Text style={T.h2} accessibilityRole="header">Verify your identity</Text>
        <Text style={[T.muted, { textAlign: 'center' }]}>Stripe checks that your government ID matches a live selfie of you. It confirms you are who you say you are, not that anyone is safe to meet. A passed check adds an ID badge to your profile.</Text>
      </View>
      <IdVerifyPanel onSignIn={() => router.replace('/auth')} />
      <Button label="Close" variant="quiet" onPress={() => router.back()} />
    </ScrollView>
  );
}
