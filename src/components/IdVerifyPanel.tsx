import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, Text, View } from 'react-native';
import { Button, Note, Tag, type IconName } from '@/components/ui';
import { stillCapturing, idErrorMessage } from '@/lib/idStatus';
import { fetchIdAttempt, idServerMode, isProfileNotReadyError, startIdVerification } from '@/lib/idVerification';
import { NOT_SAVED_MESSAGE } from '@/lib/profileSync';
import { useApp } from '@/state/AppState';
import { C, R, S, T } from '@/theme';

const STRIPE_PRIVACY = 'https://stripe.com/privacy';
const OFFLINE = 'Couldn’t reach the server. Check your connection, then tap Check status.';
// Backoff while Stripe is processing or the browser is open: 3 s, 6 s, 12 s, 24 s, then every 30 s, about 10 minutes in all.
const pollDelay = (n: number) => Math.min(3000 * 2 ** n, 30000);
const MAX_POLLS = 22;

const STEPS: [IconName, string, string][] = [
  ['card-outline', 'Photo of your ID', 'Your camera captures the front (and back, if needed) of a government photo ID. Uploads aren’t accepted.'],
  ['happy-outline', 'Selfie', 'Stripe compares a live selfie with the photo on your ID.'],
  ['shield-checkmark-outline', 'Confirmation', 'Usually a few minutes. Real people, requests, chats and events unlock when Stripe confirms it.'],
];

/**
 * The mandatory ID check (government photo ID + selfie, run by Stripe) in every state, with one primary action.
 * Shared by onboarding and /verify-id. Status always comes from the server: we re-read it when the app returns to the
 * foreground, on Check status, and by polling with backoff while a check is open or processing. Nothing here can mark
 * anyone verified, and only a live-mode result unlocks Connected.
 */
