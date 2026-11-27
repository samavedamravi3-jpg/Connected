import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Note } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

const MESSAGES: Record<string, string> = {
  wrong_password: 'That password isn’t right.',
  confirm: 'Type DELETE to confirm.',
  rate_limited: 'Too many tries. Wait a few minutes and try again.',
};

/** Re-authenticates with the password, requires a typed confirmation, then deletes server-side. */
export default function DeleteAccount() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [pw, setPw] = useState('');
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ready = pw.length > 0 && word.trim() === 'DELETE';

  const go = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setErr('');
    try {
      await app.deleteAccount(pw);
      router.replace('/onboarding');
    } catch (e) {
      setErr(MESSAGES[e instanceof Error ? e.message : ''] ?? 'We couldn’t delete your account. Nothing was changed. Try again, or email us.');
      setBusy(false);
    }
  };

  const input = { minHeight: 50, borderWidth: 1, borderColor: C.line2, borderRadius: R.md, paddingHorizontal: S.md, fontSize: 16, color: C.ink, backgroundColor: C.surface } as const;
  return (
    <>
      <Stack.Screen options={{ title: 'Delete my account' }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xxl, gap: S.lg }} keyboardShouldPersistTaps="handled">
        <Text style={T.title} accessibilityRole="header">Delete your account</Text>
        <Text style={T.body}>This is permanent and can’t be undone. We will delete:</Text>
        <View style={{ gap: S.xs }}>
          {['Your profile, photo, experience and settings', 'Your connection requests and messages, including the ones the other person sees', 'Your blocks, mutes and reports you filed', 'Your location check-in and nearby-alert settings', 'Your sign-in. We also ask Stripe to redact your ID check (Stripe says that can take up to 4 days)'].map((t) => (
            <Text key={t} style={T.muted}>• {t}</Text>
          ))}
        </View>
        <Note icon="information-circle-outline">What can remain: backups until they expire, limited records we must keep for legal or safety reasons, and anything Stripe must retain under its own policy. Audit-log entries are kept without your ID.</Note>
        <View style={{ gap: 6 }}>
          <Text style={T.label}>Your password</Text>
          <TextInput value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" style={input} accessibilityLabel="Your password" />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={T.label}>Type DELETE to confirm</Text>
          <TextInput value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} style={input} accessibilityLabel="Type DELETE to confirm" />
        </View>
        {err ? <Text style={{ color: C.bad, fontWeight: '600', fontSize: 15 }} accessibilityRole="alert">{err}</Text> : null}
        <Button label={busy ? 'Deleting…' : 'Permanently delete my account'} variant="danger" disabled={!ready || busy} onPress={go} />
        <Button label="Cancel" variant="quiet" onPress={() => router.back()} />
      </ScrollView>
    </>
  );
}
