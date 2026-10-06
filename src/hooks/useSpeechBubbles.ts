import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../realtime";

const BUBBLE_DURATION = 7_000;
type Bubble = { message: ChatMessage; expiresAt: number };

export default function useSpeechBubbles(messages: ChatMessage[]) {
  const seen = useRef(new Set<string>());
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});

  useEffect(() => {
    const incoming = messages.filter((message) => !seen.current.has(message.id));
    for (const message of incoming) seen.current.add(message.id);
    const speech = incoming.filter((message) => !message.system);
    if (!speech.length) return;
    setBubbles((current) => {
      const next = { ...current };
      for (const message of speech) {
        next[message.playerId] = { message, expiresAt: Date.now() + BUBBLE_DURATION };
      }
      return next;
    });
  }, [messages]);

  useEffect(() => {
    const pending = Object.values(bubbles);
    if (!pending.length) return;
    const nextExpiry = Math.min(...pending.map((bubble) => bubble.expiresAt));
    const timer = window.setTimeout(() => {
      setBubbles((current) => Object.fromEntries(
        Object.entries(current).filter(([, bubble]) => bubble.expiresAt > Date.now()),
      ));
    }, Math.max(0, nextExpiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [bubbles]);

  return bubbles;
}
