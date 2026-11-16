/**
 * The shared content rules. One file with no imports and no runtime APIs, so the app (src/lib/moderation.ts), the
 * `profile-write` edge function (Deno), the SQL generator (scripts/gen-moderation-sql.ts) and node:test all use the
 * exact same lists and normalisation. The generated SQL in supabase/schema.sql and the moderation migration mirrors it;
 * src/lib/__tests__/moderationSync.test.ts fails when the generated SQL is stale.
 * After editing, run: npx tsx scripts/gen-moderation-sql.ts
 *
 * WORDS are matched against NORMALIZED text (see normalize()): lowercase letters and single spaces only, leetspeak
 * undone, spaced-out letters joined, long repeats collapsed. Keep them portable: letters, spaces, `|`, `?`, `+`,
 * `[a-z]`, groups and `(?!...)` lookahead only, so the same source works as a JavaScript RegExp and a Postgres ARE.
 * Every pattern is wrapped in word boundaries, so "Scunthorpe", "Cummings" or "assess" never match a shorter word.
 *
 * This is a first line of defence, not a complete one: text that is inappropriate without using a listed phrase
 * passes the rules. Profile text also gets a contextual AI check on the server (supabase/functions/profile-write).
 */
export const WORDS: Record<'slurs' | 'hate' | 'sexual' | 'harassment' | 'threats' | 'scams' | 'selfharm' | 'drugs' | 'doxxing', string[]> = {
  slurs: [
    'nigg?(er|ers|a|as|ah|ahs)', 'fag+(ot|ots|s)?', 'dykes?', 'tranny', 'trannies', 'retard(ed|s)?',
    'chinks?', 'spics?', 'kikes?', 'wetbacks?', 'gooks?', 'coons?', 'pakis?', 'beaners?', 'towel ?heads?',
    'sand ?nigg?(er|a)s?', 'raghead', 'cunts?',
  ],
  // Dehumanising statements about a group. Narrow on purpose: "rats are vermin" (pest control) stays fine.
  hate: [
    '(immigrants|foreigners|refugees|muslims|jews|christians|blacks|whites|asians|mexicans|indians|gays|lesbians|trans people|women|men) (are|r) (all )?(vermin|subhuman|cockroaches|parasites|animals|savages|filth|inferior|a disease|a plague)',
    '(gas|exterminate|deport all) (the )?(jews|muslims|immigrants|gays|blacks)',
  ],
  sexual: [
    'porn(o|ography)?', 'nudes?', 'send nudes', 'horny', 'sexy', 'sex(ting| chat| tape)', 'blow ?jobs?', 'hand ?jobs?',
    'cum(?! laude)', 'cumshot', 'boobs?', 'tits', 'titties', 'pussy', 'pussies', 'penis', 'vagina', 'orgasm', 'dildo', 'only ?fans',
    'naked', 'one night stand', 'hook ?up with me', 'sleep with me', 'slut(s|ty)?', 'whores?', 'cock ?suckers?', 'dick ?heads?',
    'jerk ?off', 'masturbat(e|ing|ion)', 'erotic', 'fetish', 'escort service',
    'sugar (daddy|daddies|baby|babies|mama|momma)', 'dtf', 'fwb', 'friends with benefits', 'nsfw', 'no strings attached',
    'netflix and chill',
  ],
  harassment: [
    'fuck ?(you|off|u)', 'fuck ?(ing)? (idiot|loser|moron)', 'f u', 'stfu', 'shut ?the ?fuck ?up', 'go to hell', 'go ?fuck ?yourself',
    '(mother ?)?fuck(ing|ed|er|ers|s)?', '(fvck|phuck|fuk|fck|fuq)(ing|ed|er|s)? ?(you|off|u)?',
    'bitch(es)?', 'bastards?', 'asshole', 'dumb ?ass', 'son of a bitch',
    '(you are|you re|u r|ur|youre) (so |such a |a |an )?(stupid|ugly|worthless|useless|pathetic|idiot|loser|moron|trash|garbage|disgusting|fat|retard(ed)?)',
    'nobody (likes|wants|loves) you', 'i hate you', 'hope you (die|rot|suffer)', 'kill your ?self', 'kys', 'go (die|kill yourself)',
    'stalk(ing)? you', 'i m watching you', 'i am watching you', 'send me (pics|pictures|photos)', 'show me your (body|boobs|tits)',
  ],
  threats: [
    '(i|we) (will|ll|m going to|am going to|gonna|ma) (kill|hurt|find|beat|shoot|stab|rape|murder|ruin|destroy) (you|u|your family|ur family)',
    'i know where you (live|work|are)', 'i will find you', 'i ll find you', 'watch your back', 'you re (dead|going to die)',
    'you are (dead|going to die)', 'you will (pay|regret|die)', 'shoot (you|up)', 'stab you', 'bomb (threat|the|this)', 'rape (you|her|him)',
    'rapist', 'kill ?(you|him|her|them)', 'beat you up', 'burn your (house|home)', 'i have a (gun|knife)',
    'you ll (pay|regret|die)', '(make|making) you pay',
  ],
  scams: [
    // investment and crypto pitches
    'guaranteed (returns?|profits?|income|roi|winnings)', 'risk ?free (investment|returns?|profits?)', 'double your (money|investment|bitcoin|crypto)',
    'investment opportunit(y|ies)', 'invest (with|in) (me|my|our)', 'crypto (investment|trading|signals?|giveaway|mining|opportunity|doubler)',
    'bitcoin (investment|trading|doubler|giveaway|mining)', 'forex (trading|signals?)', 'binary options?', 'passive income', 'trading (signals?|bot|mentor)',
    'airdrop', 'get rich', 'financial freedom', 'unlimited income', 'make (money|cash) (fast|online|from home)', 'earn (money|cash|income) (fast|online|daily|weekly|from home)',
    'easy money', 'quick money', 'wallet address', 'seed phrase', 'recovery phrase', 'triple (your|my) (money|investment|crypto|bitcoin)',
    '(send|buy|pay|deposit|transfer) (in |me |us |some )?(usdt|usdc|tether)', '(usdt|usdc|tether) (wallet|address|only|payment)',
    '(huge|massive|insane) (gains|returns|profits?)', '(gains|profits?) (every|each|per|a) (day|week|month)',
    // money and payment requests (naming a payment company is fine: "engineer at Venmo", "Western Union analyst")
    'send (me |us )?(some )?(money|cash|funds)', 'wire (me|us) (money|cash|funds)', '(via|through|by|send|wire|use) (western union|moneygram)', '(western union|moneygram) (only|me|us|transfer)', 'gift ?cards?',
    '(pay|send|via|through|accept|accepting) (me |us )?(on |via |through |with )?(venmo|zelle|cash ?app|paypal|apple pay)',
    '(venmo|zelle|cash ?app|paypal|apple pay) (me|us|only|accepted|handle|id|username)',
    'paypal (me|us)', 'pay (me|us) (via|through|on|with)',
    // moving the chat off the app
    '(dm|message|text|add|contact|hit) (me|us) (on|at|via) (telegram|whatsapp|snapchat|snap|signal|instagram|insta|wechat|kik|discord)',
    '(telegram|whatsapp|snapchat|snap|wechat|kik) (me|us)', 'my (telegram|whatsapp|snapchat|snap|wechat|kik) (is|id|handle|number)',
    '(gmail|yahoo|hotmail|outlook|icloud|proton ?mail|proton) (dot )?com',
    // spelled-out links ("evil dot com", "example(dot)com"); "the dot-com bubble" stays fine
    '(?!the |a |of )[a-z]+ dot (com|net|org|io|me|co|ly|xyz|app|gg|info|biz)',
    // urgency and phishing
    'act now', 'limited time (offer|only)?', 'last chance', 'don t miss out', 'offer expires', 'respond (immediately|asap|now)', 'urgent(ly)? (reply|response|action|need)',
    'verify your (account|identity|bank|password|id)', 'confirm your (password|account|bank)', 'click (here|the link|this link|below)', 'you have (won|been selected)',
    'claim your (prize|reward|gift)', 'account (has been )?(suspended|locked|compromised)', 'login to claim',
    '(send|share|give|tell|text) me (your |the )?(code|otp|password|passcode|login|pin|verification code|one time code|six digit code|digit code)',
    'one time (code|password|passcode)',
    // MLM and job-offer scams (studying or regulating MLMs is fine)
    'multi ?level marketing (team|opportunity|business|company)', '(join|our|my) (an? )?(mlm|multi ?level marketing)', '(mlm|multi ?level marketing) (team|opportunity|business)',
    'be your own boss', 'work from home opportunity', 'no experience (needed|necessary|required) (job|work|offer)', 'join my (team|downline|business)',
    'pay (a|an|the) (training|registration|starter|application|processing) fee', 'recruiting (now|today)', 'ground floor opportunity',
  ],
  selfharm: [
    'you should (just )?(kill|hurt|harm|cut|hang) your ?self', '(just )?(go )?(end|take) your (own )?life', 'do (everyone|us all|the world) a favou?r and (die|leave|disappear)',
    'you (should|ought to|need to) (just )?(die|disappear)', 'commit suicide', 'cut your wrists', 'hang your ?self', 'overdose (on|yourself)',
  ],
  drugs: [
    '(selling|sell|buy|buying) (some )?(weed|cocaine|coke|molly|mdma|xanax|adderall|oxy|oxycodone|percocet|fentanyl|heroin|meth|lsd|ketamine|edibles)',
    '(weed|cocaine|molly|xanax|adderall|guns?|weapons?|ammo) for sale', 'cocaine', 'heroin', 'fentanyl', 'crystal meth', 'ghost guns?', 'ar ?15', 'illegal (guns?|weapons?|drugs?)',
    '(selling|sell|buy|buying) (guns?|firearms?|weapons?|ammo|ammunition)',
  ],
  doxxing: [
    '(her|his|their|your) (home )?address is', 'lives at', 'i found (her|his|their|your) (address|number|home)', 'social security (number)?', 'ssn', 'credit card number', 'bank account number',
    'routing number', 'drivers? licen[cs]e number', 'leak(ing|ed)? (her|his|their|your) (address|number|photos|nudes)',
  ],
};
export type Reason = keyof typeof WORDS | 'contact';

