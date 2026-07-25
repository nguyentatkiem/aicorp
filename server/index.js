'use strict';
/* AICORP server — Express + socket.io tại http://localhost:3939 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const multer = require('multer');
const { Server } = require('socket.io');
const { db, DIRS, uid, now, getSetting, setSetting, getCredentials, setCredentials, log } = require('./db');
const { seed, seedSettings } = require('./seed');
const { Orchestrator } = require('./orchestrator');
const { ICONS } = require('./artifacts');

seed();
seedSettings();

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = http.createServer(app);
const io = new Server(server);
const orch = new Orchestrator(io);

const upload = multer({ dest: DIRS.brain, limits: { fileSize: 30 * 1024 * 1024 } });

/* ---------------- STATE / ONBOARDING ---------------- */
app.get('/api/state', (req, res) => {
  const company = db.prepare('SELECT * FROM company WHERE id=1').get() || null;
  const dnaRow = db.prepare('SELECT * FROM dna WHERE id=1').get();
  const kind = getSetting('engine_kind', 'demo');
  const hasKey = !!(getCredentials().anthropic_api_key || process.env.ANTHROPIC_API_KEY);
  const pending = db.prepare("SELECT COUNT(*) c FROM approvals WHERE status='pending'").get().c;
  const running = db.prepare("SELECT COUNT(*) c FROM missions WHERE status IN ('briefing','planning','running','waiting_approval','reporting')").get().c;
  res.json({
    onboarded: !!(company && dnaRow),
    company, dna: dnaRow ? JSON.parse(dnaRow.json) : null,
    engine: { kind, hasKey },
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
  }
  (dna.facts || []).forEach(f => db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,NULL,?)').run('fact', f, now()));
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
  // Nếu có mission đang chờ CEO trả lời brief-back → coi là câu trả lời
  const waiting = db.prepare("SELECT * FROM missions WHERE status='briefing' AND plan_json IS NOT NULL ORDER BY created_at DESC LIMIT 1").get();
  if (waiting) {
    orch.answerBriefing(waiting.id, text.trim()).catch(e => log('answer err ' + e.message));
    return res.json({ ok: true, missionId: waiting.id, kind: 'answer' });
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
  if (a.type === 'html') return res.sendFile(a.path);
  if (a.type === 'md') { res.type('text/plain; charset=utf-8'); return res.send(fs.readFileSync(a.path, 'utf8')); }
  res.download(a.path, a.name);
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
  const { decision, note } = req.body || {};
  res.json(await orch.decideApproval(req.params.id, decision, note));
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
app.post('/api/brain/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  const orig = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
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
    hasKey: !!(getCredentials().anthropic_api_key || process.env.ANTHROPIC_API_KEY)
  });
});
app.post('/api/settings', (req, res) => {
  const allow = ['engine_kind', 'nguong_diem', 'max_review_rounds', 'max_concurrent', 'tran_per_mission', 'tran_per_day', 'usd_vnd', 'models', 'pricing'];
  for (const k of allow) if (req.body[k] !== undefined) setSetting(k, req.body[k]);
  if (req.body.apiKey) setCredentials({ anthropic_api_key: String(req.body.apiKey).trim() });
  res.json({ ok: true });
});
app.post('/api/engine/test', async (req, res) => {
  const key = (req.body.apiKey || '').trim() || getCredentials().anthropic_api_key || process.env.ANTHROPIC_API_KEY;
  if (!key) return res.json({ ok: false, message: 'Chưa nhập API key' });
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });
    const models = getSetting('models');
    await client.messages.create({ model: models.nv, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] });
    res.json({ ok: true, message: '✅ Kết nối Claude API thành công!' });
  } catch (e) {
    const msg = /401|auth/i.test(e.message) ? 'API key không đúng hoặc hết hạn'
      : /credit|billing/i.test(e.message) ? 'Tài khoản hết hạn mức — nạp thêm tại console.anthropic.com'
      : /ENOTFOUND|fetch failed/i.test(e.message) ? 'Không kết nối được mạng' : e.message.slice(0, 140);
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

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

io.on('connection', socket => {
  socket.emit('hello', { at: now() });
});

const PORT = process.env.PORT || 3939;
server.listen(PORT, () => {
  console.log(`\n  🏢 AICORP đang chạy tại  http://localhost:${PORT}\n  📂 Dữ liệu: ${DIRS.root}\n`);
  log('server started');
  orch.resume();
  if (process.platform === 'darwin' && !process.env.AICORP_NO_OPEN) {
    require('child_process').exec(`open http://localhost:${PORT}`);
  }
});
