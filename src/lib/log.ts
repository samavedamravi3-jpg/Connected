/**
 * Logging that cannot leak personal data. Error objects from the network and the database can carry request details,
 * row values or text the user typed, so only the kind of failure is logged: name, code and HTTP status. Never pass user
 * content as `what`.
 */
export function warn(what: string, e?: unknown): void {
  const x = e as { name?: unknown; code?: unknown; status?: unknown } | null | undefined;
  const bits = [x?.name, x?.code, x?.status].filter((v) => typeof v === 'string' || typeof v === 'number').join(' ');
  console.warn(bits ? `${what} (${bits})` : what);
}
