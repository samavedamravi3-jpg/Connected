import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import { C } from '@/theme';

/** Blue check shown next to people who proved a school or work email. With `label` it reads "Verified". */
export function VerifiedBadge({ size = 16, label, kind }: { size?: number; label?: boolean; kind?: 'school' | 'work' | 'id' | null }) {
  const what = kind === 'school' ? 'school email' : kind === 'work' ? 'work email' : kind === 'id' ? 'ID' : 'email';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessible accessibilityLabel={`Verified with ${what}`}>
      <Ionicons name="checkmark-circle" size={size} color={C.blue} />
      {label ? <Text style={{ color: C.blue, fontSize: size - 3, fontWeight: '700' }}>Verified</Text> : null}
    </View>
  );
}