/**
 * Checked on the RAW text (lowercased, accents and zero-width characters removed, lookalike letters mapped), because
 * normalization turns digits and symbols into letters and so hides phone numbers, links and handles.
 * Same portability rules as WORDS (`\b` becomes `\y` in Postgres). CONTACT applies to every field, names included.
 */
export const CONTACT: string[] = [
  '[a-z0-9._%+-]+@[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}', // email address
  '(https?|ftp)://', '\\bh\\s*t\\s*t\\s*p\\s*s?\\s*:\\s*/\\s*/', '\\bhxxps?\\b', '\\bwww\\s*\\.', // links, spaced or defanged ("hxxp")
  '\\b(bit|tinyurl|goo|ow|is|cutt|rb|shorturl|t|wa|linktr|rebrand|buff|tiny|lnkd)\\s*\\.\\s*(ly|com|gl|gd|gy|at|me|ee|cc|in|co)\\s*/', // shorteners and chat links, also "t . me/x"
  '\\b(bit\\.ly|tinyurl\\.com|goo\\.gl|ow\\.ly|is\\.gd|cutt\\.ly|rb\\.gy|shorturl\\.at|t\\.me|wa\\.me|linktr\\.ee|rebrand\\.ly|buff\\.ly|tiny\\.cc|lnkd\\.in|t\\.co)\\b',
  '\\b[a-z0-9-]*(paypa1|paypai|linkedln|1inkedin|faceb00k|g00gle|gma1l|app1e|amaz0n|micr0soft|netf1ix|wellsfarg0|bankofamerlca)[a-z0-9-]*\\.[a-z]{2,}', // lookalike domains
  '\\d{3}\\)?[ .-]?\\d{3}[ .-]?\\d{4}', // phone number
  '(^|[^a-z0-9])\\$[a-z][a-z0-9_]{2,}', // $cashtag
  '\\b(snapchat|snap|telegram|tg|whatsapp|wechat|kik|signal|insta|instagram|ig|discord) ?(:|@) ?[a-z0-9_.]{3,}', // chat handles
];

