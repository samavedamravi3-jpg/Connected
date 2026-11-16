// Run: npm test   (node's built-in test runner through tsx)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkText, experienceProblem, fieldMessage, normalize, profileFieldMessages } from '../moderation';
import { checkText as rule, profileRuleErrors } from '../../../supabase/functions/_shared/moderationRules';

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

// ---- Phase 4: evasion, field-appropriate rules, false positives, multilingual text ----

blocked('evasion: defanged and spelled-out links, scam and phishing phrases', [
  'hxxp://evil[.]com', 'hxxps://x', 'visit evil dot com', 'example(dot)com/offer', 'evil[.]com', 't . me/joinme', 'wa . me/123', 'www . site',
  'h t t p : / / x', 'visit mysite.com today', 'join at evil.io', 'Send USDT to my wallet', 'Apple Pay me for a referral',
  'Crypto mentor, 300% gains every month', 'Verify your ID at connected-verify dot com', 'Send me the 6 digit code you just got',
  'Tell me your login and I will set up your profile', 'send me your password', 'Seeking a sugar daddy', 'DTF tonight', 'fwb only',
]);

blocked('evasion: lookalikes, small capitals, invisible characters, misspellings', [
  'fսck you', 'ꜰᴜᴄᴋ ʏᴏᴜ', 'por⁣n', 'k⁡ill you', 'fvck you', 'phuck off', 'fuck this', 'Immigrants are vermin', 'Cross me and I will make you pay',
]);

allowed('false positives: healthcare, education and identity', [
  'Sexual health nurse at Atrium', 'LGBTQ+ mentor for first-gen students', 'Rape crisis counselor and volunteer trainer', 'Sex education teacher',
  'Breast cancer researcher', 'Trans people mentoring network', 'Mentor at Black Women in Tech', 'Graduated magna cum laude', 'Summa cum laude',
  'Domestic violence advocate', 'HIV prevention outreach', 'Harm reduction counselor',
]);

allowed('false positives: employers, finance and tech words', [
  'Engineer at Venmo', 'Product manager on the Zelle team', 'Western Union analyst', 'Studied MLM fraud as a regulator', 'Built USDC payments at a fintech',
  'Reported monthly returns to clients', 'OTP authentication engineer', 'I survived the dot-com bubble', 'B.Com and M.Com graduate',
  'I offer more than just coffee chats', 'Pest control: rats are vermin', 'I will triple-check your resume', 'Node.js, Vue.js, ASP.NET',
]);

test('names and organisations: substrings and real names pass, in any script', () => {
  for (const t of ['Dick', 'Cummings', 'Scunthorpe', 'Hancock', 'Dickinson', 'Cockburn', 'Sexton', 'Babcock', "O'Brien-Smith", 'Zoë Ðoàn-Nguyễn',
    'José Martínez Ñúñez', 'Øyvind Ærø', 'Siobhán Ní Bhriain', 'Наташа Кокорина', 'Νίκος Παπαδόπουλος', 'प्रिया शर्मा', '김민준', '王小明',
    'محمد عبد الله', 'Western Union', 'Booking.com', 'Salesforce.com', 'Zelle', 'Cash App']) {
    assert.equal(rule(t, 'name').ok, true, `name should pass: ${t}`);
  }
  for (const t of ['n i g g e r', 'Mr Asshole', 'me@evil.example', 'insta @cooljohn', 'www.site.com', '704-555-1234']) {
    assert.equal(rule(t, 'name').ok, false, `name should block: ${t}`);
  }
});

test('multilingual free text passes', () => {
  for (const t of ['我是软件工程师，喜欢帮助新人', 'مهندسة برمجيات في شارلوت', 'Hablo español y English, ¿café?', 'Je suis infirmière à Lyon',
    'Ich helfe gern beim Lebenslauf', 'मैं सॉफ्टवेयर इंजीनियर हूँ', 'Я помогаю студентам с резюме', 'Μιλάω ελληνικά', 'Tôi là kỹ sư phần mềm', '저는 간호사입니다']) {
    assert.equal(checkText(t).ok, true, `should allow: ${t}`);
  }
});

test('profile rows: field-appropriate rules and limits; messages name the field and the problem', () => {
  assert.deepEqual(profileRuleErrors({ first_name: 'Dick', last_name: 'Cummings', org: 'Booking.com', intro: 'Engineer at Venmo', offer: '' }), {});
  assert.deepEqual(profileRuleErrors({ intro: 'DM me on Telegram', org: 'me@x.example', offer: 'x'.repeat(201), skills: ['Excel', 'sugar daddy'], status: 5 }),
    { intro: 'scams', org: 'contact', offer: 'too_long', skills: 'sexual', status: 'invalid' });
  const m = profileFieldMessages({ intro: 'call 704-555-1234', first_name: 'www.x.com' });
  assert.match(m.intro, /A little about you.*phone numbers/);
  assert.match(m.first_name, /first name can only be a name/);
  assert.notEqual(fieldMessage('sexual', 'X'), fieldMessage('scams', 'X'));
  assert.match(fieldMessage('ai_unavailable'), /couldn’t check/);
});

test('experience: organisation is a name, description is free text', () => {
  assert.equal(experienceProblem({ title: 'Analyst', org: 'Booking.com', description: 'Built USDC payments', skills: ['SQL'] }), null);
  assert.match(experienceProblem({ title: 'Analyst', org: 'Acme', description: 'visit evil dot com', skills: [] }) ?? '', /The description/);
  assert.match(experienceProblem({ title: 'Analyst', org: 'Acme', description: '', skills: ['sugar daddy'] }) ?? '', /A skill/);
});

allowed('known limit, on purpose: security advice is not a phishing request', ['Never share your password with anyone']);
