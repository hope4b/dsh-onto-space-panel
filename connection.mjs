import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export function validateEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Укажи полный адрес MCP-сервера, например https://example.org/mcp.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Для подключения нужен HTTPS. HTTP доступен только для localhost.');
  if (url.username || url.password || url.search || url.hash || url.href.length > 2000) throw new Error('Адрес сервера не должен содержать логин, ключ, параметры или фрагмент.');
  return url.href;
}

export function connectionError(error) {
  // Never reflect server text, request headers or submitted credentials into the UI.
  const code = error?.code ?? error?.status ?? error?.statusCode;
  const message = String(error?.message || '');
  if (code === 'ONTO_AUTH_REJECTED') return 'Onto отклонил API-ключ. Проверь ключ и права доступа. Вставь только значение ключа, без названия заголовка.';
  if (code === 'ONTO_REALM_FORMAT') return 'Onto ответил, но формат списка пространств не распознан. Код: ONTO_REALM_FORMAT.';
  if ([401, 403].includes(code) || /\b(401|403)\b/.test(message)) return 'Сервер отклонил доступ. Проверь API-ключ и права в Onto.';
  if (code === 404 || /\b404\b/.test(message)) return 'MCP-сервер не найден. Проверь адрес: нужен MCP endpoint, а не главная страница Onto.';
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || /timeout|timed out/i.test(message)) return 'Сервер не ответил вовремя. Проверь адрес, сеть и VPN, затем повтори.';
  return 'Не удалось подключиться к Onto. Проверь адрес MCP-сервера, ключ и доступ к сети.';
}

export function normalizeApiKey(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const header = trimmed.match(/^X-Onto-Api-Key[ \t]*:[ \t]*(.*)$/i);
  return header ? header[1].trim() : trimmed;
}

export function readRealmResponse(result, normalizeRealms) {
  if (!result.isError) {
    try { return normalizeRealms(result); } catch { /* Some Onto errors are returned as successful MCP text. */ }
  }
  const text = [...(result.content ?? []).filter(block => block.type === 'text').map(block => block.text),
    typeof result.structuredContent?.result === 'string' ? result.structuredContent.result : ''].join('\n');
  if (/unauthorized|forbidden|invalid.*(?:api.?key|token)|(?:api.?key|token).*(?:invalid|missing|expired)|access denied/i.test(text)) {
    throw Object.assign(new Error('Onto rejected authentication'), { code: 'ONTO_AUTH_REJECTED' });
  }
  throw Object.assign(new Error('Onto realm response is unavailable'), { code: 'ONTO_REALM_FORMAT' });
}

export function createConnectionManager({ directory, profile, credentials, external, probe, mount, invalidate = () => {} }) {
  const profileId = createHash('sha256').update(profile).digest('hex').slice(0, 24);
  const filename = join(directory, profileId + '.json');
  const ref = 'ONTO_PANEL_' + profileId.toUpperCase();
  let saved = null, fiber = null, busy = false, failure = null;
  try {
    saved = JSON.parse(readFileSync(filename, 'utf8'));
    if (saved.version !== 1 || saved.credentialRef !== ref) throw new Error('invalid config');
    saved.url = validateEndpoint(saved.url);
  } catch (error) {
    if (error.code !== 'ENOENT') { saved = null; failure = 'Настройки подключения повреждены. Подключи Onto заново.'; }
  }
  function persist(config) {
    mkdirSync(directory, { recursive: true });
    const temp = filename + '.' + randomUUID() + '.tmp';
    try { writeFileSync(temp, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 }); renameSync(temp, filename); }
    finally { try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  }
  async function status() {
    const existing = external();
    const info = credentials ? await credentials.describe(ref) : { writable: false };
    return { source: existing && !fiber ? 'harness' : fiber || saved ? 'panel' : 'none',
      connected: !!existing?.connected || !!fiber, configured: !!saved || !!existing,
      url: existing && !fiber ? existing.url ?? '' : saved?.url ?? '', busy, error: failure,
      canConfigure: !!credentials && info.writable !== false && !(existing && !fiber),
      keyConfigured: !!info.configured };
  }
  async function restore() {
    if (!saved || external()) return;
    try {
      const secret = await credentials?.resolve(ref);
      if (!secret?.value) { failure = 'Сохранённый API-ключ недоступен. Введи ключ заново.'; return; }
      fiber = await mount(saved.url, secret.value); invalidate();
    } catch (error) { failure = connectionError(error); }
  }
  async function connect(body, signal) {
    if (busy) throw new Error('Подключение уже проверяется. Дождись результата.');
    const current = await status();
    if (!current.canConfigure) throw new Error(current.source === 'harness'
      ? 'Подключение Onto уже настроено в Harness. Его параметры меняются в настройках Harness.'
      : 'Хранилище ключей Harness недоступно или доступно только для чтения.');
    const url = validateEndpoint(body.url);
    const previousSecret = await credentials.resolve(ref);
    const key = normalizeApiKey(body.apiKey) || (saved?.url === url ? previousSecret?.value : '');
    if (typeof key !== 'string' || !key.trim() || key.length > 8192 || /[\r\n]/.test(key)) throw new Error('Введи API-ключ Onto.');
    if (busy) throw new Error('Подключение уже проверяется. Дождись результата.');
    busy = true;
    const previous = saved;
    let changedSecret = false, replaced = false;
    try {
      let realms;
      try { realms = await probe(url, key, signal); }
      catch (error) { throw new Error(connectionError(error)); }
      signal?.throwIfAborted();
      try {
        await credentials.set(ref, key); changedSecret = true;
        if (fiber) { await fiber.dispose(); fiber = null; }
        replaced = true;
        fiber = await mount(url, key);
        const config = { version: 1, url, credentialRef: ref,
          contextId: previous && previous.url === url && previousSecret?.value === key ? previous.contextId : randomUUID() };
        persist(config); saved = config; failure = null; invalidate();
      } catch {
        throw new Error('Проверка прошла, но Harness не смог сохранить или включить подключение. Предыдущие настройки восстановлены, если это возможно.');
      }
      return { connection: { ...(await status()), busy: false }, realms };
    } catch (error) {
      if (changedSecret) {
        try {
          if (fiber && replaced) { await fiber.dispose(); fiber = null; }
          if (previousSecret?.value) await credentials.set(ref, previousSecret.value);
          else await credentials.unset(ref);
          if (previous && replaced && previousSecret?.value) fiber = await mount(previous.url, previousSecret.value);
        } catch { failure = 'Не удалось восстановить подключение. Открой настройки и подключи Onto заново.'; }
      }
      throw error;
    } finally { busy = false; }
  }
  return { status, restore, connect, identity: () => saved && external() && !fiber ? 'external-connection' : saved?.contextId || '' };
}

