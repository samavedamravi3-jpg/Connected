/**
 * The four policies, written from what the app actually does (see docs/privacy-audit.md for the trace behind each
 * statement). The in-app screens and the static pages in web-policies/ both render from here, so they cannot drift.
 * Not legal advice: `docs/privacy-audit.md` lists what needs founder approval and legal review.
 */
import { CONTACT_LINE, LEGAL } from './config';

/** A paragraph (string) or a bullet list (string[]). */
export type Block = string | string[];
export type Section = { id: string; heading: string; body: Block[] };
export type LegalDoc = { id: DocId; title: string; version: string; summary: string; sections: Section[] };
export type DocId = 'privacy' | 'terms' | 'refunds' | 'cookies';

/**
 * Every outside party the app or its servers talk to. A test scans the source for web addresses and fails when one is
 * missing here, so the privacy policy cannot silently miss a recipient.
 */
export const RECIPIENTS: { name: string; hosts: string[]; what: string; when: string }[] = [
  { name: 'Supabase', hosts: ['supabase.co'], what: 'Hosts accounts, the database, profile photos and our server functions. Holds everything in your account.', when: 'Whenever you use an account' },
  { name: 'Stripe', hosts: ['stripe.com'], what: 'Runs the government ID and selfie check on its own page.', when: 'Only if you choose to verify your ID' },
  { name: 'Anthropic (Claude)', hosts: ['anthropic.com'], what: 'Reads text we send for the AI assistant, chat suggestions, resume extraction and safety screening.', when: 'Only when those features run (see AI features)' },
  { name: 'Groq', hosts: ['groq.com'], what: 'Screens profile text for abuse before it is shown to others.', when: 'When you save profile text' },
  { name: 'Meetup and Devpost', hosts: ['meetup.com', 'devpost.com', 'meetupstatic.com', 'cloudfront.net'], what: 'Public event listings and event photos are loaded from them. They see your IP address, not your account.', when: 'When you open Events' },
  { name: 'OpenStreetMap (Nominatim)', hosts: ['openstreetmap.org'], what: 'Looks up places (for example meeting spots). They receive the place search text and your IP address.', when: 'When you search for a place' },
  { name: 'picsum.photos', hosts: ['picsum.photos'], what: 'Serves the stock photos on demo posts. They see your IP address.', when: 'When demo posts are shown' },
  { name: 'Apple Maps and Google Maps', hosts: ['apple.com', 'google.com'], what: 'Only if you tap Directions: your phone opens their app or site with the venue address.', when: 'Only when you tap Directions' },
  { name: 'Expo (EAS Update)', hosts: ['expo.dev'], what: 'Delivers app updates. Receives the app version, platform and your IP address.', when: 'When the app checks for updates' },
  { name: 'GitHub (referrer text only)', hosts: ['github.com'], what: 'Our address is written into the User-Agent of event and place lookups so the services can contact us. Nothing is sent to GitHub.', when: 'Never contacted' },
];

const PILOT = 'ID verification is currently in a limited pilot, so it may not be available to your account yet.';

