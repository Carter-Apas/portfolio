import type { ChatMessage } from './realtime';

export function notifyOwner(message: ChatMessage, token?: string) {
  // Pushover credentials and throttling live on the server. Only the sender
  // requests an alert, so other visitors do not duplicate it on receipt.
  void fetch('/api/chat-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: message.id,
      playerId: message.playerId,
      name: message.name,
      text: message.text,
      token,
    }),
    keepalive: true,
  }).catch(() => {
    // Chat remains usable when notifications are disabled or unavailable.
  });
}
