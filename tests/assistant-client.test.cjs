const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

const compiled = ts.transpileModule(fs.readFileSync(new URL('../src/assistant.ts', `file://${__filename}`), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const flush = async () => { await new Promise(setImmediate); };
const assistantMessage = { id: 'reply-1', playerId: 'assistant', name: 'Assistant', text: 'Hello!', sentAt: Date.now(), assistant: true };
const state = (messages = [], thinking = false) => ({ enabled: true, thinking, unavailable: false, messages });

function runtime({ storage = new Map(), respond = () => new Response(JSON.stringify(state())) } = {}) {
  const calls = [], beacons = [], messages = [], states = [];
  const events = new Map(), docEvents = new Map(), intervals = new Map(), timeouts = new Map();
  let nextTimer = 0;
  const handlers = (map) => ({
    addEventListener(name, fn) { if (!map.has(name)) map.set(name, new Set()); map.get(name).add(fn); },
    removeEventListener(name, fn) { map.get(name)?.delete(fn); },
    dispatch(name) { for (const fn of [...map.get(name) ?? []]) fn(); },
  });
  const window = {
    ...handlers(events),
    setInterval(fn) { intervals.set(++nextTimer, fn); return nextTimer; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { timeouts.set(++nextTimer, fn); return nextTimer; },
    clearTimeout(id) { timeouts.delete(id); },
  };
  const document = { hidden: false, ...handlers(docEvents) };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, window, document, Blob, AbortController, Date,
    crypto: { randomUUID },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    navigator: { sendBeacon: (url, body) => { beacons.push({ url, body }); return true; } },
    fetch: async (url, init) => { const call = { url, init, body: JSON.parse(init.body) }; calls.push(call); return respond(call); },
  });
  return { calls, beacons, messages, states, window, document, intervals, timeouts,
    tick() { for (const fn of intervals.values()) fn(); },
    connect(token = 'live-session-token', id = 'kiwi') {
      return exports.connectAssistant({ id, name: id }, token, value => messages.push(value), value => states.push(value));
    },
  };
}

test('polling receives one shared reply once; only the sender submits a visitor message', async () => {
  const a = runtime({ respond: () => new Response(JSON.stringify(state([assistantMessage]))) });
  const connection = a.connect(); await flush();
  a.tick(); await flush(); a.tick(); await flush();
  assert.equal(a.messages.length, 1); assert(a.calls.every(call => call.body.type === 'sync'));
  connection.sendMessage({ id: 'human-1', text: 'Hello!', name: 'forged', assistant: true }); await flush();
  assert.equal(a.calls.filter(call => call.body.type === 'message').length, 1);
  const submitted = a.calls.at(-1).body;
  assert.equal(submitted.player.name, 'kiwi'); assert.deepEqual(submitted.message, { id: 'human-1', text: 'Hello!' });
  assert.equal(a.messages.length, 1);
  connection.close();
});

test('Assistant polling always uses the public room and includes the live WebSocket capability', async () => {
  const a = runtime(); const b = runtime();
  const first = a.connect('token-a'); const second = b.connect('token-b'); await flush();
  assert.equal(a.calls[0].body.roomId, 'carters-studio');
  assert.equal(b.calls[0].body.roomId, 'carters-studio');
  assert.equal(a.calls[0].body.token, 'token-a'); assert.equal(b.calls[0].body.token, 'token-b');
  first.close(); second.close();
});

test('page exit pauses polling, page-cache restore reconnects and close removes all listeners', async () => {
  const a = runtime(); const connection = a.connect(); await flush();
  a.window.dispatch('pagehide'); a.tick(); await flush();
  assert.equal(a.calls.length, 1); assert.equal(a.beacons.length, 1);
  assert.equal(JSON.parse(await a.beacons[0].body.text()).type, 'leave');
  a.window.dispatch('pageshow'); await flush(); assert.equal(a.calls.length, 2);
  connection.close(); connection.close(); a.window.dispatch('pageshow'); a.tick(); await flush();
  assert.equal(a.calls.length, 2); assert.equal(a.intervals.size, 0); assert.equal(a.timeouts.size, 0);
});

test('closing cancels pending requests and late responses cannot add chat or update state', async () => {
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const a = runtime({ respond: () => deferred }); const connection = a.connect();
  assert.equal(a.calls.length, 1); connection.close();
  assert.equal(a.calls[0].init.signal.aborted, true);
  release(new Response(JSON.stringify(state([assistantMessage])))); await flush();
  assert.equal(a.messages.length, 0); assert.equal(a.states.length, 0); assert.equal(a.timeouts.size, 0);
});

test('provider outages clear thinking and polling can recover; hidden tabs throttle polls', async () => {
  let count = 0;
  const a = runtime({ respond: () => {
    count++;
    if (count === 1) return new Response(JSON.stringify(state([], true)));
    if (count === 2) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify(state([assistantMessage])));
  } });
  const connection = a.connect(); await flush(); assert.equal(a.states.at(-1).thinking, true);
  a.tick(); await flush(); assert.equal(a.states.at(-1).thinking, false); assert(a.states.at(-1).error);
  a.tick(); await flush(); assert.equal(a.states.at(-1).error, null); assert.equal(a.messages.length, 1);
  a.document.hidden = true; a.tick(); await flush(); assert.equal(count, 3);
  a.document.hidden = false; a.document.dispatch('visibilitychange'); await flush(); assert.equal(count, 4);
  connection.close();
});

test('rate-limit feedback remains visible during subsequent successful presence polls', async () => {
  const a = runtime({ respond: call => call.body.type === 'message'
    ? new Response('{}', { status: 429 }) : new Response(JSON.stringify(state())) });
  const connection = a.connect(); await flush();
  connection.sendMessage({ id: 'limited', text: 'Hello' }); await flush();
  assert(a.states.at(-1).error.includes('minute'));
  a.tick(); await flush(); assert(a.states.at(-1).error.includes('minute'));
  connection.close();
});
