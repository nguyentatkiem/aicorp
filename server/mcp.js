'use strict';
/* ============================================================================
   MCP GATEWAY — Trạm kết nối doanh nghiệp.
   AICORP làm CLIENT của mọi MCP server (stdio hoặc SSE/HTTP) qua @modelcontextprotocol/sdk.
   - Đăng ký nhiều server, tự khám phá tool, gán "túi công cụ" theo phòng ban.
   - Bí mật (token/khoá) cất ở ~/AICORP/secret/mcp/<id>.json (quyền 600) — KHÔNG vào DB/API/backup.
   SDK là ESM → nạp bằng dynamic import trong module CommonJS này.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { db, DIRS, uid, now, log } = require('./db');

const MCP_SECRET_DIR = path.join(DIRS.secret, 'mcp');
fs.mkdirSync(MCP_SECRET_DIR, { recursive: true });

db.exec(`
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY, name TEXT, transport TEXT DEFAULT 'stdio',
  command TEXT, args_json TEXT DEFAULT '[]', url TEXT,
  enabled INTEGER DEFAULT 1, status TEXT DEFAULT 'idle', error TEXT,
  tools_json TEXT DEFAULT '[]', created_at TEXT, last_connected_at TEXT);
CREATE TABLE IF NOT EXISTS mcp_assign (
  server_id TEXT, tool_name TEXT, dept_id TEXT,
  PRIMARY KEY(server_id, tool_name, dept_id));
`);

/* ---------- nạp SDK ESM (cache) ---------- */
let _sdk = null;
async function sdk() {
  if (_sdk) return _sdk;
  const client = await import('@modelcontextprotocol/sdk/client/index.js');
  const stdio = await import('@modelcontextprotocol/sdk/client/stdio.js');
  let SSE = null, HTTP = null;
  try { SSE = (await import('@modelcontextprotocol/sdk/client/sse.js')).SSEClientTransport; } catch {}
  try { HTTP = (await import('@modelcontextprotocol/sdk/client/streamableHttp.js')).StreamableHTTPClientTransport; } catch {}
  _sdk = { Client: client.Client, Stdio: stdio.StdioClientTransport, SSE, HTTP };
  return _sdk;
}

/* ---------- bí mật (vault) ---------- */
/* CHỐT CHẶN path traversal: id chỉ được là token an toàn (uid sinh ra hợp lệ).
   Không có ký tự này thì `..%2Fcredentials` không thể thoát ra ghi/xoá file ngoài vault. */
function validId(id) { return /^[A-Za-z0-9_-]{1,64}$/.test(String(id || '')); }
function secretPath(id) {
  if (!validId(id)) throw new Error('id kết nối không hợp lệ');
  return path.join(MCP_SECRET_DIR, id + '.json');
}
function getSecrets(id) { try { return JSON.parse(fs.readFileSync(secretPath(id), 'utf8')); } catch { return {}; } }
function setSecrets(id, env) {
  const cur = getSecrets(id);
  fs.writeFileSync(secretPath(id), JSON.stringify({ ...cur, ...env }, null, 2), { mode: 0o600 });
}
function delSecrets(id) { try { fs.rmSync(secretPath(id), { force: true }); } catch {} }

/* ---------- tiện ích ---------- */
function withTimeout(p, ms, label) {
  let to;
  const timeout = new Promise((_, rej) => { to = setTimeout(() => rej(new Error((label || 'Thao tác') + ' quá thời gian (' + ms + 'ms)')), ms); });
  return Promise.race([p.finally(() => clearTimeout(to)), timeout]);
}
const live = new Map();           // id -> { client, transport }
const row = id => db.prepare('SELECT * FROM mcp_servers WHERE id=?').get(id);

async function makeTransport(r) {
  const S = await sdk();
  const secrets = getSecrets(r.id);
  if (r.transport === 'sse' || r.transport === 'http') {
    if (!r.url) throw new Error('Thiếu URL cho kết nối SSE/HTTP');
    const url = new URL(r.url);
    const opts = {};
    if (secrets.__authHeader) opts.requestInit = { headers: { Authorization: secrets.__authHeader } };
    const T = r.transport === 'http' ? S.HTTP : S.SSE;
    if (!T) throw new Error('SDK không hỗ trợ transport ' + r.transport);
    return new T(url, opts);
  }
  if (!r.command) throw new Error('Thiếu lệnh (command) cho kết nối stdio');
  // thay ${VAR} bằng bí mật từ vault → cho phép giấu mật khẩu (vd chuỗi kết nối CSDL) khỏi DB
  const subst = str => String(str).replace(/\$\{(\w+)\}/g, (m, k) => secrets[k] != null ? String(secrets[k]) : m);
  const args = JSON.parse(r.args_json || '[]').map(a => subst(String(a).replace('~', process.env.HOME || '')));
  // CHỈ truyền env an toàn cho tiến trình con (KHÔNG rót toàn bộ process.env → tránh lộ AICORP_PASSWORD/ANTHROPIC_* cho gói MCP bên thứ 3)
  const SAFE_ENV = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TEMP', 'TMP', 'TERM', 'NODE_PATH', 'NVM_DIR', 'npm_config_registry', 'SystemRoot', 'APPDATA', 'ProgramFiles', 'ProgramData'];
  const env = {};
  for (const k of SAFE_ENV) if (process.env[k] != null) env[k] = process.env[k];
  Object.assign(env, secrets);   // bí mật riêng của server này
  return new S.Stdio({ command: r.command, args, env });
}

