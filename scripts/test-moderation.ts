// Run: npx tsx scripts/test-moderation.ts
import { checkText } from '../src/lib/moderation';

const bad = ['I will kill you', 'k1ll y0urself', 'k y s', 'f.u.c.k you', 'fuuuuck off', 'you are so stupid', 'send nudes', 's e x t i n g', 'n i g g e r', 'wh0re', 'i know where you live', 'go d1e', 'ｋｉｌｌ ｙｏｕｒｓｅｌｆ', 'k​ill you'];
const good = ['Hi! I’m a junior studying economics and would love 15 minutes.', 'I work in Essex and study class assignments.', 'Scunthorpe analyst', 'Dick Smith, Hancock Bank', 'I want to kill it at my interview', 'Looking for a cocktail hour mixer', 'Nurse practitioner, 10 years', 'I a m ready', 'Raccoon rescue volunteer', 'We assess risk at the bank', 'Therapist for sexual health education'];

let fail = 0;
for (const t of bad) if (checkText(t).ok) { fail++; console.log('MISSED  ', t); }
for (const t of good) if (!checkText(t).ok) { fail++; console.log('FALSE+  ', t, checkText(t)); }
console.log(fail ? `${fail} failures` : 'all passed');
process.exit(fail ? 1 : 0);
