// Pure privacy and blocking policy. No framework or database imports so it can be unit tested directly.

export type BlockRow = { userId: string; personId: string };
export type RequestRow = { id: string; sender: string; recipient: string; status: string };
export type RequestStatus = 'accepted' | 'declined' | 'cancelled';

/** Discovery is visible only while the one-hour window is open. */
export function isDiscoverable(visibleUntil: number, now = Date.now()) {
  return visibleUntil > now;
}

/** Remove the stored coarse location from a profile document once discovery has expired. */
export function scrubLocation<T extends Record<string, unknown>>(data: T): Omit<T, 'latitude' | 'longitude' | 'discovery'> & { latitude: null; longitude: null; discovery: false } {
  return { ...data, latitude: null, longitude: null, discovery: false };
}

/** IDs hidden from `userId` in either direction: people they blocked and people who blocked them. */
export function hiddenFor(blocks: BlockRow[], userId: string) {
  const hidden = new Set<string>();
  for (const b of blocks) {
    if (b.userId === userId) hidden.add(b.personId);
    else if (b.personId === userId) hidden.add(b.userId);
  }
  return hidden;
}

/** True when either person has blocked the other. */
export function isBlockedPair(blocks: BlockRow[], a: string, b: string) {
  return blocks.some(x => (x.userId === a && x.personId === b) || (x.userId === b && x.personId === a));
}

export function counterpart(r: Pick<RequestRow, 'sender' | 'recipient'>, userId: string) {
  return r.sender === userId ? r.recipient : r.sender;
}

/** Requests a user may see: their own, minus any with a blocked counterpart. */
export function visibleRequests<T extends RequestRow>(requests: T[], blocks: BlockRow[], userId: string) {
  const hidden = hiddenFor(blocks, userId);
  return requests.filter(r => (r.sender === userId || r.recipient === userId) && !hidden.has(counterpart(r, userId)));
}

/**
 * Who may move a request out of `pending`: only the sender may cancel; only the recipient may accept or decline.
 * Accepting is refused when either side has blocked the other. Declining or cancelling stays allowed so people can clean up.
 */
export function canTransition(r: RequestRow | undefined, userId: string, status: RequestStatus, blocks: BlockRow[]) {
  if (!r || r.status !== 'pending') return false;
  if (status === 'cancelled') return r.sender === userId;
  if (r.recipient !== userId) return false;
  if (status === 'accepted' && isBlockedPair(blocks, r.sender, r.recipient)) return false;
  return true;
}