export function IdVerifyPanel({ onDone, onSignIn, onEditProfile }: { onDone?: () => void; onSignIn?: () => void; onEditProfile?: () => void }) {
  const app = useApp();
  const [mode, setMode] = useState<{ available: boolean; test: boolean } | null>(null);
  const [busy, setBusy] = useState<'start' | 'check' | 'save' | null>(null);
  const [opened, setOpened] = useState<string | null | undefined>(undefined); // event_at when Stripe's page was opened
  const [attempt, setAttempt] = useState<{ lastError: string | null; eventAt: string | null }>({ lastError: null, eventAt: null });
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const [notReady, setNotReady] = useState(false); // a save or the server said your profile row isn't there yet
  const inFlight = useRef(false); // blocks a second tap before the disabled state renders
  const status = app.idStatus;
  const signedIn = !!app.session;
  const uid = app.session?.userId;
  const refreshStatus = app.refreshId;
  const loadAttempt = useCallback(() => (uid ? fetchIdAttempt(uid).then(setAttempt).catch(() => {}) : Promise.resolve()), [uid]);
  // Status (shared app state) plus this attempt's error code and event time (only this screen needs them).
  const refreshId = useCallback(async () => {
    const ok = await refreshStatus();
    if (ok) await loadAttempt();
    return ok;
  }, [refreshStatus, loadAttempt]);
  useEffect(() => {
    loadAttempt();
  }, [loadAttempt, status]);
  const ensureSaved = app.ensureProfileSaved;
  const ready = app.profileReady;

  // The identity function needs your saved profile row: save it now instead of waiting for the debounce.
  const kicked = useRef(false);
  useEffect(() => {
    if (!signedIn || ready || kicked.current) return;
    kicked.current = true;
    ensureSaved();
  }, [signedIn, ready, ensureSaved]);

  const loadMode = useCallback(() => {
    setMode(null);
    return idServerMode().then(setMode);
  }, []);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    idServerMode().then((m) => live && setMode(m));
    return () => { live = false; };
  }, [signedIn]);

  // Back from the browser (closed, finished or dismissed early): the app becomes active, so re-read the result.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshId(); });
    return () => sub.remove();
  }, [refreshId]);

  // A test pass counts as not started: once live mode is on, the user runs a real check.
  const notStarted = status === 'unverified' || status === 'test_verified';
  const capturing = stillCapturing(opened, status, attempt.eventAt);
  const polling = signedIn && (status === 'pending' || capturing);
  useEffect(() => {
    if (!polling) return;
    let n = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      t = setTimeout(async () => {
        await refreshId();
        if (++n < MAX_POLLS) tick();
      }, pollDelay(n));
    };
    tick();
    return () => clearTimeout(t);
  }, [polling, refreshId]);

  const run = useCallback(async (kind: 'start' | 'check' | 'save') => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(kind);
    setErr('');
    setNotReady(false);
    try {
      if (kind !== 'check' && !(await ensureSaved())) return setNotReady(true);
      if (kind === 'start' && (await startIdVerification()) === 'opened') setOpened(attempt.eventAt);
      if (kind !== 'save' && !(await refreshId())) setErr(OFFLINE);
    } catch (e) {
      if (isProfileNotReadyError(e)) setNotReady(true);
      else setErr(e instanceof Error ? e.message : 'Couldn’t start verification.');
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }, [refreshId, ensureSaved, attempt.eventAt]);

  if (!app.authReady) return <ActivityIndicator color={C.accent} accessibilityLabel="Loading your account" />;
  if (!signedIn) {
    return (
      <View style={{ gap: S.md }}>
        <Note icon="person-circle-outline">Sign in or create an account first. The ID check is tied to your account, so it can’t run in demo mode.</Note>
        <Button label="Sign in to verify" icon="log-in-outline" onPress={onSignIn ?? (() => router.push('/auth'))} />
      </View>
    );
  }
  if (status === 'verified') {
    return (
      <View style={{ gap: S.md }}>
        <Note tone="ok" icon="shield-checkmark">ID verified. Connected is unlocked, and people see an ID badge on your profile.</Note>
        {onDone ? <Button label="Continue" icon="arrow-forward" onPress={onDone} /> : null}
      </View>
    );
  }
  if (!mode) return <ActivityIndicator color={C.accent} accessibilityLabel="Checking the verification service" />;

  const testResult = status === 'test_verified' ? (
    <View style={{ gap: S.sm }}>
      <View style={{ flexDirection: 'row' }}><Tag label="Test result — does not unlock Connected" icon="flask-outline" tone="warn" /></View>
      <Note icon="flask-outline">Your Stripe test-mode check passed. Test checks use sample data, so they add no ID badge and don’t unlock real people, requests, chats or events.</Note>
    </View>
  ) : null;

  if (!mode.available) {
    return (
      <View style={{ gap: S.md }}>
        {testResult}
        <View accessibilityRole="alert">
          <Note tone="warn" icon="construct-outline">
            Real ID verification is unavailable right now: the verification service isn’t set up on Connected’s server. Real people, requests, chats and events stay locked until it is. You can still explore demo mode.
          </Note>
        </View>
        <Button label="Check again" icon="refresh" variant="secondary" onPress={loadMode} />
      </View>
    );
  }

  const testMode = mode.test ? (
    <View style={{ gap: S.sm }}>
      <View style={{ flexDirection: 'row' }}><Tag label="Test mode" icon="flask-outline" tone="warn" /></View>
      <Note tone="warn" icon="information-circle-outline">
        Live ID verification is switched off on Connected’s server, so a real check can’t run yet and Connected stays locked. You can try Stripe’s test flow (no real ID needed); its result is a test result that does not unlock Connected.
      </Note>
    </View>
  ) : null;

  // In test mode a passed test is as far as it goes; with live mode on, the user can now run the real check.
  if (status === 'test_verified' && mode.test) return <View style={{ gap: S.md }}>{testResult}{testMode}</View>;

  const fresh = notStarted || status === 'canceled';
  const showIntro = fresh && !capturing;
  const issue = app.profileSaveIssue;
  // A draft (text waiting for review) doesn't block the ID check: the row is saved, only that text isn't public yet.
  const draftNote = issue?.draft ? issue.message : null;
  const saveProblem = status === 'pending' ? null : (issue?.draft ? null : issue) ?? (notReady ? { message: NOT_SAVED_MESSAGE, rejected: false } : null);
  const settingUp = !ready && status !== 'pending';
  const editProfile = onEditProfile ?? (() => router.push({ pathname: '/onboarding', params: { edit: 'profile' } }));
  const primary =
    status === 'pending' ? 'Check status'
    : busy === 'start' ? 'Opening…'
    : settingUp ? 'Setting up your profile…'
    : capturing || status === 'started' ? 'Continue verification'
    : status === 'rejected' ? 'Try again'
    : 'Start ID check';

  return (
    <View style={{ gap: S.md }}>
      {testMode}
      {testResult}
      {showIntro ? <Intro consent={consent} onConsent={() => setConsent((v) => !v)} /> : null}
      {status === 'canceled' && !capturing ? <Note icon="close-circle-outline">Your last check was canceled or expired. Start a new one when you’re ready.</Note> : null}
      {capturing ? <Note icon="open-outline">Finish the ID and selfie steps in your browser. Closed it early? Tap Continue verification to pick up where you left off. We check for your result automatically.</Note> : null}
      {status === 'started' && !capturing ? <Note icon="hourglass-outline">You started a check but haven’t finished it. Pick up where you left off.</Note> : null}
      {status === 'pending' ? (
        <View style={{ flexDirection: 'row', gap: S.sm, alignItems: 'center' }} accessibilityLiveRegion="polite">
          <ActivityIndicator color={C.accent} />
          <Text style={[T.small, { flex: 1 }]}>Stripe is checking your ID and selfie. This usually takes a few minutes; this screen updates by itself.</Text>
        </View>
      ) : null}
      {status === 'rejected' && !capturing ? (
        <View accessibilityRole="alert">
          <Note tone="warn" icon="alert-circle-outline">{idErrorMessage(attempt.lastError, mode.test)}</Note>
        </View>
      ) : null}
      {err ? <Text style={{ color: C.bad, fontSize: 14 }} accessibilityRole="alert">{err}</Text> : null}
      {draftNote ? (
        <>
          <Note icon="time-outline">{draftNote}</Note>
          <Button label="Try again" icon="refresh" variant="secondary" small loading={busy === 'save'} disabled={!!busy} onPress={() => run('save')} />
        </>
      ) : null}
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
          label={primary}
          icon={status === 'pending' ? 'refresh' : 'camera-outline'}
          loading={status === 'pending' ? busy === 'check' : busy === 'start' || settingUp}
          disabled={!!busy || settingUp || (showIntro && !consent)}
          accessibilityHint={showIntro && !consent ? 'Agree to the consent statement above first.' : 'Opens Stripe’s verification page in your browser.'}
          onPress={() => run(status === 'pending' ? 'check' : 'start')}
        />
      )}
      {status !== 'pending' && (capturing || !notStarted) ? (
        <Button label="Check status" icon="refresh" variant="secondary" loading={busy === 'check'} disabled={!!busy} onPress={() => run('check')} />
      ) : null}
    </View>
  );
}