export const PRIVACY: LegalDoc = {
  id: 'privacy',
  title: 'Privacy Policy',
  version: LEGAL.versions.privacy,
  summary: 'What Connected collects, why, who receives it, how long it is kept and how to control or delete it.',
  sections: [
    {
      id: 'who',
      heading: 'Who we are',
      body: [
        `${LEGAL.product} is run by ${LEGAL.operator} (“we”). Contact for support, privacy and deletion requests: ${CONTACT_LINE}.`,
        `Connected is for adults aged ${LEGAL.minAge} or older in ${LEGAL.region}. It helps people find nearby professional connections, events and conversations.`,
      ],
    },
    {
      id: 'collect',
      heading: 'What we collect, and why',
      body: [
        'We only collect what a feature needs. Each item below says where it goes.',
        [
          'Account: your email address and a password. The password is handled by Supabase’s sign-in service and stored only as a hash; we never see it. Used to sign you in and to send account emails such as the confirmation link.',
          'Profile you write: your first and last name, role, organization, status, field, goals, interests, languages, neighborhood and similar answers. Stored in Supabase and shown to other members only as your sharing settings allow. Real people stay hidden from you, and you from them, until you both finish ID verification.',
          'Profile photo: stored in a private Supabase storage bucket and shown through short-lived links. Photos are re-encoded on your phone first, which removes camera details and GPS from the file.',
          'Resume and experience (optional): you can pick a PDF. It is sent once for text extraction (see AI features), and we do not keep the file. The experience entries you confirm are saved to your profile and are private unless you turn on “show experience”.',
          'Location: only while the app is open and you have allowed it. Your phone’s position centers the map and sorts distances, and the map area is sent to our database to find nearby members (the search itself is not stored). If you are discoverable and share your rough area, we save that position rounded to about 1 km, and nothing more precise. Connected does not use background location.',
          'Connection requests, chat messages and notes: stored in Supabase and visible to the people in that conversation. Messages you send are screened for abuse (see AI features).',
          'Safety records: blocks, mutes and reports you file; moderation decisions (which field, allowed or blocked, and a short reason code, not the text); rate-limit counters; and signals that help us spot spam (for example many sign-ups at once). Automatic moderation actions, such as hiding a profile after several reports, are written to an audit log.',
          'Nearby alerts (optional): your alert settings are saved to your account. Alerts are shown as notifications created on your phone while the app is open. We do not collect a push token and cannot send you notifications when the app is closed.',
          'On your phone: your draft profile, preferences, hidden events, cached messages, which alerts you have seen and your Nearby post draft are kept in the app’s local storage, and your sign-in session in the phone’s local database. Signing out or deleting your account clears them.',
          'Technical data: our providers (Supabase, Expo, Stripe, and the event and map services above) receive your IP address and basic device or app details when your phone connects to them, and may keep standard server logs. We do not add analytics or advertising trackers to the app.',
        ],
      ],
    },
    {
      id: 'ai',
      heading: 'AI features',
      body: [
        'Some features send text to AI providers. We treat these differently depending on whether they are optional.',
        [
          'Optional, only after you allow it in Privacy & data: the Assistant sends your questions plus your profile summary and your preferences to Anthropic (Claude). Chat suggestions send the last 10 messages of that chat and the other person’s public profile text (name, role, bio) to Anthropic. If you do not allow it, the app uses built-in suggestions that never leave your phone. Please do not use chat suggestions for a conversation you would not want a provider to process.',
          'Resume import: when you pick a PDF, its contents are sent through our server to Anthropic once to extract your experience. We do not store the file.',
          'Safety screening (not optional, because it protects members): profile text you save is checked by rules and then by an AI model (Groq) before it is published. Chat messages, connection notes and experience text are checked by an AI model (Anthropic, or Groq as a fallback) through our server. Text that is blocked is not published.',
        ],
        'AI output can be wrong or inappropriate. It is not advice. We ask providers to process text only to return a result, and we do not send your email or password.',
      ],
    },
    {
      id: 'id',
      heading: 'ID verification (Stripe Identity)',
      body: [
        `${PILOT}`,
        'If you choose to verify, you are sent to a page hosted by Stripe in your phone’s browser. Stripe, not Connected, collects the photo of your government ID and your selfie and runs the check. Stripe tells us the result by a signed message that we verify before using it.',
        'What Stripe receives: the pictures you take, the data it reads from your ID, a comparison of your face with the ID photo (which Stripe describes as biometric processing), and technical data such as device, browser and IP address. Stripe’s own privacy notice applies to this data; its Privacy Center says biometric information from IDs and selfies is kept no longer than one year, or until consent is withdrawn if earlier. Read it at stripe.com/privacy.',
        'What Connected stores: only the result. That is a verification record with Stripe’s session ID, a status (started, pending, verified, rejected or canceled), whether it was a live or test check, a short error code if it failed, and timestamps, plus a flag on your profile that records when a live check passed. We do not request or store ID images, selfies, document numbers, your date of birth or your address from Stripe.',
        'The “ID verified” badge is granted only after Stripe confirms a live check to our server, never by the app or by anyone who tells us they passed. A test-mode result never grants it. Verification is for adults only: Stripe does not verify minors, and we ask you to confirm you are 18 or older before the check opens.',
        'The badge only means that a live document-and-selfie check passed for that account. It is not a background check, and it does not mean someone is safe, honest or trustworthy. Please read the Terms on meeting people.',
        'Deleting your account: we ask Stripe to redact the verification session, which removes the information it collected, and then delete our records. Stripe says redaction can take up to four days. Stripe may keep limited data it must retain by law, under its own policy.',
      ],
    },
    {
      id: 'share',
      heading: 'Who can see your information',
      body: [
        [
          'Other members: your first and last name, photo, organization, role, interests and the answers you chose to share, and an approximate area (about 1 km) if you share it. Never your email, exact position, resume file or ID details.',
          'People in a conversation: the messages and notes in it.',
          'Us: the founders can access the database and server logs to run and protect the service, to handle reports and to answer legal requests.',
          'Our providers: only what they need to do their job, as listed below. We do not sell your personal information and do not share it for advertising.',
          'Authorities: when the law requires it, or to protect someone’s safety.',
        ],
      ],
    },
    {
      id: 'recipients',
      heading: 'Who receives data from the app',
      body: [RECIPIENTS.map((r) => `${r.name}: ${r.what} (${r.when}.)`)],
    },
    {
      id: 'retention',
      heading: 'How long we keep data',
      body: [
        [
          'Account, profile, photo, requests, messages, experience and alert settings: until you delete your account, or you edit or remove them yourself. Deleting your account also removes the messages and requests you took part in from the other person’s view.',
          'Your saved rough position: replaced each time you move, and removed when you delete your account. Turning off sharing hides you from other members, but does not erase the last saved position until the account is deleted.',
          'Rate-limit counters: trimmed automatically after about 2 days.',
          'Moderation decisions, spam signals and reports: kept while your account exists and removed with it. We have not set an automatic purge for the audit log yet; we will say so here when we do. Audit-log entries that name you are de-identified (your ID is removed) when you delete your account.',
          'Verification record: until you delete your account. Stripe’s retention is described above.',
          'Backups: our database host keeps backups for a limited period, so deleted data can remain in a backup until it expires. We are confirming that period and will state it here.',
          'Law and safety: we may keep limited records longer if the law requires it or to deal with a safety report or a dispute.',
        ],
      ],
    },
    {
      id: 'choices',
      heading: 'Your choices and rights',
      body: [
        [
          'Location and visibility: Profile > Show me in nearby discovery, Show my rough area on the map, and your device’s location permission. Turn them off at any time.',
          'Notifications: Profile > Nearby alerts, and your device settings.',
          'AI: Privacy & data > AI suggestions. Off by default.',
          'Tracking and marketing: there are none to turn off. We have no analytics, advertising trackers or marketing messages. If we add any, we will ask separately first and will not make it a condition of using Connected.',
          'See and correct your data: edit your profile in the app.',
          'Delete your account: Privacy & data > Delete my account. You confirm with your password and a typed word. It deletes your data immediately (see Retention).',
          `Questions or other requests, including a copy of your data: email ${CONTACT_LINE}.`,
        ],
        'Depending on where you live, you may have additional rights under state privacy laws. The founders are still working out how to honor each one, and a lawyer will review this section.',
      ],
    },
    {
      id: 'security',
      heading: 'Security',
      body: [
        'Connections use encryption in transit. Access to data in our database is limited by row-level security rules, secrets are kept on our servers and not in the app, and ID results are accepted only with a verified signature from Stripe. No system is perfectly secure, so we cannot promise that data will never be exposed.',
      ],
    },
    {
      id: 'age',
      heading: 'Age',
      body: [
        `Connected is only for people ${LEGAL.minAge} or older. We ask you to confirm your age when you create an account, and we do not collect your date of birth. If we learn that someone under ${LEGAL.minAge} has an account, we will remove it.`,
      ],
    },
    {
      id: 'changes',
      heading: 'Changes',
      body: [`This policy took effect on ${LEGAL.effective} (version ${LEGAL.versions.privacy}). If we change what we collect, we will update it and the date before the change goes live, and tell you in the app if the change matters to you.`],
    },
  ],
};

