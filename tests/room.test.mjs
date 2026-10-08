import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRoomHub, originAllowed, clientAddress, roomOptions, MAX_PAYLOAD } from '../server/room.mjs';
import { createAssistantHandler } from '../server/assistant.mjs';
import { invokeHandler } from './http-fixture.mjs';

const player = { id: 'forged-id', name: 'Kiwi', animal: 'kiwi', position: { x: 7, y: 6 }, facing: 'se' };
const request = (ip = '127.0.0.1', extra = {}) => ({ socket: { remoteAddress: ip }, headers: { host: 'studio.example', origin: 'http://studio.example' }, ...extra });
class Socket extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent = [];
  send(value, callback) { this.sent.push(JSON.parse(value)); callback?.(); }
  close(code, reason) { this.closeCode = code; this.reason = reason; this.readyState = 3; this.emit('close'); }
  terminate() { this.terminated = true; this.close(1006); }
  ping() { this.pings = (this.pings || 0) + 1; }
  message(event, binary = false) { this.emit('message', Buffer.from(JSON.stringify(event)), binary); }
}
function fixture() {
  const clock = { value: 1_000_000 };
  const hub = createRoomHub({ now: () => clock.value });
  const connect = (profile = player, ip) => {
    const socket = new Socket(); const req = request(ip);
    assert(hub.canConnect(req)); hub.connect(socket, req); socket.message({ type: 'join', player: profile });
    return { socket, req, identity: socket.sent.find(event => event.type === 'ready') };
  };
  return { clock, hub, connect };
}
const sessionBody = (identity, extra = {}) => ({ type: 'sync', roomId: 'carters-studio',
  player: { id: identity.player.id, name: identity.player.name }, token: identity.assistantToken, ...extra });

test('server assigns identities, shares presence, stamps messages and removes departures immediately', () => {
  const f = fixture(); const a = f.connect(); const b = f.connect({ ...player, name: 'Fox' });
  assert.notEqual(a.identity.player.id, player.id); assert.notEqual(a.identity.player.id, b.identity.player.id);
  assert.equal(b.socket.sent.find(event => event.type === 'snapshot').players.length, 2);
  assert.equal(a.socket.sent.at(-1).type, 'join');
  a.socket.message({ type: 'move', position: { x: 8, y: 6 }, facing: 'se' });
  assert.equal(b.socket.sent.at(-1).player.position.x, 8);
  a.socket.message({ type: 'message', text: 'Hello!' });
  const message = a.socket.sent.at(-1).message;
  assert.equal(message.playerId, a.identity.player.id); assert.equal(message.name, 'Kiwi'); assert.equal(message.sentAt, f.clock.value);
  assert.equal(b.socket.sent.at(-1).message.id, message.id); assert(!message.assistant);
  a.socket.close(1000); assert.equal(b.socket.sent.at(-1).type, 'leave'); assert.equal(f.hub.visitors().length, 1);
  f.hub.close();
});

test('strict validation rejects spoofing, invalid movement, binary messages and oversized payloads', () => {
  for (const event of [
    { type: 'message', text: 'spoof', playerId: 'assistant', assistant: true },
    { type: 'message', text: 'x'.repeat(181) },
    { type: 'move', position: { x: -1, y: 6 }, facing: 'se' },
    { type: 'move', position: { x: 7.5, y: 6 }, facing: 'se' },
    { type: 'leave', player },
    { type: 'snapshot', players: [] },
    null,
  ]) {
    const f = fixture(); const a = f.connect(); a.socket.message(event);
    assert.equal(a.socket.closeCode, 1008); assert.equal(f.hub.visitors().length, 0);
  }
  const f = fixture(); const a = f.connect(); a.socket.message({ type: 'message', text: 'Hello' }, true);
  assert.equal(a.socket.closeCode, 1008);
  const b = f.connect(); b.socket.emit('message', Buffer.alloc(MAX_PAYLOAD + 1), false); assert.equal(b.socket.closeCode, 1008);
  const c = f.connect(); c.socket.emit('message', Buffer.from('broken-json'), false); assert.equal(c.socket.closeCode, 1008);
  const d = f.connect({ ...player, name: 'Assistant' }); assert.equal(d.socket.closeCode, 1008);
  f.hub.close();
});