/** What happens, what's accepted, what's kept, and explicit consent, before Stripe's camera flow opens. */
function Intro({ consent, onConsent }: { consent: boolean; onConsent: () => void }) {
  return (
    <View style={{ gap: S.md }}>
      <View style={{ gap: S.md }}>
        {STEPS.map(([icon, title, body], k) => (
          <View key={title} style={{ flexDirection: 'row', gap: S.md, alignItems: 'flex-start' }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={18} color={C.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={T.label}>{k + 1}. {title}</Text>
              <Text style={T.small}>{body}</Text>
            </View>
          </View>
        ))}
      </View>
      <Note icon="card-outline">Accepted: driver’s license, passport or national ID card. It must be a physical, unexpired, government-issued photo ID. Stripe doesn’t verify people under the age of majority.</Note>
      <View style={{ gap: S.xs }}>
        <Text style={T.label}>Your privacy</Text>
        <Text style={T.small}>
          Stripe, our verification provider, collects and processes your ID images and selfie, including comparing your face with your ID photo. Connected doesn’t store your ID images, selfie, face data, document number or Stripe’s verification details. We keep only the result, whether it was a test, an error code if it failed, and dates.
        </Text>
        <Text style={T.small}>
          Stripe keeps verification data for a period set by its own privacy policy.{' '}
          <Text style={{ color: C.accent, fontWeight: '600' }} accessibilityRole="link" onPress={() => Linking.openURL(STRIPE_PRIVACY).catch(() => {})}>Read Stripe’s privacy policy</Text>
        </Text>
        <Text style={T.small}>A verified ID confirms someone is who they say they are. It doesn’t guarantee anyone is safe to meet, so keep first meetings in public places.</Text>
      </View>
      <Pressable
        onPress={onConsent}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        style={{ flexDirection: 'row', gap: S.md, alignItems: 'flex-start', padding: S.md, borderRadius: R.md, borderWidth: 1, borderColor: consent ? C.accent : C.line2, backgroundColor: C.surface, minHeight: 44 }}
      >
        <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? C.accent : C.ink3} />
        <Text style={[T.body, { flex: 1, fontSize: 15, lineHeight: 21 }]}>
          I agree that Stripe may collect and process my ID and selfie, including face matching, to verify my identity for Connected.
        </Text>
      </Pressable>
    </View>
  );
}
