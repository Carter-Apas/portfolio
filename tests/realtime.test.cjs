const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(new URL('../src/realtime.ts', `file://${__filename}`), 'utf8');
const flush = async () => { await new Promise(setImmediate); };
const player = (id) => ({ id, name: id, animal: 'kiwi', position: { x: 7, y: 6 }, facing: 'se' });

function environment({ online = false } = {}) {
  const channels = new Set();
  const clients = [];
  class Channel {
    constructor() { channels.add(this); this.closed = false; }
    postMessage(value) {
      assert(!this.closed, 'Posting to a closed channel');
      for (const other of channels) {
        if (other === this) continue;
        const copy = structuredClone(value);
        queueMicrotask(() => { if (!other.closed) other.onmessage?.({ data: copy }); });
      }
    }
    close() { this.closed = true; channels.delete(this); }
  }
  function runtime() {
    const clock = { now: 0 };
    const timers = new Map();
    const events = new Map();
    const docEvents = new Map();
    let nextTimer = 0;
    const eventTarget = (handlers) => ({
      addEventListener(name, fn) {
        if (!handlers.has(name)) handlers.set(name, new Set());
        handlers.get(name).add(fn);
      },
      removeEventListener(name, fn) { handlers.get(name)?.delete(fn); },
      dispatch(name) { for (const fn of [...handlers.get(name) ?? []]) fn(); },
    });
    const window = {
      ...eventTarget(events),
      setInterval(fn) { timers.set(++nextTimer, fn); return nextTimer; },
      clearInterval(id) { timers.delete(id); },
    };
    const document = eventTarget(docEvents);
    const exports = {};
    class ClockDate extends Date { static now() { return clock.now; } }
    const compiled = ts.transpileModule(source
      .replace('import.meta.env.VITE_SUPABASE_URL', JSON.stringify(online ? 'https://test.supabase.co' : ''))
      .replace('import.meta.env.VITE_SUPABASE_ANON_KEY', JSON.stringify(online ? 'test-key' : '')),
      { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const createClient = () => {
      const handlers = new Map();
      const state = { presence: {}, track: [], untrack: 0, removed: 0, disconnected: 0 };
      const channel = {
        on(type, filter, fn) { handlers.set(`${type}:${filter.event}`, fn); return this; },
        subscribe(fn) { state.subscribe = fn; return this; },
        presenceState() { return state.presence; },
        track(peer) { state.track.push(peer); return Promise.resolve('ok'); },
        untrack() { state.untrack++; return Promise.resolve('ok'); },
        send() { return Promise.resolve('ok'); },
      };
      clients.push({ state, emit: (event, payload) => handlers.get(event)?.(payload) });
      return {
        channel: () => channel,
        removeChannel: () => { state.removed++; return Promise.resolve('ok'); },
        realtime: { disconnect: () => { state.disconnected++; return Promise.resolve(); } },
      };
    };
    vm.runInNewContext(compiled, {
      exports, window, document, BroadcastChannel: Channel, Date: ClockDate,
      require: () => ({ createClient }),
    });
    return { connect: exports.connectToRoom, window, timers,
      tick(ms) { clock.now += ms; for (const fn of timers.values()) fn(); } };
  }
  const observer = () => {
    const peers = new Map();
    const messages = [];
    const onEvent = (event) => {
      if (event.type === 'snapshot') {
        peers.clear(); for (const peer of event.players) peers.set(peer.id, peer);
      } else if (event.type === 'leave') peers.delete(event.player.id);
      else if (event.type === 'message') messages.push(event.message);
      else peers.set(event.player.id, event.player);
    };
    return { peers, messages, onEvent };
  };
  return { runtime, observer, Channel, channels, clients };
}

test('local peers disappear on exit/refresh and return correctly from the page cache', async () => {
  const env = environment(); const a = env.runtime(); const b = env.runtime();
  const viewA = env.observer(); const viewB = env.observer();
  const ca = a.connect(player('a'), viewA.onEvent); const cb = b.connect(player('b'), viewB.onEvent);
  await flush(); assert(viewA.peers.has('b')); assert(viewB.peers.has('a'));
  b.window.dispatch('pagehide'); await flush(); assert(!viewA.peers.has('b'));
  cb.update({ ...player('b'), position: { x: 8, y: 6 } });
  b.window.dispatch('pageshow'); await flush(); assert.equal(viewA.peers.get('b').position.x, 8);
  cb.close(); cb.close(); await flush(); assert(!viewA.peers.has('b'));
  b.window.dispatch('pageshow'); await flush(); assert(!viewA.peers.has('b'), 'Closed React effects stay closed');
  const refreshed = env.runtime(); const freshView = env.observer();
  const fresh = refreshed.connect(player('b-new'), freshView.onEvent); await flush();
  assert(viewA.peers.has('b-new')); assert(!viewA.peers.has('b')); assert(freshView.peers.has('a'));
  fresh.close(); ca.close(); assert.equal(env.channels.size, 0);
  assert.equal(a.timers.size + b.timers.size + refreshed.timers.size, 0);
});

test('local heartbeat lease removes a peer whose final leave message is missing', async () => {
  const env = environment(); const a = env.runtime(); const view = env.observer();
  const connection = a.connect(player('a'), view.onEvent);
  const ghost = new env.Channel(); ghost.postMessage({ type: 'join', player: player('crashed') });
  await flush(); assert(view.peers.has('crashed')); ghost.close();
  a.tick(29_999); await flush(); assert(view.peers.has('crashed'));
  a.tick(1); await flush(); assert(!view.peers.has('crashed'));
  connection.close();
});

test('heartbeats retain stationary visitors and chat is delivered without changing membership', async () => {
  const env = environment(); const a = env.runtime(); const b = env.runtime();
  const va = env.observer(); const vb = env.observer();
  const ca = a.connect(player('a'), va.onEvent); const cb = b.connect(player('b'), vb.onEvent); await flush();
  for (let i = 0; i < 8; i++) { a.tick(5_000); b.tick(5_000); await flush(); }
  assert(va.peers.has('b')); assert(vb.peers.has('a'));
  cb.sendMessage({ id: 'chat', playerId: 'b', name: 'b', text: 'Kia ora!', sentAt: 0 });
  await flush(); assert.equal(va.messages[0].text, 'Kia ora!'); assert(va.peers.has('b'));
  ca.close(); cb.close();
});

test('hidden peer leases allow throttled timers but still expire after a crash', async () => {
  const env = environment(); const a = env.runtime(); const view = env.observer();
  const connection = a.connect(player('a'), view.onEvent);
  const hidden = new env.Channel();
  hidden.postMessage({ type: 'heartbeat', player: player('hidden'), hidden: true });
  await flush(); hidden.close();
  a.tick(60_000); await flush(); assert(view.peers.has('hidden'));
  a.tick(30_000); await flush(); assert(!view.peers.has('hidden'));
  connection.close();
});

test('online presence is authoritative; late moves and callbacks cannot resurrect departed peers', async () => {
  const env = environment({ online: true }); const runtime = env.runtime(); const view = env.observer();
  const connection = runtime.connect(player('a'), view.onEvent); const server = env.clients[0];
  await server.state.subscribe('SUBSCRIBED'); assert.equal(server.state.track.length, 1);
  server.state.presence = { a: [player('a')], b: [player('b'), player('b')] };
  server.emit('presence:sync'); assert.equal(view.peers.size, 2);
  server.emit('broadcast:room-event', { payload: { type: 'move', player: { ...player('b'), position: { x: 8, y: 6 } } } });
  assert.equal(view.peers.get('b').position.x, 8);
  server.state.presence = { a: [player('a')] }; server.emit('presence:sync');
  server.emit('broadcast:room-event', { payload: { type: 'move', player: player('b') } });
  assert(!view.peers.has('b'));
  runtime.window.dispatch('pagehide'); assert.equal(server.state.untrack, 1);
  assert.equal(server.state.removed, 1); assert.equal(server.state.disconnected, 1);
  server.state.presence = { b: [player('b')] }; server.emit('presence:sync'); assert(!view.peers.has('b'));
  await server.state.subscribe('SUBSCRIBED'); assert.equal(server.state.track.length, 1);
  connection.close(); assert.equal(server.state.untrack, 1);
});

test('anonymous room broadcasts cannot impersonate server-owned Assistant replies', async () => {
  for (const online of [false, true]) {
    const env = environment({ online }); const a = env.runtime(); const view = env.observer();
    const connection = a.connect(player('a'), view.onEvent);
    const sender = online ? null : new env.Channel();
    const send = message => {
      const event = { type: 'message', message };
      if (online) env.clients[0].emit('broadcast:room-event', { payload: event });
      else sender.postMessage(event);
    };
    send({ id: 'spoof-1', playerId: 'assistant', name: 'Assistant', text: 'Fake reply' });
    send({ id: 'spoof-2', playerId: 'b', name: 'Assistant', text: 'Fake reply', assistant: true });
    send({ id: 'human', playerId: 'b', name: 'Fox', text: 'Real visitor message' });
    await flush();
    assert.equal(view.messages.length, 1); assert.equal(view.messages[0].id, 'human');
    sender?.close(); connection.close();
  }
});
