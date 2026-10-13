import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnectionManager, validateEndpoint, connectionError, normalizeApiKey, readRealmResponse } from '../connection.mjs';
import { createSelectionStore, normalizeRealms } from '../index.mjs';
import { createContextStore } from '../panel.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'onto-connection-'));
  const values = new Map(); let mounted = 0, rejected = false, failMount = false;
  const options = { directory, profile: 'test-profile', external: () => null,
    credentials: { describe: async ref => ({ configured: values.has(ref), writable: true }),
      resolve: async ref => values.has(ref) ? { value: values.get(ref) } : undefined,
      set: async (ref, value) => values.set(ref, value), unset: async ref => values.delete(ref) },
    probe: async () => { if (rejected) throw Object.assign(new Error('401 private-secret'), { status: 401 }); return []; },
    mount: async () => { if (failMount) throw new Error('cannot activate'); mounted++; return { dispose: async () => mounted-- }; },
  };
  return { directory, values, options, manager: createConnectionManager(options), mounted: () => mounted,
    reject: value => rejected = value, failMount: value => failMount = value,
    close: () => rmSync(directory, { recursive: true, force: true }) };
}
test('accepts a pasted Onto header and explains authentication errors without exposing server text', () => {
  assert.equal(normalizeApiKey(' X-Onto-Api-Key: synthetic-key '), 'synthetic-key');
  assert.equal(normalizeApiKey(' synthetic-key '), 'synthetic-key');
  const response = { content: [{ type: 'text', text: 'Error: invalid API key: private-secret' }], isError: false };
  let rejected;
  try { readRealmResponse(response, normalizeRealms); } catch (error) { rejected = error; }
  assert.equal(rejected.code, 'ONTO_AUTH_REJECTED');
  assert.ok(!connectionError(rejected).includes('private-secret'));
  assert.equal(readRealmResponse({ structuredContent: { realms: [{ realm_id: 'example', name: 'Forbidden topics' }] } }, normalizeRealms)[0].name, 'Forbidden topics');
});
test('rejects unsafe endpoints and redacts remote errors', () => {
  assert.equal(validateEndpoint('https://example.org/mcp'), 'https://example.org/mcp');
  assert.equal(validateEndpoint('http://localhost:1234/mcp'), 'http://localhost:1234/mcp');
  for (const url of ['http://example.org/mcp', 'https://user:key@example.org/mcp', 'https://example.org/mcp?key=secret', 'file:///private']) assert.throws(() => validateEndpoint(url));
  assert.ok(!connectionError(new Error('server echoed private-secret')).includes('private-secret'));
});
test('failed validation leaves no credentials or config; success stores only a reference and restores', async () => {
  const f = fixture();
  try {
    f.reject(true);
    await assert.rejects(f.manager.connect({ url: 'https://example.org/mcp', apiKey: 'private-secret' }), /ключ/);
    assert.equal(f.values.size, 0); assert.equal(readdirSync(f.directory).length, 0);
    f.reject(false);
    const result = await f.manager.connect({ url: 'https://example.org/mcp', apiKey: 'private-secret' });
    assert.equal(result.connection.connected, true); assert.equal(result.connection.busy, false);
    const text = readFileSync(join(f.directory, readdirSync(f.directory)[0]), 'utf8');
    assert.ok(!text.includes('private-secret')); assert.ok(!JSON.stringify(result).includes('private-secret'));
    const next = createConnectionManager(f.options); await next.restore();
    assert.equal((await next.status()).connected, true); assert.equal(next.identity(), f.manager.identity());
    const other = createConnectionManager({ ...f.options, profile: 'other-profile' });
    assert.equal((await other.status()).source, 'none');
  } finally { f.close(); }
});
test('mount failure restores previous credentials and connection config', async () => {
  const f = fixture();
  try {
    await f.manager.connect({ url: 'https://example.org/mcp', apiKey: 'old-secret' });
    const old = f.manager.identity(); f.failMount(true);
    await assert.rejects(f.manager.connect({ url: 'https://another.example/mcp', apiKey: 'new-secret' }), /сохранить/);
    assert.equal([...f.values.values()][0], 'old-secret'); assert.equal(f.manager.identity(), old);
    assert.equal((await f.manager.status()).url, 'https://example.org/mcp');
  } finally { f.close(); }
});
test('existing Harness connection is reused without asking for or storing a key', async () => {
  const f = fixture();
  try {
    const manager = createConnectionManager({ ...f.options, external: () => ({ connected: true, url: 'https://example.org/mcp' }) });
    assert.equal((await manager.status()).source, 'harness');
    assert.equal((await manager.status()).canConfigure, false);
    await assert.rejects(manager.connect({ url: 'https://example.org/mcp', apiKey: 'key' }), /Harness/);
    assert.equal(f.values.size, 0);
  } finally { f.close(); }
});
test('overlapping setup requests cannot both change the connection', async () => {
  const f = fixture();
  try {
    const gate = Promise.withResolvers();
    const manager = createConnectionManager({ ...f.options, probe: async () => { await gate.promise; return []; } });
    const first = manager.connect({ url: 'https://example.org/mcp', apiKey: 'one' });
    const second = manager.connect({ url: 'https://example.org/mcp', apiKey: 'two' });
    const rejected = assert.rejects(second, /проверяется/);
    gate.resolve(); await first; await rejected;
    assert.equal([...f.values.values()][0], 'one');
  } finally { f.close(); }
});
test('new server or account invalidates prior chat selections and memory, including in-flight writes', async () => {
  const f = fixture();
  try {
    await f.manager.connect({ url: 'https://example.org/mcp', apiKey: 'first-account' });
    const selections = createSelectionStore(join(f.directory, 'selections'), f.manager.identity);
    const contexts = createContextStore(join(f.directory, 'contexts'), selections);
    const realm = { realm_id: 'same-realm-id', name: 'Example' };
    selections.set('chat-a', realm);
    const state = contexts.get('chat-a'); state.memories.push({ id: 'memo', body: 'old account' });
    contexts.set('chat-a', state, realm.realm_id, 0);
    const pending = contexts.get('chat-a');
    await f.manager.connect({ url: 'https://example.org/mcp', apiKey: 'second-account' });
    assert.equal(selections.get('chat-a'), null);
    selections.set('chat-a', realm);
    assert.equal(contexts.get('chat-a').memories.length, 0);
    await assert.rejects(async () => contexts.set('chat-a', pending, realm.realm_id, 0), /изменились/);
  } finally { f.close(); }
});