test('AI authorization requires a live capability and an accepted message from that visitor', () => {
  const f = fixture(); const a = f.connect(); const b = f.connect({ ...player, name: 'Fox' });
  const valid = sessionBody(a.identity);
  assert(f.hub.authorize(valid, a.req));
  for (const invalid of [
    { ...valid, token: 'f'.repeat(64) }, { ...valid, token: 'é'.repeat(64) },
    { ...valid, token: b.identity.assistantToken }, { ...valid, roomId: 'other-room' },
    { ...valid, player: { ...valid.player, name: 'Assistant' } },
    { ...valid, type: 'message', message: { id: 'fake', text: 'Invented message' } },
  ]) assert.equal(f.hub.authorize(invalid, a.req), false);
  assert.equal(f.hub.authorize(valid, request('192.0.2.1')), false);
  a.socket.message({ type: 'message', text: 'Hello' }); const message = a.socket.sent.at(-1).message;
  assert(f.hub.authorize({ ...valid, type: 'message', message }, a.req));
  assert.equal(f.hub.authorize({ ...sessionBody(b.identity), type: 'message', message }, b.req), false);
  assert.equal(f.hub.authorize({ ...valid, type: 'message', message: { ...message, text: 'Changed' } }, a.req), false);
  a.socket.close(1000); assert.equal(f.hub.authorize(valid, a.req), false);
  f.hub.close();
});

test('Assistant endpoint rejects direct callers and gets the actual visitor roster from WebSockets', async () => {
  const f = fixture(); const a = f.connect(); f.connect({ ...player, name: 'Fox' }); let calls = 0, context;
  const assistant = createAssistantHandler({ apiKey: 'test-secret', authorize: f.hub.authorize, getVisitors: f.hub.visitors,
    fetchImpl: async (_, init) => {
      calls++; context = JSON.parse(JSON.parse(init.body).input[0].content);
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"action":"silent","text":""}' }] }] }));
    },
  });
  const send = body => invokeHandler(assistant, { path: '/api/assistant', body: JSON.stringify(body) });
  const valid = sessionBody(a.identity);
  assert.equal((await send({ ...valid, token: undefined })).status, 403); assert.equal(calls, 0);
  assert.equal((await send({ ...valid, type: 'message', message: { id: 'fake', text: 'hello' } })).status, 403);
  a.socket.message({ type: 'message', text: 'Fox, are you coming over?' }); const message = a.socket.sent.at(-1).message;
  assert.equal((await send({ ...valid, type: 'message', message })).status, 200);
  await new Promise(setImmediate);
  assert.equal(calls, 1); assert.equal(context.visitors.length, 2); assert.equal(context.replyRequired, false);
  f.hub.close();
});

test('chat flooding is bounded, stalled clients are dropped and heartbeat removes dead connections', () => {
  const f = fixture(); const a = f.connect(); const b = f.connect({ ...player, name: 'Fox' });
  for (let i = 0; i < 13; i++) a.socket.message({ type: 'message', text: `m${i}` });
  assert.equal(a.socket.sent.filter(event => event.type === 'message').length, 12);
  assert.equal(a.socket.sent.at(-1).type, 'error');
  f.clock.value += 5000; a.socket.message({ type: 'message', text: 'Recovered' }); assert.equal(a.socket.sent.at(-1).type, 'message');
  b.socket.bufferedAmount = 70_000; a.socket.message({ type: 'move', position: { x: 8, y: 6 }, facing: 'se' });
  assert(b.socket.terminated); assert.equal(f.hub.visitors().length, 1);
  f.hub.heartbeat(); assert.equal(a.socket.pings, 1); a.socket.emit('pong');
  f.hub.heartbeat(); assert.equal(f.hub.visitors().length, 1);
  f.hub.heartbeat(); assert(a.socket.terminated); assert.equal(f.hub.visitors().length, 0);
});

