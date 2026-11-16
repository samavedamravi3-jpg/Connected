/**
 * ID verification (client side). The app never sees ID images or numbers and cannot set the result:
 * the `identity` edge function starts or resumes a hosted Stripe Identity check, and only the signed
 * `identity-webhook` updates the status. See supabase/functions/identity* and docs/id-verification.md.
 */
import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { toIdStatus, type IdStatus } from './idStatus';
import { supabase } from './supabase';

export type { IdStatus };

/** Your own status, read from the server: the public flag AND your live verified row (same rule as is_real_member). */
export async function fetchIdStatus(userId: string, publicVerified: boolean): Promise<IdStatus> {
  if (!supabase) return 'unverified';
  const { data, error } = await supabase.from('id_verifications').select('status, livemode').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return toIdStatus(data, publicVerified);
}

/** Is an ID provider configured on the server, and is it Stripe test mode? Any failure reads as unavailable. */
export async function idServerMode(): Promise<{ available: boolean; test: boolean }> {
  if (!supabase) return { available: false, test: false };
  const { data, error } = await supabase.functions.invoke('identity', { body: { action: 'status' } });
  const d = data as { available?: boolean; test?: boolean } | null;
  return error ? { available: false, test: false } : { available: !!d?.available, test: !!d?.test };
}

/**
 * Resumes your open check or starts one, then opens Stripe's hosted page in the browser.
 * Returns 'processing' when Stripe already has your submission (nothing to open). Throws a friendly Error.
 */
export async function startIdVerification(): Promise<'opened' | 'processing'> {
  if (!supabase) throw new Error('Accounts aren’t set up in this build.');
  const { data, error } = await supabase.functions.invoke('identity', { body: { action: 'session' } });
  if (error) {
    let msg = 'Couldn’t start verification. Try again later.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      msg = body?.error === 'unavailable' ? 'Verification currently unavailable.' : body?.error ?? msg;
    } catch {
      /* keep the default */
    }
    throw new Error(msg);
  }
  const d = data as { url?: string; state?: string } | null;
  if (d?.state === 'processing') return 'processing';
  const url = d?.url;
  if (!url || !/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//.test(url)) throw new Error('Couldn’t start verification. Try again later.');
  // External browser (Safari / Chrome): camera access works there, and no redirect back into the app is needed.
  try {
    await Linking.openURL(url);
  } catch {
    throw new Error('Couldn’t open the browser. Check that a browser is installed, then try again.');
  }
  return 'opened';
}

/** Whether the server currently requires ID verification for sensitive actions (a switch in app_config). */
async function gateOn(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.rpc('id_gate_on');
  return data === true;
}

/**
 * Call before a sensitive action. Returns true when the action is blocked (and the prompt is showing).
 * The database enforces the same rule for connection requests; this just explains it before the attempt.
 */
export async function idBlocks(status: IdStatus, action: string): Promise<boolean> {
  if (status === 'verified' || !(await gateOn())) return false;
  Alert.alert('Verify your ID first', `To ${action}, confirm your identity. It takes a couple of minutes, and we never keep your ID photos.`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Verify', onPress: () => router.push('/verify-id') },
  ]);
  return true;
}

/** The identity function couldn't find your profile row yet ("Finish setting up your profile first"). */
export const isProfileNotReadyError = (e: unknown) => /setting up your profile/i.test(String((e as { message?: string } | null)?.message ?? ''));

export const isIdRequiredError =(e: unknown) => String((e as { message?: string } | null)?.message ?? '').includes('id_required');
