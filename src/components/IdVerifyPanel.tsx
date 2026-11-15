import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { Button, Note } from '@/components/ui';
import { idAvailable, startIdVerification } from '@/lib/idVerification';
import { useApp } from '@/state/AppState';
import { C, S, T } from '@/theme';

/** The four ID states with one primary action. Used on the verify screen, Profile and onboarding. */
export function IdVerifyPanel({ onDone }: { onDone?: () => void }) {
  const app = useApp();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const status = app.idStatus;

  useEffect(() => {
    idAvailable().then(setAvailable).catch(() => setAvailable(false));
  }, []);
  // Back from the browser: pick up the result.
  const refresh = app.refreshId;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const start = useCallback(async () => {
    setBusy(true);
    setErr('');
    try {
      await startIdVerification();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t start verification.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (!app.session) return <Note>Create an account or sign in first, then verify your ID.</Note>;
  if (status === 'verified') {
    return (
      <View style={{ gap: S.md }}>
        <Note tone="accent" icon="shield-checkmark">ID verified. People see an ID badge on your profile.</Note>
        {onDone ? <Button label="Continue" onPress={onDone} /> : null}
      </View>
    );
  }
  if (available === null) return <ActivityIndicator color={C.accent} />;
  if (!available) return <Note icon="construct-outline">Verification unavailable right now. You can still use the app, and we’ll ask again when it’s ready.</Note>;

  return (
    <View style={{ gap: S.md }}>
      {status === 'pending' ? <Note icon="time-outline">Your check is being reviewed. This can take a few minutes. Come back and refresh.</Note> : null}
      {status === 'rejected' ? <Note tone="warn" icon="alert-circle-outline">We couldn’t verify that ID. Good light and an unexpired government ID help. You can try again.</Note> : null}
      {status === 'unverified' ? (
        <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'flex-start' }}>
          <Ionicons name="lock-closed-outline" size={18} color={C.ink2} style={{ marginTop: 2 }} />
          <Text style={[T.small, { flex: 1 }]}>You’ll scan an ID and take a selfie with our identity partner. We keep only the result and the date, never the photos or ID number.</Text>
        </View>
      ) : null}
      {err ? <Text style={{ color: C.bad, fontSize: 14 }} accessibilityRole="alert">{err}</Text> : null}
      <Button label={busy ? 'Opening…' : status === 'pending' ? 'Refresh status' : status === 'rejected' ? 'Try again' : 'Verify my ID'} icon="shield-checkmark-outline" disabled={busy} onPress={status === 'pending' ? refresh : start} />
    </View>
  );
}
