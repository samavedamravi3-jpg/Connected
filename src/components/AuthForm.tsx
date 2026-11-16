import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AuthFailure, RESEND_COOLDOWN_S } from '@/lib/authErrors';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';
import { Button } from './ui';

type Props = {
  mode: 'signup' | 'signin';
  onDone: (r: { mode: 'signup' | 'signin'; needsConfirmation?: boolean; hasProfile?: boolean }) => void;
  onSwitchMode?: () => void;
};

/** Email + password form for creating an account or signing in. */
export function AuthForm({ mode, onDone, onSwitchMode }: Props) {
  const app = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const inFlight = useRef(false); // state is async, so a tap plus the keyboard's Return could both get through `busy`
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = async () => {
    if (inFlight.current || wait > 0) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await app.resendConfirmation(email);
      setErr('');
      setWait(RESEND_COOLDOWN_S);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setWait(RESEND_COOLDOWN_S);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const submit = async () => {
    if (inFlight.current) return;
    setErr('');
    setUnconfirmed(false);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Enter a valid email address.');
    if (mode === 'signup' && password.length < 8) return setErr('Use at least 8 characters for your password.');
    if (!password) return setErr('Enter your password.');
    inFlight.current = true;
    setBusy(true);
    try {
      if (mode === 'signup') {
        const r = await app.signUp(email, password);
        onDone({ mode, needsConfirmation: r.needsConfirmation });
      } else {
        const r = await app.signIn(email, password);
        onDone({ mode, hasProfile: r.hasProfile });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setUnconfirmed(e instanceof AuthFailure && e.code === 'email_not_confirmed');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: S.lg }}>
      <View style={{ gap: 6 }}>
        <Text style={T.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={C.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          style={styles.input}
          accessibilityLabel="Email"
        />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={T.label}>Password</Text>
        <View style={styles.pwRow}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
            placeholderTextColor={C.ink3}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            style={[styles.input, { flex: 1, borderWidth: 0 }]}
            onSubmitEditing={submit}
            accessibilityLabel="Password"
          />
          <Pressable onPress={() => setShow((v) => !v)} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} hitSlop={8} style={{ paddingHorizontal: S.md }}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.ink3} />
          </Pressable>
        </View>
      </View>
      {err ? <Text style={styles.err} accessibilityRole="alert">{err}</Text> : null}
      {unconfirmed ? (
        <Button label={wait > 0 ? `Resend email in ${wait}s` : 'Resend confirmation email'} variant="secondary" onPress={resend} disabled={busy || wait > 0} />
      ) : null}
      <Button label={busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'} onPress={submit} disabled={busy} />
      {onSwitchMode ? (
        <Pressable onPress={onSwitchMode} accessibilityRole="button" style={{ alignSelf: 'center', minHeight: 40, justifyContent: 'center' }}>
          <Text style={[T.small, { color: C.accent, fontWeight: '600' }]}>
            {mode === 'signup' ? 'I already have an account' : 'New here? Create an account'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderColor: C.line2, borderRadius: R.md, paddingHorizontal: S.md, fontSize: 16, color: C.ink, backgroundColor: C.surface },
  pwRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line2, borderRadius: R.md, backgroundColor: C.surface },
  err: { color: C.bad, fontWeight: '600', fontSize: 15 },
});
