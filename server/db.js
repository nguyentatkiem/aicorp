'use strict';
/* AICORP — lớp dữ liệu SQLite (chương 3 đặc tả). Dữ liệu nằm local tại ~/AICORP */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = process.env.AICORP_HOME || path.join(os.homedir(), 'AICORP');
fs.mkdirSync(ROOT, { recursive: true });

/* ===== ĐA CÔNG TY (v4): registry công ty + thư mục dữ liệu theo công ty đang hoạt động =====
   Backward-compatible: công ty "default" DÙNG THẲNG ~/AICORP (dữ liệu cũ không phải di chuyển).
   Công ty mới nằm tại ~/AICORP/companies/<slug>/. Chuyển công ty = đổi registry + restart. */
const REGISTRY_PATH = path.join(ROOT, 'companies.json');
const DEFAULT_REG = () => ({ active: 'default', companies: [{ id: 'default', name: '', dir: null, created_at: new Date().toISOString() }] });
function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return DEFAULT_REG();
  try {
    const r = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    if (!r || !Array.isArray(r.companies) || !r.companies.length) throw new Error('registry rỗng');
    return r;
  } catch (e) {
    // KHÔNG âm thầm reset (mất công ty khác): sao lưu file hỏng để cứu tay, rồi mới dùng mặc định
    try { fs.copyFileSync(REGISTRY_PATH, REGISTRY_PATH + '.corrupt-' + Date.now() + '.bak'); } catch {}
    return DEFAULT_REG();
  }
}
function writeRegistry(reg) {
  // ghi nguyên tử: file tạm rồi rename (tránh cắt cụt khi tiến trình chết giữa chừng)
  const tmp = REGISTRY_PATH + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2));
  fs.renameSync(tmp, REGISTRY_PATH);
}
function companyDir(id) { return id === 'default' ? ROOT : path.join(ROOT, 'companies', id); }

let REG = readRegistry();
if (!REG.companies.some(c => c.id === REG.active)) REG.active = REG.companies[0].id;
let regChanged = false;
// AICORP_COMPANY chỉ override active TRONG TIẾN TRÌNH NÀY — KHÔNG persist vào registry
// (tránh env tạm thời ghi đè vĩnh viễn lựa chọn công ty của người dùng)
let envOverride = null;
if (process.env.AICORP_COMPANY && REG.companies.some(c => c.id === process.env.AICORP_COMPANY)) envOverride = process.env.AICORP_COMPANY;
if (!fs.existsSync(REGISTRY_PATH)) { writeRegistry(REG); }   // tạo lần đầu
const ACTIVE_COMPANY = envOverride || REG.active;
const CDIR = companyDir(ACTIVE_COMPANY);

const DIRS = {
  root: CDIR,
  data: path.join(CDIR, 'data'),
  workspace: path.join(CDIR, 'workspace'),
  artifacts: path.join(CDIR, 'workspace', 'artifacts'),
  brain: path.join(CDIR, 'workspace', 'brain'),
  skills: path.join(CDIR, 'workspace', 'skills'),
  logs: path.join(CDIR, 'workspace', 'logs'),
  backups: path.join(CDIR, 'workspace', 'backups'),
  secret: path.join(ROOT, 'secret')   // API key DÙNG CHUNG toàn bộ công ty (key của người dùng)
};
Object.values(DIRS).forEach(d => fs.mkdirSync(d, { recursive: true }));

const db = new Database(path.join(DIRS.data, 'aicorp.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS company (id INTEGER PRIMARY KEY CHECK (id=1), name TEXT, industry TEXT,
  size TEXT, region TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS dna (id INTEGER PRIMARY KEY CHECK (id=1), json TEXT NOT NULL, updated_at TEXT);

CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, name TEXT, emoji TEXT, color TEXT,
  enabled INTEGER DEFAULT 1, sort INTEGER);
CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, dept_id TEXT REFERENCES departments(id),
  name TEXT, role_title TEXT, avatar TEXT, is_manager INTEGER DEFAULT 0,
  system_prompt TEXT, model TEXT, skills_json TEXT, tools_json TEXT, enabled INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS agent_stats (agent_id TEXT PRIMARY KEY, tasks_done INTEGER DEFAULT 0,
  avg_score REAL, rejected_rate REAL, tokens_used INTEGER DEFAULT 0, rejected_count INTEGER DEFAULT 0);

CREATE TABLE IF NOT EXISTS missions (id TEXT PRIMARY KEY, title TEXT, ceo_command TEXT, mode TEXT,
  status TEXT, progress INTEGER DEFAULT 0, plan_json TEXT, report_html TEXT,
  budget_vnd INTEGER, spent_vnd INTEGER DEFAULT 0, created_at TEXT, done_at TEXT);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, mission_id TEXT REFERENCES missions(id),
  dept_id TEXT, assignee_id TEXT, reviewer_id TEXT, title TEXT, brief TEXT,
  deps_json TEXT, status TEXT, review_round INTEGER DEFAULT 0, score INTEGER,
  output_ref TEXT, real_action_json TEXT, created_at TEXT, done_at TEXT);
CREATE TABLE IF NOT EXISTS task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, agent_id TEXT,
  type TEXT, payload_json TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT, round INTEGER,
  reviewer_id TEXT, score INTEGER, pass INTEGER, feedback TEXT, rubric_json TEXT, at TEXT);

CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, mission_id TEXT, task_id TEXT, agent_id TEXT,
  name TEXT, type TEXT, path TEXT, version INTEGER DEFAULT 1, prev_id TEXT, score INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, mission_id TEXT, task_id TEXT,
  type TEXT, title TEXT, context TEXT, options_json TEXT, preview TEXT, action_json TEXT,
  status TEXT, decided_at TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS brain_docs (id TEXT PRIMARY KEY, name TEXT, path TEXT, status TEXT,
  chunks INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS brain_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT, seq INTEGER,
  text TEXT, embedding BLOB);
CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT,
  text TEXT, source_mission TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, kind TEXT, name TEXT, config_json TEXT,
  enabled INTEGER, status TEXT, last_used_at TEXT);
CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT, path TEXT, description TEXT,
  assigned_agents_json TEXT, enabled INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS cost_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT, agent_id TEXT,
  model TEXT, input_tokens INTEGER, output_tokens INTEGER, vnd INTEGER, at TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id TEXT, role TEXT,
  html TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS dms (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT, role TEXT,
  text TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS crons (id TEXT PRIMARY KEY, title TEXT, command TEXT, mode TEXT,
  cadence TEXT, hhmm TEXT, dow INTEGER, enabled INTEGER DEFAULT 1, last_run_at TEXT, last_run_local TEXT, created_at TEXT);
-- Phase 3: buồng lái kinh doanh (sự kiện kinh doanh tích lũy)
CREATE TABLE IF NOT EXISTS biz_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT,
  label TEXT, amount_vnd INTEGER DEFAULT 0, meta_json TEXT, source_mission TEXT, at TEXT);
-- Phase 3: sáng kiến chủ động của COO
CREATE TABLE IF NOT EXISTS initiatives (id TEXT PRIMARY KEY, title TEXT, command TEXT, ly_do TEXT,
  phong TEXT, loai TEXT, status TEXT DEFAULT 'pending', created_at TEXT, decided_at TEXT);
-- Phase 3: cuộc họp chiến lược
CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, mission_id TEXT, topic TEXT,
  perspectives_json TEXT, synthesis_json TEXT, created_at TEXT);
-- v4: CRM sống
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT, phone TEXT, segment TEXT,
  source TEXT, city TEXT, note TEXT, ltv INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at TEXT);
CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, customer_id TEXT, product TEXT, score INTEGER DEFAULT 0,
  stage TEXT DEFAULT 'moi', source TEXT, assignee TEXT, note TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, customer_id TEXT, kind TEXT, content TEXT,
  status TEXT DEFAULT 'moi', resolution TEXT, created_at TEXT, resolved_at TEXT);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer_id TEXT, product TEXT, amount_vnd INTEGER,
  status TEXT DEFAULT 'done', source_mission TEXT, created_at TEXT);
-- v4: công ty tự học (playbook)
CREATE TABLE IF NOT EXISTS playbooks (id TEXT PRIMARY KEY, dept_id TEXT, agent_id TEXT, title TEXT,
  pattern TEXT, score INTEGER, source_task TEXT, uses INTEGER DEFAULT 0, created_at TEXT);
`);

/* Migrate cột thêm sau (bỏ qua nếu đã có) */
for (const [tbl, col, def] of [['crons', 'last_run_local', 'TEXT']]) {
  try { db.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`).run(); } catch { /* đã có */ }
}

function uid(prefix) { return (prefix ? prefix + '_' : '') + crypto.randomBytes(5).toString('hex'); }
function now() { return new Date().toISOString(); }

function getSetting(key, def) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return def;
  try { return JSON.parse(row.value); } catch { return row.value; }
}
function setSetting(key, val) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, JSON.stringify(val));
}

/* API key không lưu DB — lưu file quyền 600 (đặc tả ch3) */
const CRED_PATH = path.join(DIRS.secret, 'credentials.json');
function getCredentials() {
  try { return JSON.parse(fs.readFileSync(CRED_PATH, 'utf8')); } catch { return {}; }
}
function setCredentials(obj) {
  const cur = getCredentials();
  fs.writeFileSync(CRED_PATH, JSON.stringify({ ...cur, ...obj }, null, 2), { mode: 0o600 });
}

function log(line) {
  const f = path.join(DIRS.logs, 'server-' + new Date().toISOString().slice(0, 10) + '.log');
  try { fs.appendFileSync(f, `[${now()}] ${line}\n`); } catch {}
}

/* ===== Quản lý đa công ty ===== */
function listCompanies() {
  const reg = readRegistry();
  return { active: reg.active, companies: reg.companies.map(c => ({ id: c.id, name: c.name || '', created_at: c.created_at })) };
}
function addCompany(name) {
  const reg = readRegistry();
  const base = String(name || 'cong-ty').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'cong-ty';
  let id = base, i = 2;
  // tránh trùng cả trong registry LẪN thư mục mồ côi trên đĩa (không dùng lại data cũ)
  while (reg.companies.some(c => c.id === id) || id === 'default' || fs.existsSync(companyDir(id))) { id = base + '-' + i++; }
  reg.companies.push({ id, name: name || '', dir: null, created_at: new Date().toISOString() });
  reg.active = id;
  fs.mkdirSync(companyDir(id), { recursive: true });
  writeRegistry(reg);
  return id;
}
function switchCompany(id) {
  const reg = readRegistry();
  if (!reg.companies.some(c => c.id === id)) return false;
  reg.active = id; writeRegistry(reg); return true;
}
function setCompanyName(id, name) {
  const reg = readRegistry();
  const c = reg.companies.find(x => x.id === id);
  if (c) { c.name = name; writeRegistry(reg); }
}

module.exports = {
  db, DIRS, uid, now, getSetting, setSetting, getCredentials, setCredentials, log,
  ACTIVE_COMPANY, listCompanies, addCompany, switchCompany, setCompanyName
};
