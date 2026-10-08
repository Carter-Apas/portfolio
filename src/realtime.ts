import type { AnimalKind, Facing, Position } from "./roomData";

export type Player = {
  id: string;
  name: string;
  animal: AnimalKind;
  position: Position;
  facing: Facing;
};
export type ChatMessage = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  sentAt: number;
  system?: boolean;
  assistant?: boolean;
};
export type RoomEvent =
  | { type: "snapshot"; players: Player[] }
  | { type: "join" | "move" | "leave"; player: Player }
  | { type: "message"; message: ChatMessage };
export type ConnectionMode = "connecting" | "realtime" | "offline";
type Options = {
  onReady?: (player: Player, token: string) => void;
  onStatus?: (mode: ConnectionMode) => void;
  onError?: (error: string | null) => void;
};

export function connectToRoom(initialPlayer: Player, onEvent: (event: RoomEvent) => void, options: Options = {}) {
  let player = initialPlayer;
  let socket: WebSocket | undefined;
  let closed = false;
  let paused = false;
  let ready = false;
  let mode: ConnectionMode = "connecting";
  let attempt = 0;
  let retry: number | undefined;
  let moveTimer: number | undefined;
  const status = (value: ConnectionMode) => { mode = value; options.onStatus?.(value); };
  const sendMove = () => {
    moveTimer = undefined;
    if (ready && socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "move", position: player.position, facing: player.facing }));
    }
  };
  function open() {
    if (closed || paused) return;
    ready = false;
    status("connecting");
    const url = new URL("/api/room", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const active = new WebSocket(url);
    socket = active;
    active.onopen = () => {
      if (closed || paused || socket !== active) { active.close(); return; }
      active.send(JSON.stringify({ type: "join", player }));
    };
    active.onmessage = ({ data }) => {
      if (closed || paused || socket !== active) return;
      let event;
      try { event = JSON.parse(data); } catch { active.close(1008, "Invalid room response"); return; }
      if (event.type === "ready") {
        if (typeof event.player?.id !== "string" || typeof event.assistantToken !== "string") {
          active.close(1008, "Invalid room identity"); return;
        }
        player = { ...event.player, position: player.position, facing: player.facing };
        ready = true;
        attempt = 0;
        options.onReady?.(event.player, event.assistantToken);
        options.onError?.(null);
        status("realtime");
        sendMove();
      } else if (event.type === "error") {
        options.onError?.(event.error);
      } else if (ready && ["snapshot", "join", "move", "leave", "message"].includes(event.type)) {
        onEvent(event as RoomEvent);
      }
    };
    active.onerror = () => { /* The following close event drives reconnection. */ };
    active.onclose = ({ code }) => {
      if (closed || paused || socket !== active) return;
      ready = false;
      status("offline");
      onEvent({ type: "snapshot", players: [] });
      if (code === 1008 || code === 1009) {
        options.onError?.("Room connection closed. Refresh to reconnect."); return;
      }
      const delay = Math.min(15_000, 500 * 2 ** Math.min(attempt++, 5)) * (0.8 + Math.random() * 0.4);
      retry = window.setTimeout(open, delay);
    };
  }
  const pagehide = () => {
    paused = true;
    ready = false;
    window.clearTimeout(retry);
    window.clearTimeout(moveTimer);
    moveTimer = undefined;
    socket?.close(1000, "Leaving room");
    socket = undefined;
    status("offline");
  };
  const pageshow = () => { if (!closed && paused) { paused = false; attempt = 0; open(); } };
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);
  open();
  return {
    get mode() { return mode; },
    update(nextPlayer: Player) {
      player = { ...nextPlayer, id: player.id };
      // Coalesce held-key movement to at most 20 updates per second.
      if (ready && moveTimer === undefined) moveTimer = window.setTimeout(sendMove, 50);
    },
    sendMessage(message: ChatMessage) {
      if (!ready || socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify({ type: "message", text: message.text }));
      return true;
    },
    close() {
      if (closed) return;
      closed = true;
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      pagehide();
    },
  };
}
