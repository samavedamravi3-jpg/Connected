import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Note } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

/**
 * Email one-time-code sign-in. `?then=finish` comes from the end of onboarding: the answers already on the phone
 * are saved to the new account. Otherwise it's "I already have an account" from the welcome screen.
 */
export default function SignIn() {
  const { then } = useLocalSearchParams<{ then?: string }>();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  async function send() {
    if (!validEmail) return setErr('Enter a valid email address.');
    setBusy(true);
    setErr('');
    try {
      const r = await app.startSignIn(email.trim());
      setDevCode(r.devCode ?? null);
      setStep('code');
      setCooldown(30);
      setTimeout(() => codeInput.current?.focus(), 300);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (!/^\d{6}$/.test(value)) return setErr('Enter the 6-digit code from the email.');
    setBusy(true);
    setErr('');
    try {
      const r = await app.verifySignIn(email.trim(), value);
      if (r.onboarded) router.replace('/');
      else if (then === 'finish') router.back(); // onboarding finishes saving and shows the "you're set" screen
      else router.replace('/onboarding');
    } catch (e) {
      setErr((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: then === 'finish' ? 'Save your profile' : 'Sign in' }} />
      <ScrollView contentContainerStyle={{ padding: S.xl, paddingBottom: insets.bottom + S.xl, gap: S.lg }} keyboardShouldPersistTaps="handled">
        <View style={styles.icon}><Ionicons name={step === 'email' ? 'mail-outline' : 'key-outline'} size={26} color={C.accent} /></View>
        {step === 'email' ? (
          <>
            <Text style={T.title} accessibilityRole="header">{then === 'finish' ? 'One last step' : 'Welcome back'}</Text>
            <Text style={T.muted}>
              {then === 'finish'
                ? 'Add your email so your profile, requests and conversations are saved and real people can reach you. We’ll send a 6-digit code. No password.'
                : 'Enter the email you used before. We’ll send a 6-digit code. No password.'}
            </Text>
            <TextInput
              value={email}
              onChangeText={(t) => { setEmail(t); setErr(''); }}
              placeholder="you@example.com"
              placeholderTextColor={C.ink3}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="send"
              onSubmitEditing={send}
              style={styles.input}
              accessibilityLabel="Email address"
            />
            {err ? <Text style={styles.err} accessibilityLiveRegion="polite">{err}</Text> : null}
            <Button label={busy ? 'Sending…' : 'Email me a code'} icon="arrow-forward" disabled={busy || !validEmail} onPress={send} />
          </>
        ) : (
          <>
            <Text style={T.title} accessibilityRole="header">Check your email</Text>
            <Text style={T.muted}>We sent a code to <Text style={{ color: C.ink, fontWeight: '600' }}>{email.trim()}</Text>. It expires in 10 minutes.</Text>
            {devCode ? (
              <Note icon="construct-outline" tone="accent">
                Development server (no email service yet): your code is {devCode}.{' '}
                <Text style={{ color: C.accent, fontWeight: '700' }} onPress={() => { setCode(devCode); void verify(devCode); }}>Use it</Text>
              </Note>
            ) : null}
            <TextInput
              ref={codeInput}
              value={code}
              onChangeText={(t) => {
                const v = t.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                setErr('');
                if (v.length === 6) void verify(v);
              }}
              placeholder="123456"
              placeholderTextColor={C.ink3}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              style={[styles.input, styles.code]}
              accessibilityLabel="6-digit code"
            />
            {err ? <Text style={styles.err} accessibilityLiveRegion="polite">{err}</Text> : null}
            <Button label={busy ? 'Checking…' : 'Continue'} icon="checkmark" disabled={busy || code.length !== 6} onPress={() => verify()} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable onPress={() => { setStep('email'); setCode(''); setErr(''); setDevCode(null); }} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.link}>Use a different email</Text>
              </Pressable>
              <Pressable onPress={send} disabled={cooldown > 0 || busy} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.link, cooldown > 0 && { color: C.ink3 }]}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</Text>
              </Pressable>
            </View>
          </>
        )}
        <Text style={[T.small, { textAlign: 'center' }]}>We only use your email to sign you in. It’s never shown to other members.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 52, borderWidth: 1, borderColor: C.line2, borderRadius: R.md, paddingHorizontal: S.lg, fontSize: 17, color: C.ink, backgroundColor: C.white },
  code: { fontSize: 26, letterSpacing: 10, textAlign: 'center', fontVariant: ['tabular-nums'] },
  err: { color: C.bad, fontSize: 14 },
  link: { color: C.accent, fontSize: 15, fontWeight: '600' },
});
