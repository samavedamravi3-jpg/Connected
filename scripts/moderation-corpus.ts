// Parity corpus: scripts/gen-moderation-sql.ts writes the app's verdict for each string into supabase/tests/moderation.sql,
// and that SQL test fails if the database functions disagree. Add a line whenever a rule is added or fixed.
// No `$c$` in any string (it is the SQL quote).
export const CORPUS: string[] = [
  // should block
  'I will kill you', 'k1ll y0urself', 'k y s', 'you are so stupid', 'send nudes', 'go d1e', 'wh0re', 'n i g g e r', 'n​іgger',
  'f.u.c.k you', 'fuuuuck off', 'ｋｉｌｌ ｙｏｕｒｓｅｌｆ', 'k‍ill you', 'sеnd nudеs', '𝐟𝐮𝐜𝐤 𝐲𝐨𝐮', 'fսck you', 'fvck you', 'phuck off', 'ꜰᴜᴄᴋ ʏᴏᴜ', 'por⁣n',
  'Immigrants are vermin and should all be deported', 'Seeking a sugar daddy, generous men only', 'DTF tonight', 's3xy and single',
  'Cross me and I will make you pay', 'Paid mentorship: $50 per session via CashApp', 'Send USDT to my wallet and I will triple it',
  'Apple Pay me for a referral', 'Crypto mentor, 300% gains every month', 'Verify your ID at connected-verify dot com',
  'Send me the 6 digit code you just got', 'Tell me your login and I will set up your profile', 'hxxp://evil[.]com', 'visit evil dot com',
  't . me/joinme', 'example(dot)com/offer', 'insta @cooljohn', 'h t t p : / / x', 'www . site', 'call 704-555-1234', 'john.doe@gmail.com',
  'visit mysite.com today', 'free-prizes.xyz', 'Pay me via Cash App', 'i accept zelle', 'western union only', 'gift-cards only',
  'Be your own boss with our MLM', 'her address is 12 Oak St', 'selling weed', 'you should just kill yourself', 'Graduated magna cum laude and cum on',
  // should pass
  'Sexual health nurse at Atrium', 'LGBTQ+ mentor for first-gen students', 'Rape crisis counselor and volunteer trainer', 'Dick', 'Cummings',
  'Graduated magna cum laude', 'Summa cum laude', 'Hancock', 'Scunthorpe', 'Cocktail bar manager', 'Sex education teacher', 'Breast cancer researcher',
  'Product manager on the Zelle team', 'Engineer at Venmo', 'Western Union analyst', 'ML engineer', 'Studied MLM fraud as a regulator',
  'I survived the dot-com bubble', 'B.Com and M.Com graduate', 'Built Node.js and ASP.NET services', 'Pest control: rats are vermin',
  'Reported monthly returns to clients', 'Built USDC payments at a fintech', 'OTP authentication engineer', 'I offer more than just coffee chats',
  'I want to kill it at my interview', 'Raccoon rescue volunteer', 'Middlesex Community College', 'Essex', 'assess', 'Classic cars',
  '我是软件工程师，喜欢帮助新人', 'مهندسة برمجيات في شارلوت', 'Zoë Ðoàn-Nguyễn', "O'Brien-Smith", 'Νίκος Παπαδόπουλος', 'Наташа Кокорина',
  'प्रिया शर्मा', 'José Martínez Ñúñez', 'Øyvind Ærø', 'Nguyễn Thị Minh Khai', '김민준', 'Siobhán Ní Bhriain', 'Mbɔ́ŋ',
  'Booking.com', 'Salesforce.com', 'Mentor at Black Women in Tech', 'Trans people mentoring network', 'Hablo español y English',
];
