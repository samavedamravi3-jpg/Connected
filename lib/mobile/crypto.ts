// WebCrypto helpers shared by the Worker and the Node tests. No imports.

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(input: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
}

/** Uniform 6-digit code (rejection sampling avoids modulo bias). */
export function randomCode() {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

/** 256-bit random session token, base64url. */
export function randomToken() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Code hashes are bound to the email and a server secret, so a leaked table can't be brute-forced offline cheaply. */
export const hashCode = (secret: string, email: string, code: string) => sha256Hex(`code:${secret}:${email}:${code}`);
export const hashToken = (token: string) => sha256Hex(`session:${token}`);

/** Constant-time comparison of two equal-length strings (hex digests). */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
