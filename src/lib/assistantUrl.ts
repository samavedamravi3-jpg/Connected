const PRIVATE_HOST = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|localhost$|127\.)/;

/**
 * In development, a private-LAN assistant URL gets the host Metro is serving from (the Mac's current address), so a
 * Wi-Fi IP change doesn't silently break the assistant on a phone. Public URLs and release builds are left alone.
 */
export function withDevHost(url: string | undefined, hostUri: string | undefined | null, dev: boolean): string | undefined {
  if (!url || !dev || !hostUri) return url;
  const metroHost = hostUri.split(':')[0];
  if (!metroHost || !PRIVATE_HOST.test(metroHost)) return url; // tunnel or unknown: keep the configured URL
  try {
    const u = new URL(url);
    if (!PRIVATE_HOST.test(u.hostname)) return url;
    u.hostname = metroHost;
    return u.toString().replace(/\/$/, url.endsWith('/') ? '/' : '');
  } catch {
    return url;
  }
}

/** Metro's host:port, loaded lazily so node:test can import modules that use assistantUrl() without React Native. */
function metroHostUri(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-constants').default?.expoConfig?.hostUri;
  } catch {
    return undefined;
  }
}

export const assistantUrl = () =>
  withDevHost(process.env.EXPO_PUBLIC_ASSISTANT_URL, metroHostUri(), typeof __DEV__ !== 'undefined' && __DEV__);
