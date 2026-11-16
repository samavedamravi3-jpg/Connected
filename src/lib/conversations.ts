import type { ConnectionRequest, IncomingRequest, Message } from '@/data/types';

export type Conversation = {
  /** The chat route id: a request id, or a demo incoming id. */
  id: string;
  /** Set for requests; demo incoming requests have no person record. */
  personId?: string;
  name: string;
  preview: string;
  /** Latest message time; missing for demo chats accepted before messages were kept. */
  at?: number;
  /** Simulated on this phone, not a real person. */
  demo: boolean;
  unread: boolean;
};

type Input = {
  requests: ConnectionRequest[];
  incoming: IncomingRequest[];
  messages: Record<string, Message[]>;
  showDemo: boolean;
  blocked: string[];
  lastRead: Record<string, number>;
  nameOf: (personId: string) => string;
};

/**
 * Unread = the latest message is from them, came after the opening request, and is newer than when you last opened the chat.
 * Only real (remote) chats count, so simulated demo replies never look like real unread messages.
 */
export function isUnread(msgs: Message[], lastReadAt = 0, remote = true): boolean {
  const last = msgs.at(-1);
  return remote && msgs.length > 1 && last?.from === 'them' && last.at > lastReadAt;
}

/** Accepted requests (either direction, real or demo) as chats, newest message first. Blocked people are left out. */
export function conversations({ requests, incoming, messages, showDemo, blocked, lastRead, nameOf }: Input): Conversation[] {
  const fromRequests = requests
    .filter((r) => r.status === 'accepted' && !blocked.includes(r.personId))
    .map((r): Conversation => {
      const msgs = messages[r.id] ?? [];
      const last = msgs.at(-1);
      return {
        id: r.id,
        personId: r.personId,
        name: nameOf(r.personId),
        preview: last ? `${last.from === 'me' ? 'You: ' : ''}${last.text}` : r.message,
        at: last?.at ?? r.updatedAt,
        demo: !r.remote,
        unread: isUnread(msgs, lastRead[r.id], !!r.remote),
      };
    });
  const fromDemo = showDemo
    ? incoming
        .filter((i) => i.state === 'accepted')
        .map((i): Conversation => {
          const last = messages[i.id]?.at(-1);
          return { id: i.id, name: i.name, preview: last ? `${last.from === 'me' ? 'You: ' : ''}${last.text}` : i.message, at: last?.at, demo: true, unread: false };
        })
    : [];
  return [...fromRequests, ...fromDemo].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}
