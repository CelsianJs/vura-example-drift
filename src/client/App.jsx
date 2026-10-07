import { signal, computed, onMount, onCleanup } from 'what-framework';
import { fields } from '../lib/client-domain.js';

export default function App() {
  const items = signal([], 'drift.serverItems');
  const activity = signal([], 'drift.serverActivity');
  const status = signal('Connecting to durable storage…', 'drift.storageStatus');
  const error = signal('', 'drift.error');
  const busy = signal(false, 'drift.busy');
  const connected = signal(false, 'drift.session');
  const filter = signal('all', 'drift.filter');
  let csrfToken = '', stream;
  const visible = computed(() => items().filter(item => filter() === 'all' || item.status === filter()));
  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' && csrfToken ? { 'x-demo-csrf': csrfToken } : {}), ...options.headers } });
    const result = await response.json();
    if (!response.ok) { const failure = new Error(result.error?.message || 'Request failed.'); failure.status = response.status; throw failure; }
    return result;
  }
  async function snapshot() {
    const result = await request('/api/snapshot');
    items(result.items); activity(result.activity);
    status('PostgreSQL · server-authoritative · private workspace');
  }
  function connectEvents() {
    stream?.close();
    stream = new EventSource('/api/events');
    stream.addEventListener('snapshot', event => {
      const result = JSON.parse(event.data);
      items(result.items); activity(result.activity);
      status('PostgreSQL · live sync · private workspace');
    });
    stream.addEventListener('storage-error', () => { status('Live sync paused. Reconnecting…'); });
    stream.onerror = () => { status('Live sync reconnecting; writes still require server confirmation.'); };
  }
  async function loadSession() {
    busy(true); error('');
    try {
      const session = await request('/api/session'); csrfToken = session.csrfToken; connected(true);
      await snapshot(); connectEvents();
    } catch (failure) {
      connected(false);
      if (failure.status === 401) status('No workspace yet. Create your private seeded demo.');
      else { status('Storage unavailable · no browser-only fallback'); error(failure.message); }
    } finally { busy(false); }
  }
  async function createWorkspace() {
    busy(true); error('');
    try { const session = await request('/api/session', { method: 'POST' }); csrfToken = session.csrfToken; connected(true); await snapshot(); connectEvents(); }
    catch (failure) { error(failure.message); status('Workspace outcome unconfirmed. Refresh from server before retrying.'); }
    finally { busy(false); }
  }
  async function update(item, key, value) {
    if (busy() || value === item[key]) return;
    busy(true); error('');
    try { await request('/api/items/' + encodeURIComponent(item.id), { method: 'PATCH', body: JSON.stringify({ [key]: value, expectedVersion: item.version }) }); await snapshot(); }
    catch (failure) { error(failure.message); if (failure.status === 409) await snapshot().catch(() => {}); }
    finally { busy(false); }
  }
  async function endWorkspace() {
    busy(true); error('');
    try { await request('/api/session', { method: 'DELETE' }); stream?.close(); csrfToken = ''; connected(false); items([]); activity([]); status('Workspace deleted from the server.'); }
    catch (failure) { error(failure.message); }
    finally { busy(false); }
  }
  onMount(() => { void loadSession(); });
  onCleanup(() => { stream?.close(); });
  function Card({ item }) {
    return <article class="server-item planner-card" data-item-id={item.id}>
      <p class="row-kicker">{item.id} · revision {item.version}</p><h3>{item.title}</h3>
      <p>{item.summary || item.detail}</p>
      {Object.entries(fields).map(([key, choices]) => <label><span>{key}</span>
        <select aria-label={item.title + ' ' + key} value={item[key]} disabled={busy} onChange={event => update(item, key, event.target.value)}>
          {choices.map(choice => <option value={choice}>{choice}</option>)}
        </select>
      </label>)}
      <p class="row-kicker">Due {item.due}</p><div class="move-row">{fields.status.map(choice => <button class="button small" disabled={() => busy() || item.status === choice} onClick={() => update(item, 'status', choice)}>Move to {choice}</button>)}</div>
    </article>;
  }
  return <div class="site-shell">
    <link rel="stylesheet" href="/styles.css"/>
    <a class="skip-link" href="#content">Skip to content</a>
    <header class="masthead"><div><p class="eyebrow">Real backend / synthetic project planner</p><a class="brand" href="/">Drift</a></div>
      <nav class="nav" aria-label="Primary"><a href="#workspace">Workspace</a><a href="#activity">Activity</a><a href="/build">Build</a></nav>
    </header>
    <section class="ribbon" aria-label="Backend storage"><span role="status">{status}</span><span>Not connected to live infrastructure</span></section>
    <main id="content" class="content">
      <section class="hero"><p class="eyebrow">Make space for the next move</p>
        <h1>A calmer way to keep work moving.</h1>
        <p>Move cards across the board. The server owns each revision; a second tab of this workspace receives committed changes through SSE.</p>
        <p>This is a private, seeded demo workspace—not multi-user collaboration or an invitation system.</p>
      </section>
      <div class="backend-controls">
        <button class="button primary" disabled={() => busy() || connected()} onClick={createWorkspace}>Create private workspace</button>
        <button class="button" disabled={busy} onClick={loadSession}>Refresh from server</button>
        <button class="button" disabled={() => busy() || !connected()} onClick={endWorkspace}>Delete my workspace</button>
      </div>
      {() => error() ? <div class="backend-error" role="alert">{error()}</div> : <span/>}
      <section id="workspace" aria-label="Server workspace"><div class="section-head"><h2>Project board</h2><label>Filter status <select value={filter} onChange={event => filter(event.target.value)}><option value="all">All</option>{fields.status.map(choice => <option value={choice}>{choice}</option>)}</select></label></div>
        {() => connected() ? <div class="board-columns">{fields.status.map(column => <section><h3>{column}</h3><div class="server-items">{visible().filter(item => item.status === column).map(item => <Card key={item.id} item={item}/>)}</div></section>)}</div> : <p>No client-only seed data is shown. Connect durable storage and create a workspace.</p>}
      </section>
      <section id="activity"><h2>Server audit trail</h2>{() => <ol>{activity().map(event => <li key={event.sequence}><strong>{event.itemId}</strong> → {JSON.stringify(event.patch)} · revision {event.version} · {event.at}</li>)}</ol>}</section>
    </main>
    <footer class="footer"><p>What Framework signals + Celsian request lifecycle + Vura Dedicated APIs + external PostgreSQL. No localStorage persistence. No claim of restart durability until database proof passes.</p></footer>
  </div>;
}
