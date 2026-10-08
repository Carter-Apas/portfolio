import type { IncomingMessage, ServerResponse } from 'node:http';
export const CONTEXT_MS: number;
export const EMPTY_ROOM_MS: number;
export type AssistantOptions = {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: Pick<Console, 'error'>;
};
export function assistantOptions(env: Record<string, string | undefined>): AssistantOptions;
export function createAssistantHandler(options?: AssistantOptions): (
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) => void;
