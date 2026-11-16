/** Auth failures keep Supabase's machine code (never the password or email) so a screenshot is enough to diagnose. */
export class AuthFailure extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export const RESEND_COOLDOWN_S = 60;

/** Plain-language message plus the safe code; unknown errors keep Supabase's own text. */
export function authMessage(e: { message?: string; code?: string; status?: number } | null | undefined): AuthFailure {
  const code = e?.code ?? (e?.status ? `http_${e.status}` : 'unknown');
  const text =
    code === 'email_not_confirmed' ? 'Confirm your email first. Tap the link we sent, or resend it below.'
    : code === 'invalid_credentials' ? 'That email and password don’t match. Check them, or create an account.'
    : code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' ? 'Too many attempts. Wait a few minutes, then try again.'
    : code === 'unexpected_failure' || code === 'http_500' ? 'We couldn’t send the confirmation email. Try again in a few minutes.'
    : e?.message || 'Something went wrong. Try again.';
  return new AuthFailure(`${text} (${code})`, code);
}
