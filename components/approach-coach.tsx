"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, MessageCircle } from "lucide-react";
import type { Person } from "@/lib/network";
type Message = { role: "user" | "assistant"; content: string; source?: string };
export default function ApproachCoach({
  person,
  center,
  onDraft,
  needAccount,
}: {
  person: Person;
  center: [number, number];
  onDraft: (s: string) => void;
  needAccount: () => boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [configured, setConfigured] = useState<boolean | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/coach")
      .then((r) => r.json() as Promise<{ configured?: boolean }>)
      .then((d) => {
        if (active) setConfigured(d.configured === true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, busy]);
  async function ask(text: string) {
    if (!text.trim() || busy || needAccount()) return;
    setError("");
    setInput("");
    const next = [
      ...messages,
      { role: "user" as const, content: text.trim() },
    ].slice(-11);
    setMessages(next);
    setBusy(true);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: person.id,
          messages: next.map(({ role, content }) => ({
            role,
            content: content.slice(0, 1200),
          })),
          latitude: center[0],
          longitude: center[1],
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        text: string;
        source: string;
        note?: string;
      };
      if (!response.ok)
        throw Error(data.error || "Could not reach your coach. Try again.");
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.text,
          source:
            data.source === "claude"
              ? "Claude"
              : `Template · ${data.note || "Claude is not connected yet"}`,
        },
      ]);
    } catch (e) {
      setError((e as Error).message);
      setMessages(next.slice(0, -1));
      setInput(text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="coach" aria-label={`Approach coach for ${person.name}`}>
      <div className="coach-heading">
        <span>
          <Sparkles size={19} />
          <b>Your approach coach</b>
        </span>
        <span className="tag">
          {configured
            ? "Claude connected"
            : configured === false
              ? "Template mode"
              : "AI coach"}
        </span>
      </div>
      <p>
        Practice a hello to {person.name.split(" ")[0]}, choose a question, or
        work through the nerves.
      </p>
      <p className="coach-privacy">
        When connected, your chat and relevant profile context go to Claude.
        Photos, social links and locations are excluded.
      </p>
      {!messages.length && (
        <div className="coach-prompts">
          {[
            "How should I approach them?",
            "What should I ask about?",
            "Write a short introduction",
          ].map((s) => (
            <button key={s} disabled={busy} onClick={() => void ask(s)}>
              <MessageCircle size={13} />
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="coach-messages" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`coach-bubble ${m.role}`}>
            <small>{m.role === "user" ? "You" : m.source}</small>
            <p>{m.content}</p>
            {m.role === "assistant" && (
              <button
                className="text-button"
                onClick={() => onDraft(m.content.slice(0, 500))}
              >
                Use in my introduction
              </button>
            )}
          </div>
        ))}
        {busy && (
          <p className="coach-thinking">Thinking through a good first hello…</p>
        )}
        <div ref={bottom} />
      </div>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <form
        className="coach-input"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          aria-label="Message your approach coach"
          maxLength={1200}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="I’m nervous. How do I start?"
          disabled={busy}
        />
        <button
          className="icon-button"
          aria-label="Send to coach"
          disabled={busy || !input.trim()}
        >
          <Send size={18} />
        </button>
      </form>
      {messages.length > 0 && (
        <button
          className="text-button small-text"
          disabled={busy}
          onClick={() => setMessages([])}
        >
          Clear this conversation
        </button>
      )}
      <p className="coach-privacy">
        Only you send the introduction. Chat history clears when you close this
        profile.
      </p>
    </section>
  );
}
