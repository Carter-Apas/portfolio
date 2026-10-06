import type { IncomingMessage, ServerResponse } from 'node:http';
export const COOLDOWN_MS: number;
export type NotificationOptions = {
  token?: string;
  user?: string;
  statePath?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: Pick<Console, 'error'>;
};
export function notificationOptions(env: Record<string, string | undefined>): NotificationOptions;
export function createNotificationHandler(options?: NotificationOptions): (
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) => void;