export const TERMS: LegalDoc = {
  id: 'terms',
  title: 'Terms of Service',
  version: LEGAL.versions.terms,
  summary: 'The rules for using Connected, what we do and do not promise, and when an account can be suspended.',
  sections: [
    {
      id: 'agree',
      heading: 'Agreeing to these terms',
      body: [
        `These terms are between you and ${LEGAL.operator}, who run ${LEGAL.product}. By creating an account you agree to them and to the Privacy Policy. If you do not agree, do not create an account. You can still look around in demo mode.`,
      ],
    },
    {
      id: 'eligible',
      heading: 'Who can use Connected',
      body: [
        `You must be ${LEGAL.minAge} or older and in ${LEGAL.region}. You must give true information, keep your password private, and use one account for yourself. We may ask you to verify your ID.`,
      ],
    },
    {
      id: 'service',
      heading: 'What Connected is',
      body: [
        'Connected lets members find nearby professional connections and events, send connection requests and chat. It also lists events from other organizers (Meetup and Devpost), which we do not run or control, and offers an AI assistant.',
        'Demo people, demo events and demo posts are sample content and are labeled as such. They are not real people. Real members stay hidden from you until you finish ID verification, and you stay hidden from them.',
        'Connected is free today. See the Refund and Cancellation Policy.',
      ],
    },
    {
      id: 'idnotice',
      heading: 'ID verification and meeting people',
      body: [
        'The “ID verified” badge means a live document-and-selfie check passed for that account. It is not a background or criminal check, and it is not a guarantee that someone is who they say, or is safe or trustworthy. Verified or not, use your own judgment.',
        [
          'Meet in public places and tell someone you trust where you are going.',
          'Do not send money, and do not share financial or login details.',
          'Block and report anyone who makes you uncomfortable. In an emergency call your local emergency number.',
        ],
        'We are not responsible for what members say or do, online or offline.',
      ],
    },
    {
      id: 'rules',
      heading: 'Acceptable use',
      body: [
        'Do not:',
        [
          'harass, threaten, stalk, discriminate against or sexually pressure anyone;',
          'post hateful, sexual, violent or illegal content, scams, spam, or advertising;',
          'impersonate someone, or use a false or someone else’s ID;',
          'ask for or share contact details to move people off the app in order to scam or spam them;',
          'scrape, copy or collect other members’ information, or try to get around limits, filters or the ID check;',
          'use the assistant or chat suggestions to produce abusive messages;',
          'use Connected to find or contact people under 18.',
        ],
      ],
    },
    {
      id: 'content',
      heading: 'Your content',
      body: [
        'You own what you post. You give us a limited licence to host, copy, display and process it only to run Connected, including showing it to other members as your settings allow and screening it for safety. The licence ends when you delete the content or your account, except for copies in backups for a limited time.',
        'You promise you have the right to post it, including photos of yourself.',
      ],
    },
    {
      id: 'safety',
      heading: 'Moderation, suspension and ending your account',
      body: [
        'We screen some text automatically and review reports. We may remove content, limit features, hide an account or suspend or end it if we believe these terms were broken, someone is at risk, the law requires it, or the account looks fake or abusive. Where we can, we will say why, and you may ask us to review it by writing to us.',
        'You can end your account at any time in Privacy & data > Delete my account. We may stop providing Connected, or part of it, with notice where we can.',
      ],
    },
    {
      id: 'ai',
      heading: 'AI features',
      body: ['AI suggestions can be wrong, biased or inappropriate. They are not advice. You are responsible for anything you send. Optional AI features only run if you allow them.'],
    },
    {
      id: 'warranty',
      heading: 'No guarantees',
      body: [
        'Connected is provided “as is” and “as available”, and it is still an early product. We do not promise that it will be uninterrupted, error-free, or that you will find connections, events, jobs or mentors, or that any profile or event is accurate.',
        'To the extent the law allows, we are not liable for indirect or consequential losses, or for what other people do. Nothing in these terms limits rights that the law says cannot be limited. This section needs legal review before launch.',
      ],
    },
    {
      id: 'law',
      heading: 'Governing law and disputes',
      body: [LEGAL.governingLaw ? `These terms are governed by the laws of ${LEGAL.governingLaw}.` : 'The governing law and the place where disputes are heard are not set yet. The founders will add them after legal review.'],
    },
    {
      id: 'changes',
      heading: 'Changes and contact',
      body: [
        `These terms took effect on ${LEGAL.effective} (version ${LEGAL.versions.terms}). If we change them materially we will ask you to accept the new version in the app; we record the version and time you accept. Questions: ${CONTACT_LINE}.`,
      ],
    },
  ],
};

