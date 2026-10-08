const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/realtime.ts', `file://${__filename}`), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const player = { id: 'client-id', name: 'Kiwi', animal: 'kiwi', position: { x: 7, y: 6 }, facing: 'se' };
function runtime(protocol = 'https:') {
  const sockets = [], events = [], statuses = [], ready = [], errors = [];
  const timers = new Map(), handlers = new Map(); let timerId = 0;
  class Socket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { assert.equal(this.readyState, 1); this.sent.push(JSON.parse(value)); }
    open() { this.readyState = 1; this.onopen?.(); }
    emit(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
    joined(id = 'server-id') { this.emit({ type: 'ready', player: { ...player, id }, assistantToken: 'live-token' }); }
    close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  }
  const window = {
    location: { href: `${protocol}//studio.example/` },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
    dispatch(name) { for (const fn of [...handlers.get(name) ?? []]) fn(); },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, window, WebSocket: Socket, URL });
  const connection = exports.connectToRoom(player, event => events.push(event), {
    onReady: (value, token) => ready.push({ player: value, token }), onStatus: value => statuses.push(value), onError: value => errors.push(value),
  });
  const tick = () => { const pending = [...timers.values()]; timers.clear(); for (const { fn } of pending) fn(); };
  return { sockets, events, statuses, ready, errors, timers, window, connection, tick };
}

test('joins the server over WSS and waits for a server-owned identity before enabling chat', () => {
  const f = runtime(); const socket = f.sockets[0];
  assert.equal(socket.url.href, 'wss://studio.example/api/room');
  assert.equal(f.connection.sendMessage({ text: 'too early' }), false);
  socket.open(); assert.equal(socket.sent[0].type, 'join'); socket.joined();
  assert.equal(f.ready[0].player.id, 'server-id'); assert.equal(f.ready[0].token, 'live-token');
  assert.equal(f.connection.mode, 'realtime');
  assert.equal(f.connection.sendMessage({ id: 'fake', playerId: 'assistant', name: 'Assistant', text: 'Hello', assistant: true }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(socket.sent.at(-1))), { type: 'message', text: 'Hello' });
  socket.emit({ type: 'message', message: { id: 'canonical-message', playerId: 'server-id', text: 'Hello' } });
  assert.equal(f.events.length, 1); assert.equal(f.events[0].message.id, 'canonical-message');
  f.connection.close();
});

test('coalesces movement and uses plain WS only for HTTP development', () => {
  const f = runtime('http:'); const socket = f.sockets[0]; socket.open(); socket.joined();
  assert.equal(socket.url.protocol, 'ws:');
  for (let x = 0; x < 5; x++) f.connection.update({ ...player, position: { x, y: 6 } });
  assert.equal(f.timers.size, 1); assert.equal(socket.sent.filter(event => event.type === 'move').length, 1);
  f.tick(); assert.equal(socket.sent.at(-1).position.x, 4);
  f.connection.close();
});

test('reconnects after network loss, clears stale visitors and ignores late events from old sockets', () => {
  const f = runtime(); const first = f.sockets[0]; first.open(); first.joined(); first.close(1006);
  assert.equal(f.connection.mode, 'offline'); assert.equal(f.events.at(-1).players.length, 0);
  assert.equal(f.connection.sendMessage({ text: 'offline' }), false);
  assert.equal(f.timers.size, 1); f.tick();
  const second = f.sockets[1]; second.open(); second.joined('new-id');
  first.emit({ type: 'join', player: { ...player, id: 'ghost' } });
  assert.equal(f.events.length, 1); assert.equal(f.ready.at(-1).player.id, 'new-id');
  f.connection.close(); assert.equal(f.timers.size, 0);
});

test('page exit closes presence, page-cache restoration rejoins, and disposal cannot reconnect', () => {
  const f = runtime(); f.sockets[0].open(); f.sockets[0].joined();
  f.window.dispatch('pagehide'); assert.equal(f.connection.mode, 'offline'); assert.equal(f.timers.size, 0);
  f.window.dispatch('pageshow'); assert.equal(f.sockets.length, 2);
  f.sockets[1].open(); f.sockets[1].joined();
  f.connection.close(); f.connection.close(); f.window.dispatch('pageshow');
  assert.equal(f.sockets.length, 2); assert.equal(f.timers.size, 0);
});

test('server policy errors stop retries and rate-limit notices are displayed', () => {
  const f = runtime(); f.sockets[0].open(); f.sockets[0].joined();
  f.sockets[0].emit({ type: 'error', error: 'Please wait before sending more messages.' });
  assert.equal(f.errors.at(-1), 'Please wait before sending more messages.');
  f.sockets[0].close(1008); assert.equal(f.timers.size, 0); assert(f.errors.at(-1).includes('Refresh'));
  f.connection.close();
});
