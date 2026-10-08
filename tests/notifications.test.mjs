import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeHandler } from './http-fixture.mjs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COOLDOWN_MS, createNotificationHandler } from '../server/notifications.mjs';

const visitor = (id = 'message-1') => ({ id, playerId: 'visitor', name: 'Kiwi', text: 'Kia ora!' });
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-notify-test-'));
  const statePath = join(directory, 'state.json');
  const calls = [];
  const errors = [];
  const clock = { value: 1_000_000 };
  const config = {
    token: 'fake-app-token', user: 'fake-user-key', statePath,
    now: () => clock.value, logger: { error: (text) => errors.push(text) },
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ status: 1 }), { status: 200 });
    },
    ...options,
  };
  const instances = new Map();
  const start = async () => {
    const address = `instance-${instances.size}`;
    instances.set(address, createNotificationHandler(config));
    return { address, close: async () => {} };
  };
  const instance = await start();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const send = (message = visitor(), extra = {}, address = instance.address) => invokeHandler(instances.get(address), {
    path: '/api/chat-notification', method: extra.method || 'POST',
    body: extra.method === 'GET' ? undefined : extra.body ?? JSON.stringify(message),
    headers: extra.headers,
  });
  return { ...instance, statePath, calls, errors, clock, config, start, send };
}

test('first message alerts immediately; cooldown is global and does not slide with later messages', async t => {
  const f = await fixture(t);
  assert.deepEqual(await (await f.send()).json(), { status: 'sent' });
  f.clock.value += COOLDOWN_MS / 2;
  assert.deepEqual(await (await f.send({ ...visitor('second'), playerId: 'another-visitor' })).json(), { status: 'suppressed' });
  f.clock.value += COOLDOWN_MS / 2 - 1;
  assert.deepEqual(await (await f.send(visitor('third'))).json(), { status: 'suppressed' });
  f.clock.value++;
  assert.deepEqual(await (await f.send(visitor('fourth'))).json(), { status: 'sent' });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].url, 'https://api.pushover.net/1/messages.json');
  const body = f.calls[0].init.body;
  assert.equal(body.get('token'), 'fake-app-token'); assert.equal(body.get('user'), 'fake-user-key');
  assert.equal(body.get('message'), 'Kiwi: Kia ora!'); assert(f.calls[0].init.signal);
  const stored = await readFile(f.statePath, 'utf8');
  assert(!stored.includes('fake-app-token')); assert(!stored.includes('Kia ora!'));
});

test('concurrent messages produce a single alert', async t => {
  const f = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => f.send(visitor(`message-${i}`))));
  const results = await Promise.all(responses.map(response => response.json()));
  assert.equal(results.filter(result => result.status === 'sent').length, 1);
  assert.equal(results.filter(result => result.status === 'suppressed').length, 7);
  assert.equal(f.calls.length, 1);
});

test('cooldown and message deduplication survive a server restart', async t => {
  const f = await fixture(t); await f.send(); await f.close();
  const restarted = await f.start();
  f.clock.value += 5 * 60 * 1000;
  const suppressed = await f.send(visitor('after-restart'), {}, restarted.address);
  assert.equal((await suppressed.json()).status, 'suppressed');
  f.clock.value += COOLDOWN_MS;
  assert.equal((await (await f.send(visitor(), {}, restarted.address)).json()).status, 'suppressed');
  assert.equal((await (await f.send(visitor('fresh'), {}, restarted.address)).json()).status, 'sent');
  assert.equal(f.calls.length, 2);
});

test('disabled notifications do not send requests or create state', async t => {
  const f = await fixture(t, { token: '' });
  assert.equal((await f.send()).status, 204); assert.equal(f.calls.length, 0);
  await assert.rejects(readFile(f.statePath), { code: 'ENOENT' });
});

test('delivery failures back off briefly and can recover without a full 30-minute lockout', async t => {
  let attempts = 0;
  const f = await fixture(t, { fetchImpl: async () => {
    attempts++;
    if (attempts === 1) return new Response(JSON.stringify({ status: 0 }), { status: 500 });
    return new Response(JSON.stringify({ status: 1 }), { status: 200 });
  } });
  assert.equal((await f.send()).status, 503);
  assert.equal((await (await f.send(visitor('next'))).json()).status, 'suppressed');
  f.clock.value += 60_000;
  assert.equal((await (await f.send(visitor('retry'))).json()).status, 'sent');
  assert.equal(attempts, 2); assert.equal(f.errors.length, 1);
  assert(!f.errors[0].includes('fake-app-token'));
});

test('corrupt cooldown state fails closed rather than sending repeated alerts', async t => {
  const f = await fixture(t); await writeFile(f.statePath, 'invalid json');
  assert.equal((await f.send()).status, 503); assert.equal(f.calls.length, 0);
});

test('invalid messages and cross-site requests never call Pushover', async t => {
  const f = await fixture(t);
  assert.equal((await f.send({}, { method: 'GET', body: undefined })).status, 405);
  assert.equal((await f.send({}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await f.send({ ...visitor(), text: 'x'.repeat(181) })).status, 400);
  assert.equal((await f.send({ ...visitor(), text: 'x'.repeat(5000) })).status, 400);
  assert.equal((await f.send({ ...visitor(), name: '' })).status, 400);
  assert.equal((await f.send(visitor(), { body: 'not json' })).status, 400);
  assert.equal((await f.send(visitor(), { headers: { 'Content-Type': 'application/json', Origin: 'https://another-site.example' } })).status, 403);
  assert.equal((await f.send(visitor(), { headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal(f.calls.length, 0);
});

test('session authorization rejects notifications that are not tied to an accepted room message', async t => {
  const f = await fixture(t, { authorize: message => message.token === 'live-session' });
  assert.equal((await f.send()).status, 403); assert.equal(f.calls.length, 0);
  assert.equal((await f.send({ ...visitor(), token: 'live-session' })).status, 200);
  assert.equal(f.calls.length, 1);
});
