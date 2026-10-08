import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { WebSocketServer } from 'ws';

const scene = JSON.parse(readFileSync(new URL('../public/assets/studio/organic-scene.json', import.meta.url)));
const blocked = new Set(scene.blocked);
const animals = new Set(['fox', 'cat', 'bunny', 'frog', 'kiwi']);
const facings = new Set(['ne', 'nw', 'se', 'sw']);
const PATH = '/api/room';
const MAX_BUFFER = 64 * 1024;
export const MAX_PAYLOAD = 4096;

export function clientAddress(request, trustedProxyHops = 0) {
  const remote = request.socket.remoteAddress || 'unknown';
  if (!trustedProxyHops) return remote;
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded !== 'string') return remote;
  const chain = [...forwarded.split(',').map(value => value.trim()), remote];
  if (chain.length <= trustedProxyHops || chain.some(value => !isIP(value))) return remote;
  return chain[chain.length - 1 - trustedProxyHops];
}
export function roomOptions(env) {
  const hops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(hops) || hops < 0 || hops > 10) throw new Error('Invalid TRUST_PROXY_HOPS');
  let publicOrigin;
  if (env.PUBLIC_ORIGIN) {
    const url = new URL(env.PUBLIC_ORIGIN);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN must be an exact HTTP(S) origin');
    publicOrigin = url.origin;
  }
  return { publicOrigin, trustedProxyHops: hops };
}
export function originAllowed(request, publicOrigin) {
  try {
    const origin = new URL(request.headers.origin);
    const expected = publicOrigin || `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
    return origin.origin === expected && request.headers.origin === origin.origin;
  } catch { return false; }
}
const validPosition = position => position && Number.isInteger(position.x) && Number.isInteger(position.y) &&
  position.x >= 0 && position.x < scene.gridWidth && position.y >= 0 && position.y < scene.gridDepth &&
  !blocked.has(`${position.x},${position.y}`);
const validText = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const keysOnly = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).every(key => keys.includes(key));
function bucket(capacity, perSecond, now) {
  let tokens = capacity, last = now();
  return () => {
    const time = now(); tokens = Math.min(capacity, tokens + Math.max(0, time - last) * perSecond / 1000); last = time;
    if (tokens < 1) return false;
    tokens--; return true;
  };
}

// Separate room rules from transport so abuse and lifecycle behavior can be
// tested against the same code without opening network sockets.
export function createRoomHub({ now = Date.now, trustedProxyHops = 0 } = {}) {
  const peers = new Map();
  const attempts = new Map();
  const accepted = new Map();
  const globalChat = bucket(120, 2, now);
  const sweep = () => {
    for (const [ip, times] of attempts) {
      const recent = times.filter(time => now() - time < 60_000);
      if (recent.length) attempts.set(ip, recent); else attempts.delete(ip);
    }
    for (const [id, message] of accepted) if (message.expiresAt <= now()) accepted.delete(id);
  };
  function canConnect(request) {
    sweep();
    const ip = clientAddress(request, trustedProxyHops);
    const times = attempts.get(ip) || [];
    if (peers.size >= 100 || [...peers.values()].filter(peer => peer.ip === ip).length >= 8 ||
        times.length >= 30 || (!attempts.has(ip) && attempts.size >= 1000)) return false;
    attempts.set(ip, [...times, now()]); return true;
  }
  function send(peer, event) {
    if (peer.socket.readyState !== 1) return;
    if (peer.socket.bufferedAmount > MAX_BUFFER) { peer.socket.terminate(); return; }
    peer.socket.send(JSON.stringify(event), error => { if (error) peer.socket.terminate(); });
  }
  function broadcast(event, except) {
    for (const peer of peers.values()) if (peer.player && peer !== except) send(peer, event);
  }
  function remove(peer) {
    if (!peers.delete(peer.socket)) return;
    if (peer.player) broadcast({ type: 'leave', player: peer.player });
  }
  function disconnect(peer, code = 1008, reason = 'Invalid room event') {
    remove(peer); peer.socket.close(code, reason);
  }
  function connect(socket, request) {
    const peer = { socket, ip: clientAddress(request, trustedProxyHops), joinedAt: now(), alive: true,
      id: randomUUID(), token: randomBytes(32).toString('hex'), player: null,
      packet: bucket(80, 40, now), move: bucket(30, 20, now), chat: bucket(12, 0.2, now) };
    peers.set(socket, peer);
    socket.on('error', () => { remove(peer); socket.terminate(); });
    socket.on('close', () => remove(peer));
    socket.on('pong', () => { peer.alive = true; });
    socket.on('ping', () => { if (!peer.packet()) disconnect(peer, 1008, 'Too many events'); });
    socket.on('message', (raw, binary) => {
      if (!peers.has(socket)) return;
      if (binary || raw.length > MAX_PAYLOAD || !peer.packet()) { disconnect(peer); return; }
      let event;
      try { event = JSON.parse(raw.toString()); } catch { disconnect(peer); return; }
      if (!event || typeof event !== 'object' || Array.isArray(event)) { disconnect(peer); return; }
      if (!peer.player) {
        const player = event.player;
        if (event.type !== 'join' || !keysOnly(event, ['type', 'player']) ||
            !keysOnly(player, ['id', 'name', 'animal', 'position', 'facing']) ||
            !validText(player.name, 64) || /^assistant$/i.test(player.name.trim()) ||
            !animals.has(player.animal) || !facings.has(player.facing) || !validPosition(player.position)) {
          disconnect(peer); return;
        }
        peer.player = { id: peer.id, name: player.name.trim(), animal: player.animal,
          position: { x: player.position.x, y: player.position.y }, facing: player.facing };
        send(peer, { type: 'ready', player: peer.player, assistantToken: peer.token });
        send(peer, { type: 'snapshot', players: [...peers.values()].filter(value => value.player).map(value => value.player) });
        broadcast({ type: 'join', player: peer.player }, peer);
        return;
      }
      if (event.type === 'move' && keysOnly(event, ['type', 'position', 'facing']) &&
          validPosition(event.position) && facings.has(event.facing)) {
        if (!peer.move()) return;
        peer.player = { ...peer.player, position: { x: event.position.x, y: event.position.y }, facing: event.facing };
        broadcast({ type: 'move', player: peer.player }, peer);
      } else if (event.type === 'message' && keysOnly(event, ['type', 'text']) && validText(event.text, 180)) {
        if (!peer.chat() || !globalChat()) { send(peer, { type: 'error', error: 'Please wait before sending more messages.' }); return; }
        const message = { id: randomUUID(), playerId: peer.id, name: peer.player.name, text: event.text.trim(), sentAt: now() };
        sweep();
        accepted.set(message.id, { ...message, expiresAt: now() + 60_000 });
        while (accepted.size > 500) accepted.delete(accepted.keys().next().value);
        broadcast({ type: 'message', message });
      } else { disconnect(peer); }
    });
  }
  function authorize(body, request) {
    const peer = [...peers.values()].find(value => value.player?.id === body.player?.id);
    if (!peer || body.roomId !== 'carters-studio' || body.player.name !== peer.player.name ||
        typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token) || peer.ip !== clientAddress(request, trustedProxyHops)) return false;
    if (!timingSafeEqual(Buffer.from(body.token), Buffer.from(peer.token))) return false;
    if (body.type === 'message') {
      const message = accepted.get(body.message?.id);
      if (!message || message.expiresAt <= now() || message.playerId !== peer.id || message.text !== body.message.text) return false;
    }
    return true;
  }
  return {
    canConnect, connect, authorize,
    visitors: () => [...peers.values()].filter(peer => peer.player).map(peer => ({ id: peer.id, name: peer.player.name })),
    heartbeat() {
      sweep();
      for (const peer of peers.values()) {
        if (!peer.alive || (!peer.player && now() - peer.joinedAt >= 10_000)) { remove(peer); peer.socket.terminate(); continue; }
        peer.alive = false;
        if (peer.socket.readyState === 1) peer.socket.ping();
      }
    },
    close() { for (const peer of [...peers.values()]) { remove(peer); peer.socket.terminate(); } },
  };
}

export function attachRoomServer(server, { allowOtherUpgrades = false, ...options } = {}) {
  const hub = createRoomHub(options);
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false, maxFragments: 64, maxBufferedChunks: 64 });
  function upgrade(request, socket, head) {
    let path;
    try { path = new URL(request.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
    if (path !== PATH) { if (!allowOtherUpgrades) socket.destroy(); return; }
    if (!originAllowed(request, options.publicOrigin)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    if (!hub.canConnect(request)) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
    }
    try { wss.handleUpgrade(request, socket, head, ws => hub.connect(ws, request)); }
    catch { socket.destroy(); }
  }
  server.on('upgrade', upgrade);
  const timer = setInterval(() => hub.heartbeat(), 15_000);
  timer.unref();
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true; clearInterval(timer); server.off('upgrade', upgrade); hub.close(); wss.close();
  };
  server.once('close', close);
  return { ...hub, close };
}
