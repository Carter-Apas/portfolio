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

function localConnection(
  initialPlayer: Player,
  onEvent: (event: RoomEvent) => void,
): RoomConnection {
  const channel = new BroadcastChannel("carters-studio");
  let player = initialPlayer;

  channel.onmessage = ({ data }: MessageEvent<RoomEvent>) => {
    onEvent(data);
    if (data.type === "join") {
      channel.postMessage({ type: "move", player } satisfies RoomEvent);
    }
  };

  channel.postMessage({ type: "join", player } satisfies RoomEvent);

  return {
    mode: "local",
    update(nextPlayer) {
      player = nextPlayer;
      channel.postMessage({ type: "move", player } satisfies RoomEvent);
    },
    sendMessage(message) {
      channel.postMessage({ type: "message", message } satisfies RoomEvent);
    },
    close() {
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
  const channel: RealtimeChannel = client
    .channel("carters-studio", {
      config: {
        broadcast: { ack: false },
        presence: { key: initialPlayer.id },
      },
    })
    .on("presence", { event: "sync" }, () => {
      const players = Object.values(channel.presenceState())
        .flat()
        .map((presence) => presence as unknown as Player);
      onEvent({ type: "snapshot", players });
    })
    .on("broadcast", { event: "room-event" }, ({ payload }) => {
      onEvent(payload as RoomEvent);
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track(player);
      }
    });

  const broadcast = (event: RoomEvent) => {
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
      void channel.track(player);
      broadcast({ type: "move", player });
    },
    sendMessage(message) {
      broadcast({ type: "message", message });
    },
    close() {
      broadcast({ type: "leave", player });
      void client.removeChannel(channel);
    },
  };
}

export function connectToRoom(
  player: Player,
  onEvent: (event: RoomEvent) => void,
): RoomConnection {
  if (url && anonKey) return realtimeConnection(player, onEvent);
  return localConnection(player, onEvent);
}
