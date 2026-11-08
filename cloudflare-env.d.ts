declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_MODEL?: string;
    BUCKET?: R2Bucket;
    /** Mobile API: pepper for sign-in code hashes. Required in production. */
    AUTH_SECRET?: string;
    /** Mobile API: Resend key and sender for sign-in emails. Without a key, codes are shown only to local/LAN dev requests. */
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
  }
}
