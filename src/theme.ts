import { Platform } from 'react-native';

/** Connected. palette: warm paper neutrals, one deep forest-green accent, a muted slate (`blue` token) for info only. */
export const C = {
  bg: '#F6F4EE',
  surface: '#FCFBF7',
  bg2: '#EFEBE1',
  line: '#DDD8CB',
  line2: '#C4BEAE',
  ink: '#1C1B17',
  ink2: '#4A4840',
  ink3: '#66635A',
  accent: '#1F4D3A',
  accentPressed: '#173B2C',
  accentSoft: '#E3ECE5',
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

export const AVATAR_COLORS = ['#DCE6DD', '#E8E1D2', '#E3E6D6', '#DDE3E6', '#EADFD6', '#D9E2D5', '#E6E2D8'];

/** Subtle neutral lift, for floating map controls and sheets only. */
export const shadow = Platform.select({
  ios: { shadowColor: '#1C1B17', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  default: { elevation: 3 },
});
