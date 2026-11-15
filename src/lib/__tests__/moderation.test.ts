// Run: npm test   (node's built-in test runner through tsx)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkText, normalize } from '../moderation';

const blocked = (label: string, list: string[]) =>
  test(`blocks: ${label}`, () => {
    for (const t of list) assert.equal(checkText(t).ok, false, `should block: ${t}`);
  });
const allowed = (label: string, list: string[]) =>
  test(`allows: ${label}`, () => {
    for (const t of list) assert.equal(checkText(t).ok, true, `should allow: ${t} -> ${JSON.stringify(checkText(t))}`);
  });

blocked('harassment, threats, slurs and sexual text', [
  'I will kill you', 'k1ll y0urself', 'k y s', 'you are so stupid', 'send nudes', 'i know where you live', 'go d1e', 'wh0re', 'n i g g e r',
]);

blocked('evasions: leetspeak, spacing, dots, repeats, width, zero-width, homoglyphs', [
  'f.u.c.k you', 'f u c k   y o u', 'fuuuuck off', 'ｋｉｌｌ ｙｏｕｒｓｅｌｆ', 'k​ill you', 'f_u_c_k you',
  'sеnd nudеs', // Cyrillic е
  'ѕеnd nudes', // Cyrillic ѕ and е
  'h0rny', 'p0rn', 'wh0r3', '$lut', 'k.y.s',
]);

blocked('scams: money, crypto and investment pitches', [
  'Guaranteed returns of 40% weekly', 'Double your money with my crypto trading signals', 'Great investment opportunity, DM me',
  'Send me money first and I will help', 'send us funds', 'Pay me via Cash App', 'i accept zelle', 'Buy a gift card and send the code', 'gift-cards only',
  'g u a r a n t e e d profits', 'g.i.f.t c.a.r.d.s', 'bitcoin doubler', 'forex trading signals', 'passive income!!!', 'earn money fast from home',
  'make m0ney fast', 'western union only',
]);

blocked('scams: moving off-app, contact details, links', [
  'DM me on Telegram', 'add me on whatsapp', 'text me on Snapchat', 'my telegram is john', 'telegram: john_doe', 'snap: cooljohn', 'whatsapp me',
  'Call me at 704-555-1234', '(704) 555 1234', '704.555.1234', '7045551234', '+1 704 555 1234',
  'email me at john.doe@gmail.com', 'john at gmail dot com', 'jdoe@university.edu',
  'visit https://example.com', 'www.mysite.com', 'bit.ly/3abcde', 'tinyurl.com/x', 't.me/joinme', 'wa.me/17045551234', 'free-prizes.xyz',
  'paypa1-secure.com', 'login at g00gle-support.com', 'send to $johnsmith',
]);

blocked('scams: urgency, phishing, MLM and job-offer scams', [
  'Act now, limited time offer', 'Last chance to join', 'Verify your account immediately', 'click here to claim your prize', 'You have won!',
  'Your account has been suspended', 'Be your own boss with our MLM', 'multi level marketing team', 'join my team, no experience needed job',
  'pay a registration fee to start', 'recruiting now, work from home opportunity',
]);

blocked('self-harm, drugs, weapons and doxxing', [
  'you should just kill yourself', 'go end your life', 'do everyone a favor and disappear', 'commit suicide',
  'selling weed', 'xanax for sale', 'buy cocaine', 'selling guns', 'ghost guns available', 'fentanyl',
  'her address is 12 Oak St', 'his social security number', 'credit card number', 'leaking her nudes',
]);

allowed('false positives: ordinary professional text and look-alike words', [
  'Hi! I’m a junior studying economics and would love 15 minutes.',
  'I work in Essex and study class assignments.', 'Scunthorpe analyst', 'Dick Smith, Hancock Bank', 'We assess risk at the bank',
  'I want to kill it at my interview', 'Looking for a cocktail hour mixer', 'Nurse practitioner, 10 years', 'Raccoon rescue volunteer',
  'Therapist for sexual health education', 'assess', 'class', 'Classic cars', 'Passenger assistance', 'Basement renovation', 'Grassroots organizer',
  'Cocktails and mocktails', 'Peacock Street Coffee', 'Sussex County', 'Middlesex Community College',
  'Compliance analyst for crypto exchanges', 'Managed $2M investment portfolio for clients', 'Fintech and payments operations',
  'Wells Fargo, 2019 2020 2021 2022', 'Worked 2018-2022 at Bank of America', 'Built Node.js and ASP.NET services', 'Python, C++, SQL',
  'Mentor for first-gen students', 'Open to coffee chats about data science', 'Career changer from retail to UX', '401k and benefits analyst',
  'Teaching assistant, 3 sections, 120 students', 'Raised $50,000 for the food bank', 'Product manager at Acme Corp, Charlotte NC',
]);

test('normalize folds tricks to plain letters', () => {
  assert.equal(normalize('F.U.C.K'), 'fuck');
  assert.equal(normalize('k1ll'), 'kill');
  assert.equal(normalize('fuuuuck'), 'fuck');
  assert.equal(normalize('sеnd'), 'send'); // Cyrillic е
});