/**
 * Bare and defanged domains. Only for free text: a school or workplace name like "Booking.com" is fine.
 * Needs 2+ characters before the dot, so degrees like "B.Com" / "M.Com" are not links.
 */
export const DOMAINS: string[] = [
  '\\b[a-z0-9-]{2,}\\.(com|org|io|me|ly|gg|app|info|biz|link|site|online|ru|cn|co)\\b',
  '\\b[a-z0-9-]+\\.(xyz|top|click|zip|mov|tk|ml|ga|cf|gq|icu|buzz|monster|cyou|rest|support)\\b', // throwaway domains
  '[a-z0-9]\\s*(\\[\\s*(\\.|dot)\\s*\\]|\\(\\s*(\\.|dot)\\s*\\)|\\{\\s*(\\.|dot)\\s*\\})\\s*[a-z]', // defanged dots: evil[.]com, example(dot)com
];

/** Lookalike letters folded to plain ones (Cyrillic, Greek, Armenian, small capitals and a few others). Mirrored in SQL. */
export const HOMOGLYPHS: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', н: 'h', т: 't', в: 'b', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', ӏ: 'l',
  ο: 'o', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', υ: 'u', ρ: 'p', τ: 't', χ: 'x', ɑ: 'a', ɡ: 'g', ı: 'i', ℓ: 'l', ø: 'o', ł: 'l', đ: 'd',
  ս: 'u', օ: 'o', ո: 'n', հ: 'h', ց: 'g', զ: 'q',
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm', ɴ: 'n', ᴏ: 'o', ᴘ: 'p', ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z',
};

