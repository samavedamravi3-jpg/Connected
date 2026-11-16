import assert from 'node:assert/strict';
import { test } from 'node:test';
import { C, alpha } from '../../theme';
import { HOTSPOT_LEVELS } from '../../data/hotspots';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('contrast helper matches known WCAG values', () => {
  assert.equal(contrast('#000000', '#FFFFFF').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#FFFFFF').toFixed(2), '4.48');
});

test('text token pairs meet WCAG AA (4.5:1)', () => {
  const pairs: [string, string, string][] = [
    ['white on accent', C.white, C.accent],
    ['white on accentPressed', C.white, C.accentPressed],
    ['accent on accentSoft', C.accent, C.accentSoft],
    ['accent on accentLine', C.accent, C.accentLine],
    ['accent on surface', C.accent, C.surface],
    ['accent on bg', C.accent, C.bg],
    ['accentSoft on accent', C.accentSoft, C.accent],
    ['ink on bg', C.ink, C.bg],
    ['ink2 on bg2', C.ink2, C.bg2],
    ['ink3 on bg', C.ink3, C.bg],
    ['ink3 on bg2 (disabled buttons)', C.ink3, C.bg2],
    ['ink3 on surface', C.ink3, C.surface],
    ['ok on okSoft', C.ok, C.okSoft],
    ['warn on warnSoft', C.warn, C.warnSoft],
    ['bad on badSoft', C.bad, C.badSoft],
    ['blue on blueSoft', C.blue, C.blueSoft],
    ['white on blue', C.white, C.blue],
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
});

test('hotspot colors stay off the purple accent and remain visible as icons (3:1)', () => {
  for (const lv of Object.values(HOTSPOT_LEVELS)) {
    assert.notEqual(lv.color.toUpperCase(), C.accent.toUpperCase(), lv.label);
    assert.ok(contrast(lv.color, C.white) >= 3, `${lv.label}: ${contrast(lv.color, C.white).toFixed(2)}`);
  }
});

test('alpha() converts a token to rgba', () => {
  assert.equal(alpha(C.accent, 0.5), 'rgba(91,53,201,0.5)');
});
