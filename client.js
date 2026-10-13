window.__ModuleLoader__.load({
  id: 'dsh-onto-space-panel',
  factory: require => {
    const React = require('react');
    const h = React.createElement;
    async function connectionApi(action, extra = {}, signal) {
      const response = await fetch('/api/onto-connection', { method: 'POST', credentials: 'same-origin', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
      if (response.status === 401) throw new Error('Соединение с Harness потеряно. Перезагрузи окно.');
      const value = await response.json();
      if (!response.ok || value.error) throw new Error(value.error || 'Не удалось настроить подключение.');
      return value;
    }
    const connectionStyles = `.onto-onboarding{position:fixed!important;top:50%;left:50%;bottom:auto!important;transform:translate(-50%,-50%);width:min(380px,calc(100vw - 40px))!important;max-height:85vh!important;padding:22px!important;box-shadow:0 0 0 100vmax #0008,0 16px 60px #0008!important;z-index:100!important}.onto-setup{font-size:13px;line-height:1.5}.onto-setup h3{margin:0 0 5px;font-size:16px;font-weight:500}.onto-setup p{color:var(--dsw-alias-label-tertiary);margin:0 0 16px}.onto-setup label{display:block;margin:12px 0 5px;font-size:12px}.onto-setup input{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1,#444);border-radius:8px;padding:9px 10px;background:transparent;color:inherit;font:inherit}.onto-setup input:focus-visible{outline:2px solid #6d9fff;outline-offset:2px}.onto-setup .onto-connect{display:block;width:100%;margin-top:16px;padding:10px;border:0;border-radius:8px;background:var(--dsw-alias-state-business-primary,#9cbcff);color:var(--dsw-alias-bg-base,#141416);font:inherit;cursor:pointer}.onto-setup button:disabled{opacity:.5;cursor:wait}.onto-setup small{display:block;margin-top:10px;color:var(--dsw-alias-label-tertiary);font-size:11px}.onto-setup-status{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:12px}.onto-setup-url{overflow-wrap:anywhere;margin-top:5px;color:var(--dsw-alias-label-tertiary)}.onto-popup{max-height:min(520px,65vh);overflow:auto}.onto-setup-link{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.onto-connection-toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}`;
    function ConnectionSetup({ onConnected, onBack }) {
      const [connection, setConnection] = React.useState(null);
      const [url, setUrl] = React.useState('');
      const [key, setKey] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const id = React.useId();
      const request = React.useRef(null);
      React.useEffect(() => {
        const abort = new AbortController(); request.current = abort;
        connectionApi('status', {}, abort.signal).then(value => {
          setConnection(value.connection); setUrl(value.connection.url); setError(value.connection.error || '');
        }).catch(e => { if (!abort.signal.aborted) setError(e.message); });
        return () => { abort.abort(); request.current = null; };
      }, []);
      async function submit(event) {
        event.preventDefault(); if (busy) return;
        setBusy(true); setError('');
        const abort = request.current;
        try {
          const data = await connectionApi('connect', { url, apiKey: key }, abort?.signal);
          if (!abort?.signal.aborted) { setKey(''); setConnection(data.connection); onConnected(data); }
        } catch (e) { if (!abort?.signal.aborted) setError(e.message); }
        finally { if (!abort?.signal.aborted) setBusy(false); }
      }
      return h('div', { className: 'onto-setup' }, h('style', null, connectionStyles),
        h('div', { className: 'onto-heading' }, h('h3', null, connection?.configured ? 'Подключение Onto' : 'Подключить Onto'),
          onBack ? h('button', { type: 'button', className: 'onto-setup-link', disabled: busy, onClick: onBack }, 'Назад') : null),
        !connection ? h('p', { role: 'status' }, error ? 'Проверка подключения не завершена.' : 'Проверяю подключение…') :
        connection.source === 'harness' ? h('div', { className: 'onto-setup-status' },
          h('strong', null, connection.connected ? 'Onto уже подключён' : 'Подключение настроено в Harness'),
          h('div', { className: 'onto-setup-url' }, connection.url),
          h('small', null, 'Панель использует это подключение. Адрес и ключ меняются в настройках Harness.')) :
        !connection.canConfigure ? h('p', null, 'Для настройки нужно доступное для записи хранилище ключей Harness.') :
        h('form', { onSubmit: submit },
          h('p', null, 'Укажи адрес MCP-сервера и свой ключ. После проверки выбери пространство для этого чата.'),
          h('label', { htmlFor: id + '-url' }, 'Адрес MCP-сервера'),
          h('input', { id: id + '-url', type: 'url', required: true, autoFocus: true, placeholder: 'https://example.org/mcp', autoComplete: 'off', value: url, disabled: busy, onChange: e => setUrl(e.target.value) }),
          h('label', { htmlFor: id + '-key' }, 'API-ключ'),
          h('input', { id: id + '-key', type: 'password', required: !connection.keyConfigured || url !== connection.url, placeholder: connection.keyConfigured && url === connection.url ? 'Сохранён · оставь пустым, чтобы использовать' : 'Ключ доступа к Onto', autoComplete: 'off', value: key, disabled: busy, onChange: e => setKey(e.target.value) }),
          h('button', { type: 'submit', className: 'onto-connect', disabled: busy }, busy ? 'Проверяю подключение…' : 'Подключить'),
          h('small', null, 'Ключ хранится локально в хранилище Harness и не передаётся модели. Подключение общее для профиля.')),
        error ? h('div', { className: 'onto-error', role: 'alert' }, error) : null);
    }
    async function api(sessionId, action, extra = {}, signal) {
      const response = await fetch('/api/onto-space', {
        method: 'POST', credentials: 'same-origin', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action, ...extra }),
      });
      if (response.status === 401) throw new Error('Соединение с Harness потеряно. Перезагрузи окно.');
      const value = await response.json();
      if (!response.ok || value.error) throw new Error(value.error || 'Не удалось связаться с Onto.');
      return value;
    }
    const styles = `.onto-picker{font-size:13px;line-height:1.5;font-family:inherit;color:var(--dsw-alias-label-primary);position:relative;margin:0 0 8px}.onto-picker button,.onto-picker input{font:inherit;color:inherit}.onto-trigger{display:flex;align-items:center;gap:8px;max-width:100%;padding:7px 12px;background:var(--dsw-alias-interactive-bg-hover,#252525);border:1px solid var(--dsw-alias-border-l1,#444);border-radius:9px;cursor:pointer}.onto-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.onto-brand{color:var(--dsw-alias-label-tertiary,#aaa)}.onto-popup{position:absolute;bottom:calc(100% + 6px);left:0;width:min(360px,calc(100vw - 60px));background:var(--dsw-alias-bg-base,#202020);border:1px solid var(--dsw-alias-border-l1,#444);border-radius:12px;box-shadow:0 12px 40px #0006;padding:12px;z-index:50}.onto-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px}.onto-heading button{border:0;background:transparent;cursor:pointer;padding:4px 8px;border-radius:6px}.onto-search{width:100%;box-sizing:border-box;background:transparent;border:1px solid var(--dsw-alias-border-l1,#444);border-radius:8px;padding:8px 10px;margin-bottom:8px;outline-offset:2px}.onto-list{max-height:240px;overflow:auto;display:flex;flex-direction:column;gap:3px}.onto-choice{display:flex;justify-content:space-between;gap:12px;text-align:left;width:100%;border:0;border-radius:7px;background:transparent;padding:9px 10px;cursor:pointer;overflow-wrap:anywhere}.onto-choice:hover,.onto-choice[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover,#333)}.onto-hint{padding:12px 4px;color:var(--dsw-alias-label-tertiary,#aaa)}.onto-error{padding:8px 0;color:var(--dsw-alias-state-error-primary,#ff8080)}.onto-footer{border-top:1px solid var(--dsw-alias-border-l1,#444);margin-top:8px;padding-top:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-tertiary,#aaa);font-size:12px}.onto-footer button{background:none;border:0;cursor:pointer}.onto-picker button:focus-visible,.onto-picker input:focus-visible{outline:2px solid #6d9fff;outline-offset:2px}.onto-picker button:disabled{opacity:.5;cursor:wait}`;
    function Picker({ ontoSessionId: sessionId, openPanel }) {
      const [selected, setSelected] = React.useState(null);
      const [context, setContext] = React.useState(null);
      const [connection, setConnection] = React.useState(null);
      const [setup, setSetup] = React.useState(false);
      const [removing, setRemoving] = React.useState(false);
      const [open, setOpen] = React.useState(false);
      const [realms, setRealms] = React.useState([]);
      const [query, setQuery] = React.useState('');
      const [loading, setLoading] = React.useState(false);
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState('');
      const root = React.useRef(null);
      const current = React.useRef(sessionId);
      current.current = sessionId;
      React.useEffect(() => {
        let alive = true;
        const controller = new AbortController();
        setSelected(null); setContext(null); setRemoving(false); setOpen(false); setQuery(''); setError(''); setRealms([]); setLoading(false); setSaving(false);
        const sync = async () => {
          try { const data = await api(sessionId, 'get', {}, controller.signal); if (alive) { setSelected(data.selected); setContext(data.context); setConnection(data.connection); } }
          catch (e) { if (alive && e.name !== 'AbortError') setError(e.message); }
        };
        sync();
        const timer = setInterval(sync, 2000);
        return () => { alive = false; clearInterval(timer); controller.abort(); };
      }, [sessionId]);
      React.useEffect(() => {
        if (!open) return;
        const click = event => { if (!root.current?.contains(event.target)) setOpen(false); };
        const key = event => {
          if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('.onto-trigger')?.focus(); }
          if (event.key === 'Tab') {
            const modal = root.current?.querySelector('.onto-onboarding');
            const fields = modal ? [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled)')] : [];
            if (!fields.length) return;
            const first = fields[0], last = fields[fields.length - 1];
            if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
          }
        };
        document.addEventListener('pointerdown', click); document.addEventListener('keydown', key);
        return () => { document.removeEventListener('pointerdown', click); document.removeEventListener('keydown', key); };
      }, [open]);
      async function load(refresh = false) {
        const id = sessionId;
        setLoading(true); setError('');
        try { const data = await api(id, 'list', { refresh }); if (current.current === id) { setRealms(data.realms); setSelected(data.selected); } }
        catch (e) { if (current.current === id) setError(e.message); }
        finally { if (current.current === id) setLoading(false); }
      }
      async function choose(realm_id) {
        const id = sessionId;
        setSaving(true); setError('');
        try { const data = await api(id, 'set', { realm_id }); if (current.current === id) { setSelected(data.selected); setContext(null); setOpen(false); } }
        catch (e) { if (current.current === id) setError(e.message); }
        finally { if (current.current === id) setSaving(false); }
      }
      const shown = realms.filter(row => row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      return h('div', { className: 'onto-picker', ref: root },
        h('style', null, styles + panelStyles + ".onto-picker{margin:0 var(--dsh-composer-side-clearance,20px) 4px;min-width:0}.onto-hub{display:inline-flex;align-items:center;max-width:100%;border:1px solid var(--dsw-alias-border-l1,#36363e);border-radius:10px;background:transparent}.onto-hub .onto-trigger{border:0;border-radius:9px 0 0 9px;background:transparent;padding:6px 10px;gap:8px;min-width:0}.onto-hub .onto-trigger:hover,.onto-open-panel:hover{background:var(--dsw-alias-interactive-bg-hover,#28282d)}.onto-name{max-width:240px}.onto-brand{font-size:12px;flex:none}.onto-chevron{color:var(--dsw-alias-label-tertiary);flex:none}.onto-hub .onto-open-panel{align-self:stretch;padding:6px 10px;background:transparent;border:0;border-left:1px solid var(--dsw-alias-border-l1,#36363e);border-radius:0 9px 9px 0;color:var(--dsw-alias-label-tertiary);font-size:12px;cursor:pointer;flex:none}.onto-picker .onto-space-context-chips{margin:7px 0 0;gap:5px}.onto-picker .onto-space-context-chip{padding:2px 6px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:12px}.onto-picker .onto-space-context-chip span{max-width:175px}.onto-picker .onto-space-context-chip+.onto-space-context-chip{border-left:1px solid var(--dsw-alias-border-l1);border-radius:0}.onto-picker .onto-space-context-chips:empty{display:none}@media(max-width:420px){.onto-name{max-width:170px}.onto-picker .onto-space-context-chip span{max-width:140px}}"),
        h('div', { className: 'onto-hub' },
          h('button', { type: 'button', className: 'onto-trigger', 'aria-expanded': open, 'aria-haspopup': 'dialog', 'aria-label': 'Выбрать пространство Onto: ' + (selected?.name || 'не выбрано'), onClick: () => { setOpen(!open); setSetup(false); if (!open && connection?.configured) load(); } },
            h('span', { className: 'onto-brand' }, 'Onto'), h('span', { className: 'onto-name' }, connection?.source === 'none' ? 'Подключить' : selected?.name || 'Выбрать пространство'), h('span', { className: 'onto-chevron', 'aria-hidden': true }, '▾')),
          h('button', { type: 'button', className: 'onto-open-panel', onClick: openPanel, 'aria-label': 'Открыть панель пространства Onto' }, 'Обзор')),
        h(ContextChips, {context,disabled:removing,onRemove:async item=>{setRemoving(true);try{const data=await panelApi(sessionId,'remove',{kind:item.kind,id:item.id,revision:context.revision,realm_id:selected?.realm_id});setContext(data.context);}catch(e){setError(e.message);}finally{setRemoving(false);}}}),
        !open && error ? h('div', { className: 'onto-error', role: 'status' }, error) : null,
        open ? h('div', { className: 'onto-popup' + (!connection || connection.source === 'none' || setup ? ' onto-onboarding' : ''), role: 'dialog', 'aria-modal': !connection || connection.source === 'none' || setup ? true : undefined, 'aria-label': 'Пространство Onto' },
          !connection || connection.source === 'none' || setup ? h(ConnectionSetup, { onBack: () => { if (connection?.configured) { setSetup(false); load(true); } else setOpen(false); },
            onConnected: data => { setConnection(data.connection); setRealms(data.realms); setSetup(false); setError(''); } }) : h(React.Fragment, null,
          h('div', { className: 'onto-heading' }, h('strong', null, 'Пространство Onto'), h('button', { type: 'button', disabled: loading || saving, onClick: () => load(true), 'aria-label': 'Обновить список пространств' }, 'Обновить')),
          h('input', { className: 'onto-search', placeholder: 'Найти пространство', 'aria-label': 'Найти пространство', value: query, autoFocus: true, onChange: event => setQuery(event.target.value) }),
          error ? h('div', { className: 'onto-error', role: 'alert' }, error, h('button', { type: 'button', onClick: () => load(true), disabled: loading }, 'Повторить')) : null,
          loading ? h('div', { className: 'onto-hint', role: 'status' }, 'Загружаю пространства…') : h('div', { className: 'onto-list', role: 'listbox', 'aria-label': 'Доступные пространства' },
            ...shown.map(row => h('button', { key: row.realm_id, type: 'button', className: 'onto-choice', role: 'option', 'aria-selected': selected?.realm_id === row.realm_id, disabled: saving, onClick: () => choose(row.realm_id) }, h('span', null, row.name), selected?.realm_id === row.realm_id ? h('span', { 'aria-hidden': true }, '✓') : null)),
            !shown.length && !error ? h('div', { className: 'onto-hint' }, realms.length ? 'Ничего не найдено' : 'Нет доступных пространств') : null),
          h('div', { className: 'onto-footer' }, h('span', null, saving ? 'Сохраняю…' : 'Выбор только для этого чата'), h('button', { type: 'button', disabled: saving, onClick: () => setSetup(true) }, 'Подключение'), selected ? h('button', { type: 'button', disabled: saving, onClick: () => choose(null) }, 'Сбросить') : null))) : null);
    }
    const panelStyles = `.onto-space-panel{color:var(--dsw-alias-label-primary);font:inherit;height:100%;overflow:auto;padding:18px;box-sizing:border-box;overflow-wrap:anywhere}.onto-space-panel *{box-sizing:border-box}.onto-space-panel button,.onto-space-panel input{font:inherit;color:inherit}.onto-space-panel button{cursor:pointer}.onto-space-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.onto-space-head h2{font-size:18px;line-height:1.4;font-weight:500;margin:0 0 5px}.onto-space-muted{font-size:12px;color:var(--dsw-alias-label-tertiary)}.onto-space-tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1);margin:18px 0}.onto-space-tab{background:transparent;border:0;border-bottom:2px solid transparent;padding:10px 6px}.onto-space-tab[aria-selected=true]{border-bottom-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}.onto-space-button{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:transparent;padding:7px 10px;display:inline-flex;gap:5px;align-items:center;font-size:12px!important}.onto-space-button:hover{background:var(--dsw-alias-interactive-bg-hover)}.onto-space-button:disabled{opacity:.5;cursor:wait}.onto-space-button.primary{background:var(--dsw-alias-state-business-primary);border-color:transparent;color:var(--dsw-alias-bg-base)}.onto-space-section{margin-bottom:20px}.onto-space-section h3{font-size:14px;font-weight:500;margin:0 0 10px}.onto-space-declaration{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:14px;margin-bottom:16px}.onto-space-declaration p{font-size:13px;margin:8px 0 12px}.onto-space-row{padding:13px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}.onto-space-row h4{margin:0 0 5px;font-weight:500;font-size:13px}.onto-space-row p{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:5px 0 8px}.onto-space-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.onto-space-error{color:var(--dsw-alias-state-error-primary);font-size:13px;margin:12px 0}.onto-space-empty{font-size:13px;color:var(--dsw-alias-label-tertiary);padding:14px 0}.onto-space-preview{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:14px;margin-bottom:18px}.onto-space-preview h3{font-size:14px;margin:0 0 8px;font-weight:500}.onto-space-preview pre{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.65;font-family:inherit;margin:12px 0 0;max-height:55vh;overflow:auto}.onto-space-field{width:100%;background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;min-width:0}.onto-space-search{display:flex;gap:7px;margin-bottom:12px}.onto-space-summary{border-top:1px solid var(--dsw-alias-border-l1);padding-top:14px;margin-top:20px}.onto-space-context-chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.onto-space-context-chip{background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px 7px;display:flex;align-items:center;gap:7px;font-size:12px}.onto-space-context-chip span{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.onto-space-context-chip button{background:transparent;border:0;font:inherit;padding:0 3px}.onto-space-pagination{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:15px;font-size:12px}.onto-space-block{background:var(--dsw-alias-interactive-bg-hover);border-radius:8px;padding:12px;margin-top:12px}.onto-space-block p{margin:0}.onto-space-label{display:inline-flex;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-left:8px}.onto-space-opening{background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:7px 10px;cursor:pointer}.onto-space-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.onto-space-panel button:focus-visible,.onto-space-panel input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.onto-space-doc-list{padding-left:20px;font-size:13px}.onto-space-doc-list li{margin:8px 0}`;

    function contextEntries(context) {
      if (!context) return [];
      return [context.declaration && { ...context.declaration, kind: 'declaration', name: 'Декларация' },
        context.agent && { id: context.agent.slug, name: context.agent.name, kind: 'agent' },
        ...(context.memories || []).map(item => ({ ...item, kind: 'memory' })),
        ...(context.objects || []).map(item => ({ ...item, kind: 'object' }))].filter(Boolean);
    }
    async function panelApi(sessionId, action, extra = {}, signal) {
      const response = await fetch('/api/onto-panel', { method: 'POST', credentials: 'same-origin', signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, action, ...extra }) });
      if (response.status === 401) throw new Error('Соединение с Harness потеряно. Перезагрузи окно.');
      const value = await response.json();
      if (!response.ok || value.error) throw new Error(value.error || 'Не удалось загрузить пространство.');
      return value;
    }
    function ContextChips({ context, onRemove, disabled }) {
      const entries = contextEntries(context);
      return h('div', { className: 'onto-space-context-chips', 'aria-live': 'polite' }, ...entries.map(item =>
        h('div', { key: item.kind + item.id, className: 'onto-space-context-chip' }, h('span', { title: item.name }, item.name),
          h('button', { type: 'button', disabled, 'aria-label': 'Отключить: ' + item.name, onClick: () => onRemove(item) }, '×'))));
    }
    function DocumentBody({ document }) {
      let body = document.body;
      try {
        const data = JSON.parse(body);
        if (typeof data.purpose === 'string') return h('div', null,
          h('p', null, data.purpose),
          Array.isArray(data.boundaries) ? h('div', null, h('h3', null, 'Границы работы'), h('ul', { className: 'onto-space-doc-list' }, ...data.boundaries.map((text, i) => h('li', { key: i }, text)))) : null,
          Array.isArray(data.routes) ? h('div', null, h('h3', null, 'Куда перейти'), ...data.routes.map((route, i) => h('div', { key: i, className: 'onto-space-row' }, h('div', null, route.need), h('p', null, route.authoritative_result)))) : null);
        body = JSON.stringify(data, null, 2);
      } catch { /* Markdown/plain text is shown safely, without interpreting HTML. */ }
      return h('pre', null, body);
    }
    function SpacePanel({ ontoSessionId: sessionId }) {
      const [setup, setSetup] = React.useState(false);
      const [state, setState] = React.useState({ selected: null, context: null });
      const [tab, setTab] = React.useState('overview');
      const [data, setData] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState('');
      const [query, setQuery] = React.useState('');
      const [first, setFirst] = React.useState(0);
      const [template, setTemplate] = React.useState(null);
      const [preview, setPreview] = React.useState(null);
      const [refresh, setRefresh] = React.useState(0);
      const currentSession = React.useRef(sessionId);
      const currentRealm = React.useRef(state.selected?.realm_id);
      currentSession.current = sessionId; currentRealm.current = state.selected?.realm_id;
      React.useEffect(() => {
        let alive = true;
        const abort = new AbortController();
        setState({ selected: null, context: null }); setData(null); setPreview(null); setQuery(''); setTemplate(null); setFirst(0); setError(''); setBusy(false);
        const sync = async () => {
          try { const value = await panelApi(sessionId, 'state', {}, abort.signal); if (alive) setState(old => JSON.stringify(old) === JSON.stringify(value) ? old : value); }
          catch (e) { if (alive && e.name !== 'AbortError') setError(e.message); }
        };
        sync(); const timer = setInterval(sync, 3000);
        return () => { alive = false; abort.abort(); clearInterval(timer); };
      }, [sessionId]);
      React.useEffect(() => { setPreview(null); setTemplate(null); setFirst(0); setQuery(''); }, [state.selected?.realm_id]);
      React.useEffect(() => {
        if (!state.selected) return;
        let alive = true;
        const abort = new AbortController();
        setLoading(true); setError(''); setData(null);
        const action = tab === 'objects' ? template ? 'objects' : 'templates' : tab;
        panelApi(sessionId, action, { realm_id: state.selected.realm_id, query, first, template_id: template?.id }, abort.signal)
          .then(value => { if (alive) setData(value); }).catch(e => { if (alive && e.name !== 'AbortError') setError(e.message); })
          .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; abort.abort(); };
      }, [sessionId, state.selected?.realm_id, tab, first, template?.id, refresh]);
      async function mutation(action, extra = {}) {
        if (!state.selected || !state.context) return;
        const id = sessionId, realm = state.selected.realm_id;
        setBusy(true); setError('');
        try {
          const value = await panelApi(id, action, { ...extra, realm_id: realm, revision: state.context.revision });
          if (currentSession.current === id && currentRealm.current === realm) setState(old => ({ ...old, context: value.context }));
        } catch (e) { if (currentSession.current === id && currentRealm.current === realm) setError(e.message); }
        finally { if (currentSession.current === id) setBusy(false); }
      }
      async function openDocument(action, extra) {
        const id = sessionId, realm = state.selected?.realm_id;
        setBusy(true); setError('');
        try { const value = await panelApi(id, action, { ...extra, realm_id: realm }); if (currentSession.current === id && currentRealm.current === realm) setPreview(value.document); }
        catch (e) { if (currentSession.current === id) setError(e.message); }
        finally { if (currentSession.current === id) setBusy(false); }
      }
      const button = (label, click, extra = {}) => h('button', { type: 'button', className: 'onto-space-button', disabled: busy, onClick: click, ...extra }, label);
      const itemInContext = id => state.context?.memories?.some(item => item.id === id);
      function agentRows(registry) {
        if (!registry || registry.governance_status !== 'valid') return h('div', { className: 'onto-space-empty' }, 'Агенты недоступны: в пространстве нет валидированного текущего реестра.', ...(registry?.issues || []).map((issue, i) => h('p', { key: i }, issue.message)));
        if (!registry.agents?.length) return h('div', { className: 'onto-space-empty' }, 'В реестре пока нет агентов.');
        return registry.agents.map(agent => h('div', { key: agent.slug, className: 'onto-space-row' },
          h('h4', null, agent.name || agent.slug, h('span', { className: 'onto-space-label' }, agent.boot_allowed ? 'Доступен' : 'Недоступен')),
          h('p', null, agent.role),
          h('div', { className: 'onto-space-actions' },
            button('Устав', () => openDocument('agent-preview', { slug: agent.slug })),
            button(state.context?.agent?.slug === agent.slug ? 'Выбран ✓' : 'Выбрать для чата', () => mutation('select-agent', { slug: agent.slug }), { disabled: busy || !agent.boot_allowed, 'aria-pressed': state.context?.agent?.slug === agent.slug }))));
      }
      function content() {
        if (loading) return h('div', { className: 'onto-space-empty', role: 'status' }, 'Загружаю…');
        if (!data) return null;
        if (tab === 'overview') {
          const declaration = data.declaration;
          let purpose = declaration?.body || '';
          try { purpose = JSON.parse(purpose).purpose || purpose; } catch {}
          return h('div', null,
            h('section', { className: 'onto-space-declaration' }, h('h3', null, 'Декларация пространства'),
              declaration ? h(React.Fragment, null, h('p', null, purpose.length > 350 ? purpose.slice(0,350) + '…' : purpose), h('div', { className: 'onto-space-actions' },
                button('Прочитать', () => setPreview({ id: declaration.artifact_id, path: declaration.artifact_path, name: 'Декларация пространства', body: declaration.body })),
                button(state.context?.declaration ? 'Подключена ✓' : 'В контекст', () => mutation('attach-declaration'), { disabled: busy || !!state.context?.declaration })))
                : h('div', { className: 'onto-space-empty' }, data.declarationError?.message || 'Декларация ещё не опубликована.')),
            h('section', { className: 'onto-space-section' }, h('h3', null, 'Агент для разговора'),
              data.registryError ? h('p', { className: 'onto-space-error' }, data.registryError.message) : data.registry?.governance_status === 'valid'
                ? h('div', null, h('p', { className: 'onto-space-muted' }, state.context?.agent ? 'Выбран: ' + state.context.agent.name : `${data.registry.agents?.length || 0} агентов пространства. Выбери подходящую роль для задачи.`), button('Открыть агентов', () => setTab('agents')))
                : agentRows(data.registry)),
            h('section', { className: 'onto-space-section' }, h('h3', null, 'Память'), h('p', { className: 'onto-space-muted' }, 'Открой артефакт перед подключением к разговору.'), button('Посмотреть память', () => setTab('memory'))));
        }
        if (tab === 'agents') return h('div', null, agentRows(data.registry), h('p', { className: 'onto-space-muted' }, 'Выбор подключает принятую конституцию и устав агента к текущему чату. Следующие сообщения выполняются в этой роли.'));
        if (tab === 'memory') return h('div', null,
          ...(data.items || []).map(item => h('div', { key: item.id, className: 'onto-space-row' }, h('h4', null, item.name), h('p', null, item.path),
            h('div', { className: 'onto-space-actions' }, button('Открыть', () => openDocument('preview', { id: item.id })),
              button(itemInContext(item.id) ? 'Подключено ✓' : 'В контекст', () => mutation('attach-memory', { id: item.id }), { disabled: busy || itemInContext(item.id) })))),
          !data.items?.length ? h('div', { className: 'onto-space-empty' }, 'Артефакты памяти не найдены.') : null,
          h('div', { className: 'onto-space-pagination' }, button('←', () => setFirst(Math.max(0, first - 25)), { disabled: busy || first === 0, 'aria-label': 'Предыдущие артефакты' }),
            h('span', null, data.total ? `${first + 1}–${Math.min(first + data.items.length, data.total)} из ${data.total}` : '0 артефактов'),
            button('→', () => setFirst(first + 25), { disabled: busy || first + 25 >= data.total, 'aria-label': 'Следующие артефакты' })));
        if (tab === 'objects') return h('div', null,
          template ? button('← Все шаблоны', () => { setTemplate(null); setFirst(0); }) : h('h3', null, 'Шаблоны пространства'),
          template ? h('p', null, template.name) : null,
          ...(data.items || []).map(item => h('div', { key: item.id, className: 'onto-space-row' }, h('h4', null, item.name),
            template ? h('div', { className: 'onto-space-actions' }, button('Открыть', () => openDocument('object-preview', { id: item.id, name: item.name })), button(state.context?.objects?.some(doc => doc.id === item.id) ? 'Подключён ✓' : 'В контекст', () => mutation('attach-object', { id: item.id, name: item.name }), { disabled: busy || state.context?.objects?.some(doc => doc.id === item.id) }))
              : button('Открыть объекты →', () => { setTemplate(item); setFirst(0); }))),
          !data.items?.length ? h('div', { className: 'onto-space-empty' }, 'Ничего не найдено.') : null,
          template ? h('div', { className: 'onto-space-pagination' }, button('←', () => setFirst(Math.max(0, first - 25)), { disabled: busy || first === 0 }), h('span', null, 'Страница ' + (first / 25 + 1)), button('→', () => setFirst(first + 25), { disabled: busy || data.items.length < 25 })) : null);
      }
      return h('div', { className: 'onto-space-panel' }, h('style', null, panelStyles),
        h('style', null, connectionStyles),
        h('div', { className: 'onto-connection-toolbar' }, button(setup ? '← Пространство' : 'Подключение Onto', () => setSetup(!setup))),
        setup ? h(ConnectionSetup, { onConnected: () => { setSetup(false); setRefresh(value => value + 1); } }) : h(React.Fragment, null,
        h('div', { className: 'onto-space-head' }, h('div', null, h('h2', null, state.selected?.name || 'Пространство Onto'), h('div', { className: 'onto-space-muted' }, 'Выбор и контекст только для этого чата')), button('Обновить', () => setRefresh(value => value + 1), { disabled: busy || loading })),
        !state.selected ? h('div', { className: 'onto-space-empty' }, 'Выбери пространство в переключателе Onto над полем ввода.') : h(React.Fragment, null,
          h('div', { className: 'onto-space-tabs', role: 'tablist', 'aria-label': 'Разделы пространства' }, ...[['overview', 'Обзор'], ['agents', 'Агенты'], ['memory', 'Память'], ['objects', 'Объекты']].map(([id, name]) =>
            h('button', { type: 'button', key: id, className: 'onto-space-tab', role: 'tab', id: `onto-${sessionId}-${id}`, 'aria-controls': `onto-${sessionId}-content`, 'aria-selected': tab === id, onClick: () => { setTab(id); setPreview(null); setFirst(0); setQuery(''); } }, name))),
          tab === 'memory' || tab === 'objects' ? h('form', { className: 'onto-space-search', onSubmit: event => { event.preventDefault(); setFirst(0); setRefresh(value => value + 1); } },
            h('input', { className: 'onto-space-field', 'aria-label': tab === 'memory' ? 'Поиск памяти' : 'Поиск объектов и шаблонов', placeholder: 'Поиск', value: query, onChange: event => setQuery(event.target.value) }), button('Найти', () => { setFirst(0); setRefresh(value => value + 1); })) : null,
          preview ? h('section', { className: 'onto-space-preview' }, h('div', { className: 'onto-space-head' }, h('h3', null, preview.name || preview.path), button('Закрыть', () => setPreview(null))),
            h('div', { className: 'onto-space-muted' }, preview.path), h(DocumentBody, { document: preview })) : null,
          h('div', { role: 'tabpanel', id: `onto-${sessionId}-content`, 'aria-labelledby': `onto-${sessionId}-${tab}` }, content()),
          h('section', { className: 'onto-space-summary' }, h('h3', null, 'Контекст этого чата'), h(ContextChips, { context: state.context, disabled: busy, onRemove: item => mutation('remove', { kind: item.kind, id: item.id }) }),
            contextEntries(state.context).length ? h('div', { className: 'onto-space-muted' }, 'Материалы подключены. Напиши задачу в чат.') : h('div', { className: 'onto-space-muted' }, 'Пока ничего не подключено.'))),
        busy ? h('div', { className: 'onto-space-muted', role: 'status' }, 'Читаю и подключаю материалы…') : null,
        error ? h('div', { className: 'onto-space-error', role: 'alert' }, error, button('Повторить', () => { setError(''); setRefresh(value => value + 1); })) : null));
    }
    function registerSpacePanel(ctx) {
      const id = 'dsh-onto-space-panel/panel';
      ctx.effect(() => ctx.sidebarRightTabs.register({ id, kind: 'onto-space', priority: 'extension', title: () => 'Пространство Onto' }));
      ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id, inject: sessionId => ({ ontoSessionId: sessionId }) }, SpacePanel));
    }

    return {
      inject: ['slots', 'sidebarRightTabs', 'sidebarRight'],
      apply(ctx) {
        registerSpacePanel(ctx);
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock', id: 'onto-space-picker', order: 5,
          inject: sessionId => ({ ontoSessionId: sessionId, openPanel: () => ctx.sidebarRight.openTab('onto-space') }),
        }, Picker));
      },
    };
  },
});
