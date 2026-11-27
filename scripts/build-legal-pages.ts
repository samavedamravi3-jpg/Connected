/**
 * Builds the public policy pages from the same text the app shows: `npm run legal:build` writes web-policies/*.html.
 * The pages set no cookies, run no scripts and load nothing from other sites (system fonts, inline CSS).
 * `npm run legal:check` exits 1 while a release blocker (missing contact address etc.) is open.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL, releaseBlockers } from '../src/legal/config';
import { CREDITS, DOCS, DOC_ORDER, type Block, type LegalDoc } from '../src/legal/documents';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const block = (b: Block) => (Array.isArray(b) ? `<ul>${b.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p>${esc(b)}</p>`);

const CSS = `:root{color-scheme:light dark}body{font:17px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;max-width:44rem;margin:0 auto;padding:1.25rem;color:#1b1a21;background:#f5f4f8}
a{color:#5b35c9}nav a{margin-right:1rem;display:inline-block;padding:.5rem 0}h1{font-size:1.9rem;line-height:1.2}h2{font-size:1.3rem;margin-top:2rem}small,.meta{color:#47454f}
:focus-visible{outline:3px solid #5b35c9;outline-offset:2px}.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:#fff;padding:.5rem}
@media (prefers-color-scheme:dark){body{color:#f1f0f5;background:#16151b}a{color:#b9a6ff}small,.meta{color:#c9c6d3}}`;

function page(d: LegalDoc): string {
  const nav = DOC_ORDER.map((id) => `<a href="${id}.html"${id === d.id ? ' aria-current="page"' : ''}>${esc(DOCS[id].title)}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.title)} · ${LEGAL.product}</title><meta name="description" content="${esc(d.summary)}"><meta name="robots" content="noindex">
<style>${CSS}</style></head><body><a class="skip" href="#main">Skip to content</a>
<nav aria-label="Policies">${nav}</nav><main id="main"><h1>${esc(d.title)}</h1>
<p class="meta">Version ${d.version} · in effect from ${LEGAL.effective} · ${esc(LEGAL.operator)}</p><p>${esc(d.summary)}</p>
${d.sections.map((s) => `<section aria-labelledby="${s.id}"><h2 id="${s.id}">${esc(s.heading)}</h2>${s.body.map(block).join('')}</section>`).join('')}
</main><footer><hr><h2>Credits</h2>${CREDITS.map((c) => `<p><small>${esc(c)}</small></p>`).join('')}</footer></body></html>`;
}

if (process.argv.includes('--check')) {
  const b = releaseBlockers();
  console.log(b.length ? `Release blockers:\n- ${b.join('\n- ')}` : 'No release blockers.');
  process.exit(b.length ? 1 : 0);
}
const out = join(__dirname, '..', 'web-policies');
mkdirSync(out, { recursive: true });
for (const id of DOC_ORDER) writeFileSync(join(out, `${id}.html`), page(DOCS[id]));
writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${LEGAL.product} policies</title><style>${CSS}</style></head><body><main><h1>${LEGAL.product} policies</h1><ul>${DOC_ORDER.map((id) => `<li><a href="${id}.html">${esc(DOCS[id].title)}</a></li>`).join('')}</ul></main></body></html>`);
console.log(`Wrote ${DOC_ORDER.length + 1} pages to web-policies/`);
