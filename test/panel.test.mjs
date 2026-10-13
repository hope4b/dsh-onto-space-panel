import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSelectionStore, normalizeRealms } from '../index.mjs';
import { createContextStore, installPanel, unwrap, parseNamedList } from '../panel.mjs';

const realmId = '11111111-1111-1111-1111-111111111111';
const memoryId = '22222222-2222-2222-2222-222222222222';
const charterId = '33333333-3333-3333-3333-333333333333';
const constitutionId = '44444444-4444-4444-4444-444444444444';
const wrapped = value => ({ structuredContent: { result: JSON.stringify(value) } });
const doc = (id, path, body) => ({ artifact_id: id, realm_id: realmId, artifact_path: path, status: 'accepted', body, summary: path });

test('parses structured data appended to a human-readable MCP response', () => {
  assert.deepEqual(unwrap({ structuredContent: { result: 'Memory artifact search data:\n{"items":[],"total":0}' } }), { items: [], total: 0 });
  assert.throws(() => unwrap({ structuredContent: { result: 'Memory artifact data:\n{broken}' } }));
  assert.equal(parseNamedList('1. Example\n   UUID: ' + memoryId).length, 1);
  assert.equal(normalizeRealms({ structuredContent: { realms: [{ realm_id: realmId, name: 'Example' }] } })[0].realm_id, realmId);
  assert.equal(normalizeRealms({ content: [{ type: 'text', text: 'Available realms (1):\n\n1. Example\n   ID: ' + realmId }] })[0].realm_id, realmId);
});

test('context persists without leaking into another chat or realm', () => {
  const directory = mkdtempSync(join(tmpdir(), 'onto-context-test-'));
  try {
    const selections = createSelectionStore(join(directory, 'selections'));
    selections.set('chat-a', { realm_id: realmId, name: 'Example' });
    selections.set('chat-b', { realm_id: realmId, name: 'Example' });
    const contexts = createContextStore(join(directory, 'contexts'), selections);
    const state = contexts.get('chat-a');
    state.memories.push(doc(memoryId, 'notes/example', 'Attached source data'));
    contexts.set('chat-a', state, realmId, 0);
    assert.equal(contexts.get('chat-b').memories.length, 0);
    assert.equal(createContextStore(join(directory, 'contexts'), selections).get('chat-a').memories.length, 1);
    assert.throws(() => contexts.set('chat-a', state, realmId, 0), /изменились/);
    selections.set('chat-a', { realm_id: 'another-realm', name: 'Another' });
    assert.equal(contexts.get('chat-a').memories.length, 0);
    assert.throws(() => selections.get('../outside'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('validates resident governance, attaches accepted documents and projects only the chosen chat', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'onto-role-test-'));
  try {
    const selections = createSelectionStore(join(directory, 'selections'));
    for (const id of ['chat-a', 'chat-b']) selections.set(id, { realm_id: realmId, name: 'Example' });
    let bootAllowed = true;
    const providers = {};
    const docs = {
      [memoryId]: doc(memoryId, 'notes/example', 'Specific source content'),
      [charterId]: doc(charterId, 'realm/agents/example/charter', 'Bounded role duties'),
    };
    const ctx = {
      tools: {
        register() {},
        get: name => ({ execute: async args => {
          if (name.endsWith('get_realm_agent')) return wrapped({ realm_id: realmId, slug: 'example', governance_status: 'valid', boot_allowed: bootAllowed, charter: { artifact_id: charterId } });
          if (name.endsWith('list_realm_agents')) return wrapped({ realm_id: realmId, governance_status: 'valid', agents: [{ slug: 'example', role: 'Example role', boot_allowed: bootAllowed, charter: { artifact_id: charterId } }] });
          if (name.endsWith('get_memory_artifact_by_path')) return wrapped(doc(constitutionId, 'realm/agents/constitution', 'Constitution content'));
          if (name.endsWith('get_memory_artifact')) return wrapped(docs[args.artifact_id]);
          throw new Error('Unexpected read');
        } }),
      },
      connection: { fetch: { register() {} } },
      systemPrompt: { section() {}, context: entry => providers[entry.name] = entry },
    };
    const panel = installPanel(ctx, selections, directory);
    const operation = (action, args = {}) => panel.operate({ sessionId: 'chat-a', action, ...args }, new AbortController().signal);
    await operation('select-agent', { slug: 'example', revision: 0 });
    await operation('attach-memory', { id: memoryId, revision: 1 });
    const prompt = providers['onto-selected-materials'].text({ agent: { session: { id: 'chat-a' } } });
    assert.match(prompt, /Bounded role duties/);
    assert.match(prompt, /Specific source content/);
    assert.equal(providers['onto-selected-materials'].text({ agent: { session: { id: 'chat-b' } } }), '');
    bootAllowed = false;
    await assert.rejects(operation('select-agent', { slug: 'example', revision: 2 }), /недоступен/);
    await assert.rejects(operation('preview', { id: memoryId, realm_id: 'another-realm' }), /Пространство изменилось/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
