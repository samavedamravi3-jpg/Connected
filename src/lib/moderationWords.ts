/**
 * Blocklist patterns, matched against NORMALIZED text (see moderation.ts): lowercase letters
 * and single spaces only, leetspeak undone, spaced-out letters joined, long repeats collapsed.
 *
 * Keep these portable: only letters, spaces, `|`, `?`, `+` and groups, so the same source works
 * as a JavaScript RegExp and a Postgres ARE. `\b` is rewritten to `\y` for Postgres by
 * scripts/gen-moderation-sql.ts, which writes the list into supabase/schema.sql.
 * After editing, run: npx tsx scripts/gen-moderation-sql.ts
 */
export const WORDS: Record<'slurs' | 'sexual' | 'harassment' | 'threats' | 'scams' | 'selfharm' | 'drugs' | 'doxxing', string[]> = {
  slurs: [
    'nigg?(er|ers|a|as|ah|ahs)', 'fag+(ot|ots|s)?', 'dykes?', 'tranny', 'trannies', 'retard(ed|s)?',
    'chinks?', 'spics?', 'kikes?', 'wetbacks?', 'gooks?', 'coons?', 'pakis?', 'beaners?', 'towel ?heads?',
    'sand ?nigg?(er|a)s?', 'raghead', 'cunts?',
  ],
  sexual: [
    'porn(o|ography)?', 'nudes?', 'send nudes', 'horny', 'sexy', 'sex(ting| chat| tape)', 'blow ?jobs?', 'hand ?jobs?',
    'cum', 'cumshot', 'boobs?', 'tits', 'titties', 'pussy', 'pussies', 'penis', 'vagina', 'orgasm', 'dildo', 'only ?fans',
    'naked', 'one night stand', 'hook ?up with me', 'sleep with me', 'slut(s|ty)?', 'whores?', 'cock ?suckers?', 'dick ?heads?',
    'jerk ?off', 'masturbat(e|ing|ion)', 'erotic', 'fetish', 'escort service',
  ],
  harassment: [
    'fuck ?(you|off|u)', 'fuck ?(ing)? (idiot|loser|moron)', 'f u', 'stfu', 'shut ?the ?fuck ?up', 'go to hell', 'go ?fuck ?yourself',
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
  ],
  scams: [
    // investment and crypto pitches
    'guaranteed (returns?|profits?|income|roi|winnings)', 'risk ?free (investment|returns?|profits?)', 'double your (money|investment|bitcoin|crypto)',
    'investment opportunit(y|ies)', 'invest (with|in) (me|my|our)', 'crypto (investment|trading|signals?|giveaway|mining|opportunity|doubler)',
    'bitcoin (investment|trading|doubler|giveaway|mining)', 'forex (trading|signals?)', 'binary options?', 'passive income', 'trading (signals?|bot|mentor)',
    'airdrop', 'get rich', 'financial freedom', 'unlimited income', 'make (money|cash) (fast|online|from home)', 'earn (money|cash|income) (fast|online|daily|weekly|from home)',
    'easy money', 'quick money',
    // money and payment requests
    'send (me |us )?(some )?(money|cash|funds)', 'wire (me|us) (money|cash|funds)', 'western union', 'moneygram', 'gift ?cards?', 'cash ?app', 'venmo', 'zelle',
    'paypal (me|us)', 'pay (me|us) (via|through|on|with)',
    // moving the chat off the app
    '(dm|message|text|add|contact|hit) (me|us) (on|at|via) (telegram|whatsapp|snapchat|snap|signal|instagram|insta|wechat|kik|discord)',
    '(telegram|whatsapp|snapchat|snap|wechat|kik) (me|us)', 'my (telegram|whatsapp|snapchat|snap|wechat|kik) (is|id|handle|number)',
    '(gmail|yahoo|hotmail|outlook|icloud|proton ?mail|proton) (dot )?com',
    // urgency and phishing
    'act now', 'limited time (offer|only)?', 'last chance', 'don t miss out', 'offer expires', 'respond (immediately|asap|now)', 'urgent(ly)? (reply|response|action|need)',
    'verify your (account|identity|bank|password)', 'confirm your (password|account|bank)', 'click (here|the link|this link|below)', 'you have (won|been selected)',
    'claim your (prize|reward|gift)', 'account (has been )?(suspended|locked|compromised)', 'login to claim',
    // MLM and job-offer scams
    'multi ?level marketing', 'mlm', 'be your own boss', 'work from home opportunity', 'no experience (needed|necessary|required) (job|work|offer)', 'join my (team|downline|business)',
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

/**
 * Checked on the RAW text (lowercased, accents and zero-width characters removed, lookalike letters mapped), because
 * normalization turns digits and symbols into letters and so hides phone numbers, links and handles.
 * Same portability rules as WORDS (`\b` becomes `\y` in Postgres). Applied to public free-text fields.
 */
export const RAW: string[] = [
  '[a-z0-9._%+-]+@[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}', // email address
  '(https?|ftp)://', '\\bwww\\.', // links
  '\\b(bit\\.ly|tinyurl\\.com|goo\\.gl|ow\\.ly|is\\.gd|cutt\\.ly|rb\\.gy|shorturl\\.at|t\\.me|wa\\.me|linktr\\.ee|rebrand\\.ly|buff\\.ly|tiny\\.cc|lnkd\\.in|t\\.co)\\b', // shorteners and chat links
  '\\b[a-z0-9-]+\\.(xyz|top|click|zip|mov|tk|ml|ga|cf|gq|icu|buzz|monster|cyou|rest|support)\\b', // throwaway domains
  '\\b[a-z0-9-]*(paypa1|paypai|linkedln|1inkedin|faceb00k|g00gle|gma1l|app1e|amaz0n|micr0soft|netf1ix|wellsfarg0|bankofamerlca)[a-z0-9-]*\\.[a-z]{2,}', // lookalike domains
  '\\d{3}\\)?[ .-]?\\d{3}[ .-]?\\d{4}', // phone number
  '(^|[^a-z0-9])\\$[a-z][a-z0-9_]{2,}', // $cashtag
  '\\b(snapchat|snap|telegram|tg|whatsapp|wechat|kik|signal|insta|instagram|ig|discord) ?(:|@) ?[a-z0-9_.]{3,}', // chat handles
];

/** Lookalike letters folded to plain ones (Cyrillic, Greek and a few others). Mirrored in schema.sql by the generator. */
export const HOMOGLYPHS: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', к: 'k', м: 'm', н: 'h', т: 't', в: 'b', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ԛ: 'q', ԝ: 'w', ӏ: 'l',
  ο: 'o', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', υ: 'u', ρ: 'p', τ: 't', χ: 'x', ɑ: 'a', ɡ: 'g', ı: 'i', ℓ: 'l', ø: 'o', ł: 'l', đ: 'd',
};

/** Text with money, contact or urgency hints is "borderline": worth the AI check when one is configured. */
export const BORDERLINE =
  /\b(money|pay|paid|payment|invest\w*|crypto|bitcoin|profit|earn\w*|income|loan|cash|deal|offer|opportunit\w*|hiring|recruit\w*|telegram|whatsapp|snap\w*|text me|call me|contact me|link|click|account|password|verify|urgent|free|win|won|prize|reward)\b/i;
