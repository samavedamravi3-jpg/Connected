/**
 * Your ID-check state as the app shows it, derived only from server data (never set by the app).
 * `test_verified` is a passed Stripe test-mode check: shown as "Test verification passed", but it is not `verified`,
 * so it grants no public badge and does not satisfy the ID gate. Email verification is separate (src/lib/verification.ts).
 */
export type IdStatus = 'unverified' | 'started' | 'pending' | 'verified' | 'test_verified' | 'rejected' | 'canceled';

export function toIdStatus(row: { status?: string | null; livemode?: boolean | null } | null, publicVerified: boolean): IdStatus {
  if (publicVerified) return 'verified';
  const s = row?.status;
  // A live "verified" row without the public badge means the webhook is still finishing.
  if (s === 'verified') return row?.livemode ? 'pending' : 'test_verified';
  return s === 'started' || s === 'pending' || s === 'rejected' || s === 'canceled' ? s : 'unverified';
}
