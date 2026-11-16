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
