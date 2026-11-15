/**
 * ID verification (client side). The app never sees ID images or numbers and cannot set the result:
 * the `identity` edge function starts a hosted check with the provider (Stripe Identity, test mode), and only
 * its signed webhook marks you verified. See supabase/functions/identity and docs/id-verification.md.
 */
import { Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { supabase } from './supabase';

export type IdStatus = 'unverified' | 'pending' | 'verified' | 'rejected';

/** Your own status. Others only ever see the public `id_verified` badge. */
export async function fetchIdStatus(userId: string, publicVerified: boolean): Promise<IdStatus> {
  if (publicVerified) return 'verified';
  if (!supabase) return 'unverified';
  const { data } = await supabase.from('id_verifications').select('status').eq('user_id', userId).maybeSingle();
  return (data?.status as IdStatus | undefined) ?? 'unverified';
}

/** True when the server has an ID provider configured. False (not an error) means "Verification unavailable". */
export async function idAvailable(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.functions.invoke('identity', { body: { action: 'status' } });
  return !error && !!(data as { available?: boolean } | null)?.available;
}

/** Starts the hosted check and opens it in the browser. Throws a friendly Error on failure. */
export async function startIdVerification(): Promise<void> {
  if (!supabase) throw new Error('Accounts aren’t set up in this build.');
  const { data, error } = await supabase.functions.invoke('identity', { body: { action: 'session' } });
  if (error) {
    let msg = 'Couldn’t start verification. Try again later.';
    try {
      const body = await (error as { context?: Response }).context?.json();
      msg = body?.error === 'unavailable' ? 'Verification unavailable right now.' : body?.error ?? msg;
    } catch {
      /* keep the default */
    }
    throw new Error(msg);
  }
  const url = (data as { url?: string } | null)?.url;
  if (!url || !/^https:\/\//.test(url)) throw new Error('Couldn’t start verification. Try again later.');
  await Linking.openURL(url);
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

export const isIdRequiredError = (e: unknown) => String((e as { message?: string } | null)?.message ?? '').includes('id_required');