/* ---------- vòng đời kết nối ---------- */
async function disconnect(id) {
  const c = live.get(id);
  if (c) { try { await c.client.close(); } catch {} live.delete(id); }
}

const connecting = new Map();   // id -> promise (chống connect trùng gây spawn 2 tiến trình)
function connectServer(id) {
  if (connecting.has(id)) return connecting.get(id);
  const p = _connectServer(id).finally(() => connecting.delete(id));
  connecting.set(id, p);
  return p;
}
async function _connectServer(id) {
  const r = row(id);
  if (!r) throw new Error('Không tìm thấy kết nối');
  await disconnect(id);
  const S = await sdk();
  let transport = null, client = null;
  try {
    transport = await makeTransport(r);
    client = new S.Client({ name: 'aicorp', version: '1.0.0' }, { capabilities: {} });
    await withTimeout(client.connect(transport), 30000, 'Kết nối MCP');
    const list = await withTimeout(client.listTools(), 15000, 'Lấy danh sách công cụ');
    const tools = (list.tools || []).map(t => ({ name: t.name, description: t.description || '', inputSchema: t.inputSchema || {} }));
    // server bị xoá/tắt trong lúc đang nối? → huỷ, không để tiến trình mồ côi
    const cur = row(id);
    if (!cur || !cur.enabled) { try { await client.close(); } catch {} throw new Error('Kết nối đã bị huỷ hoặc tắt khi đang nối'); }
    // child tự chết sau này → dọn entry stale + trả trạng thái thật (chống 'connected' giả)
    client.onclose = () => {
      if (live.get(id) && live.get(id).client === client) {
        live.delete(id);
        try { db.prepare("UPDATE mcp_servers SET status='idle' WHERE id=? AND status='connected'").run(id); } catch {}
      }
    };
    live.set(id, { client, transport });
    db.prepare('UPDATE mcp_servers SET status=?, error=NULL, tools_json=?, last_connected_at=? WHERE id=?')
      .run('connected', JSON.stringify(tools), now(), id);
    log(`mcp connected: ${r.name} (${tools.length} tools)`);
    return { ok: true, tools };
  } catch (e) {
    // dọn tiến trình con/kết nối treo khi connect thất bại hoặc timeout (chống zombie)
    try { if (client) await client.close(); } catch {}
    try { if (transport && transport.close) await transport.close(); } catch {}
    const msg = String((e && e.message) || e).slice(0, 400);
    db.prepare('UPDATE mcp_servers SET status=?, error=? WHERE id=?').run('error', msg, id);
    log(`mcp connect fail ${r.name}: ${msg}`);
    return { ok: false, error: msg };
  }
}

