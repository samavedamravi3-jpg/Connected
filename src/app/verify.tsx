import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { Button, Note } from '@/components/ui';
import { classifyEmail, confirmVerificationCode, sendVerificationCode } from '@/lib/verification';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

/** Verify with a school or work email: type the address, then the code we email you. */
export default function VerifyScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    setErr('');
    const c = classifyEmail(email);
    if (!c.ok) return setErr(c.reason);
    setBusy(true);
    try {
      await sendVerificationCode(email);
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We couldn’t send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setErr('');
    if (code.trim().length < 6) return setErr('Enter the code from the email.');
    setBusy(true);
    try {
      await confirmVerificationCode(email, code);
      await app.refreshVerification();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That code didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const done = app.verification.verified;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: insets.bottom + S.xxl }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: S.sm }}>
          <View style={styles.icon}><Ionicons name="shield-checkmark" size={30} color={C.blue} /></View>
          <Text style={T.h2}>{done ? 'You’re verified' : 'Get verified'}</Text>
          <Text style={[T.muted, { textAlign: 'center' }]}>
            {done
              ? `Your ${app.verification.kind ?? ''} email is confirmed. People see a check next to your name, and people in your field get nearby alerts when you’re close.`
              : 'Confirm a school or work email with a one-time code. People see a check next to your name. Only verified people trigger nearby alerts for others in their field.'}
          </Text>
          {done ? <VerifiedBadge label size={20} kind={app.verification.kind} /> : null}
        </View>

        {!app.session ? (
          <Note>Create an account or sign in first, then come back to verify.</Note>
        ) : done ? (
          <Button label="Done" onPress={() => router.back()} />
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <Text style={T.label}>School or work email</Text>
              <TextInput
                value={email}
                onChangeText={(t) => { setEmail(t); setSent(false); }}
                placeholder="you@university.edu"
                placeholderTextColor={C.ink3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                style={styles.input}
                editable={!busy}
                accessibilityLabel="School or work email"
              />
              <Text style={T.small}>Personal addresses like Gmail don’t count. We store only that you’re verified and when, never the address.</Text>
            </View>
            {sent ? (
              <View style={{ gap: 6 }}>
                <Text style={T.label}>Code from the email</Text>
                <TextInput
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
                  placeholder="6-digit code"
                  placeholderTextColor={C.ink3}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  style={[styles.input, { letterSpacing: 4, fontSize: 20 }]}
                  editable={!busy}
                  accessibilityLabel="Verification code"
                />
              </View>
            ) : null}
            {err ? <Text style={{ color: C.bad, fontSize: 14 }} accessibilityRole="alert">{err}</Text> : null}
            {sent ? (
              <View style={{ gap: S.sm }}>
                <Button label={busy ? 'Checking…' : 'Verify'} onPress={confirm} disabled={busy} />
                <Button label="Send a new code" variant="secondary" onPress={send} disabled={busy} />
              </View>
            ) : (
              <Button label={busy ? 'Sending…' : 'Email me a code'} onPress={send} disabled={busy || !email.trim()} />
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.blueSoft, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line2, borderRadius: R.md, paddingHorizontal: S.md, fontSize: 16, color: C.ink, backgroundColor: C.surface },
});
