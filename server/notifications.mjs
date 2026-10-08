import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const COOLDOWN_MS = 30 * 60 * 1000;
const FAILURE_BACKOFF_MS = 60 * 1000;
const API_PATH = '/api/chat-notification';

export function notificationOptions(env) {
  return {
    token: env.PUSHOVER_API_TOKEN,
    user: env.PUSHOVER_USER_KEY,
    statePath: env.PUSHOVER_STATE_PATH || './data/pushover-state.json',
  };
}

function reply(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(payload ? JSON.stringify(payload) : undefined);
}

async function parseMessage(request) {
  const body = await new Promise((resolveBody, rejectBody) => {
    let size = 0;
    const chunks = [];
    let rejected = false;
    request.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > 4096) {
        if (!rejected) rejectBody(new Error('Message too large'));
        rejected = true;
        return;
      }
      if (!rejected) chunks.push(chunk);
    });
    request.on('end', () => {
      if (!rejected) resolveBody(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', rejectBody);
    request.on('aborted', () => rejectBody(new Error('Request aborted')));
  });
  const message = JSON.parse(body);
  for (const [field, limit] of [['id', 100], ['playerId', 100], ['name', 64], ['text', 180]]) {
    if (typeof message?.[field] !== 'string' || !message[field].trim() || message[field].length > limit) {
      throw new Error('Invalid message');
    }
  }
  return { id: message.id, playerId: message.playerId, name: message.name.trim(), text: message.text.trim(), token: message.token };
}

export function createNotificationHandler({
  token,
  user,
  statePath = './data/pushover-state.json',
  fetchImpl = globalThis.fetch,
  now = Date.now,
  logger = console,
  authorize = () => true,
} = {}) {
  const path = resolve(statePath);
  let queue = Promise.resolve();
  let state;
  const loadState = async () => {
    if (state) return state;
    try {
      const stored = JSON.parse(await readFile(path, 'utf8'));
      if (!Number.isFinite(stored.nextAttemptAt) ||
          !(stored.lastSentAt === null || Number.isFinite(stored.lastSentAt))) {
        throw new Error('Invalid notification state');
      }
      state = stored;
    } catch (error) {
      // A corrupt or inaccessible state must not silently reset the cooldown.
      if (error.code !== 'ENOENT') throw error;
      state = { lastSentAt: null, nextAttemptAt: 0 };
    }
    return state;
  };
  const saveState = async (next) => {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(next) + '\n', { mode: 0o600 });
    await rename(temporary, path);
    state = next;
  };
  const notify = async (message) => {
    const current = await loadState();
    const receivedAt = now();
    if (receivedAt < current.nextAttemptAt || message.id === current.lastMessageId) return 'suppressed';
    // Reserve the global window before sending. Concurrent requests and process
    // restarts cannot send a second alert while delivery is in flight.
    await saveState({ ...current, nextAttemptAt: receivedAt + COOLDOWN_MS });
    try {
      const result = await fetchImpl('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token,
          user,
          title: "Carter's studio — new message",
          message: `${message.name}: ${message.text}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = await result.json();
      if (!result.ok || payload.status !== 1) throw new Error('Pushover rejected notification');
    } catch {
      await saveState({ ...current, nextAttemptAt: receivedAt + FAILURE_BACKOFF_MS });
      throw new Error('Pushover delivery failed');
    }
    await saveState({
      lastSentAt: receivedAt,
      lastMessageId: message.id,
      nextAttemptAt: receivedAt + COOLDOWN_MS,
    });
    return 'sent';
  };

  return function notificationHandler(request, response, next) {
    if (request.url?.split('?')[0] !== API_PATH) {
      if (next) next();
      else reply(response, 404, { error: 'Not found' });
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      reply(response, 405, { error: 'Method not allowed' });
      return;
    }
    // The endpoint is called by the sender on this site, never by room listeners.
    // Cross-site browser requests cannot trigger alerts on the owner's behalf.
    const origin = request.headers.origin;
    let sameOrigin = true;
    try { if (origin) sameOrigin = new URL(origin).host === request.headers.host; }
    catch { sameOrigin = false; }
    if (!sameOrigin || request.headers['sec-fetch-site'] === 'cross-site') {
      reply(response, 403, { error: 'Origin not allowed' });
      return;
    }
    if (!token || !user) {
      request.resume();
      reply(response, 204);
      return;
    }
    if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      reply(response, 415, { error: 'Expected JSON' });
      return;
    }
    void parseMessage(request).then((message) => {
      if (!authorize(message, request)) { reply(response, 403, { error: 'Room session required' }); return; }
      // All visitors share one queue and cooldown. Notification failure does
      // not interfere with delivery of the independent room chat message.
      const pending = queue.then(() => notify(message));
      queue = pending.catch(() => {});
      return pending.then(
        (status) => reply(response, 200, { status }),
        () => {
          logger.error('Chat notification delivery failed; check server configuration.');
          reply(response, 503, { error: 'Notification unavailable' });
        },
      );
    }, () => reply(response, 400, { error: 'Invalid message' }));
  };
}