export function installConnection(ctx, directory, normalizeRealms, invalidate) {
  const loader = ctx.get('loader');
  // The packaged Desktop host resolves bundled modules through its Include tree.
  // The root Loader itself resolves from the profile and may not see host packages.
  const importer = ctx.fiber.entry?.parent.tree ?? loader;
  const credentials = {
    describe: ref => ctx.get('credentials')?.describe(ref) ?? Promise.resolve({ configured: false, writable: false }),
    resolve: ref => ctx.get('credentials')?.resolve(ref) ?? Promise.resolve(undefined),
    set: (ref, value) => ctx.get('credentials').set(ref, value),
    unset: ref => ctx.get('credentials').unset(ref),
  };
  const profile = ctx.root.baseUrl;
  if (typeof profile !== 'string' || !profile) throw new Error('Harness не сообщил расположение профиля.');
  const external = () => {
    const connected = !!ctx.tools.get('mcp__onto__list_available_realms');
    const entry = [...(loader?.entries() ?? [])].find(entry =>
      !entry.options.disabled && entry.options.name === '@deepseek-ai/dsh-mcp-client' && entry.options.config?.serverName === 'onto');
    return connected || entry ? { connected, url: entry?.options.config?.url ?? '' } : null;
  };
  let managedFiber;
  const manager = createConnectionManager({ directory, profile, credentials,
    external: () => managedFiber ? null : external(), invalidate,
    async probe(url, key, signal) {
      const { Client, StreamableHTTPClientTransport } = await importer.import('@modelcontextprotocol/client');
      const client = new Client({ name: 'onto-space-panel-setup', version: '1.2.1' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
      const abort = AbortSignal.any([AbortSignal.timeout(20000), ...(signal ? [signal] : [])]);
      const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: {
        headers: { 'X-Onto-Api-Key': key }, redirect: 'error', signal: abort } });
      try {
        await client.connect(transport, { signal: abort });
        const result = await client.callTool({ name: 'list_available_realms', arguments: {} }, { signal: abort, timeout: 20000 });
        return readRealmResponse(result, normalizeRealms);
      } finally { await client.close().catch(() => {}); }
    },
    async mount(url, key) {
      const module = await importer.import('@deepseek-ai/dsh-mcp-client');
      const next = ctx.plugin(module, { serverName: 'onto', transport: 'streamable-http', url,
        headers: { 'X-Onto-Api-Key': key }, failOnStartupError: true });
      try { await next.await(); }
      catch (error) { await next.dispose(); throw error; }
      managedFiber = next;
      return { async dispose() { await next.dispose(); if (managedFiber === next) managedFiber = null; } };
    },
  });
  ctx.connection.fetch.register({ path: '/api/onto-connection', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const body = await request.json();
        if (body.action === 'status') return Response.json({ connection: await manager.status() }, { headers: { 'Cache-Control': 'no-store' } });
        if (body.action === 'connect') return Response.json(await manager.connect(body, request.signal), { headers: { 'Cache-Control': 'no-store' } });
        return Response.json({ error: 'Неизвестное действие.' }, { status: 400 });
      } catch (error) { return Response.json({ error: error.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
    } });
  return manager;
}