async function callTool(id, toolName, args) {
  let c = live.get(id);
  if (!c) { const rr = await connectServer(id); if (!rr.ok) throw new Error(rr.error); c = live.get(id); }
  const res = await withTimeout(c.client.callTool({ name: toolName, arguments: args || {} }), 90000, 'Gọi công cụ');
  // rút gọn nội dung text để hiển thị/ghi log
  const text = (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { isError: !!res.isError, text, raw: res.content || [] };
}

/* ---------- registry (KHÔNG lộ bí mật) ---------- */
function listServers() {
  return db.prepare('SELECT * FROM mcp_servers ORDER BY created_at').all().map(r => ({
    id: r.id, name: r.name, transport: r.transport, command: r.command,
    args: JSON.parse(r.args_json || '[]'), url: r.url, enabled: !!r.enabled,
    status: live.has(r.id) ? 'connected' : r.status, error: r.error,
    tools: JSON.parse(r.tools_json || '[]'),
    hasSecrets: fs.existsSync(secretPath(r.id)),
    assignments: db.prepare('SELECT tool_name, dept_id FROM mcp_assign WHERE server_id=?').all(r.id),
    last_connected_at: r.last_connected_at
  }));
}

function addServer({ name, transport, command, args, url, env }) {
  const id = uid('mcp');
  transport = ['stdio', 'sse', 'http'].includes(transport) ? transport : 'stdio';
  db.prepare(`INSERT INTO mcp_servers(id,name,transport,command,args_json,url,enabled,status,created_at)
    VALUES(?,?,?,?,?,?,1,'idle',?)`)
    .run(id, String(name || 'MCP').slice(0, 80), transport, command || null,
      JSON.stringify(Array.isArray(args) ? args.map(String) : []), url || null, now());
  if (env && Object.keys(env).length) setSecrets(id, env);
  return id;
}

async function removeServer(id) {
  await disconnect(id);
  db.prepare('DELETE FROM mcp_servers WHERE id=?').run(id);
  db.prepare('DELETE FROM mcp_assign WHERE server_id=?').run(id);
  delSecrets(id);
  return true;
}

async function toggleServer(id) {
  const r = row(id); if (!r) return { enabled: false };
  const en = r.enabled ? 0 : 1;
  db.prepare('UPDATE mcp_servers SET enabled=? WHERE id=?').run(en, id);
  if (!en) { await disconnect(id); db.prepare("UPDATE mcp_servers SET status='idle' WHERE id=?").run(id); }
  return { enabled: !!en };
}

/* ---------- gán tool ↔ phòng ban ---------- */
function assign(serverId, toolName, deptId, on) {
  if (on) db.prepare('INSERT OR IGNORE INTO mcp_assign(server_id,tool_name,dept_id) VALUES(?,?,?)').run(serverId, toolName, deptId);
  else db.prepare('DELETE FROM mcp_assign WHERE server_id=? AND tool_name=? AND dept_id=?').run(serverId, toolName, deptId);
  return true;
}
/* Túi công cụ của 1 phòng (để agent dùng ở Pha B) */
function toolbeltFor(deptId) {
  const rows = db.prepare('SELECT server_id, tool_name FROM mcp_assign WHERE dept_id=?').all(deptId);
  const out = [];
  for (const a of rows) {
    const r = row(a.server_id); if (!r || !r.enabled) continue;
    const t = JSON.parse(r.tools_json || '[]').find(x => x.name === a.tool_name);
    if (t) out.push({ serverId: r.id, serverName: r.name, name: t.name, description: t.description });
  }
  return out;
}

/* ---------- catalog gợi ý (điền sẵn cấu hình) ---------- */
const CATALOG = [
  { key: 'filesystem', name: 'Tệp cục bộ (Filesystem)', dept: 'vh', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '~/AICORP/workspace'], env: {}, secret: false, note: 'Đọc/ghi tệp trong thư mục cho phép. Không cần khoá.' },
  { key: 'memory', name: 'Bộ nhớ tri thức (Memory)', dept: 'data', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], env: {}, secret: false, note: 'Đồ thị tri thức tạm của MCP. Không cần khoá.' },
  { key: 'everything', name: 'Everything (server thử nghiệm)', dept: 'data', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-everything'], env: {}, secret: false, note: 'Server mẫu để kiểm tra Gateway. Không cần khoá.' },
  { key: 'sequential', name: 'Suy luận tuần tự', dept: 'data', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], env: {}, secret: false, note: 'Hỗ trợ agent suy luận nhiều bước.' },
  { key: 'github', name: 'GitHub', dept: 'data', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' }, secret: true, note: 'Cần Personal Access Token GitHub.' },
  { key: 'slack', name: 'Slack', dept: 'vh', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' }, secret: true, note: 'Cần Bot Token + Team ID.' },
  { key: 'postgres', name: 'PostgreSQL (chỉ đọc)', dept: 'data', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', '${DATABASE_URL}'], env: { DATABASE_URL: '' }, secret: true, note: 'Dán chuỗi kết nối (có mật khẩu) vào ô khoá DATABASE_URL — lưu vault, không vào DB. Tham số dùng ${DATABASE_URL}.' },
  { key: 'n8n', name: 'n8n (400+ app) qua MCP', dept: 'vh', transport: 'sse', url: 'http://localhost:5678/mcp/aicorp/sse', env: { __authHeader: '' }, secret: true, note: 'Cầu nối tới Zalo/Shopee/TikTok Shop… qua n8n. Dán URL MCP Trigger của n8n + header xác thực nếu có.' }
];

function count() { return db.prepare("SELECT COUNT(*) c FROM mcp_servers WHERE enabled=1").get().c; }
function toolCount() { return listServers().filter(s => s.status === 'connected').reduce((n, s) => n + s.tools.length, 0); }

/* kết nối các server đã bật lúc khởi động (không chặn boot) */
function bootConnect() {
  // trạng thái 'connected' cũ trong DB không còn đúng sau restart → đưa về 'idle' trước
  try { db.prepare("UPDATE mcp_servers SET status='idle' WHERE enabled=1 AND status='connected'").run(); } catch {}
  for (const r of db.prepare('SELECT id FROM mcp_servers WHERE enabled=1').all())
    connectServer(r.id).catch(e => log('mcp boot ' + r.id + ': ' + e.message));
}
async function closeAll() { for (const id of [...live.keys()]) await disconnect(id); }

module.exports = {
  listServers, addServer, removeServer, toggleServer, connectServer, disconnect,
  callTool, assign, toolbeltFor, setSecrets, CATALOG, count, toolCount, bootConnect, closeAll, validId
};
