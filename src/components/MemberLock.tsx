import { router } from 'expo-router';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, Note } from '@/components/ui';
import type { IdStatus } from '@/lib/idStatus';
import { useApp } from '@/state/AppState';
import { S } from '@/theme';

const NEXT: Record<Exclude<IdStatus, 'verified'>, { text: string; button: string }> = {
  unverified: { text: 'They unlock after a government photo ID and selfie check.', button: 'Verify your ID' },
  canceled: { text: 'They unlock after a government photo ID and selfie check.', button: 'Verify your ID' },
  started: { text: 'You started your ID check. Pick up where you left off.', button: 'Continue verification' },
  pending: { text: 'Stripe is checking your ID. This usually takes a few minutes.', button: 'Check status' },
  rejected: { text: 'Your last ID check didn’t go through. You can try again.', button: 'Try again' },
  test_verified: { text: 'Test result — does not unlock Connected. Only a live ID check does.', button: 'See details' },
};

/**
 * Locked state for real-member areas (real people, search, requests, chats, events) until you're a real member
 * (live ID check). The database enforces the same rule; this explains it and gives the next step. Demo content still works.
 */
export function MemberLock({ what, style }: { what: string; style?: StyleProp<ViewStyle> }) {
  const app = useApp();
  if (!app.memberLocked || app.idStatus === 'verified') return null;
  const guest = !app.session;
  const next = guest ? { text: 'Create an account, then verify your ID with a government photo ID and a selfie.', button: 'Create an account' } : NEXT[app.idStatus];
  return (
    <View style={[{ gap: S.sm }, style]} accessibilityRole="summary">
      <Note icon="lock-closed-outline">{`Real ${what} are locked. ${next.text}`}</Note>
      <Button
        label={next.button}
        icon={guest ? 'person-add-outline' : 'shield-checkmark-outline'}
        small
        onPress={() => (guest ? router.push({ pathname: '/onboarding', params: { edit: 'account' } }) : router.push('/verify-id'))}
      />
    </View>
  );
}