/** Which reasons apply to a field. Names and organisation names get the abuse lists and contact details only. */
export type FieldKind = 'name' | 'text';
export const NAME_REASONS: (keyof typeof WORDS)[] = ['slurs', 'hate', 'sexual', 'harassment', 'threats'];

// Combining marks, zero-width and invisible characters (incl. soft hyphen, word joiner, BOM, invisible operators).
const INVISIBLE = /[̀-ͯ​-‏⁠-⁤﻿­᠎]/g;
const HOMO_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join('')}]`, 'g');

/** Lowercase text with accents, zero-width characters and lookalike letters folded, but digits and symbols kept. */
export function normalizeRaw(input: string): string {
  return input.normalize('NFKC').replace(INVISIBLE, '').toLowerCase().replace(HOMO_RE, (c) => HOMOGLYPHS[c] ?? c);
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

/** Lowercase letters and single spaces only. Mirrors moderation_normalize() in SQL. Used for matching, never for display. */
export function normalize(input: string): string {
  let t = input.normalize('NFKD').replace(INVISIBLE, '').toLowerCase().replace(HOMO_RE, (c) => HOMOGLYPHS[c] ?? c);
  // "!", "|" and "+" only stand in for letters when a letter follows ("k!ll"), so "income!!!" stays "income".
  t = t.replace(/[!|+](?=[a-z0-9@$])/g, (c) => LEET[c] ?? c);
  t = t.replace(/[0134578@$9]/g, (c) => LEET[c] ?? c);
  t = t.replace(/[^a-z]+/g, ' ').trim();
  // Join runs of 3+ single letters: "k i l l" -> "kill".
  const tokens = t.split(' ');
  const out: string[] = [];
  let run = '';
  const flush = () => {
    if (run.length >= 3) out.push(run);
    else if (run) out.push(...run.split(''));
    run = '';
  };
  for (const tok of tokens) {
    if (tok.length === 1) run += tok;
    else {
      flush();
      out.push(tok);
    }
  }
  flush();
  // Collapse stretched letters: "fuuuck" -> "fuck".
  return out.join(' ').replace(/(.)\1{2,}/g, '$1');
}

const wordRe = (reasons: (keyof typeof WORDS)[]) => reasons.map((reason) => ({ reason, re: new RegExp(`\\b(?:${WORDS[reason].join('|')})\\b`) }));
const ALL_REASONS = Object.keys(WORDS) as (keyof typeof WORDS)[];
const COMPILED = { name: wordRe(NAME_REASONS), text: wordRe(ALL_REASONS) };
const RAW_RES = { name: CONTACT.map((p) => new RegExp(p)), text: [...CONTACT, ...DOMAINS].map((p) => new RegExp(p)) };

export type RuleResult = { ok: true } | { ok: false; reason: Reason };

/** Rules check for one value. `kind` 'name' is for people's and organisations' names (see NAME_REASONS). */
export function checkText(text: string | null | undefined, kind: FieldKind = 'text'): RuleResult {
  if (!text || !text.trim()) return { ok: true };
  const n = normalize(text);
  for (const { reason, re } of COMPILED[kind]) if (re.test(n)) return { ok: false, reason };
  const raw = normalizeRaw(text);
  if (RAW_RES[kind].some((re) => re.test(raw))) return { ok: false, reason: 'contact' };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------
// Profile fields: one table of limits and kinds, used by the app before saving and by `profile-write` before publishing.
// ---------------------------------------------------------------------------------------------------------------

/** Text columns the app may send, with their limit and kind. The database constraints are looser (400/300) backstops. */
export const PROFILE_TEXT: Record<string, { max: number; kind: FieldKind; nullable?: boolean }> = {
  first_name: { max: 60, kind: 'name' }, last_name: { max: 60, kind: 'name' }, org: { max: 120, kind: 'name' },
  intro: { max: 280, kind: 'text' }, offer: { max: 200, kind: 'text' }, area_name: { max: 80, kind: 'text', nullable: true },
  status: { max: 40, kind: 'text', nullable: true }, field: { max: 40, kind: 'text', nullable: true }, from_field: { max: 40, kind: 'text', nullable: true },
  mode: { max: 20, kind: 'text' }, meet_mode: { max: 20, kind: 'text' }, share_mode: { max: 20, kind: 'text' },
};
export const PROFILE_LISTS = ['goals', 'challenges', 'want_traits', 'interests', 'skills', 'languages', 'foods', 'diet', 'availability'] as const;
export const LIST_LIMITS = { items: 30, item: 60 } as const;

export type FieldError = Reason | 'too_long' | 'invalid' | 'ai';

/** Rule and length problems per column (first problem per column). Empty object = fine. */
export function profileRuleErrors(row: Record<string, unknown>): Record<string, FieldError> {
  const errors: Record<string, FieldError> = {};
  for (const [col, spec] of Object.entries(PROFILE_TEXT)) {
    if (!(col in row)) continue;
    const v = row[col];
    if (v === null && spec.nullable) continue;
    if (typeof v !== 'string') errors[col] = 'invalid';
    else if (v.length > spec.max) errors[col] = 'too_long';
    else {
      const r = checkText(v, spec.kind);
      if (!r.ok) errors[col] = r.reason;
    }
  }
  for (const col of PROFILE_LISTS) {
    if (!(col in row)) continue;
    const v = row[col];
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) errors[col] = 'invalid';
    else if (v.length > LIST_LIMITS.items || v.some((x: string) => x.length > LIST_LIMITS.item)) errors[col] = 'too_long';
    else {
      for (const x of v as string[]) {
        const r = checkText(x);
        if (!r.ok) {
          errors[col] = r.reason;
          break;
        }
      }
    }
  }
  return errors;
}
