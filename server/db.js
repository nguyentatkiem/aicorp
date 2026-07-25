'use strict';
/* AICORP — lớp dữ liệu SQLite (chương 3 đặc tả). Dữ liệu nằm local tại ~/AICORP */
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = process.env.AICORP_HOME || path.join(os.homedir(), 'AICORP');
const DIRS = {
  root: ROOT,
  data: path.join(ROOT, 'data'),
  workspace: path.join(ROOT, 'workspace'),
  artifacts: path.join(ROOT, 'workspace', 'artifacts'),
  brain: path.join(ROOT, 'workspace', 'brain'),
  skills: path.join(ROOT, 'workspace', 'skills'),
  logs: path.join(ROOT, 'workspace', 'logs'),
  backups: path.join(ROOT, 'workspace', 'backups'),
  secret: path.join(ROOT, 'secret')
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
`);

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

module.exports = { db, DIRS, uid, now, getSetting, setSetting, getCredentials, setCredentials, log };