test('connection limits count open sockets and unjoined sockets time out', () => {
  const f = fixture();
  for (let i = 0; i < 8; i++) f.connect();
  assert.equal(f.hub.canConnect(request()), false);
  assert.equal(f.hub.canConnect(request('192.0.2.1')), true);
  const idle = new Socket(); f.hub.connect(idle, request('192.0.2.1'));
  f.clock.value += 10_000; f.hub.heartbeat(); assert(idle.terminated);
  f.hub.close();
});

test('origin checks reject cross-site and missing origins; proxy headers require explicit trust', () => {
  assert(originAllowed(request()));
  assert.equal(originAllowed(request(undefined, { headers: { host: 'studio.example', origin: 'https://attacker.example' } })), false);
  assert.equal(originAllowed(request(undefined, { headers: { host: 'studio.example' } })), false);
  const proxy = request('10.0.0.1', { headers: { host: 'internal:8080', origin: 'https://studio.example', 'x-forwarded-for': '192.0.2.1' } });
  assert(originAllowed(proxy, 'https://studio.example'));
  assert.equal(clientAddress(proxy), '10.0.0.1'); assert.equal(clientAddress(proxy, 1), '192.0.2.1');
  assert.throws(() => roomOptions({ TRUST_PROXY_HOPS: '-1' }));
  assert.throws(() => roomOptions({ PUBLIC_ORIGIN: 'https://studio.example/' }));
});

test('real WebSocket upgrade accepts only the site origin and enforces frame size limits', async () => {
  const { Duplex } = await import('node:stream');
  const { attachRoomServer } = await import('../server/room.mjs');
  class Wire extends Duplex {
    remoteAddress = '127.0.0.1';
    output = [];
    _read() {}
    _write(chunk, _, callback) { this.output.push(Buffer.from(chunk)); callback(); }
    setTimeout() {}
    setNoDelay() {}
  }
  const server = new EventEmitter();
  const room = attachRoomServer(server, { publicOrigin: 'https://studio.example' });
  const upgrade = origin => {
    const wire = new Wire();
    wire.on('error', () => {});
    server.emit('upgrade', { ...request(), method: 'GET', url: '/api/room', headers: {
      host: 'studio.example', origin, upgrade: 'websocket', connection: 'Upgrade',
      'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    } }, wire, Buffer.alloc(0));
    return wire;
  };
  const frame = text => {
    const payload = Buffer.from(text), extended = payload.length >= 126;
    const header = Buffer.alloc(extended ? 8 : 6);
    header[0] = 0x81; header[1] = 0x80 | (extended ? 126 : payload.length);
    if (extended) header.writeUInt16BE(payload.length, 2);
    // Client frames must be masked; an all-zero mask is valid for this fixture.
    return Buffer.concat([header, payload]);
  };
  let rejected, accepted;
  try {
    rejected = upgrade('https://attacker.example');
    assert.match(Buffer.concat(rejected.output).toString(), /403 Forbidden/);
    accepted = upgrade('https://studio.example');
    assert.match(Buffer.concat(accepted.output).toString(), /101 Switching Protocols/);
    accepted.push(frame(JSON.stringify({ type: 'join', player })));
    await new Promise(setImmediate);
    assert.equal(room.visitors().length, 1);
    assert(Buffer.concat(accepted.output).includes(Buffer.from('assistantToken')));
    accepted.push(frame('x'.repeat(MAX_PAYLOAD + 1)));
    await new Promise(setImmediate);
    assert.equal(room.visitors().length, 0);
    const closeIndex = accepted.output.findIndex(buffer => buffer[0] === 0x88);
    assert(closeIndex >= 0);
    const close = Buffer.concat(accepted.output.slice(closeIndex));
    assert.equal(close.readUInt16BE(2), 1009);
  } finally {
    rejected?.destroy(); accepted?.destroy(); room.close();
  }
});
