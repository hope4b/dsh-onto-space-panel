import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { installPanel, compactContext } from './panel.mjs';

export const name = 'onto-space-panel';
export const inject = ['tools', 'connection', 'systemPrompt'];
const PREFIX = 'mcp__onto__';

export function normalizeRealms(result) {
  const roots = [result.structuredContent];
  for (const block of result.content ?? []) {
    if (block.type === 'text') {
      try { roots.push(JSON.parse(block.text)); } catch { /* Non-JSON prose is not a realm list. */ }
    }
  }
  function find(value, depth = 0) {
    if (typeof value === 'string') {
      try { return find(JSON.parse(value), depth + 1); } catch { /* Onto also returns a numbered text list. */ }
      const count = value.match(/^Available realms \((\d+)\):/);
      if (count) {
        const rows = [...value.matchAll(/^\d+\.\s+(.+)\r?\n\s+ID:\s*([0-9a-f-]{36})\s*$/gim)]
          .map(match => ({ realm_id: match[2], name: match[1].trim() }));
        if (rows.length === Number(count[1])) return rows;
      }
      return null;
    }
    if (depth > 6 || !value || typeof value !== 'object') return null;
    if (Array.isArray(value)) {
      if (!value.length) return [];
      const rows = value.map(row => ({
        realm_id: row?.realm_id ?? row?.id ?? row?.uuid,
        name: row?.name ?? row?.realm_name ?? row?.title,
      }));
      if (rows.every(row => typeof row.realm_id === 'string' && typeof row.name === 'string')) return rows;
    }
    for (const key of ['realms', 'available_realms', 'spaces', 'items', 'data', 'result']) {
      const found = find(value[key], depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const root of roots) {
    const found = find(root);
    if (found !== null) return [...new Map(found.map(row => [row.realm_id, row])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  throw new Error('Onto вернул список в неизвестном формате. Выбор не изменён.');
}

export function createSelectionStore(directory) {
  const cache = new Map();
  function pathFor(sessionId) {
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(sessionId)) throw new Error('Не удалось определить чат.');
    return join(directory, sessionId + '.json');
  }
  return {
    get(sessionId) {
      const path = pathFor(sessionId);
      if (cache.has(sessionId)) return cache.get(sessionId);
      let value = null;
      try { value = JSON.parse(readFileSync(path, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (value !== null && (typeof value.realm_id !== 'string' || typeof value.name !== 'string')) throw new Error('Сохранённый выбор пространства повреждён.');
      cache.set(sessionId, value);
      return value;
    },
    set(sessionId, realm) {
      const path = pathFor(sessionId);
      const record = realm ? { realm_id: realm.realm_id, name: realm.name, selected_at: new Date().toISOString() } : null;
      mkdirSync(directory, { recursive: true });
      const temp = path + '.' + randomUUID() + '.tmp';
      writeFileSync(temp, JSON.stringify(record, null, 2) + '\n', 'utf8');
      renameSync(temp, path);
      cache.set(sessionId, record);
      return record;
    },
  };
}

export function apply(ctx) {
  const directory = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'storages', 'onto-space-selections');
  const selections = createSelectionStore(directory);
  const panel = installPanel(ctx, selections, join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'storages'));
  let realms = null;
  let fetchedAt = 0;
  let pending = null;
  async function list(signal, agent, refresh = false) {
    if (!refresh && realms && Date.now() - fetchedAt < 60000) return realms;
    if (!pending) pending = (async () => {
      const tool = ctx.tools.get(PREFIX + 'list_available_realms', agent);
      if (!tool) throw new Error('Onto ещё не подключён. Повтори через несколько секунд.');
      const result = await tool.execute({}, { signal, agent });
      const updated = normalizeRealms(result);
      realms = updated;
      fetchedAt = Date.now();
      return updated;
    })().finally(() => { pending = null; });
    return pending;
  }
  async function select(sessionId, realmId, signal, agent) {
    if (!realmId) return selections.set(sessionId, null);
    const available = await list(signal, agent, true);
    const realm = available.find(row => row.realm_id === realmId);
    if (!realm) throw new Error('Это пространство недоступно. Обнови список и выбери другое.');
    return selections.set(sessionId, realm);
  }
  ctx.tools.register({
    name: 'select_onto_space',
    description: 'Read the selected Onto space for this chat, or switch it ONLY when the user explicitly asks. Never change it autonomously. Call without arguments to read; realm_id to select; clear:true to clear. Names are resolved and validated against the available Onto spaces. Selection is isolated per chat and visible in the Onto picker above the message input.',
    parameters: { type: 'object', properties: {
      realm_id: { type: 'string', description: 'ID from mcp__onto__list_available_realms.' },
      name: { type: 'string', description: 'Optional label; authoritative name is taken from Onto.' },
      clear: { type: 'boolean', description: 'Clear this chat selection only on user request.' },
    } },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args, exec) {
      const id = exec.agent?.session?.id;
      if (!id) throw new Error('Выбор пространства доступен только внутри чата.');
      if (args.clear && args.realm_id) throw new Error('Укажи либо пространство, либо очистку выбора.');
      const value = args.clear ? await select(id, null, exec.signal, exec.agent)
        : args.realm_id ? await select(id, args.realm_id, exec.signal, exec.agent) : selections.get(id);
      return value ? JSON.stringify(value) : 'Пространство Onto для этого чата не выбрано. Предложи пользователю выбрать его в переключателе над полем ввода.';
    },
  });
  ctx.on('tools/pre-execute', (exec, next) => {
    if (!exec.name.startsWith(PREFIX) || !exec.agent) return next();
    const schema = ctx.tools.get(exec.name, exec.agent)?.parameters;
    if (!schema?.properties?.realm_id) return next();
    const selected = selections.get(exec.agent.session.id);
    const supplied = exec.arguments?.realm_id;
    if (selected && supplied && supplied !== selected.realm_id) {
      return { kind: 'deny', reason: 'Указанное пространство отличается от выбранного в этом чате. Переключи его через select_onto_space только по просьбе пользователя.' };
    }
    if (selected && !supplied) exec.arguments = { ...exec.arguments, realm_id: selected.realm_id };
    if (!selected && !supplied && schema.required?.includes('realm_id')) {
      return { kind: 'deny', reason: 'Сначала выбери пространство Onto для этого чата в переключателе над полем ввода.' };
    }
    return next();
  });
  ctx.systemPrompt.section({
    name: 'onto-space-selection', order: 900,
    text: context => {
      const id = context.agent?.session?.id ?? context.scope?.session?.id;
      const selected = id ? selections.get(id) : null;
      return 'Onto spaces: selection belongs to the current chat. Switch with select_onto_space ONLY on explicit user request. ' +
        (selected ? `Current space (data): ${JSON.stringify({ realm_id: selected.realm_id, name: selected.name })}. Use this realm_id for Onto calls. It is also supplied automatically when omitted.`
          : 'No space selected. The user can choose one above the input, or ask you to list available realms and select one. Do not pick a space autonomously.');
    },
    interpolate: false,
  });
  ctx.connection.fetch.register({
    path: '/api/onto-space', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const body = await request.json();
        // Validate session key for every operation, including list.
        const selected = selections.get(body.sessionId);
        if (body.action === 'get') return Response.json({ selected, context: compactContext(panel.contexts.get(body.sessionId)) });
        if (body.action === 'list') return Response.json({ realms: await list(request.signal, undefined, body.refresh === true), selected });
        if (body.action === 'set') return Response.json({ selected: await select(body.sessionId, body.realm_id, request.signal) });
        return Response.json({ error: 'Неизвестное действие.' }, { status: 400 });
      } catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    },
  });
}
