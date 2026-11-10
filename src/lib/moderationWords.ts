/**
 * Blocklist patterns, matched against NORMALIZED text (see moderation.ts): lowercase letters
 * and single spaces only, leetspeak undone, spaced-out letters joined, long repeats collapsed.
 *
 * Keep these portable: only letters, spaces, `|`, `?`, `+` and groups, so the same source works
 * as a JavaScript RegExp and a Postgres ARE. `\b` is rewritten to `\y` for Postgres by
 * scripts/gen-moderation-sql.ts, which writes the list into supabase/schema.sql.
 * After editing, run: npx tsx scripts/gen-moderation-sql.ts
 */
export const WORDS: Record<'slurs' | 'sexual' | 'harassment' | 'threats', string[]> = {
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
    'fuck (you|off|u)', 'fuck ?(ing)? (idiot|loser|moron)', 'f u', 'stfu', 'shut the fuck up', 'go to hell', 'go fuck yourself',
    'bitch(es)?', 'bastards?', 'asshole', 'dumb ?ass', 'son of a bitch',
    '(you are|you re|u r|ur|youre) (so |such a |a |an )?(stupid|ugly|worthless|useless|pathetic|idiot|loser|moron|trash|garbage|disgusting|fat|retard(ed)?)',
    'nobody (likes|wants|loves) you', 'i hate you', 'hope you (die|rot|suffer)', 'kill your ?self', 'kys', 'go (die|kill yourself)',
    'stalk(ing)? you', 'i m watching you', 'i am watching you', 'send me (pics|pictures|photos)', 'show me your (body|boobs|tits)',
  ],
  threats: [
    '(i|we) (will|ll|m going to|am going to|gonna|ma) (kill|hurt|find|beat|shoot|stab|rape|murder|ruin|destroy) (you|u|your family|ur family)',
    'i know where you (live|work|are)', 'i will find you', 'i ll find you', 'watch your back', 'you re (dead|going to die)',
    'you are (dead|going to die)', 'you will (pay|regret|die)', 'shoot (you|up)', 'stab you', 'bomb (threat|the|this)', 'rape (you|her|him)',
    'rapist', 'kill (you|him|her|them)', 'beat you up', 'burn your (house|home)', 'i have a (gun|knife)',
  ],
};
