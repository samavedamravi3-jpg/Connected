/**
 * Business details and versions used by every policy screen, the static pages and the consent record.
 * Pure TypeScript (no React Native imports) so the static-page builder and node tests can import it.
 *
 * FOUNDERS: fill in `contactEmail` and confirm `operator` before release. `npm run legal:check` fails while any
 * release blocker is open. Do not put a private home address here: the policies do not need one.
 */
export const LEGAL = {
  product: 'Connected',
  /** Who runs the service. Confirm the exact legal names (Kartik's full name is missing) or replace with a company. */
  operator: 'Shritan Samavedam and Kartik, individuals (no company has been formed yet)',
  /** One mailbox for support, privacy and deletion requests. Must be a mailbox a founder actually reads. */
  contactEmail: null as string | null,
  /** The age gate. Stripe Identity does not verify minors; US launch only. */
  minAge: 18,
  region: 'the United States',
  /** Date the current text takes effect. Update together with the versions below when anything changes. */
  effective: '2026-11-27',
  /** Bump when a document changes materially; users are asked to accept the Terms again when TERMS_VERSION changes. */
  versions: { terms: '2026-11-27', privacy: '2026-11-27', refunds: '2026-11-27', cookies: '2026-11-27' },
  /** Governing law and venue are a legal decision, so they stay empty until a lawyer confirms them. */
  governingLaw: null as string | null,
} as const;

export const CONTACT_LINE = LEGAL.contactEmail ?? 'a support address that the founders must add before public release';

/** Things that must be resolved before this text is shown to the public. Used by `npm run legal:check`. */
export function releaseBlockers(): string[] {
  const out: string[] = [];
  if (!LEGAL.contactEmail) out.push('LEGAL.contactEmail is empty: add a support/privacy mailbox.');
  if (!LEGAL.governingLaw) out.push('LEGAL.governingLaw is empty: a lawyer should confirm governing law and venue.');
  if (/\bKartik, individuals\b/.test(LEGAL.operator)) out.push("LEGAL.operator needs Kartik's full legal name (or a company name).");
  return out;
}
