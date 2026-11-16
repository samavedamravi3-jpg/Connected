import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { Button, Note, Tag } from '@/components/ui';
import { idServerMode, isProfileNotReadyError, startIdVerification, type IdStatus } from '@/lib/idVerification';
import { NOT_SAVED_MESSAGE } from '@/lib/profileSync';
import { useApp } from '@/state/AppState';
import { C, S, T } from '@/theme';

const PRIMARY: Record<IdStatus, string> = {
  unverified: 'Verify identity', started: 'Continue verification', rejected: 'Try again', canceled: 'Verify identity',
  pending: 'Check status', verified: '', test_verified: '',
};

/**
 * The ID check in every state, with one primary action. Shared by onboarding, Profile (via /verify-id) and the gate prompt.
 * Status always comes from the server: after the browser closes we re-read it (app foreground, or "Check status").
 */
export function IdVerifyPanel({ onDone, onLater, onSignIn, onEditProfile }: { onDone?: () => void; onLater?: () => void; onSignIn?: () => void; onEditProfile?: () => void }) {
  const app = useApp();
  const [mode, setMode] = useState<{ available: boolean; test: boolean } | null>(null);
  const [busy, setBusy] = useState<'start' | 'check' | 'save' | null>(null);
  const [opened, setOpened] = useState(false);
  const [err, setErr] = useState('');
  const [notReady, setNotReady] = useState(false); // a save or the server said your profile row isn't there yet
  const inFlight = useRef(false); // blocks a second tap before the disabled state renders
  const status = app.idStatus;
  const signedIn = !!app.session;
  const refreshId = app.refreshId;
  const ensureSaved = app.ensureProfileSaved;
  const ready = app.profileReady;

  // The identity function needs your saved profile row: save it now instead of waiting for the debounce.
  const kicked = useRef(false);
  useEffect(() => {
    if (!signedIn || ready || kicked.current) return;
    kicked.current = true;
    ensureSaved();
  }, [signedIn, ready, ensureSaved]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    idServerMode().then((m) => live && setMode(m));
    return () => { live = false; };
  }, [signedIn]);

  // Back from the browser: the app becomes active again, so re-read the result from the server.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshId(); });
    return () => sub.remove();
  }, [refreshId]);

  const run = useCallback(async (kind: 'start' | 'check' | 'save') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setErr('');
    setNotReady(false);
    try {
      if (kind !== 'check' && !(await ensureSaved())) return setNotReady(true);
      if (kind === 'start' && (await startIdVerification()) === 'opened') setOpened(true);
      if (kind !== 'save') await refreshId();
    } catch (e) {
      if (isProfileNotReadyError(e)) setNotReady(true);
      else setErr(e instanceof Error ? e.message : 'Couldn’t start verification.');
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }, [refreshId, ensureSaved]);

  if (!app.authReady) return <ActivityIndicator color={C.accent} accessibilityLabel="Loading your account" />;
  if (!signedIn) {
    return (
      <View style={{ gap: S.md }}>
        <Note icon="person-circle-outline">Sign in or create an account first. The check is tied to your account, so it can’t run in guest mode.</Note>
        <Button label="Sign in to verify" icon="log-in-outline" onPress={onSignIn ?? (() => router.push('/auth'))} />
        {onLater ? <Button label="Do this later" variant="quiet" onPress={onLater} /> : null}
      </View>
    );
  }
  if (status === 'verified') {
    return (
      <View style={{ gap: S.md }}>
        <Note tone="accent" icon="shield-checkmark">ID verified. People see an ID badge on your profile.</Note>
        {onDone ? <Button label="Continue" onPress={onDone} /> : null}
      </View>
    );
  }
  if (!mode) return <ActivityIndicator color={C.accent} accessibilityLabel="Checking verification service" />;

  const testTag = mode.test ? <View style={{ flexDirection: 'row' }}><Tag label="Test verification" icon="flask-outline" tone="warn" /></View> : null;

  if (status === 'test_verified') {
    return (
      <View style={{ gap: S.md }}>
        {testTag}
        <Note tone="accent" icon="flask-outline">Test verification passed. This was a Stripe test-mode check, so it adds no ID badge and doesn’t count as ID verified.</Note>
        {onDone ? <Button label="Continue" onPress={onDone} /> : null}
      </View>
    );
  }
  if (!mode.available) {
    return (
      <View style={{ gap: S.md }}>
        <Note icon="construct-outline">Verification currently unavailable. Nothing changes for you: keep using the app, and verify later from your profile.</Note>
        {onDone ? <Button label="Continue" onPress={onDone} /> : null}
      </View>
    );
  }

  const showCheck = status !== 'unverified' || opened;
  const issue = app.profileSaveIssue;
  const saveProblem = status === 'pending' ? null : issue ?? (notReady ? { message: NOT_SAVED_MESSAGE, rejected: false } : null);
  const settingUp = !ready && status !== 'pending';
  const editProfile = onEditProfile ?? (() => router.push({ pathname: '/onboarding', params: { edit: 'profile' } }));
  return (
    <View style={{ gap: S.md }}>
      {testTag}
      {status === 'started' ? <Note icon="hourglass-outline">You started a check but haven’t finished it. Pick up where you left off.</Note> : null}
      {status === 'pending' ? <Note icon="time-outline">Stripe is reviewing your check. This usually takes a minute or two. Tap Check status to see the result.</Note> : null}
      {status === 'rejected' ? <Note tone="warn" icon="alert-circle-outline">That attempt didn’t go through. Use an unexpired government ID in good light, and make sure your face is clearly visible in the selfie.</Note> : null}
      {status === 'canceled' ? <Note icon="close-circle-outline">That check was canceled. You can start a new one.</Note> : null}
      {opened && status === 'unverified' ? <Note icon="open-outline">Finish the steps in your browser, then come back here and tap Check status.</Note> : null}
      <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'flex-start' }}>
        <Ionicons name="lock-closed-outline" size={18} color={C.ink2} style={{ marginTop: 2 }} />
        <Text style={[T.small, { flex: 1 }]}>Stripe processes your ID and selfie. We never see or store your ID photos, selfie or document details, only the result and the date.</Text>
      </View>
      {err ? <Text style={{ color: C.bad, fontSize: 14 }} accessibilityRole="alert">{err}</Text> : null}
      {saveProblem ? (
        <>
          <View accessibilityRole="alert">
            <Note tone="warn" icon="alert-circle-outline">{saveProblem.message}</Note>
          </View>
          <Button label="Try again" icon="refresh" loading={busy === 'save'} disabled={!!busy} onPress={() => run('save')} />
          {saveProblem.rejected ? <Button label="Edit profile" icon="create-outline" variant="secondary" disabled={!!busy} onPress={editProfile} /> : null}
        </>
      ) : (
        <Button
          label={status === 'pending' ? PRIMARY.pending : busy === 'start' ? 'Opening…' : settingUp ? 'Setting up your profile…' : PRIMARY[status]}
          icon={status === 'pending' ? 'refresh' : 'shield-checkmark-outline'}
          loading={status === 'pending' ? busy === 'check' : busy === 'start' || settingUp}
          disabled={!!busy || settingUp}
          onPress={() => run(status === 'pending' ? 'check' : 'start')}
        />
      )}
      {showCheck && status !== 'pending' ? <Button label="Check status" icon="refresh" variant="secondary" loading={busy === 'check'} disabled={!!busy} onPress={() => run('check')} /> : null}
      {onLater ? <Button label="Do this later" variant="quiet" disabled={!!busy} onPress={onLater} /> : null}
    </View>
  );
}