export const REFUNDS: LegalDoc = {
  id: 'refunds',
  title: 'Refund and Cancellation Policy',
  version: LEGAL.versions.refunds,
  summary: 'Connected has no paid products. This says how that works today and what happens if that changes.',
  sections: [
    {
      id: 'free',
      heading: 'Connected is free',
      body: [
        'Connected has no subscriptions, in-app purchases, fees or paid features, and we do not take payment details from you. ID verification is free for you; we pay the verification provider.',
        'Because nothing is sold, there is nothing to refund.',
      ],
    },
    {
      id: 'cancel',
      heading: 'Cancelling',
      body: ['There is no subscription to cancel. To stop using Connected, open Privacy & data > Delete my account. It takes effect immediately and has no cost or waiting period.'],
    },
    {
      id: 'future',
      heading: 'If we ever charge',
      body: [
        'We will not start charging anyone until this policy has been updated. Before any payment we will show the price, what it includes, how renewal works, and how to cancel and to get a refund. Paid features will never be switched on for existing accounts without asking, and we will never use pre-ticked boxes or hidden fees.',
        'Events from Meetup, Devpost and other organizers may have their own prices and refund rules. We do not sell tickets and are not part of those payments.',
      ],
    },
    { id: 'date', heading: 'Effective date', body: [`This policy took effect on ${LEGAL.effective} (version ${LEGAL.versions.refunds}). Contact: ${CONTACT_LINE}.`] },
  ],
};

