import type { IncomingMessage } from 'node:http';
import type { EventEmitter } from 'node:events';
export type RoomOptions = { publicOrigin?: string; trustedProxyHops?: number; allowOtherUpgrades?: boolean };
export type AssistantRequest = {
  roomId: string;
  player: { id: string; name: string };
  token?: string;
  type: string;
  message?: { id: string; text: string };
};
export function roomOptions(env: Record<string, string | undefined>): RoomOptions;
export function clientAddress(request: IncomingMessage, trustedProxyHops?: number): string;
export function attachRoomServer(server: EventEmitter, options?: RoomOptions): {
  close(): void;
  authorize(body: AssistantRequest, request: IncomingMessage): boolean;
  visitors(): { id: string; name: string }[];
};
