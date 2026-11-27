import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { LEGAL } from '../../legal/config';
import { DOCS, DOC_ORDER, RECIPIENTS, type Block } from '../../legal/documents';

const text = (id: keyof typeof DOCS) => DOCS[id].sections.flatMap((s) => [s.heading, ...s.body.flatMap((b: Block) => (Array.isArray(b) ? b : [b]))]).join('\n');
const all = DOC_ORDER.map((d) => text(d)).join('\n');
const SRC = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== '__tests__') walk(p, out); } else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

test('all four policies exist with a version and an in-force date', () => {
  assert.deepEqual([...DOC_ORDER].sort(), ['cookies', 'privacy', 'refunds', 'terms']);
  for (const id of DOC_ORDER) assert.match(DOCS[id].version, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(LEGAL.effective, /^\d{4}-\d{2}-\d{2}$/);
});

test('every web address in the app source belongs to a listed recipient (or is our own backend or a local one)', () => {
  const allowed = new Set(['localhost', 'example.com', 'elsewhere.example', 'api.example.com', 'evil.example.com', 'stripe.com', 'api.stripe.com', 'verify.stripe.com']);
  const known = RECIPIENTS.flatMap((r) => r.hosts);
  const missing = new Set<string>();
  for (const f of [...walk(SRC), ...walk(join(SRC, '..', 'server', 'src')), ...walk(join(SRC, '..', 'supabase', 'functions'))]) {
    for (const m of readFileSync(f, 'utf8').matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const h = m[1].toLowerCase().replace(/\.$/, '');
      if (allowed.has(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.endsWith('.supabase.co') || h === 's' || h === 'user' || h === 'insecure' || h === 'x.supabase.co') continue;
      if (!known.some((k) => h === k || h.endsWith(`.${k}`))) missing.add(`${h} (${f.slice(SRC.length)})`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('the privacy policy names every recipient and the key Stripe facts', () => {
  const p = text('privacy');
  for (const r of RECIPIENTS) assert.ok(p.includes(r.name), `missing ${r.name}`);
  assert.match(p, /one year/);
  assert.match(p, /not a background check/);
  assert.match(p, /never by the app/);
  assert.match(p, /do not request or store ID images/);
});

test('the refund policy says the app is free and that billing needs a policy update first', () => {
  const r = text('refunds');
  assert.match(r, /no subscriptions, in-app purchases, fees or paid features/);
  assert.match(r, /until this policy has been updated/);
});

test('the cookie policy matches reality: no tracking SDKs are installed', () => {
  const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(' ');
  assert.doesNotMatch(deps, /analytics|segment|amplitude|mixpanel|sentry|firebase|facebook|appsflyer|adjust|posthog|branch|onesignal|admob|gtag/i);
  assert.match(text('cookies'), /does not use analytics/);
});

test('no personal home address or personal email is published', () => {
  assert.doesNotMatch(all.replaceAll(LEGAL.contactEmail ?? '', ''), /gmail\.com|yahoo\.com|\bapt\b|\bstreet\b/i);
  assert.equal(LEGAL.contactEmail, 'connectedks@gmail.com');
  assert.match(LEGAL.operator, /Shritan Samavedam and Kartik Shinde/);
});

test('the age line matches the age gate', () => {
  assert.match(text('terms'), new RegExp(`${LEGAL.minAge} or older`));
});
