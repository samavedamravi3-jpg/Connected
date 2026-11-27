/**
 * Consent records. Pure logic (no React Native), so node tests cover it.
 *  - Accepting the Terms and Privacy Policy always records the version and the time, and the adult (18+) confirmation.
 *  - Optional things (AI suggestions) are a separate flag and are never implied by accepting the Terms.
 *  - The ID check cannot open until the adult confirmation exists.
 */
import { LEGAL } from '../legal/config';

export type ConsentRecord = {
  termsVersion: string;
  privacyVersion: string;
  /** ISO timestamp of the tap that accepted. */
  acceptedAt: string;
  /** The person confirmed they are at least LEGAL.minAge. We store the yes, never a date of birth. */
  adult: boolean;
  /** The account the record was last saved to the server for, so a new sign-in re-syncs it. */
  syncedFor?: string | null;
};

export const makeConsent = (now: Date = new Date()): ConsentRecord => ({
  termsVersion: LEGAL.versions.terms,
  privacyVersion: LEGAL.versions.privacy,
  acceptedAt: now.toISOString(),
  adult: true,
  syncedFor: null,
});

/** True while the stored acceptance matches the Terms and Privacy versions in force. */
export const consentCurrent = (c: ConsentRecord | null | undefined): boolean =>
  !!c && c.adult && c.termsVersion === LEGAL.versions.terms && c.privacyVersion === LEGAL.versions.privacy;

/** The Stripe ID check is adults only: it must not open for anyone who has not confirmed their age. */
export const canStartIdCheck = (c: ConsentRecord | null | undefined): boolean => !!c && c.adult === true;

export const needsConsentSync = (c: ConsentRecord | null | undefined, uid: string | null | undefined): boolean =>
  !!c && !!uid && c.adult && c.syncedFor !== uid;
