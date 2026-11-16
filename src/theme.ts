/**
 * Connected. palette: cool, faintly violet neutrals; one rich purple accent (the app icon's purple) reserved for
 * primary actions, selection, the active tab and meaningful highlights; a muted slate (`blue` token) for info only.
 * Semantic ok/warn/bad and the map hotspot colors (src/data/hotspots.ts) stay distinct from the accent.
 * No react-native imports here so node tests can check contrast (src/lib/__tests__/theme.test.ts).
 */
export const C = {
  bg: '#F5F4F8',
  surface: '#FDFDFE',
  bg2: '#ECEAF1',
  line: '#DCD9E3',
  line2: '#C2BECD',
  ink: '#1B1A21',
  ink2: '#47454F',
  ink3: '#63606C',
  /** White on accent 7.5:1; accent on accentSoft 6.4:1. Same purple as splash and adaptive icon in app.json. */
  accent: '#5B35C9',
  accentPressed: '#4A28A8',
  accentSoft: '#EEEAFB',
  /** The icon's lavender dot: pressed state of accentSoft surfaces and marks drawn on solid purple. */
  accentLine: '#D9CCFF',
  blue: '#2F5D7C',
  blueSoft: '#E4ECF2',
  ok: '#1E6B3E',
  okSoft: '#E6F1E8',
  warn: '#86580A',
  warnSoft: '#F8F0DE',
  bad: '#B42318',
  badSoft: '#FAECE9',
  white: '#FFFFFF',
} as const;

/** `#RRGGBB` plus alpha as rgba(), for map overlays, scrims and translucent panels. */
export const alpha = (hex: string, a: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

/** Display face for titles and names only (loaded in the root layout). If loading fails, platforms fall back to the system font. */
export const F = {
  display: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
} as const;

export const R = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const T = {
  title: { fontFamily: F.display, fontSize: 28, lineHeight: 34, color: C.ink, letterSpacing: -0.4 },
  h2: { fontFamily: F.displaySemi, fontSize: 20, lineHeight: 26, color: C.ink, letterSpacing: -0.2 },
  h3: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, color: C.ink },
  body: { fontSize: 16, lineHeight: 24, color: C.ink },
  muted: { fontSize: 15, lineHeight: 22, color: C.ink2 },
  small: { fontSize: 13, lineHeight: 18, color: C.ink3 },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' as const, color: C.ink },
};

/** Initials backgrounds: quiet cool tints, one lavender; ink2 initials stay >= 4.5:1 on each. */
export const AVATAR_COLORS = ['#E4E1EE', '#DDE5EC', '#E8E3DD', '#DFE6E1', '#E9E0E8', '#E2E4E9', '#E6E4DA'];

/** Subtle neutral lift, for floating map controls and sheets only. iOS reads the shadow* keys, Android the elevation. */
export const shadow = { shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 };
