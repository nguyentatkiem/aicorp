'use strict';
/* AICORP server — Express + socket.io tại http://localhost:3939 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const multer = require('multer');
const { Server } = require('socket.io');
const { db, DIRS, uid, now, getSetting, setSetting, getCredentials, setCredentials, log } = require('./db');
const { seed, seedSettings, syncSkillsFromSeedDir } = require('./seed');
const { Orchestrator } = require('./orchestrator');
const { ICONS } = require('./artifacts');
const secondbrain = require('./secondbrain');
const noteContent = require('./demo/note-content');
const mcp = require('./mcp');
const AdmZip = require('adm-zip');

seed();
seedSettings();
syncSkillsFromSeedDir();

const app = express();
app.use(express.json({ limit: '5mb' }));

/* ---------- CỔNG ĐĂNG NHẬP ----------
   Chỉ bật khi đặt biến môi trường AICORP_PASSWORD (vd khi phơi ra ngoài qua Cloudflare Tunnel).
   Không đặt → chạy localhost như cũ, KHÔNG hỏi mật khẩu. So sánh hằng thời gian chống dò timing. */
const crypto = require('crypto');
const SITE_PASSWORD = process.env.AICORP_PASSWORD || '';
function passOk(header) {
  if (!SITE_PASSWORD) return true;
  if (!header || !/^Basic /i.test(header)) return false;
  let dec; try { dec = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const pass = dec.slice(dec.indexOf(':') + 1);          // bỏ phần username, lấy mật khẩu
  const a = Buffer.from(pass), b = Buffer.from(SITE_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
if (SITE_PASSWORD) {
  app.use((req, res, next) => {
    if (passOk(req.headers.authorization)) return next();
    res.set('WWW-Authenticate', 'Basic realm="AICORP", charset="UTF-8"');
    res.status(401).send('AICORP — cần đăng nhập');
  });
}
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = http.createServer(app);
const io = new Server(server);
if (SITE_PASSWORD) io.use((socket, next) => passOk(socket.request.headers.authorization) ? next() : next(new Error('unauthorized')));
const orch = new Orchestrator(io);

const upload = multer({ dest: DIRS.brain, limits: { fileSize: 30 * 1024 * 1024 } });

/* Chống CSRF cho các thao tác nguy hiểm (thoát tiến trình / ghi đè dữ liệu):
   chỉ chấp nhận request cùng nguồn (không có Origin lạ). App chạy localhost đơn người dùng. */
function sameOrigin(req, res, next) {
  const origin = req.get('Origin');
  if (origin) {
    try {
      const h = new URL(origin).host;
      if (h !== req.get('Host')) return res.status(403).json({ error: 'Từ chối: request khác nguồn' });
    } catch { return res.status(403).json({ error: 'Origin không hợp lệ' }); }
  }
  const sfs = req.get('Sec-Fetch-Site');
  if (sfs && !['same-origin', 'same-site', 'none'].includes(sfs)) return res.status(403).json({ error: 'Từ chối: cross-site' });
  next();
}

/* ---------------- STATE / ONBOARDING ---------------- */
app.get('/api/state', (req, res) => {
  const company = db.prepare('SELECT * FROM company WHERE id=1').get() || null;
  const dnaRow = db.prepare('SELECT * FROM dna WHERE id=1').get();
  const kind = getSetting('engine_kind', 'demo');
  const creds = getCredentials();
  const hasKey = !!(creds.anthropic_api_key || process.env.ANTHROPIC_API_KEY);
  const hasSubToken = !!(creds.claude_oauth_token || process.env.ANTHROPIC_AUTH_TOKEN);
  const pending = db.prepare("SELECT COUNT(*) c FROM approvals WHERE status='pending'").get().c;
  const running = db.prepare("SELECT COUNT(*) c FROM missions WHERE status IN ('briefing','planning','running','waiting_approval','reporting')").get().c;
  res.json({
    onboarded: !!(company && dnaRow),
    company, dna: dnaRow ? JSON.parse(dnaRow.json) : null,
    engine: { kind, hasKey, hasSubToken },
    pendingApprovals: pending, runningMissions: running,
    todayVnd: orch.todayVnd(), tranDay: getSetting('tran_per_day', 100000)
  });
});

app.post('/api/onboarding', (req, res) => {
  const { dna, engine } = req.body || {};
  if (!dna || !dna.company || !dna.company.name) return res.status(400).json({ error: 'Thiếu thông tin công ty' });
  db.prepare(`INSERT INTO company(id,name,industry,size,region,created_at) VALUES(1,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, industry=excluded.industry, size=excluded.size, region=excluded.region`)
    .run(dna.company.name, dna.company.industry, dna.company.size, dna.company.region, now());
  db.prepare(`INSERT INTO dna(id,json,updated_at) VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at`)
    .run(JSON.stringify(dna), now());
  const enabled = new Set(['bgd', ...(dna.departments_enabled || [])]);
  db.prepare('UPDATE departments SET enabled=0').run();
  enabled.forEach(d => db.prepare('UPDATE departments SET enabled=1 WHERE id=?').run(d));
  if (engine) {
    if (engine.kind) setSetting('engine_kind', engine.kind);
    if (engine.apiKey) setCredentials({ anthropic_api_key: engine.apiKey.trim() });
    if (engine.subToken) setCredentials({ claude_oauth_token: engine.subToken.trim() });
  }
  (dna.facts || []).forEach(f => db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,NULL,?)').run('fact', f, now()));
  try { require('./crm').seedCustomers(dna, 12); } catch (e) { log('seed customers: ' + e.message); }   // v4: khách hàng nền
  try { // Bộ não thứ 2: gieo note nền — chỉ TẠO note seed còn thiếu (theo source), KHÔNG đè note đã có
    const seen = new Set(db.prepare("SELECT source FROM notes WHERE source IS NOT NULL").all().map(r => r.source));
    noteContent.seedNotes(dna).forEach(n => { if (!seen.has(n.source)) secondbrain.createNote(n); });
  } catch (e) { log('seed notes: ' + e.message); }
  require('./db').setCompanyName(require('./db').ACTIVE_COMPANY, dna.company.name);                        // v4: tên công ty vào registry
  log('onboarding done: ' + dna.company.name);
  res.json({ ok: true });
});

/* ---------------- ORG / AGENTS ---------------- */
app.get('/api/org', (req, res) => {
  const depts = db.prepare('SELECT * FROM departments WHERE enabled=1 AND id!=? ORDER BY sort').all('bgd');
  const agents = db.prepare(`SELECT a.*, s.tasks_done, s.avg_score, s.rejected_rate FROM agents a
    JOIN departments d ON d.id=a.dept_id LEFT JOIN agent_stats s ON s.agent_id=a.id
    WHERE a.enabled=1 AND d.enabled=1`).all();
  res.json({
    depts,
    agents: agents.map(a => ({
      id: a.id, dept_id: a.dept_id, name: a.name, role: a.role_title, ava: a.avatar,
      is_manager: !!a.is_manager, level: a.model, tasks_done: a.tasks_done,
      avg_score: a.avg_score, rejected_rate: a.rejected_rate,
      skills: JSON.parse(a.skills_json || '[]')
    }))
  });
});

app.get('/api/agents', (req, res) => {
  const rows = db.prepare(`SELECT a.*, d.name dept_name, s.tasks_done, s.avg_score, s.rejected_rate, s.tokens_used
    FROM agents a JOIN departments d ON d.id=a.dept_id LEFT JOIN agent_stats s ON s.agent_id=a.id
    WHERE a.enabled=1 AND d.enabled=1 ORDER BY d.sort, a.is_manager DESC`).all();
  res.json(rows.map(a => ({
    id: a.id, name: a.name, ava: a.avatar, role: a.role_title, dept: a.dept_name, dept_id: a.dept_id,
    level: a.model, is_manager: !!a.is_manager, tasks_done: a.tasks_done || 0,
    avg_score: a.avg_score, rejected_rate: a.rejected_rate || 0,
    skills: JSON.parse(a.skills_json || '[]')
  })));
});

/* ---------------- CHAT / MISSIONS ---------------- */
app.post('/api/chat', async (req, res) => {
  const { text, mode } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'empty' });
  // Nếu có mission đang chờ CEO trả lời brief-back (COO đã hỏi) → coi là câu trả lời
  const waiting = db.prepare("SELECT * FROM missions WHERE status='briefing' AND plan_json IS NOT NULL ORDER BY created_at DESC LIMIT 1").get();
  if (waiting) {
    orch.answerBriefing(waiting.id, text.trim()).catch(e => log('answer err ' + e.message));
    return res.json({ ok: true, missionId: waiting.id, kind: 'answer' });
  }
  // COO đang phân tích/lập kế hoạch nhiệm vụ trước (chưa kịp hỏi) → không tạo mission chạy song song
  const busy = db.prepare("SELECT id FROM missions WHERE status IN ('briefing','planning') ORDER BY created_at DESC LIMIT 1").get();
  if (busy) {
    orch.chat('coo', 'Dạ sếp chờ em xíu — em đang xử lý nhiệm vụ trước đó, xong em nhận việc mới ngay ạ. Nếu là câu trả lời cho câu hỏi của em thì sếp gửi lại sau vài giây nhé.', busy.id);
    return res.json({ ok: true, kind: 'busy' });
  }
  const id = await orch.createMission(text.trim(), mode === 'go' ? 'go' : 'ask', req.body.budget_vnd || null);
  res.json({ ok: true, missionId: id, kind: 'mission' });
});

app.get('/api/missions', (req, res) => {
  res.json(db.prepare('SELECT * FROM missions ORDER BY created_at DESC LIMIT 30').all());
});
app.get('/api/missions/active', (req, res) => {
  const m = db.prepare(`SELECT * FROM missions WHERE status IN ('briefing','planning','running','waiting_approval','reporting','over_budget','paused')
    ORDER BY created_at DESC LIMIT 1`).get()
    || db.prepare('SELECT * FROM missions ORDER BY created_at DESC LIMIT 1').get() || null;
  if (!m) return res.json(null);
  const tasks = db.prepare('SELECT * FROM tasks WHERE mission_id=?').all(m.id);
  const reviews = db.prepare('SELECT COUNT(*) c FROM reviews WHERE task_id IN (SELECT id FROM tasks WHERE mission_id=?)').get(m.id).c;
  const rejected = db.prepare('SELECT COUNT(*) c FROM reviews WHERE pass=0 AND task_id IN (SELECT id FROM tasks WHERE mission_id=?)').get(m.id).c;
  res.json({ ...m, taskCount: tasks.length, doneCount: tasks.filter(t => t.status === 'done').length, reviewCount: reviews, rejectedCount: rejected });
});
app.post('/api/missions/:id/resume', (req, res) => res.json(orch.resumeMission(req.params.id, req.body.budget_vnd || null)));
app.post('/api/missions/:id/pause', (req, res) => res.json(orch.pauseMission(req.params.id)));

app.get('/api/tasks', (req, res) => {
  const mid = req.query.mission;
  const rows = mid
    ? db.prepare('SELECT * FROM tasks WHERE mission_id=? ORDER BY created_at').all(mid)
    : db.prepare('SELECT t.* FROM tasks t JOIN missions m ON m.id=t.mission_id ORDER BY t.created_at DESC LIMIT 40').all();
  res.json(rows.map(t => ({ ...t, brief: safeJson(t.brief), deps: safeJson(t.deps_json) })));
});

/* ---------------- ARTIFACTS ---------------- */
app.get('/api/artifacts', (req, res) => {
  const rows = db.prepare(`SELECT a.*, ag.name agent_name, ag.avatar agent_ava, d.name dept_name, d.color dept_color, m.title mission_title
    FROM artifacts a LEFT JOIN agents ag ON ag.id=a.agent_id LEFT JOIN tasks t ON t.id=a.task_id
    LEFT JOIN departments d ON d.id=t.dept_id LEFT JOIN missions m ON m.id=a.mission_id
    ORDER BY a.created_at DESC LIMIT 100`).all();
  res.json(rows.map(r => ({ ...r, icon: ICONS[r.type] || '📄' })));
});
app.get('/api/artifacts/:id/file', (req, res) => {
  const a = db.prepare('SELECT * FROM artifacts WHERE id=?').get(req.params.id);
  if (!a || !fs.existsSync(a.path)) return res.status(404).send('Không tìm thấy file');
  // chống path traversal: file phải nằm trong thư mục artifacts
  const real = fs.realpathSync(a.path);
  if (!real.startsWith(fs.realpathSync(DIRS.artifacts) + path.sep)) return res.status(403).send('Từ chối truy cập');
  if (a.type === 'html') {
    // CSP tầng HTTP + sandbox: kể cả nếu lọt thẻ lạ, script vẫn không chạy được
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('text/html; charset=utf-8');
    return res.send(fs.readFileSync(real, 'utf8'));
  }
  if (a.type === 'md') { res.type('text/plain; charset=utf-8'); return res.send(fs.readFileSync(real, 'utf8')); }
  res.download(real, a.name);
});

/* ---------------- APPROVALS ---------------- */
app.get('/api/approvals', (req, res) => {
  const st = req.query.status || 'pending';
  const rows = db.prepare(`SELECT ap.*, t.title task_title, t.score task_score, t.dept_id, m.title mission_title
    FROM approvals ap LEFT JOIN tasks t ON t.id=ap.task_id LEFT JOIN missions m ON m.id=ap.mission_id
    WHERE ap.status=? ORDER BY ap.created_at DESC`).all(st);
  res.json(rows.map(r => ({ ...r, options: safeJson(r.options_json), action: safeJson(r.action_json) })));
});
app.post('/api/approvals/:id/decide', async (req, res) => {
  const { decision, note, edited_text } = req.body || {};
  res.json(await orch.decideApproval(req.params.id, decision, note, edited_text));
});

/* ---------------- CHATS ---------------- */
app.get('/api/chats', (req, res) => {
  res.json(db.prepare('SELECT * FROM chats ORDER BY id DESC LIMIT 60').all().reverse());
});

/* ---------------- BRAIN ---------------- */
app.get('/api/brain', (req, res) => {
  const docs = db.prepare('SELECT * FROM brain_docs ORDER BY created_at DESC').all();
  const memories = db.prepare('SELECT * FROM memories ORDER BY id DESC LIMIT 20').all();
  const dnaRow = db.prepare('SELECT json FROM dna WHERE id=1').get();
  res.json({ docs, memories, dna: dnaRow ? JSON.parse(dnaRow.json) : null });
});

/* ---------------- BỘ NÃO THỨ 2 (Second Brain kiểu Obsidian) ---------------- */
app.get('/api/brain2', (req, res) => {
  res.json({
    notes: secondbrain.listNotes({ q: req.query.q, tag: req.query.tag, type: req.query.type }),
    stats: secondbrain.stats(), types: secondbrain.NOTE_TYPES
  });
});
app.get('/api/brain2/graph', (req, res) => res.json(secondbrain.graph()));
app.get('/api/brain2/suggest', (req, res) => res.json({ pairs: secondbrain.suggestConnections() }));
app.get('/api/brain2/notes/:slug', (req, res) => {
  const v = secondbrain.noteView(req.params.slug);
  if (!v) return res.status(404).json({ error: 'Không tìm thấy ghi chú' });
  res.json(v);
});
app.post('/api/brain2/notes', sameOrigin, (req, res) => {
  try {
    const n = secondbrain.createNote({ title: req.body.title, body: req.body.body, tags: req.body.tags, type: req.body.type, source: 'ceo' });
    orch.emit('brain2.new', { slug: n.slug });
    res.json({ ok: true, slug: n.slug });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/brain2/notes/:slug', sameOrigin, (req, res) => {
  try {
    const n = secondbrain.updateNote(req.params.slug, { title: req.body.title, body: req.body.body, tags: req.body.tags, type: req.body.type, pinned: req.body.pinned });
    res.json({ ok: true, slug: n.slug });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/brain2/notes/:slug', sameOrigin, (req, res) => {
  res.json({ ok: secondbrain.deleteNote(req.params.slug) });
});
app.post('/api/brain2/reindex', sameOrigin, (req, res) => {
  try { res.json({ ok: true, count: secondbrain.reindexFromDisk() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- MCP GATEWAY — KẾT NỐI DOANH NGHIỆP ---------------- */
app.get('/api/mcp', (req, res) => {
  res.json({ servers: mcp.listServers(), catalog: mcp.CATALOG, toolCount: mcp.toolCount(), actions: mcp.recentActions(20) });
});
app.post('/api/mcp/servers', sameOrigin, (req, res) => {
  try {
    const id = mcp.addServer({ name: req.body.name, transport: req.body.transport, command: req.body.command, args: req.body.args, url: req.body.url, env: req.body.env });
    // thử kết nối ngay (không chặn phản hồi lâu — trả id, client tự làm mới)
    mcp.connectServer(id).then(() => orch.emit('mcp.update', {})).catch(() => {});
    res.json({ ok: true, id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
const badId = (v, res) => { if (!mcp.validId(v)) { res.status(400).json({ error: 'id kết nối không hợp lệ' }); return true; } return false; };
app.post('/api/mcp/servers/:id/connect', sameOrigin, async (req, res) => {
  if (badId(req.params.id, res)) return;
  try { const r = await mcp.connectServer(req.params.id); orch.emit('mcp.update', {}); res.json(r); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mcp/servers/:id/toggle', sameOrigin, async (req, res) => {
  if (badId(req.params.id, res)) return;
  try { res.json(await mcp.toggleServer(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mcp/servers/:id/secrets', sameOrigin, (req, res) => {
  if (badId(req.params.id, res)) return;
  try { mcp.setSecrets(req.params.id, req.body.env || {}); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/mcp/servers/:id', sameOrigin, async (req, res) => {
  if (badId(req.params.id, res)) return;
  try { res.json({ ok: await mcp.removeServer(req.params.id) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mcp/assign', sameOrigin, (req, res) => {
  if (badId(req.body.serverId, res)) return;
  try { res.json({ ok: mcp.assign(req.body.serverId, req.body.tool, req.body.deptId, !!req.body.on) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/mcp/call', sameOrigin, async (req, res) => {
  if (badId(req.body.serverId, res)) return;
  try { res.json({ ok: true, result: await mcp.callTool(req.body.serverId, req.body.tool, req.body.args || {}) }); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
/* Làm sạch tên file người dùng tải lên — chống path traversal */
function safeFilename(name) {
  const clean = path.basename(String(name || ''))
    .replace(/[\/\\<>:"|?*]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return clean || 'tai-lieu-' + Date.now() + '.txt';
}

app.post('/api/brain/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  const orig = safeFilename(Buffer.from(req.file.originalname, 'latin1').toString('utf8'));
  const dest = path.join(DIRS.brain, orig);
  try { fs.renameSync(req.file.path, dest); } catch { fs.copyFileSync(req.file.path, dest); }
  const id = uid('doc');
  let chunks = 0;
  const ext = path.extname(orig).toLowerCase();
  if (['.txt', '.md', '.csv', '.json', '.html'].includes(ext)) {
    try {
      const text = fs.readFileSync(dest, 'utf8');
      const ins = db.prepare('INSERT INTO brain_chunks(doc_id,seq,text) VALUES(?,?,?)');
      for (let i = 0; i < text.length && chunks < 400; i += 680) { // chunk ~800 token
        ins.run(id, chunks++, text.slice(Math.max(0, i - 120), i + 680));
      }
    } catch {}
  }
  db.prepare('INSERT INTO brain_docs(id,name,path,status,chunks,created_at) VALUES(?,?,?,?,?,?)')
    .run(id, orig, dest, chunks > 0 ? 'ready' : 'stored', chunks, now());
  res.json({ ok: true, id, chunks });
});

/* ---------------- CONNECTIONS / SKILLS ---------------- */
app.get('/api/connections', (req, res) => {
  res.json(db.prepare('SELECT * FROM connections').all().map(c => ({ ...c, config: safeJson(c.config_json) })));
});
app.post('/api/connections/:id/toggle', (req, res) => {
  db.prepare('UPDATE connections SET enabled = 1-enabled WHERE id=?').run(req.params.id);
  res.json({ ok: true, enabled: db.prepare('SELECT enabled FROM connections WHERE id=?').get(req.params.id).enabled });
});
app.get('/api/skills', (req, res) => {
  res.json(db.prepare('SELECT * FROM skills').all().map(s => ({ ...s, assigned: safeJson(s.assigned_agents_json) })));
});
app.post('/api/skills/:id/toggle', (req, res) => {
  db.prepare('UPDATE skills SET enabled = 1-enabled WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- SETTINGS / ENGINE ---------------- */
app.get('/api/settings', (req, res) => {
  res.json({
    engine_kind: getSetting('engine_kind'), nguong_diem: getSetting('nguong_diem'),
    max_review_rounds: getSetting('max_review_rounds'), max_concurrent: getSetting('max_concurrent'),
    tran_per_mission: getSetting('tran_per_mission'), tran_per_day: getSetting('tran_per_day'),
    usd_vnd: getSetting('usd_vnd'), models: getSetting('models'), pricing: getSetting('pricing'),
    hasKey: !!(getCredentials().anthropic_api_key || process.env.ANTHROPIC_API_KEY),
    hasSubToken: !!(getCredentials().claude_oauth_token || process.env.ANTHROPIC_AUTH_TOKEN)
  });
});
app.post('/api/settings', (req, res) => {
  const allow = ['engine_kind', 'nguong_diem', 'max_review_rounds', 'max_concurrent', 'tran_per_mission', 'tran_per_day', 'usd_vnd', 'models', 'pricing'];
  for (const k of allow) if (req.body[k] !== undefined) setSetting(k, req.body[k]);
  if (req.body.apiKey) setCredentials({ anthropic_api_key: String(req.body.apiKey).trim() });
  if (req.body.subToken) setCredentials({ claude_oauth_token: String(req.body.subToken).trim() });
  res.json({ ok: true });
});
app.post('/api/engine/test', async (req, res) => {
  const Anthropic = require('@anthropic-ai/sdk');
  const models = getSetting('models');
  const mode = req.body.mode === 'sub' ? 'sub' : 'api';
  try {
    let client;
    if (mode === 'sub') {
      // Gói Sub: token OAuth từ `claude setup-token` (Bearer + header oauth beta)
      const token = (req.body.subToken || '').trim() || getCredentials().claude_oauth_token || process.env.ANTHROPIC_AUTH_TOKEN;
      if (!token) return res.json({ ok: false, message: 'Chưa có token gói Sub. Chạy `claude setup-token` rồi dán token vào.' });
      client = new Anthropic({ authToken: token, defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' } });
    } else {
      const key = (req.body.apiKey || '').trim() || getCredentials().anthropic_api_key || process.env.ANTHROPIC_API_KEY;
      if (!key) return res.json({ ok: false, message: 'Chưa nhập API key' });
      client = new Anthropic({ apiKey: key });
    }
    await client.messages.create({ model: models.nv, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] });
    res.json({ ok: true, message: mode === 'sub' ? '✅ Kết nối gói Sub Claude thành công!' : '✅ Kết nối Claude API thành công!' });
  } catch (e) {
    const raw = String((e && e.message) || '');
    const msg = mode === 'sub' && /401|oauth|auth/i.test(raw) ? 'Token gói Sub không đúng hoặc đã hết hạn — chạy lại `claude setup-token`'
      : /401|auth/i.test(raw) ? 'API key không đúng hoặc hết hạn'
      : /429|rate|limit/i.test(raw) ? (mode === 'sub' ? 'Gói Sub đang chạm giới hạn phiên — thử lại sau ít phút' : 'Chạm giới hạn tốc độ — thử lại sau')
      : /credit|billing/i.test(raw) ? 'Tài khoản hết hạn mức — nạp thêm tại console.anthropic.com'
      : /ENOTFOUND|fetch failed/i.test(raw) ? 'Không kết nối được mạng' : raw.slice(0, 140);
    res.json({ ok: false, message: '❌ ' + msg });
  }
});

/* ---------------- STATS (topbar) ---------------- */
app.get('/api/stats', (req, res) => {
  res.json({
    todayVnd: orch.todayVnd(), tranDay: getSetting('tran_per_day', 100000),
    runningMissions: db.prepare("SELECT COUNT(*) c FROM missions WHERE status IN ('briefing','planning','running','waiting_approval','reporting')").get().c,
    pendingApprovals: db.prepare("SELECT COUNT(*) c FROM approvals WHERE status='pending'").get().c
  });
});

/* ---------------- NHÂN SỰ: TUYỂN / SỬA / NHẮN RIÊNG (4.4, v1) ---------------- */
app.get('/api/agents/:id', (req, res) => {
  const a = db.prepare(`SELECT a.*, d.name dept_name, s.tasks_done, s.avg_score, s.rejected_rate, s.tokens_used
    FROM agents a JOIN departments d ON d.id=a.dept_id LEFT JOIN agent_stats s ON s.agent_id=a.id WHERE a.id=?`).get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Không có agent này' });
  const failFeedbacks = db.prepare(`SELECT r.feedback, r.score, r.at FROM reviews r JOIN tasks t ON t.id=r.task_id
    WHERE t.assignee_id=? AND r.pass=0 ORDER BY r.id DESC LIMIT 5`).all(req.params.id);
  const dms = db.prepare('SELECT * FROM dms WHERE agent_id=? ORDER BY id DESC LIMIT 20').all(req.params.id).reverse();
  res.json({
    ...a, skills: safeJson(a.skills_json) || [], tools: safeJson(a.tools_json) || [],
    failFeedbacks, dms
  });
});

app.post('/api/agents', (req, res) => {
  const { dept_id, name, avatar, role_title, role_block, level, skills } = req.body || {};
  const dept = db.prepare('SELECT * FROM departments WHERE id=? AND enabled=1').get(dept_id);
  if (!dept) return res.status(400).json({ error: 'Phòng ban không hợp lệ hoặc đang tắt' });
  if (!name || !name.trim() || !role_title || !role_title.trim()) return res.status(400).json({ error: 'Thiếu tên hoặc chức danh' });
  const lv = ['tp', 'nv'].includes(level) ? level : 'nv';
  const validSkills = (Array.isArray(skills) ? skills : []).filter(s => db.prepare('SELECT 1 FROM skills WHERE id=?').get(s));
  const id = 'cus_' + uid('').replace('_', '');
  // làm sạch ký tự < > để tên/chức danh không thành vector XSS ở bất kỳ chỗ render nào
  const clean = s => String(s || '').replace(/[<>]/g, '').trim();
  db.prepare(`INSERT INTO agents(id,dept_id,name,role_title,avatar,is_manager,system_prompt,model,skills_json,tools_json,enabled)
    VALUES(?,?,?,?,?,0,?,?,?,?,1)`)
    .run(id, dept_id, clean(name).slice(0, 40), clean(role_title).slice(0, 80),
      (avatar || '🧑‍💼').slice(0, 8),
      (role_block || `Bạn là ${name.trim()}, ${role_title.trim()} của phòng ${dept.name}. Làm đúng brief, kết quả chuyên nghiệp, giọng đúng DNA thương hiệu.`).slice(0, 2000),
      lv, JSON.stringify(validSkills), JSON.stringify([]));
  db.prepare('INSERT INTO agent_stats(agent_id,tasks_done,avg_score,rejected_rate,tokens_used,rejected_count) VALUES(?,0,NULL,0,0,0)').run(id);
  db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,NULL,?)')
    .run('fact', `Tuyển nhân viên AI mới: ${name.trim()} — ${role_title.trim()} (${dept.name})`, now());
  io.emit('org.update', { reason: 'hire', agentId: id });
  io.emit('toast', { title: '🎉 Nhân viên AI mới gia nhập', body: `${avatar || '🧑‍💼'} ${name.trim()} — ${role_title.trim()}`, cls: '' });
  setTimeout(() => { io.emit('packet.send', { fromId: 'coo', toId: id, color: 'gold' }); io.emit('agent.state', { agentId: id, state: 'think', logLine: 'Ngày đầu đi làm — đọc DNA công ty…' }); }, 1200);
  setTimeout(() => io.emit('agent.state', { agentId: id, state: 'idle' }), 4500);
  res.json({ ok: true, id });
});

app.patch('/api/agents/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM agents WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Không có agent này' });
  const b = req.body || {};
  if (b.model !== undefined && ['coo', 'tp', 'nv'].includes(b.model)) db.prepare('UPDATE agents SET model=? WHERE id=?').run(b.model, a.id);
  if (b.system_prompt !== undefined) db.prepare('UPDATE agents SET system_prompt=? WHERE id=?').run(String(b.system_prompt).slice(0, 4000), a.id);
  if (b.role_title !== undefined) db.prepare('UPDATE agents SET role_title=? WHERE id=?').run(String(b.role_title).slice(0, 80), a.id);
  if (Array.isArray(b.skills)) {
    const valid = b.skills.filter(s => db.prepare('SELECT 1 FROM skills WHERE id=?').get(s));
    db.prepare('UPDATE agents SET skills_json=? WHERE id=?').run(JSON.stringify(valid), a.id);
  }
  if (b.enabled !== undefined) {
    if (a.id === 'coo') return res.status(400).json({ error: 'Không thể tạm dừng AI COO' });
    db.prepare('UPDATE agents SET enabled=? WHERE id=?').run(b.enabled ? 1 : 0, a.id);
    io.emit('org.update', { reason: b.enabled ? 'resume' : 'pause', agentId: a.id });
  }
  res.json({ ok: true });
});

app.post('/api/agents/:id/dm', async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Tin nhắn trống' });
  res.json(await orch.dmAgent(req.params.id, text.trim()));
});

/* ---------------- CHI TIẾT TASK / MISSION ---------------- */
app.get('/api/tasks/:id/detail', (req, res) => {
  const t = db.prepare(`SELECT t.*, a.name assignee_name, a.avatar assignee_ava, r.name reviewer_name
    FROM tasks t LEFT JOIN agents a ON a.id=t.assignee_id LEFT JOIN agents r ON r.id=t.reviewer_id WHERE t.id=?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Không có task này' });
  const reviews = db.prepare('SELECT * FROM reviews WHERE task_id=? ORDER BY round').all(t.id)
    .map(r => ({ ...r, rubric: safeJson(r.rubric_json) }));
  const artifacts = db.prepare('SELECT id,name,type,version,score FROM artifacts WHERE task_id=? ORDER BY version').all(t.id)
    .map(a => ({ ...a, icon: ICONS[a.type] || '📄' }));
  res.json({ ...t, brief: safeJson(t.brief), deps: safeJson(t.deps_json), real_action: safeJson(t.real_action_json), reviews, artifacts, output: (t.output_ref || '').slice(0, 5000) });
});

app.get('/api/missions/:id/full', (req, res) => {
  const m = db.prepare('SELECT * FROM missions WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Không có nhiệm vụ này' });
  const tasks = db.prepare('SELECT * FROM tasks WHERE mission_id=? ORDER BY created_at').all(m.id);
  const arts = db.prepare('SELECT id,name,type,version,score FROM artifacts WHERE mission_id=?').all(m.id).map(a => ({ ...a, icon: ICONS[a.type] || '📄' }));
  res.json({ ...m, tasks: tasks.map(t => ({ ...t, brief: safeJson(t.brief) })), artifacts: arts });
});

/* ---------------- GỢI Ý NHIỆM VỤ THEO NGÀNH (B7) ---------------- */
app.get('/api/suggestions', (req, res) => {
  const { forIndustry } = require('./demo/suggestions');
  const c = db.prepare('SELECT industry FROM company WHERE id=1').get();
  res.json({ suggestions: forIndustry(c ? c.industry : 'khac') });
});

/* ---------------- LỊCH NHIỆM VỤ ĐỊNH KỲ (v1) ---------------- */
app.get('/api/crons', (req, res) => res.json(db.prepare('SELECT * FROM crons ORDER BY created_at').all()));
app.post('/api/crons', (req, res) => {
  const { title, command, mode, cadence, hhmm, dow } = req.body || {};
  if (!command || !command.trim()) return res.status(400).json({ error: 'Thiếu nội dung nhiệm vụ' });
  if (!/^\d{2}:\d{2}$/.test(hhmm || '')) return res.status(400).json({ error: 'Giờ chạy phải dạng HH:MM' });
  const id = uid('cr');
  db.prepare('INSERT INTO crons(id,title,command,mode,cadence,hhmm,dow,enabled,created_at) VALUES(?,?,?,?,?,?,?,1,?)')
    .run(id, (title || command).slice(0, 80), command.trim(), mode === 'ask' ? 'ask' : 'go',
      cadence === 'weekly' ? 'weekly' : 'daily', hhmm, Number.isInteger(dow) ? dow : 1, now());
  res.json({ ok: true, id });
});
app.post('/api/crons/:id/toggle', (req, res) => {
  db.prepare('UPDATE crons SET enabled=1-enabled WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
app.delete('/api/crons/:id', (req, res) => {
  db.prepare('DELETE FROM crons WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
app.post('/api/crons/check', (req, res) => res.json({ ok: true, fired: orch.runCronCheck(!!req.body.force) }));

/* ---------------- SAO LƯU / KHÔI PHỤC .aicorp (ch10) ---------------- */
app.get('/api/backup', (req, res) => {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const zip = new AdmZip();
    zip.addLocalFile(path.join(DIRS.data, 'aicorp.db'), 'data');
    for (const [dir, zdir] of [[DIRS.skills, 'workspace/skills'], [DIRS.brain, 'workspace/brain'], [DIRS.artifacts, 'workspace/artifacts']]) {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length) zip.addLocalFolder(dir, zdir);
    }
    // KHÔNG kèm secret/credentials (đặc tả ch10)
    const name = 'aicorp-backup-' + new Date().toISOString().slice(0, 10) + '.aicorp';
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(zip.toBuffer());
  } catch (e) { res.status(500).json({ error: 'Sao lưu lỗi: ' + e.message }); }
});

app.post('/api/backup/import', sameOrigin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file .aicorp' });
  try {
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries();
    // chỉ chấp nhận file thuộc data/ và workspace/ — chống zip-slip VÀ chống ghi đè secret/ hay file ngoài ~/AICORP
    for (const e of entries) {
      if (e.isDirectory) continue;
      const name = e.entryName.replace(/\\/g, '/');
      if (name.includes('..') || path.isAbsolute(name) || !/^(data\/|workspace\/)/.test(name))
        return res.status(400).json({ error: 'File sao lưu không hợp lệ (chứa đường dẫn ngoài data/ hoặc workspace/)' });
    }
    if (!entries.some(e => e.entryName === 'data/aicorp.db')) return res.status(400).json({ error: 'File không phải bản sao lưu AICORP (thiếu data/aicorp.db)' });
    res.json({ ok: true, restart: true, message: 'Đã nhận bản sao lưu. App sẽ tự thoát trong 2 giây — sếp chạy lại "npm start" để hoàn tất khôi phục.' });
    setTimeout(() => {
      try {
        // đọc TẤT CẢ dữ liệu entry vào bộ nhớ TRƯỚC (nếu zip lỗi thì phát hiện ở đây, chưa đụng DB cũ)
        const rootReal = fs.realpathSync(DIRS.root);
        const payload = [];
        for (const e of entries) {
          if (e.isDirectory) continue;
          const dest = path.join(DIRS.root, e.entryName);
          if (!path.resolve(dest).startsWith(rootReal + path.sep)) continue;
          payload.push({ dest, data: e.getData() });   // getData() có thể ném → nhảy vào catch, DB cũ nguyên vẹn
        }
        // sao lưu DB hiện tại trước khi ghi đè (cứu nếu cần)
        const cur = path.join(DIRS.data, 'aicorp.db');
        if (fs.existsSync(cur)) { try { fs.copyFileSync(cur, cur + '.pre-restore.bak'); } catch {} }
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        for (const suffix of ['-wal', '-shm']) {
          const f = path.join(DIRS.data, 'aicorp.db' + suffix);
          if (fs.existsSync(f)) fs.unlinkSync(f);
        }
        for (const { dest, data } of payload) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data); }
        log('backup imported, exiting for restart');
      } catch (e) { log('backup import fail: ' + e.message); }
      process.exit(0);
    }, 2000);
  } catch (e) { res.status(400).json({ error: 'Không đọc được file: ' + e.message }); }
});

/* ---------------- CÀI SKILL .zip (8.2) ---------------- */
app.post('/api/skills/install', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file .zip' });
  try {
    const zip = new AdmZip(req.file.path);
    const entries = zip.getEntries().filter(e => !e.isDirectory);
    for (const e of entries) {
      if (e.entryName.includes('..') || path.isAbsolute(e.entryName)) return res.status(400).json({ error: 'Zip chứa đường dẫn nguy hiểm' });
    }
    const skillEntry = entries.find(e => e.entryName === 'SKILL.md' || /^[^\/]+\/SKILL\.md$/.test(e.entryName));
    if (!skillEntry) return res.status(400).json({ error: 'Zip phải chứa SKILL.md (ở gốc hoặc trong 1 thư mục)' });
    const raw = skillEntry.getData().toString('utf8');
    const nameMatch = raw.match(/^---[\s\S]*?\bname:\s*([^\n]+)/);
    const slug = (nameMatch ? nameMatch[1].trim() : path.basename(req.file.originalname, '.zip'))
      .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    if (!slug) return res.status(400).json({ error: 'Không xác định được tên skill' });
    const descMatch = raw.match(/\bdescription:\s*([^\n]+)/);
    const prefix = skillEntry.entryName.includes('/') ? skillEntry.entryName.split('/')[0] + '/' : '';
    const dir = path.join(DIRS.skills, slug);
    fs.mkdirSync(dir, { recursive: true });
    for (const e of entries) {
      if (prefix && !e.entryName.startsWith(prefix)) continue;
      const rel = prefix ? e.entryName.slice(prefix.length) : e.entryName;
      if (!rel) continue;
      const dest = path.join(dir, rel);
      if (!path.resolve(dest).startsWith(path.resolve(dir) + path.sep) && path.resolve(dest) !== path.resolve(dir)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, e.getData());
    }
    db.prepare(`INSERT INTO skills(id,name,path,description,assigned_agents_json,enabled) VALUES(?,?,?,?,?,1)
      ON CONFLICT(id) DO UPDATE SET path=excluded.path, description=excluded.description`)
      .run(slug, slug, dir, (descMatch ? descMatch[1].trim() : '').slice(0, 200), JSON.stringify([]));
    res.json({ ok: true, slug });
  } catch (e) { res.status(400).json({ error: 'Không cài được skill: ' + e.message }); }
});

/* ---------------- CONNECTIONS: SỬA CẤU HÌNH (n8n URL…) ---------------- */
app.patch('/api/connections/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM connections WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Không có kết nối này' });
  const cfg = safeJson(c.config_json) || {};
  if (req.body.url !== undefined) {
    const u = String(req.body.url).trim();
    if (u && !/^https?:\/\//i.test(u)) return res.status(400).json({ error: 'URL phải bắt đầu bằng http:// hoặc https://' });
    cfg.url = u;
  }
  db.prepare('UPDATE connections SET config_json=? WHERE id=?').run(JSON.stringify(cfg), c.id);
  res.json({ ok: true });
});

/* ---------------- PHASE 3: BUỒNG LÁI KINH DOANH ---------------- */
const biz = require('./biz');
app.get('/api/cockpit', (req, res) => {
  const dnaRow = db.prepare('SELECT json FROM dna WHERE id=1').get();
  res.json(biz.cockpit(dnaRow ? JSON.parse(dnaRow.json) : null));
});

/* ---------------- PHASE 3: SÁNG KIẾN CHỦ ĐỘNG CỦA COO ---------------- */
app.get('/api/initiatives', (req, res) => {
  const st = req.query.status || 'pending';
  res.json(db.prepare('SELECT * FROM initiatives WHERE status=? ORDER BY created_at DESC LIMIT 30').all(st));
});
app.post('/api/initiatives/:id/decide', async (req, res) => {
  res.json(await orch.decideInitiative(req.params.id, !!req.body.accept));
});
app.post('/api/initiatives/check', async (req, res) => {
  res.json({ ok: true, count: await orch.runInitiativeCheck(true) });
});

/* ---------------- PHASE 3: CUỘC HỌP CHIẾN LƯỢC ---------------- */
app.get('/api/meetings/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM meetings WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Không có cuộc họp này' });
  res.json({ ...m, perspectives: safeJson(m.perspectives_json), synthesis: safeJson(m.synthesis_json) });
});
app.get('/api/meetings', (req, res) => {
  res.json(db.prepare('SELECT id, mission_id, topic, created_at FROM meetings ORDER BY created_at DESC LIMIT 20').all());
});

/* ---------------- V4: CRM SỐNG ---------------- */
const crm = require('./crm');
app.get('/api/crm', (req, res) => {
  const dnaRow = db.prepare('SELECT json FROM dna WHERE id=1').get();
  res.json(crm.view(dnaRow ? JSON.parse(dnaRow.json) : null));
});

/* ---------------- V4: VÒNG HỌC (PLAYBOOK) ---------------- */
const learning = require('./learning');
app.get('/api/playbooks', (req, res) => {
  const s = learning.stats();
  res.json({ ...s, review: learning.performanceReview() });
});

/* ---------------- V4: ĐA CÔNG TY ---------------- */
const dbmod = require('./db');
app.get('/api/companies', (req, res) => {
  const list = dbmod.listCompanies();
  // Công ty đang mở: lấy tên thật từ DB nếu registry chưa có (tương thích dữ liệu cũ)
  const co = db.prepare('SELECT name FROM company WHERE id=1').get();
  list.companies = list.companies.map(c =>
    (c.id === list.active && co && co.name) ? { ...c, name: co.name } : c);
  res.json(list);
});
app.post('/api/companies', sameOrigin, (req, res) => {
  const name = String((req.body || {}).name || '').replace(/[<>]/g, '').trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: 'Thiếu tên công ty' });
  const id = dbmod.addCompany(name);
  res.json({ ok: true, id, restart: true, message: `Đã tạo công ty "${name}". App sẽ tự thoát trong 2 giây — chạy lại "npm start" để vào khảo sát DNA cho công ty mới.` });
  setTimeout(() => { log('new company ' + id + ' — exiting for restart'); process.exit(0); }, 2000);
});
app.post('/api/companies/:id/switch', sameOrigin, (req, res) => {
  if (!dbmod.switchCompany(req.params.id)) return res.status(404).json({ error: 'Không có công ty này' });
  res.json({ ok: true, restart: true, message: 'Đã chuyển công ty. App sẽ tự thoát trong 2 giây — chạy lại "npm start" để vào công ty đã chọn.' });
  setTimeout(() => { log('switch company ' + req.params.id + ' — exiting'); process.exit(0); }, 2000);
});

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

io.on('connection', socket => {
  socket.emit('hello', { at: now() });
});

/* Tắt sạch: đóng mọi tiến trình con MCP khi thoát (tránh bỏ rơi zombie mỗi lần restart) */
let _shuttingDown = false;
async function shutdown() { if (_shuttingDown) return; _shuttingDown = true; try { await mcp.closeAll(); } catch {} process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const PORT = process.env.PORT || 3939;
/* Chỉ bind localhost — dữ liệu công ty không lộ ra mạng LAN (bảo mật) */
server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  🏢 AICORP đang chạy tại  http://localhost:${PORT}\n  📂 Dữ liệu: ${DIRS.root}\n`);
  log('server started');
  orch.resume();
  mcp.bootConnect();   // kết nối lại các MCP server đã bật (không chặn khởi động)
  if (process.platform === 'darwin' && !process.env.AICORP_NO_OPEN) {
    require('child_process').exec(`open http://localhost:${PORT}`);
  }
});
