/**
 * Your ID-check state as the app shows it, derived only from server data (never set by the app).
 * `verified` = real member: the public flag AND a live-mode verified row, the same rule as SQL public.is_real_member().
 * `test_verified` is a passed Stripe test-mode check: shown as "Test result — does not unlock Connected", never `verified`.
 * Email verification is separate (src/lib/verification.ts).
 */
export type IdStatus = 'unverified' | 'started' | 'pending' | 'verified' | 'test_verified' | 'rejected' | 'canceled';

export function toIdStatus(row: { status?: string | null; livemode?: boolean | null } | null, publicVerified: boolean): IdStatus {
  const s = row?.status;
  if (s === 'verified') {
    if (row?.livemode !== true) return 'test_verified';
    // A live "verified" row without the public flag means the webhook is still finishing.
    return publicVerified === true ? 'verified' : 'pending';
  }
  // A flag without a live verified row (stale or forged) counts for nothing.
  return s === 'started' || s === 'pending' || s === 'rejected' || s === 'canceled' ? s : 'unverified';
}

/** Stripe's session last_error.code values (docs.stripe.com/api/identity/verification_sessions/object) for our document + selfie check. */
const REASONS: Record<string, string> = {
  abandoned: 'You left Stripe’s page before submitting.',
  consent_declined: 'You declined Stripe’s consent step. The check can’t run without it.',
  device_not_supported: 'Stripe couldn’t use your camera. Allow camera access for your browser in your phone’s Settings, then try again.',
  document_expired: 'Your ID has expired. Use an unexpired one.',
  document_type_not_supported: 'That document isn’t accepted. Use a driver’s license, passport or national ID card.',
  document_unverified_other: 'Stripe couldn’t verify your ID. Use an unexpired driver’s license, passport or national ID card, flat, in good light, with no glare.',
  selfie_document_missing_photo: 'Your ID has no photo of your face. Use a government photo ID.',
  selfie_face_mismatch: 'Your selfie didn’t match the photo on your ID. Face the camera in good light, without a hat or sunglasses.',
  selfie_manipulated: 'Stripe couldn’t accept that selfie. Take a fresh live selfie.',
  selfie_unverified_other: 'Stripe couldn’t verify your selfie. Face the camera in good light.',
  under_supported_age: 'Stripe doesn’t verify people under the age of majority.',
  country_not_supported: 'Stripe can’t verify IDs from that country.',
};
const NO_RETRY = new Set(['under_supported_age', 'country_not_supported']);

/** Why the last attempt failed, and what to do. Test mode says so: Stripe doesn't check real IDs there (it offers test cases). */
export function idErrorMessage(code: string | null | undefined, test: boolean): string {
  const reason = (code && REASONS[code]) || 'That attempt didn’t go through.';
  if (test) return `Stripe test mode: this test attempt didn’t pass. ${reason} Test mode doesn’t check real IDs or selfies, so tap Try again and pick one of Stripe’s test cases. A test result never unlocks Connected.`;
  return code && NO_RETRY.has(code) ? reason : `${reason} Tap Try again.`;
}

/**
 * Is the browser trip still open? `openedAt` = the row's event_at when you opened Stripe's page. A newer webhook event
 * (processing or a result) ends it; a new session (event_at reset to null) doesn't. Covers retrying from rejected, where status alone doesn't change.
 */
export const stillCapturing = (openedAt: string | null | undefined, status: IdStatus, eventAt: string | null) =>
  openedAt !== undefined && status !== 'pending' && status !== 'verified' && (eventAt === null || eventAt === openedAt);
