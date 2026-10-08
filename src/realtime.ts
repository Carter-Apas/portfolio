import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
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

export type ConnectionMode = "realtime" | "local";

type RoomConnection = {
  mode: ConnectionMode;
  update: (player: Player) => void;
  sendMessage: (message: ChatMessage) => void;
  close: () => void;
};

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Exit events normally remove peers immediately. A lease also cleans up tabs
// that crash or close without delivering their final BroadcastChannel message.
const HEARTBEAT_INTERVAL = 5_000;
const PEER_TIMEOUT = 30_000;
// Chrome may throttle a long-hidden tab to one timer tick per minute.
const HIDDEN_PEER_TIMEOUT = 90_000;
type LocalEvent = RoomEvent | { type: "heartbeat"; player: Player; hidden: boolean };

function localConnection(
  initialPlayer: Player,
  onEvent: (event: RoomEvent) => void,
): RoomConnection {
  const channel = new BroadcastChannel("carters-studio");
  let player = initialPlayer;
  let closed = false;
  const peers = new Map<string, { player: Player; lastSeen: number; timeout: number }>();

  const heartbeat = () => {
    if (closed) return;
    channel.postMessage({ type: "heartbeat", player, hidden: document.hidden } satisfies LocalEvent);
  };
  channel.onmessage = ({ data }: MessageEvent<LocalEvent>) => {
    if (closed) return;
    if (data.type === "message") {
      // AI replies arrive from our server, never from another anonymous visitor.
      if (data.message.assistant || data.message.playerId === "assistant") return;
      onEvent(data);
      return;
    }
    if (data.type === "snapshot" || data.player.id === player.id) return;
    if (data.type === "leave") {
      peers.delete(data.player.id);
      onEvent(data);
      return;
    }
    peers.set(data.player.id, {
      player: data.player,
      lastSeen: Date.now(),
      timeout: data.type === "heartbeat" && data.hidden ? HIDDEN_PEER_TIMEOUT : PEER_TIMEOUT,
    });
    onEvent(data.type === "heartbeat" ? { type: "move", player: data.player } : data);
    if (data.type === "join") heartbeat();
  };

  onEvent({ type: "snapshot", players: [] });
  channel.postMessage({ type: "join", player } satisfies RoomEvent);
  const timer = window.setInterval(() => {
    heartbeat();
    for (const [id, peer] of peers) {
      if (Date.now() - peer.lastSeen >= peer.timeout) {
        peers.delete(id);
        onEvent({ type: "leave", player: peer.player });
      }
    }
  }, HEARTBEAT_INTERVAL);
  // A visible tab immediately announces itself after timer throttling or sleep.
  document.addEventListener("visibilitychange", heartbeat);

  return {
    mode: "local",
    update(nextPlayer) {
      player = nextPlayer;
      if (!closed) channel.postMessage({ type: "move", player } satisfies RoomEvent);
    },
    sendMessage(message) {
      if (!closed) channel.postMessage({ type: "message", message } satisfies RoomEvent);
    },
    close() {
      if (closed) return;
      closed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
      channel.postMessage({ type: "leave", player } satisfies RoomEvent);
      channel.close();
    },
  };
}

function realtimeConnection(
  initialPlayer: Player,
  onEvent: (event: RoomEvent) => void,
): RoomConnection {
  const client = createClient(url, anonKey);
  let player = initialPlayer;
  let closed = false;
  let presentIds = new Set<string>();
  const channel: RealtimeChannel = client
    .channel("carters-studio", {
      config: {
        broadcast: { ack: false },
        presence: { key: initialPlayer.id },
      },
    })
    .on("presence", { event: "sync" }, () => {
      if (closed) return;
      const roster = new Map<string, Player>();
      for (const presence of Object.values(channel.presenceState()).flat()) {
        const peer = presence as unknown as Player;
        roster.set(peer.id, peer);
      }
      presentIds = new Set(roster.keys());
      onEvent({ type: "snapshot", players: [...roster.values()] });
    })
    .on("broadcast", { event: "room-event" }, ({ payload }) => {
      if (closed) return;
      const event = payload as RoomEvent;
      // Membership comes from Presence, so a delayed movement packet cannot
      // bring back an avatar after its departure has synced.
      if (event.type === "message" && (event.message.assistant || event.message.playerId === "assistant")) return;
      if (event.type === "message" ||
          (event.type === "move" && presentIds.has(event.player.id))) {
        onEvent(event);
      }
    })
    .subscribe(async (status) => {
      if (!closed && status === "SUBSCRIBED") {
        await channel.track(player);
      }
    });

  const broadcast = (event: RoomEvent) => {
    if (closed) return;
    void channel.send({
      type: "broadcast",
      event: "room-event",
      payload: event,
    });
  };

  return {
    mode: "realtime",
    update(nextPlayer) {
      player = nextPlayer;
      if (closed) return;
      void channel.track(player);
      broadcast({ type: "move", player });
    },
    sendMessage(message) {
      broadcast({ type: "message", message });
    },
    close() {
      if (closed) return;
      closed = true;
      void channel.untrack();
      void client.removeChannel(channel);
      // Unload can interrupt the unsubscribe acknowledgement. Closing the
      // socket also lets the server remove presence after an abrupt departure.
      void client.realtime.disconnect();
    },
  };
}

export function connectToRoom(
  initialPlayer: Player,
  onEvent: (event: RoomEvent) => void,
): RoomConnection {
  const mode = url && anonKey ? "realtime" : "local";
  let player = initialPlayer;
  const open = () => mode === "realtime"
    ? realtimeConnection(player, onEvent)
    : localConnection(player, onEvent);
  let active: RoomConnection | undefined = open();
  const pagehide = () => {
    active?.close();
    active = undefined;
  };
  const pageshow = () => {
    // Restore the same visitor when the browser returns from its back/forward
    // cache, where React stays mounted and its connection effect does not rerun.
    if (!active) active = open();
  };
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);

  return {
    mode,
    update(nextPlayer) {
      player = nextPlayer;
      active?.update(player);
    },
    sendMessage(message) { active?.sendMessage(message); },
    close() {
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      pagehide();
    },
  };
}
