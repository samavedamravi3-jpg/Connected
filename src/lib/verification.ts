/**
 * Verified badge, phase 1: prove a school or work email with a one-time code.
 *
 * How it works (nothing here can set the flag; only the server can):
 *  1. A throwaway Supabase client asks Supabase Auth to email a code to the school or work address.
 *  2. The person types the code; the throwaway client confirms it and gets a proof token.
 *  3. We send that proof to the `verify-email` edge function with the real session. The function
 *     checks the email and domain, then sets profiles.verified / verified_at / verified_kind.
 *     The database blocks clients from changing those columns directly.
 * We store only verified true/false, the date, and the kind ("school" or "work"). Never the email.
 *
 * Phase 2 (planned): Stripe Identity in test mode through server/. See docs/verification.md.
 */
import { assertClean } from './moderation';
import { createEphemeralClient, supabase } from './supabase';

export type VerifyKind = 'school' | 'work';

const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com',
  'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com', 'yandex.com', 'qq.com', '163.com',
]);
const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'trashmail.com', 'yopmail.com', 'sharklasers.com', 'getnada.com']);

/** Classify an address by its domain. Mirrors supabase/functions/verify-email/index.ts. */
export function classifyEmail(email: string): { ok: true; kind: VerifyKind } | { ok: false; reason: string } {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, reason: 'Enter a valid email address.' };
  const domain = e.split('@')[1];
  if (FREE_MAIL.has(domain)) return { ok: false, reason: 'Use a school or work email, not a personal one like Gmail or Yahoo.' };
  if (DISPOSABLE.has(domain)) return { ok: false, reason: 'Temporary email addresses can’t be used to verify.' };
  const school = /\.edu$/.test(domain) || /\.(edu|ac)\.[a-z]{2}$/.test(domain);
  return { ok: true, kind: school ? 'school' : 'work' };
}

export type Verification = { verified: boolean; at: number | null; kind: 'school' | 'work' | 'id' | null };
export const NOT_VERIFIED: Verification = { verified: false, at: null, kind: null };

/** Step 1: email a code to the school or work address. */
export async function sendVerificationCode(email: string): Promise<void> {
  const c = classifyEmail(email);
  if (!c.ok) throw new Error(c.reason);
  const otp = createEphemeralClient();
  if (!otp) throw new Error('Accounts aren’t set up in this build.');
  const { error } = await otp.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  if (error) throw new Error(error.message);
}

/** Step 2: confirm the code, then ask the server to mark you verified. */
export async function confirmVerificationCode(email: string, code: string): Promise<Verification> {
  assertClean(code);
  if (!supabase) throw new Error('Accounts aren’t set up in this build.');
  const otp = createEphemeralClient();
  if (!otp) throw new Error('Accounts aren’t set up in this build.');
  const { data, error } = await otp.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error || !data.session) throw new Error(error?.message ?? 'That code didn’t work. Check it and try again.');
  const res = await supabase.functions.invoke('verify-email', { body: { proof: data.session.access_token } });
  if (res.error) {
    // The function replies with { error } and a 4xx status; surface its message when there is one.
    let msg = 'We couldn’t verify that email. Try again.';
    try {
      const body = await (res.error as { context?: Response }).context?.json();
      if (body?.error) msg = body.error;
    } catch {
      /* keep the default */
    }
    throw new Error(msg);
  }
  const out = res.data as { kind?: Verification['kind']; at?: string };
  return { verified: true, at: out.at ? Date.parse(out.at) : Date.now(), kind: out.kind ?? null };
}

export function toVerification(row: { verified?: boolean; verified_at?: string | null; verified_kind?: Verification['kind'] } | null): Verification {
  return row?.verified ? { verified: true, at: row.verified_at ? Date.parse(row.verified_at) : null, kind: row.verified_kind ?? null } : NOT_VERIFIED;
}
