#!/usr/bin/env node
// Deploy the backend (web app + mobile API) to YOUR Cloudflare account.
// Prerequisites: a free Cloudflare account and `npx wrangler login` once on this computer.
// Usage: node scripts/deploy-cloudflare.mjs
// What it does: create/find the D1 database "connected-db", build against it, apply migrations remotely,
// set a random AUTH_SECRET if missing (never printed), deploy, then list the secrets you still need to add.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const DB_NAME = process.env.CLOUDFLARE_D1_NAME || 'connected-db';
const wrangler = (args, opts = {}) => spawnSync(process.execPath, ['./node_modules/wrangler/bin/wrangler.js', ...args], { encoding: 'utf8', ...opts });
const step = (msg) => console.log(`\n▸ ${msg}`);
const fail = (msg, out) => { console.error(`\n✗ ${msg}${out ? `\n${(out.stderr || out.stdout || '').slice(-1500)}` : ''}`); process.exit(1); };

step('Checking Cloudflare login');
const who = wrangler(['whoami']);
if (/not authenticated/i.test(who.stdout + who.stderr)) fail('Not logged in. Run `npx wrangler login`, then run this again.');

step(`Finding or creating D1 database "${DB_NAME}"`);
const list = wrangler(['d1', 'list', '--json']);
if (list.status !== 0) fail('Could not list D1 databases.', list);
let db = JSON.parse(list.stdout).find((d) => d.name === DB_NAME);
if (!db) {
  const created = wrangler(['d1', 'create', DB_NAME]);
  if (created.status !== 0) fail('Could not create the database.', created);
  db = JSON.parse(wrangler(['d1', 'list', '--json']).stdout).find((d) => d.name === DB_NAME);
}
if (!db?.uuid) fail('Database id not found after creation.');
console.log(`  using ${DB_NAME} (${db.uuid})`);

step('Building');
const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, CLOUDFLARE_D1_ID: db.uuid, CLOUDFLARE_D1_NAME: DB_NAME } });
if (build.status !== 0) fail('Build failed.');
const configPath = 'dist/server/wrangler.json';
const conf = JSON.parse(readFileSync(configPath, 'utf8'));
conf.d1_databases = conf.d1_databases.map((d) => ({ ...d, migrations_dir: '../../drizzle' }));
writeFileSync(configPath, JSON.stringify(conf, null, 2));

step('Applying database migrations (remote)');
const migrate = wrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath], { stdio: 'inherit' });
if (migrate.status !== 0) fail('Migrations failed.');

step('Deploying');
const deploy = wrangler(['deploy', '--config', configPath], { stdio: 'inherit' });
if (deploy.status !== 0) fail('Deploy failed.');

step('Checking secrets');
const secrets = wrangler(['secret', 'list', '--config', configPath, '--format', 'json']);
const have = new Set(secrets.status === 0 ? JSON.parse(secrets.stdout).map((s) => s.name) : []);
if (!have.has('AUTH_SECRET')) {
  const put = wrangler(['secret', 'put', 'AUTH_SECRET', '--config', configPath], { input: randomBytes(32).toString('hex') });
  console.log(put.status === 0 ? '  AUTH_SECRET set to a new random value (not shown).' : '  Could not set AUTH_SECRET; run: npx wrangler secret put AUTH_SECRET --config dist/server/wrangler.json');
}
const missing = ['RESEND_API_KEY', 'ANTHROPIC_API_KEY'].filter((k) => !have.has(k));
console.log('\n✓ Deployed. Point the app at the URL above with EXPO_PUBLIC_API_URL in mobile/.env.local.');
if (missing.length) {
  console.log('\nStill needed (paste each value when prompted; nothing is echoed):');
  for (const k of missing) console.log(`  npx wrangler secret put ${k} --config dist/server/wrangler.json`);
  console.log('  RESEND_API_KEY: required for email sign-in codes. Optional: MAIL_FROM (e.g. "Connected <hello@yourdomain>").');
  console.log('  ANTHROPIC_API_KEY: optional; without it the app uses its labeled templates.');
}