export const COOKIES: LegalDoc = {
  id: 'cookies',
  title: 'Cookie and Tracking Policy',
  version: LEGAL.versions.cookies,
  summary: 'What the app and our web pages store on your device, and the trackers we do not use.',
  sections: [
    {
      id: 'tracking',
      heading: 'No analytics, advertising or tracking',
      body: [
        'Connected does not use analytics tools, advertising networks, social-media pixels, fingerprinting or advertising identifiers, in the app or on these web pages. Because we use none, there is no tracking setting to switch off and no cookie banner to show. If we add any optional tracking in the future we will update this page and ask you first, with equally clear Accept and Reject choices, before anything runs.',
      ],
    },
    {
      id: 'app',
      heading: 'What the app stores on your phone',
      body: [
        [
          'Your sign-in session, so you stay signed in (needed for the app to work).',
          'Your draft profile, preferences, hidden events, cached messages and a record of which nearby alerts were shown (needed for the app to work, and cleared when you sign out or delete your account).',
          'Your choice about AI suggestions and the Terms version you accepted.',
        ],
        'These are stored in the app’s local storage, not in browser cookies. If you use the web version of the app, your browser stores the same items in its local storage.',
      ],
    },
    {
      id: 'web',
      heading: 'These web pages',
      body: [
        'The policy pages set no cookies, run no scripts and load no fonts, images or code from other sites. Your hosting provider may keep standard server logs that include your IP address.',
      ],
    },
    {
      id: 'stripe',
      heading: 'Stripe’s verification page',
      body: ['If you verify your ID, you open a page run by Stripe. Stripe may set its own cookies or similar technology there. We do not control that page; Stripe’s notice at stripe.com/privacy applies.'],
    },
    { id: 'date', heading: 'Effective date', body: [`This policy took effect on ${LEGAL.effective} (version ${LEGAL.versions.cookies}). Contact: ${CONTACT_LINE}.`] },
  ],
};

export const DOCS: Record<DocId, LegalDoc> = { privacy: PRIVACY, terms: TERMS, refunds: REFUNDS, cookies: COOKIES };
export const DOC_ORDER: DocId[] = ['terms', 'privacy', 'refunds', 'cookies'];

/** Open-source and asset credits shown with the policies. */
export const CREDITS = [
  'Bricolage Grotesque typeface by Mathieu Triay, licensed under the SIL Open Font License 1.1 (bundled in the app; no request to Google Fonts is made).',
  'Map data © OpenStreetMap contributors (ODbL), used for place lookups.',
  'Event listings and photos come from Meetup and Devpost and belong to their organizers.',
  'Demo photos are from picsum.photos (images from Unsplash, under the Unsplash licence).',
];
