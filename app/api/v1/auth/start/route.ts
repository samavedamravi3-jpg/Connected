import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { loginCodes } from '@/db/schema';
import { hashCode, randomCode } from '@/lib/mobile/crypto';
import { CODE_RESEND_MS, CODE_TTL_MS, LIMITS, emailSchema } from '@/lib/mobile/model';
import { HttpError, apiError, authSecret, body, clientIp, isLocalRequest, json, rateLimit, sendCodeEmail } from '@/lib/mobile/server';

/**
 * POST /api/v1/auth/start {email} -> emails a 6-digit code (valid 10 minutes).
 * Same response whether or not an account exists. Without an email provider, only local/LAN dev
 * requests get the code back in `devCode`; deployed servers refuse instead.
 */
export async function POST(req: Request) {
  try {
    const { email } = await body(req, z.object({ email: emailSchema }));
    const db = getDb();
    const now = Date.now();
    const secret = authSecret(req);
    await rateLimit(db, `code-ip:${clientIp(req)}`, LIMITS.codeSendPerIp, now);
    const [prev] = await db.select().from(loginCodes).where(eq(loginCodes.email, email));
    if (prev && now - prev.sentAt < CODE_RESEND_MS) throw new HttpError(429, 'We just sent a code. Please wait 30 seconds before asking again.');
    await rateLimit(db, `code-email:${email}`, LIMITS.codeSendPerEmail, now);

    const code = randomCode();
    const row = { email, codeHash: await hashCode(secret, email, code), expiresAt: now + CODE_TTL_MS, attempts: 0, sentAt: now };
    await db.insert(loginCodes).values(row).onConflictDoUpdate({ target: loginCodes.email, set: row });

    const sent = await sendCodeEmail(email, code);
    if (sent) return json({ sent: true });
    if (isLocalRequest(req)) return json({ sent: true, devCode: code, note: 'Local development: no email service configured, so the code is shown here.' });
    await db.delete(loginCodes).where(eq(loginCodes.email, email));
    throw new HttpError(503, 'Email sign-in is not configured on this server yet.');
  } catch (e) {
    return apiError(e);
  }
}
