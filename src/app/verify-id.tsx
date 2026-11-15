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
        <Text style={T.h2}>Verify your ID</Text>
        <Text style={[T.muted, { textAlign: 'center' }]}>A quick check that you’re a real person. It unlocks sending requests and hosting events, and adds an ID badge to your profile.</Text>
      </View>
      <IdVerifyPanel />
      <Button label="Close" variant="quiet" onPress={() => router.back()} />
    </ScrollView>
  );
}
