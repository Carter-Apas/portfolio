import type { ChatMessage, ConnectionMode } from "./realtime";

export type AssistantState = {
  enabled: boolean;
  thinking: boolean;
  error: string | null;
};

type Identity = { id: string; name: string };
const OFFLINE: AssistantState = { enabled: false, thinking: false, error: null };

function roomId(mode: ConnectionMode) {
  if (mode === "realtime") return "carters-studio";
  // BroadcastChannel rooms are local to a browser. Give their AI context the
  // same scope instead of mixing unrelated local visitors on the backend.
  const key = "studio-assistant-room";
  try {
    let id = localStorage.getItem(key);
    if (!id || !/^local-[a-zA-Z0-9-]+$/.test(id)) {
      id = `local-${crypto.randomUUID()}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `local-${crypto.randomUUID()}`;
  }
}

export function connectAssistant(
  player: Identity,
  mode: ConnectionMode,
  onMessage: (message: ChatMessage) => void,
  onState: (state: AssistantState) => void,
) {
  const room = roomId(mode);
  let closed = false;
  let paused = false;
  let syncing = false;
  let lastSync = 0;
  let requestNumber = 0;
  let latestState = 0;
  let busyUntil = 0;
  const seen = new Set<string>();
  const controllers = new Set<AbortController>();
  const body = (type: string, message?: ChatMessage) => JSON.stringify({
    type, roomId: room, player, hidden: document.hidden,
    ...(message ? { message: { id: message.id, text: message.text } } : {}),
  });

  async function request(type: "sync" | "message", message?: ChatMessage) {
    if (closed || paused) return;
    const number = ++requestNumber;
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: body(type, message), signal: controller.signal,
      });
      if (closed || paused) return;
      if (!response.ok) {
        if (number >= latestState) {
          latestState = number;
          if (response.status === 429) busyUntil = Date.now() + 60_000;
          onState({ enabled: true, thinking: false,
            error: response.status === 429 ? "Assistant is busy. Try again in a minute." : "Assistant is unavailable. Try again shortly." });
        }
        return;
      }
      const payload = await response.json();
      if (closed || paused) return;
      for (const incoming of payload.messages ?? []) {
        if (!incoming.assistant || incoming.playerId !== "assistant" || seen.has(incoming.id)) continue;
        seen.add(incoming.id);
        onMessage(incoming);
      }
      // Bound browser deduplication memory too. The server returns at most 30
      // recent messages, so retaining 1000 IDs comfortably covers every poll.
      if (seen.size > 1000) {
        const recent = [...seen].slice(-500);
        seen.clear(); for (const id of recent) seen.add(id);
      }
      if (number >= latestState) {
        latestState = number;
        onState({ enabled: payload.enabled === true, thinking: payload.thinking === true,
          error: payload.unavailable ? "Assistant is unavailable. Try again shortly."
            : Date.now() < busyUntil ? "Assistant is busy. Try again in a minute." : null });
      }
    } catch {
      if (!closed && !paused && number >= latestState) {
        latestState = number;
        onState({ enabled: true, thinking: false, error: "Assistant is unavailable. Try again shortly." });
      }
    } finally {
      window.clearTimeout(timeout);
      controllers.delete(controller);
    }
  }
  async function sync() {
    if (closed || paused || syncing) return;
    syncing = true;
    lastSync = Date.now();
    try { await request("sync"); } finally { syncing = false; }
  }
  function leave() {
    const payload = new Blob([body("leave")], { type: "application/json" });
    navigator.sendBeacon("/api/assistant", payload);
  }
  const pagehide = () => {
    paused = true;
    for (const controller of controllers) controller.abort();
    leave();
    onState(OFFLINE);
  };
  const pageshow = () => { paused = false; void sync(); };
  const visibility = () => { if (!document.hidden) void sync(); };
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);
  document.addEventListener("visibilitychange", visibility);
  const timer = window.setInterval(() => {
    if (!document.hidden || Date.now() - lastSync >= 15_000) void sync();
  }, 2000);
  void sync();

  return {
    sendMessage(message: ChatMessage) { void request("message", message); },
    close() {
      if (closed) return;
      closed = true;
      window.clearInterval(timer);
      for (const controller of controllers) controller.abort();
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      document.removeEventListener("visibilitychange", visibility);
      leave();
    },
  };
}
