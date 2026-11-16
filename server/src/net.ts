// Request trust helpers for the assistant server (pure, so node:test covers them: src/lib/__tests__/serverNet.test.ts).
import { timingSafeEqual } from 'node:crypto';

/** Constant-time token check. An unset (empty) expected token never matches: callers fail closed. */
export function tokenOk(got: string | string[] | undefined, want: string): boolean {
  if (!want || typeof got !== 'string') return false;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The client address for the rate limiter. x-forwarded-for is trusted only for the number of proxies the operator
 * says sit in front of the server (TRUST_PROXY_HOPS): each one appends the address it saw, so the client is the entry
 * `hops` from the right. 0 (the default) = no proxy: use the socket address and ignore the header, which anyone can set.
 */
export function clientIp(xff: string | string[] | undefined, socketAddress: string | undefined, trustedHops: number): string {
  const list = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (trustedHops > 0 && list.length >= trustedHops) return list[list.length - trustedHops];
  return socketAddress || 'unknown';
}
