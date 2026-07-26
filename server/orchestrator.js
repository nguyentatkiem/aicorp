'use strict';
/* ORCHESTRATOR — AI Loop (chương 5): mission/task state machine, review engine,
   approval gate, budget guard, checkpoint & resume. Phát sự kiện WebSocket theo quy ước 2.4 */
const fs = require('fs');
const path = require('path');
const { db, uid, now, getSetting, setSetting, getCredentials, log } = require('./db');
const { makeEngine, parseJson } = require('./engine');
const P = require('./prompts');
const { buildArtifact, buildEml, buildIcs, ICONS } = require('./artifacts');
const biz = require('./biz');
let INITIATIVE = null, MEETING = null;
try { INITIATIVE = require('./demo/initiative'); } catch {}
try { MEETING = require('./demo/meeting'); } catch {}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Lọc HTML do LLM sinh ra trước khi đưa vào UI — chống XSS khi dùng engine thật (chương 9 an toàn) */
function sanitizeHtml(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<\s*(script|style|iframe|object|embed|link|meta|form|input|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|form|input|svg|math)\b[^>]*>/gi, '');
  const ALLOW = ['ul', 'ol', 'li', 'b', 'i', 'em', 'strong', 'br', 'p', 'small', 'u', 'span'];
  // khớp cả thẻ không có whitespace sau tên (vd <img/onerror=…>) bằng cách bắt tên rồi phần còn lại tùy ý
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?>/g, (m, slash, tag) => {
    tag = tag.toLowerCase();
    if (!ALLOW.includes(tag)) return '';
    return slash ? `</${tag}>` : `<${tag}>`;
  });
  return s.replace(/javascript\s*:/gi, '').replace(/\bon\w+\s*=/gi, '');
}

class Orchestrator {
  constructor(io) {
    this.io = io;
    this.active = new Map();          // taskId -> true (đang chạy)
    this.engine = makeEngine(
      () => getSetting('engine_kind', 'demo'),
      () => getCredentials().anthropic_api_key || process.env.ANTHROPIC_API_KEY
    );
    setInterval(() => this.tick().catch(e => log('tick error: ' + e.message)), 3000);
    setInterval(() => { try { this.runCronCheck(); } catch (e) { log('cron error: ' + e.message); } }, 30000);
    // COO chủ động: rà trạng thái công ty & đề xuất sáng kiến định kỳ (Phase 3)
    setInterval(() => this.runInitiativeCheck().catch(e => log('initiative error: ' + e.message)), 90000);
  }

  /* Danh bạ agent đang bật (dùng cho planner + brief) */
  roster() {
    return db.prepare(`SELECT a.id,a.dept_id,a.role_title,a.name,a.is_manager FROM agents a
      JOIN departments d ON d.id=a.dept_id WHERE d.enabled=1 AND a.enabled=1 AND a.id!='coo'`).all();
  }

  /* ---------- helpers ---------- */
  emit(ev, payload) { this.io.emit(ev, payload); }

  dna() { const r = db.prepare('SELECT json FROM dna WHERE id=1').get(); return r ? JSON.parse(r.json) : null; }

  agent(id) { return db.prepare('SELECT * FROM agents WHERE id=?').get(id); }

  setAgent(agentId, state, logLine, level) {
    this.emit('agent.state', { agentId, state, logLine: logLine || null });
    if (logLine) this.agentLog(agentId, logLine, level);
  }
  agentLog(agentId, text, level) {
    const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    this.emit('agent.log', { agentId, time, text, level: level || 'info' });
  }
  packet(fromId, toId, color) { this.emit('packet.send', { fromId, toId, color: color || 'gold' }); }

  chat(role, html, missionId) {
    db.prepare('INSERT INTO chats(mission_id,role,html,at) VALUES(?,?,?,?)').run(missionId || null, role, html, now());
    this.emit('chat.message', { role, html });
  }
  typing(on) { this.emit('chat.typing', { on: !!on }); }

  taskEvent(taskId, agentId, type, payload) {
    db.prepare('INSERT INTO task_events(task_id,agent_id,type,payload_json,at) VALUES(?,?,?,?,?)')
      .run(taskId, agentId, type, JSON.stringify(payload || {}), now());
  }

  setTask(task, status, extra) {
    db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status, task.id);
    task.status = status;
    const colMap = { todo: 'todo', doing: 'doing', submitted: 'review', reviewing: 'review', rejected: 'doing', waiting_approval: 'wait', done: 'done', failed: 'done' };
    this.emit('task.update', Object.assign({ taskId: task.id, missionId: task.mission_id, column: colMap[status] || 'todo', status }, extra || {}));
    this.taskEvent(task.id, task.assignee_id, 'state', { status });
    this.updateProgress(task.mission_id);
  }

  mission(id) { return db.prepare('SELECT * FROM missions WHERE id=?').get(id); }

  setMission(id, status, extra) {
    db.prepare('UPDATE missions SET status=? WHERE id=?').run(status, id);
    if (status === 'done') db.prepare('UPDATE missions SET done_at=? WHERE id=?').run(now(), id);
    const m = this.mission(id);
    this.emit('mission.update', Object.assign({ missionId: id, status, progress: m.progress, title: m.title, spentVnd: m.spent_vnd, budgetVnd: m.budget_vnd }, extra || {}));
  }

  updateProgress(missionId) {
    const rows = db.prepare('SELECT status FROM tasks WHERE mission_id=?').all(missionId);
    if (!rows.length) return;
    const doneN = rows.filter(r => r.status === 'done' || r.status === 'failed').length;
    const prog = Math.round((doneN / rows.length) * 90) + (this.mission(missionId).status === 'done' ? 10 : 5);
    db.prepare('UPDATE missions SET progress=? WHERE id=?').run(Math.min(prog, 99), missionId);
    const m = this.mission(missionId);
    this.emit('mission.update', { missionId, status: m.status, progress: m.progress, title: m.title, spentVnd: m.spent_vnd, budgetVnd: m.budget_vnd });
  }

  /* ---------- chi phí & budget guard (5.4) ---------- */
  modelFor(level) { const m = getSetting('models'); return m[level] || m.nv; }

  vndOf(model, inTok, outTok) {
    const pricing = getSetting('pricing', {});
    const p = pricing[model] || { in: 3, out: 15 };
    const usd = (inTok * p.in + outTok * p.out) / 1e6;
    return Math.round(usd * getSetting('usd_vnd', 26500));
  }

  todayVnd() {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const r = db.prepare('SELECT COALESCE(SUM(vnd),0) s FROM cost_logs WHERE at>=?').get(d.toISOString());
    return r.s;
  }

  addCost(missionId, agentId, model, inTok, outTok) {
    const vnd = this.vndOf(model, inTok, outTok);
    db.prepare('INSERT INTO cost_logs(mission_id,agent_id,model,input_tokens,output_tokens,vnd,at) VALUES(?,?,?,?,?,?,?)')
      .run(missionId, agentId, model, inTok, outTok, vnd, now());
    if (missionId) db.prepare('UPDATE missions SET spent_vnd=spent_vnd+? WHERE id=?').run(vnd, missionId);
    db.prepare('UPDATE agent_stats SET tokens_used=tokens_used+? WHERE agent_id=?').run(inTok + outTok, agentId);
    const m = missionId ? this.mission(missionId) : null;
    this.emit('cost.update', { todayVnd: this.todayVnd(), missionVnd: m ? m.spent_vnd : 0, tranDay: getSetting('tran_per_day', 100000) });
    return vnd;
  }

  estimateNext(model) { return this.vndOf(model, 5000, 2000); }

  budgetOk(missionId, model) {
    const m = this.mission(missionId);
    if (!m) return false;
    // mission bị CEO tạm dừng / đã chạm trần → mọi lượt gọi đang bay phải dừng ngay
    if (['paused', 'over_budget', 'failed'].includes(m.status)) return false;
    const est = this.estimateNext(model);
    const reserved = this.reservedVnd(missionId);
    if (m.spent_vnd + reserved + est > (m.budget_vnd || Infinity)) { this.overBudget(m, 'trần nhiệm vụ'); return false; }
    if (this.todayVnd() + this.reservedVnd(null) + est > getSetting('tran_per_day', 100000)) { this.overBudget(m, 'trần ngày'); return false; }
    return true;
  }

  /* Chống race 2 task song song cùng lách qua budgetOk (TOCTOU): giữ chỗ ước tính khi lượt gọi đang bay */
  reservedVnd(missionId) {
    if (!this._reserved) this._reserved = new Map();
    let s = 0;
    for (const [, r] of this._reserved) if (missionId === null || r.missionId === missionId) s += r.vnd;
    return s;
  }
  reserve(missionId, vnd) {
    if (!this._reserved) this._reserved = new Map();
    const key = Symbol();
    this._reserved.set(key, { missionId, vnd });
    return () => this._reserved.delete(key);
  }

  overBudget(m, why) {
    if (m.status === 'over_budget') return;
    db.prepare("UPDATE tasks SET status='todo' WHERE mission_id=? AND status IN ('doing','submitted','reviewing')").run(m.id);
    this.setMission(m.id, 'over_budget');
    const nums = why === 'trần ngày'
      ? `hôm nay đã dùng ${this.todayVnd().toLocaleString('vi-VN')}đ / trần ngày ${getSetting('tran_per_day', 100000).toLocaleString('vi-VN')}đ`
      : `nhiệm vụ đã dùng ${m.spent_vnd.toLocaleString('vi-VN')}đ / trần ${(m.budget_vnd || 0).toLocaleString('vi-VN')}đ`;
    this.chat('coo', `⛔ <b>Nhiệm vụ tạm dừng vì chạm ${why}</b> (${nums}). Sếp có thể nâng trần trong Cài đặt rồi bấm "Chạy tiếp", hoặc hủy nhiệm vụ ạ.`, m.id);
    this.setAgent('coo', 'wait', 'Chạm trần chi phí — chờ CEO quyết');
    log(`mission ${m.id} over_budget (${why})`);
  }

  /* ---------- gọi engine có kiểm soát ---------- */
  async llm(kind, { level, agentId, missionId, system, user, ctx, skipBudget }) {
    const model = this.modelFor(level || 'nv');
    if (missionId && !skipBudget && !this.budgetOk(missionId, model)) throw new Error('OVER_BUDGET');
    const release = missionId ? this.reserve(missionId, this.estimateNext(model)) : () => {};
    try {
      const res = await this.engine.call(kind, { model, system, user, ctx, maxTokens: 4096 });
      this.addCost(missionId, agentId || 'coo', model, res.inputTokens, res.outputTokens);
      return res.text;
    } finally { release(); }
  }

  /* RAG-lite cải tiến (Phase 3): chấm điểm chunk theo độ trùng từ khóa (bỏ dấu) + tần suất,
     không chỉ LIKE. Trả các đoạn liên quan NHẤT thay vì 3 đoạn ngẫu nhiên khớp. */
  brainSearch(query) {
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    const STOP = new Set(['cho', 'cua', 'va', 'cac', 'mot', 'nhung', 'theo', 'khi', 'nay', 'duoc', 'tren', 'voi', 'lam', 'ban']);
    const terms = [...new Set(norm(query).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)))].slice(0, 8);
    const mems = db.prepare('SELECT kind,text FROM memories ORDER BY id DESC LIMIT 5').all().map(m => `(${m.kind}) ${m.text}`);
    if (!terms.length) return mems.join('\n');
    // lấy ứng viên bằng LIKE rồi chấm điểm trong JS
    const like = terms.map(() => 'text LIKE ?').join(' OR ');
    const cand = db.prepare(`SELECT text FROM brain_chunks WHERE ${like} LIMIT 40`).all(...terms.map(t => `%${t}%`));
    const scored = cand.map(r => {
      const nt = norm(r.text);
      let score = 0;
      for (const t of terms) { const c = nt.split(t).length - 1; if (c) score += 1 + Math.min(c, 3) * 0.3; }
      return { text: r.text, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    return [...mems, ...scored.map(r => r.text.slice(0, 450))].join('\n');
  }

  skillTextFor(agent) {
    let out = [];
    for (const slug of JSON.parse(agent.skills_json || '[]')) {
      const sk = db.prepare('SELECT * FROM skills WHERE id=? AND enabled=1').get(slug);
      if (!sk) continue;
      try { out.push(fs.readFileSync(path.join(sk.path, 'SKILL.md'), 'utf8').slice(0, 1500)); } catch {}
    }
    return out.join('\n---\n');
  }

  /* ---------- MISSION lifecycle (5.1) ---------- */
  async createMission(command, mode, budgetOverride) {
    const id = uid('ms');
    const budget = budgetOverride || getSetting('tran_per_mission', 30000);
    db.prepare(`INSERT INTO missions(id,title,ceo_command,mode,status,progress,budget_vnd,spent_vnd,created_at)
      VALUES(?,?,?,?,?,0,?,0,?)`).run(id, command.slice(0, 80), command, mode, 'briefing', budget, now());
    this.chat('ceo', esc(command), id);
    this.setMission(id, 'briefing');
    this.runBriefing(id).catch(e => this.failMission(id, e));
    return id;
  }

  async runBriefing(missionId) {
    const m = this.mission(missionId);
    this.typing(true);
    this.setAgent('coo', 'think', 'Phân tích nhiệm vụ · đối chiếu DNA & bộ nhớ công ty…');
    if (m.mode === 'go') { this.typing(false); return this.runPlanning(missionId, null); }
    try {
      const roster = this.roster();
      const text = await this.llm('brief', {
        level: 'coo', agentId: 'coo', missionId,
        system: 'Bạn là AI COO. Chỉ trả về JSON hợp lệ.',
        user: P.briefBack(m.ceo_command, this.dna(), this.brainSearch(m.ceo_command)),
        ctx: { dna: this.dna(), answers: null, command: m.ceo_command, roster, enabledDepts: [...new Set(roster.map(r => r.dept_id))] }
      });
      const j = parseJson(text);
      this.typing(false);
      if (j.ready || !(j.cau_hoi || []).length) return this.runPlanning(missionId, null);
      db.prepare('UPDATE missions SET plan_json=? WHERE id=?').run(JSON.stringify({ brief: j }), missionId);
      this.setAgent('coo', 'idle');
      this.chat('coo', `${esc(j.hieu_nhiem_vu)}<br>Trước khi chạy, cho em hỏi:<ul>${j.cau_hoi.map(q => `<li><b>${esc(q)}</b></li>`).join('')}</ul>`, missionId);
    } catch (e) { this.typing(false); if (e.message !== 'OVER_BUDGET') this.failMission(missionId, e); }
  }

  async answerBriefing(missionId, text) {
    this.chat('ceo', esc(text), missionId);
    return this.runPlanning(missionId, text);
  }

  async runPlanning(missionId, answers, opts) {
    const m = this.mission(missionId);
    // Lệnh chiến lược (có/không/nên/quyết định…) → HỌP đa agent thay vì chia task (Phase 3)
    if (!(opts && opts.fromMeeting) && MEETING && this.isStrategic(m.ceo_command)) {
      this.typing(false);
      return this.runMeeting(missionId);
    }
    this.setMission(missionId, 'planning');
    this.typing(true);
    this.setAgent('coo', 'work', 'Chia task · xếp dependency · chọn người phù hợp…');
    const roster = this.roster();
    const rosterTxt = roster.map(r => `${r.id} · ${r.dept_id} · ${r.name} — ${r.role_title}`).join('\n');
    const enabledDepts = [...new Set(roster.map(r => r.dept_id))];
    try {
      let tasks = null;
      for (let attempt = 0; attempt < 2 && !tasks; attempt++) {
        const text = await this.llm('plan', {
          level: 'coo', agentId: 'coo', missionId,
          system: 'Bạn là AI COO. Chỉ trả về JSON hợp lệ.',
          user: P.planWBS(m.ceo_command, answers, this.dna(), rosterTxt) + (attempt ? '\nCHÚ Ý: lần trước JSON lỗi, chỉ trả JSON thuần.' : ''),
          ctx: { dna: this.dna(), enabledDepts, answers, command: m.ceo_command, roster }
        });
        try { tasks = parseJson(text).tasks; } catch { tasks = null; }
      }
      if (!tasks || !tasks.length) throw new Error('COO không lập được kế hoạch (JSON lỗi)');
      const validIds = new Set(roster.map(r => r.id));
      const managers = Object.fromEntries(roster.filter(r => r.is_manager).map(r => [r.dept_id, r.id]));
      const ins = db.prepare(`INSERT INTO tasks(id,mission_id,dept_id,assignee_id,reviewer_id,title,brief,deps_json,status,review_round,real_action_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,0,?,?)`);
      const created = [];
      // ánh xạ mọi cách planner có thể tham chiếu 1 task: theo CHỈ SỐ mảng (0-based, số hoặc chuỗi)
      // và theo id chuỗi tường minh nếu có. Hai không gian tách riêng để không đè nhau.
      const byOrigIndex = {};   // vị trí gốc trong mảng tasks → tid
      const byExplicitId = {};  // t.id (nếu planner đặt) → tid
      const original = tasks.slice(0, 12);
      original.forEach((t, i) => {
        if (!validIds.has(t.assignee_id)) return; // agent không tồn tại/đã tắt → bỏ task (deps trỏ tới sẽ bị lọc)
        const tid = uid('t');
        byOrigIndex[i] = tid;
        if (t.id != null && typeof t.id !== 'number') byExplicitId[String(t.id)] = tid;
        const reviewer = validIds.has(t.reviewer_id) ? t.reviewer_id : (managers[t.dept_id] || t.assignee_id);
        ins.run(tid, missionId, t.dept_id, t.assignee_id, reviewer, String(t.title).slice(0, 120),
          JSON.stringify(t.brief || {}), JSON.stringify([]), 'todo',
          t.real_action ? JSON.stringify(t.real_action) : null, now());
        created.push({ tid, t, i });
      });
      // map deps: số → chỉ số mảng gốc; chuỗi → id tường minh (rồi mới thử chỉ số)
      for (const { tid, t } of created) {
        const deps = (t.deps || []).map(d => {
          if (typeof d === 'number') return byOrigIndex[d];
          const s = String(d);
          return byExplicitId[s] != null ? byExplicitId[s] : byOrigIndex[Number(s)];
        }).filter(dep => dep && dep !== tid);
        db.prepare('UPDATE tasks SET deps_json=? WHERE id=?').run(JSON.stringify([...new Set(deps)]), tid);
      }
      if (!created.length) throw new Error('Kế hoạch không có task hợp lệ');
      db.prepare('UPDATE missions SET plan_json=? WHERE id=?').run(JSON.stringify({ tasks }), missionId);
      this.typing(false);
      const byDept = {};
      created.forEach(({ t }) => { (byDept[t.dept_id] = byDept[t.dept_id] || []).push(t.title); });
      const deptRow = id => db.prepare('SELECT * FROM departments WHERE id=?').get(id);
      this.chat('coo', `Đã nhận, thưa sếp. Em chia <b>${created.length} đầu việc</b>:<ul>` +
        Object.entries(byDept).map(([d, ts]) => { const dp = deptRow(d); return `<li>${dp.emoji} <b>${dp.name}</b>: ${ts.map(esc).join(' · ')}</li>`; }).join('') +
        `</ul>Sếp theo dõi trực tiếp trên Sơ đồ sống nhé 👇`, missionId);
      this.setMission(missionId, 'running');
      // packet giao việc COO → các TP
      [...new Set(created.map(({ t }) => managers[t.dept_id]).filter(Boolean))].forEach((tp, i) =>
        setTimeout(() => { this.packet('coo', tp); this.setAgent(tp, 'think', 'Nhận brief từ COO → chia việc trong phòng'); }, i * 350));
      this.setAgent('coo', 'work', `Giám sát ${created.length} task · điều phối hàng đợi`);
      setTimeout(() => this.tick(), 1200);
    } catch (e) { this.typing(false); if (e.message !== 'OVER_BUDGET') this.failMission(missionId, e); }
  }

  failMission(missionId, err) {
    log(`mission ${missionId} failed: ${err.stack || err.message}`);
    this.setMission(missionId, 'failed');
    this.setAgent('coo', 'idle');
    this.chat('coo', `😥 Em gặp trục trặc khi chạy nhiệm vụ: <b>${esc(friendlyError(err))}</b>. Sếp kiểm tra Cài đặt (API key / kết nối mạng) rồi giao lại giúp em nhé.`, missionId);
  }

  /* ---------- SCHEDULER (5.3) ---------- */
  async tick() {
    const maxC = getSetting('max_concurrent', 3);
    const missions = db.prepare("SELECT * FROM missions WHERE status='running'").all();
    for (const m of missions) {
      if (this.active.size >= maxC) break;
      const tasks = db.prepare("SELECT * FROM tasks WHERE mission_id=? AND status='todo'").all(m.id);
      for (const t of tasks) {
        if (this.active.size >= maxC) break;
        if (this.active.has(t.id)) continue;
        const deps = JSON.parse(t.deps_json || '[]');
        const depRows = deps.map(d => db.prepare('SELECT status FROM tasks WHERE id=?').get(d)).filter(Boolean);
        if (depRows.some(d => d.status === 'failed')) {
          // dependency đã hủy → nhánh này không chạy được nữa
          this.setTask(t, 'failed');
          this.agentLog('coo', `Nhánh "${t.title}" bị hủy vì task phụ thuộc đã thất bại`, 'warn');
          continue;
        }
        if (depRows.some(d => d.status !== 'done')) continue;
        // agent bị tạm dừng / phòng bị tắt sau khi task đã tạo → không giao (đặc tả 4/10)
        const av = db.prepare('SELECT a.enabled ae, d.enabled de FROM agents a JOIN departments d ON d.id=a.dept_id WHERE a.id=?').get(t.assignee_id);
        if (!av || !av.ae || !av.de) {
          this.setTask(t, 'failed');
          this.agentLog('coo', `Nhánh "${t.title}" bị hủy: người phụ trách đã tạm dừng hoặc phòng bị tắt`, 'warn');
          this.checkMissionDone(m.id);
          continue;
        }
        this.active.set(t.id, true);
        this.runTask(t).catch(e => {
          log(`task ${t.id} crash: ${e.stack || e.message}`);
          this.active.delete(t.id);
        }).finally(() => this.checkMissionDone(t.mission_id));
      }
      this.checkMissionDone(m.id);
    }
  }

  /* Gom output của các task phụ thuộc đã hoàn thành → đầu vào cho task hiện tại */
  upstreamOutputs(task) {
    const deps = JSON.parse(task.deps_json || '[]');
    const out = [];
    for (const d of deps) {
      const dt = db.prepare('SELECT title, dept_id, output_ref, status FROM tasks WHERE id=?').get(d);
      if (dt && dt.status === 'done' && dt.output_ref) {
        out.push({ title: dt.title, dept: this.deptName(dt.dept_id), excerpt: dt.output_ref.slice(0, 1800) });
      }
    }
    return out;
  }

  /* ---------- TASK lifecycle (5.2) ---------- */
  async runTask(task) {
    const nguong = getSetting('nguong_diem', 90);
    const maxRounds = getSetting('max_review_rounds', 3);
    const nv = this.agent(task.assignee_id);
    const tp = this.agent(task.reviewer_id);
    const brief = JSON.parse(task.brief || '{}');
    const dna = this.dna();
    const missionCmd = (this.mission(task.mission_id) || {}).ceo_command || '';

    // BÀN GIAO DỮ LIỆU (Phase 3): gom output các task phụ thuộc đã xong làm đầu vào thật
    const upstream = this.upstreamOutputs(task);
    if (upstream.length) brief.dau_vao_tu_phong_khac = upstream.map(u => `[${u.dept} · ${u.title}]\n${u.excerpt}`);

    this.setTask(task, 'doing');
    this.packet(tp.id, nv.id, 'gold');
    this.setAgent(nv.id, 'think', upstream.length ? `Nhận brief + dữ liệu ${upstream.length} phòng bàn giao: ${task.title}` : `Nhận brief: ${task.title}`);
    await sleep(900);

    let feedback = brief.ceo_feedback ? `Góp ý trực tiếp từ CEO: ${brief.ceo_feedback}` : null;
    let round = task.review_round || 0;
    let lastOutput = null, lastScore = 0;

    while (true) {
      /* --- NV thực thi --- */
      this.setAgent(nv.id, 'work', round > 0 ? `Sửa theo nhận xét (vòng ${round + 1})…` : `Bắt đầu: ${task.title}`);
      if (tp.id !== nv.id) this.setAgent(tp.id, 'work', 'Giám sát task đang chạy');
      let outText;
      try {
        outText = await this.withRetry(() => this.llm('execute', {
          level: brief.model_boost ? 'tp' : 'nv', agentId: nv.id, missionId: task.mission_id,
          system: P.agentSystem(nv, dna, this.skillTextFor(nv), this.brainSearch(task.title + ' ' + (brief.muc_tieu || ''))),
          user: P.execute(brief, feedback, round + 1),
          ctx: { dna, task, round, command: missionCmd, upstream }
        }));
      } catch (e) {
        if (e.message === 'OVER_BUDGET') {
          // trả task về hàng đợi để "Chạy tiếp" khôi phục được (không kẹt ở doing)
          this.setTask(task, 'todo');
          this.setAgent(nv.id, 'idle');
          this.active.delete(task.id);
          return;
        }
        this.setTask(task, 'failed');
        this.setAgent(nv.id, 'idle');
        this.agentLog('coo', `⚠️ Task "${task.title}" lỗi: ${friendlyError(e)}`, 'error');
        this.chat('coo', `⚠️ Nhánh "<b>${esc(task.title)}</b>" gặp lỗi kỹ thuật (${esc(friendlyError(e))}). Em đã dừng nhánh này, các nhánh khác vẫn chạy ạ.`, task.mission_id);
        this.active.delete(task.id);
        return;
      }
      lastOutput = extractOutput(outText);
      db.prepare('UPDATE tasks SET output_ref=? WHERE id=?').run(lastOutput.slice(0, 20000), task.id);
      this.taskEvent(task.id, nv.id, 'log', { text: 'Nộp bài vòng ' + (round + 1) });

      /* --- Nộp bài & review --- */
      this.setTask(task, 'submitted');
      this.packet(nv.id, tp.id, 'jade');
      this.setAgent(nv.id, 'idle');
      this.setTask(task, 'reviewing', { round: round + 1 });
      this.setAgent(tp.id, 'review', `Chấm "${task.title}" theo rubric + DNA (vòng ${round + 1})…`);

      let rev;
      try {
        const revText = await this.withRetry(() => this.llm('review', {
          level: 'tp', agentId: tp.id, missionId: task.mission_id,
          system: 'Bạn là trưởng phòng khó tính. Chỉ trả về JSON hợp lệ.',
          user: P.review(tp, brief, lastOutput.slice(0, 8000), dna, nguong),
          ctx: { dna, task, round, command: missionCmd, nguong }
        }));
        rev = parseJson(revText);
      } catch (e) {
        if (e.message === 'OVER_BUDGET') {
          this.setTask(task, 'todo');
          this.setAgent(tp.id, 'idle');
          this.active.delete(task.id);
          return;
        }
        // review lỗi API hết 3 lần backoff → task failed (đặc tả ch10), KHÔNG tự cho đậu
        this.setTask(task, 'failed');
        this.setAgent(tp.id, 'idle');
        this.chat('coo', `⚠️ Nhánh "<b>${esc(task.title)}</b>" không review được (${esc(friendlyError(e))}). Em dừng nhánh này, sếp có thể giao lại sau ạ.`, task.mission_id);
        this.active.delete(task.id);
        return;
      }
      const score = Math.max(0, Math.min(100, Math.round(rev.score || 0)));
      const pass = score >= nguong;
      lastScore = score;
      db.prepare('INSERT INTO reviews(task_id,round,reviewer_id,score,pass,feedback,rubric_json,at) VALUES(?,?,?,?,?,?,?,?)')
        .run(task.id, round + 1, tp.id, score, pass ? 1 : 0, rev.feedback_chi_tiet || '', JSON.stringify(rev.loi_cu_the || []), now());
      db.prepare('UPDATE tasks SET score=?, review_round=? WHERE id=?').run(score, round + 1, task.id);
      this.emit('review.score', { agentId: nv.id, score, pass });
      this.emit('task.update', { taskId: task.id, missionId: task.mission_id, column: 'review', score, round: round + 1 });

      if (pass) {
        this.setAgent(tp.id, 'idle');
        await this.finishTask(task, nv, tp, brief, lastOutput, score);
        this.active.delete(task.id);
        return;
      }

      /* --- Trượt --- */
      this.bumpStats(nv.id, null, true);
      if (round + 1 >= maxRounds) {
        // ESCALATE (5.2): đưa CEO quyết qua Hộp phê duyệt
        this.setAgent(tp.id, 'idle');
        this.setTask(task, 'waiting_approval', { score });
        this.createApproval(task, 'decision',
          `⚠️ "${task.title}" trượt review ${maxRounds} vòng (điểm cuối ${score}/100)`,
          `${nv.name} đã sửa ${maxRounds} vòng nhưng chưa đạt ngưỡng ${nguong}. Nhận xét cuối của ${tp.name}: ${rev.feedback_chi_tiet || ''}`,
          [{ key: 'accept', label: `✔ Chấp nhận bản hiện tại (${score}đ, có ghi chú)` },
           { key: 'retry_strong', label: '💪 Làm lại với model mạnh hơn' },
           { key: 'drop', label: '✖ Hủy nhánh này' }],
          lastOutput.slice(0, 1200), null);
        this.setAgent('coo', 'wait', `Escalate: "${task.title}" cần CEO quyết`);
        this.active.delete(task.id);
        return;
      }
      feedback = (rev.feedback_chi_tiet || '') + '\n' + (rev.loi_cu_the || []).map(l => `- ${l.vi_tri}: ${l.loi} → ${l.cach_sua}`).join('\n');
      this.setTask(task, 'rejected', { score, hot: true });
      this.packet(tp.id, nv.id, 'red');
      this.emit('toast', { title: `❌ ${tp.name} trả lại bài`, body: `"${task.title}" — ${score}/100. Yêu cầu sửa lại.`, cls: 'red' });
      this.setAgent(tp.id, 'idle');
      this.setTask(task, 'doing', { hot: true });
      round++;
    }
  }

  async finishTask(task, nv, tp, brief, output, score) {
    /* Sinh artifact */
    const version = db.prepare('SELECT COUNT(*) c FROM artifacts WHERE task_id=?').get(task.id).c + 1;
    const art = await buildArtifact({ title: task.title, content: output, format: brief.format_dau_ra || 'docx', version, taskId: task.id });
    const artId = uid('art');
    db.prepare(`INSERT INTO artifacts(id,mission_id,task_id,agent_id,name,type,path,version,score,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(artId, task.mission_id, task.id, nv.id, art.fileName, art.type, art.absPath, version, score, now());
    this.emit('artifact.new', { artifactId: artId, name: art.fileName, icon: ICONS[art.type] || '📄', agentId: nv.id, score });
    this.bumpStats(nv.id, score, false);

    const ra = task.real_action_json ? JSON.parse(task.real_action_json) : null;
    if (ra) {
      /* Hành động thật → Approval Gate (chương 9) */
      this.setTask(task, 'waiting_approval', { score });
      this.createApproval(task, 'real_action',
        `📣 Xin phép HÀNH ĐỘNG THẬT: ${ra.note || ra.op}`,
        `${nv.name} (${this.deptName(task.dept_id)}) hoàn thành "${task.title}", ${tp.name} chấm ${score}/100. Kênh: ${ra.channel}. Mọi hành động thật đều chờ sếp bấm nút — AI không bao giờ tự ý.`,
        [{ key: 'approve', label: '✔ Duyệt & thực hiện' }, { key: 'reject', label: '✖ Không thực hiện' }],
        output.slice(0, 1200), ra);
      this.setAgent(nv.id, 'done', `Xong (${score}/100) — chờ CEO duyệt hành động thật`);
      this.setAgent('coo', 'wait', `Xin CEO duyệt: ${ra.note || ra.op}`);
    } else {
      this.setTask(task, 'done', { score });
      db.prepare('UPDATE tasks SET done_at=? WHERE id=?').run(now(), task.id);
      this.setAgent(nv.id, 'done', `Xong: ${task.title} (${score}/100)`);
      this.packet(tp.id, 'coo', 'jade');
      this.emit('toast', { title: '📄 File mới vào Xưởng', body: `${task.title} · ${score}/100`, cls: '' });
      this.recordBiz(task, nv.id);
    }
    setTimeout(() => this.setAgent(nv.id, 'idle'), 2500);
  }

  /* Ghi sổ kinh doanh khi 1 task hoàn thành → buồng lái tiến hóa (Phase 3) */
  recordBiz(task, agentId) {
    try {
      // chỉ ghi 1 lần cho mỗi task (chống nhân đôi doanh thu khi task làm lại nhiều vòng/accept)
      if (this._bizRecorded && this._bizRecorded.has(task.id)) return;
      if (!this._bizRecorded) this._bizRecorded = new Set();
      this._bizRecorded.add(task.id);
      const dna = this.dna();
      const price = biz.avgPrice(dna);
      const map = {
        nv_cash: () => biz.record('revenue', `Dự toán tài chính: ${task.title}`, Math.round(price * 400), null, task.mission_id),
        nv_quote: () => biz.record('deal', `Báo giá/hợp đồng: ${task.title}`, Math.round(price * 50 * 10), null, task.mission_id),
        nv_lead: () => biz.record('lead', `Chấm & lọc lead: ${task.title}`, 20, null, task.mission_id),
        nv_content: () => biz.record('content', `Nội dung: ${task.title}`, 0, null, task.mission_id),
        nv_ads: () => biz.record('content', `Kịch bản quảng cáo: ${task.title}`, 0, null, task.mission_id),
        nv_market: () => biz.record('research', `Nghiên cứu thị trường: ${task.title}`, 0, null, task.mission_id)
      };
      (map[agentId] || (() => {}))();
    } catch (e) { log('recordBiz err: ' + e.message); }
  }

  /* Sinh lại artifact phiên bản mới (dùng khi CEO sửa nội dung trước khi duyệt) */
  async regenArtifact(task, content, noteText) {
    const brief = JSON.parse(task.brief || '{}');
    const version = db.prepare('SELECT COUNT(*) c FROM artifacts WHERE task_id=?').get(task.id).c + 1;
    const art = await buildArtifact({ title: task.title, content, format: brief.format_dau_ra || 'docx', version, taskId: task.id });
    const artId = uid('art');
    const prev = db.prepare('SELECT id FROM artifacts WHERE task_id=? ORDER BY version DESC LIMIT 1').get(task.id);
    db.prepare(`INSERT INTO artifacts(id,mission_id,task_id,agent_id,name,type,path,version,prev_id,score,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(artId, task.mission_id, task.id, task.assignee_id, art.fileName, art.type, art.absPath, version, prev ? prev.id : null, task.score, now());
    db.prepare('UPDATE tasks SET output_ref=? WHERE id=?').run(content.slice(0, 20000), task.id);
    this.emit('artifact.new', { artifactId: artId, name: art.fileName, icon: ICONS[art.type] || '📄', agentId: task.assignee_id, score: task.score });
    if (noteText) db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,?,?)')
      .run('decision', `${noteText}: "${task.title}"`, task.mission_id, now());
    return artId;
  }

  /* Sinh file hành động thật local (.eml/.ics) + ghi sổ kinh doanh khi CEO duyệt (Phase 3) */
  async emitRealArtifact(ap, task) {
    try {
      const action = ap.action_json ? JSON.parse(ap.action_json) : null;
      if (!action) return;
      const dna = this.dna();
      const output = task.output_ref || '';
      let art = null;
      if (action.channel === 'mcp:gmail') {
        art = await buildEml({
          to: 'khach-hang@example.com',
          subject: task.title,
          body: output.slice(0, 6000) + '\n\n— Gửi từ ' + (((dna || {}).company || {}).name || 'công ty') + ' qua AICORP'
        });
        biz.record('email', `Thư gửi khách: ${task.title}`, 0, null, task.mission_id);
      } else if (action.channel === 'mcp:facebook') {
        // ghi sổ CHIẾN DỊCH đã lên lịch đăng
        biz.record('campaign', `Bài đăng Fanpage: ${task.title}`, 0, { note: action.note }, task.mission_id);
        // kèm file lịch nhắc đăng (mở bằng Calendar)
        art = await buildIcs({
          title: 'Đăng bài: ' + task.title,
          description: (action.note || '') + '\n\n' + output.slice(0, 800),
          whenIso: null, durationMin: 15
        });
      } else if (action.channel === 'n8n' || /lich|calendar|hen|họp|meeting/i.test(action.op || '')) {
        art = await buildIcs({ title: task.title, description: output.slice(0, 800), whenIso: null, durationMin: 60 });
      }
      if (art) {
        const artId = uid('art');
        db.prepare(`INSERT INTO artifacts(id,mission_id,task_id,agent_id,name,type,path,version,score,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(artId, task.mission_id, task.id, task.assignee_id, art.fileName, art.type, art.absPath,
            db.prepare('SELECT COUNT(*) c FROM artifacts WHERE task_id=?').get(task.id).c + 1, task.score, now());
        this.emit('artifact.new', { artifactId: artId, name: art.fileName, icon: ICONS[art.type] || '📎', agentId: task.assignee_id, score: task.score });
        this.emit('toast', { title: '📎 File hành động thật đã tạo', body: art.fileName + ' — mở bằng ứng dụng Mail/Lịch', cls: '' });
      }
    } catch (e) { log('emitRealArtifact err: ' + e.message); }
  }

  /* Bắn n8n webhook thật khi CEO duyệt hành động thật (8.3) */
  async fireN8n(ap, task) {
    try {
      const conn = db.prepare("SELECT * FROM connections WHERE id='n8n_webhook'").get();
      if (!conn || !conn.enabled) return;
      const cfg = JSON.parse(conn.config_json || '{}');
      if (!cfg.url || !/^https?:\/\//i.test(cfg.url)) return;
      const art = db.prepare('SELECT name,type FROM artifacts WHERE task_id=? ORDER BY version DESC LIMIT 1').get(task.id);
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(cfg.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
        body: JSON.stringify({
          event: 'real_action_approved',
          approval: { id: ap.id, title: ap.title, action: JSON.parse(ap.action_json || 'null') },
          task: { id: task.id, title: task.title, score: task.score },
          artifact: art || null,
          output: (task.output_ref || '').slice(0, 4000), at: now()
        })
      });
      clearTimeout(to);
      db.prepare("UPDATE connections SET last_used_at=?, status=? WHERE id='n8n_webhook'").run(now(), res.ok ? 'ready' : 'error');
      this.emit('toast', { title: res.ok ? '🔄 Đã bắn n8n webhook' : `⚠️ n8n webhook trả lỗi ${res.status}`, body: cfg.url.slice(0, 60), cls: res.ok ? '' : 'red' });
      log(`n8n webhook ${res.status} for ${ap.id}`);
    } catch (e) {
      log('n8n webhook fail: ' + e.message);
      this.emit('toast', { title: '⚠️ n8n webhook không gọi được', body: String(e.message).slice(0, 80), cls: 'red' });
    }
  }

  /* Lịch nhiệm vụ định kỳ (roadmap v1) — kiểm mỗi 30s */
  runCronCheck(force) {
    if (this._cronRunning) return 0; // chống chạy chồng
    this._cronRunning = true;
    try { return this._runCronCheck(force); } finally { this._cronRunning = false; }
  }
  _runCronCheck(force) {
    const rows = db.prepare('SELECT * FROM crons WHERE enabled=1').all();
    const nowD = new Date();
    const hhmm = `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
    // dùng NGÀY LOCAL (không phải UTC) để khớp giờ local — tránh chạy 2 lần quanh nửa đêm VN
    const localDay = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-${String(nowD.getDate()).padStart(2, '0')}`;
    let fired = 0;
    for (const c of rows) {
      const ranToday = (c.last_run_local || '') === localDay;
      if (ranToday) continue;
      const dowOk = c.cadence !== 'weekly' || nowD.getDay() === (c.dow == null ? 1 : c.dow);
      if (!force && !(dowOk && hhmm >= (c.hhmm || '08:00'))) continue;
      db.prepare('UPDATE crons SET last_run_at=?, last_run_local=? WHERE id=?').run(now(), localDay, c.id);
      this.chat('system', `⏰ Lịch định kỳ "<b>${esc(c.title)}</b>" đến giờ — em tự giao nhiệm vụ ạ.`, null);
      this.createMission(c.command, c.mode || 'go').catch(e => log('cron mission err ' + e.message));
      fired++;
    }
    return fired;
  }

  /* Nhắn riêng 1-1 giữa CEO và một agent */
  async dmAgent(agentId, text) {
    const a = this.agent(agentId);
    if (!a) return { ok: false, error: 'Không có agent này' };
    db.prepare('INSERT INTO dms(agent_id,role,text,at) VALUES(?,?,?,?)').run(agentId, 'ceo', String(text).slice(0, 2000), now());
    let reply;
    try {
      const model = this.modelFor(a.model || 'nv');
      const res = await this.engine.call('dm', {
        model,
        system: P.agentSystem(a, this.dna(), this.skillTextFor(a), '') +
          '\nBạn đang nhắn riêng 1-1 với CEO. Trả lời ngắn gọn (≤120 từ), đúng vai, thân thiện, xưng "em" gọi "sếp". Không markdown, chỉ văn bản thường.',
        user: String(text).slice(0, 2000), maxTokens: 600,
        ctx: { agent: a, dna: this.dna(), text: String(text) }
      });
      this.addCost(null, agentId, model, res.inputTokens, res.outputTokens);
      reply = sanitizeHtml(res.text).slice(0, 2000).trim() || 'Dạ em nghe sếp!';
    } catch (e) {
      reply = '😥 Em chưa trả lời được — ' + friendlyError(e);
    }
    db.prepare('INSERT INTO dms(agent_id,role,text,at) VALUES(?,?,?,?)').run(agentId, 'agent', reply, now());
    this.agentLog(agentId, 'Nhắn riêng với CEO');
    return { ok: true, reply };
  }

  bumpStats(agentId, score, rejected) {
    const s = db.prepare('SELECT * FROM agent_stats WHERE agent_id=?').get(agentId);
    if (!s) return;
    if (rejected) {
      db.prepare('UPDATE agent_stats SET rejected_count=rejected_count+1 WHERE agent_id=?').run(agentId);
    } else if (score != null) {
      const n = s.tasks_done, avg = s.avg_score == null ? score : (s.avg_score * n + score) / (n + 1);
      db.prepare('UPDATE agent_stats SET tasks_done=tasks_done+1, avg_score=? WHERE agent_id=?').run(avg, agentId);
    }
    const s2 = db.prepare('SELECT * FROM agent_stats WHERE agent_id=?').get(agentId);
    const total = s2.tasks_done + s2.rejected_count;
    if (total > 0) db.prepare('UPDATE agent_stats SET rejected_rate=? WHERE agent_id=?').run(s2.rejected_count / total, agentId);
  }

  deptName(id) { const d = db.prepare('SELECT name FROM departments WHERE id=?').get(id); return d ? d.name : id; }

  createApproval(task, type, title, context, options, preview, action) {
    const id = uid('ap');
    db.prepare(`INSERT INTO approvals(id,mission_id,task_id,type,title,context,options_json,preview,action_json,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, task.mission_id, task.id, type, title, context, JSON.stringify(options || []), preview || '', action ? JSON.stringify(action) : null, 'pending', now());
    this.emit('approval.new', { approvalId: id, type, title });
    this.emit('toast', { title: '🔔 Có việc chờ sếp duyệt', body: title, cls: 'amber' });
    if (this.mission(task.mission_id).status === 'running') this.checkMissionDone(task.mission_id);
    return id;
  }

  /* CEO quyết một approval */
  async decideApproval(approvalId, decision, note, editedText) {
    const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(approvalId);
    if (!ap || ap.status !== 'pending') return { ok: false, error: 'Approval không tồn tại hoặc đã quyết' };

    // HỌP CHIẾN LƯỢC: CEO chọn 1 phương án (key A/B/C) — hợp lệ nếu khớp option của chính approval này
    const apOpts = (() => { try { return JSON.parse(ap.options_json || '[]'); } catch { return []; } })();
    const apAction = (() => { try { return JSON.parse(ap.action_json || 'null'); } catch { return null; } })();
    if (ap.type === 'decision' && apAction && apAction.meetingId && apOpts.some(o => o.key === decision)) {
      const chosen = apOpts.find(o => o.key === decision);
      db.prepare('UPDATE approvals SET status=?, decided_at=? WHERE id=?').run('approved', now(), approvalId);
      this.emit('approval.update', { approvalId, status: 'approved' });
      const tk = db.prepare('SELECT * FROM tasks WHERE id=?').get(ap.task_id);
      if (tk) { this.setTask(tk, 'done'); db.prepare('UPDATE tasks SET done_at=?, score=? WHERE id=?').run(now(), null, tk.id); }
      db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,?,?)')
        .run('decision', `CEO chọn phương án "${chosen.label}" cho: ${ap.title.replace('🗳️ Quyết định chiến lược: ', '')}`, ap.mission_id, now());
      biz.record('decision', `Chốt chiến lược: ${chosen.label}`, 0, null, ap.mission_id);
      this.chat('coo', `✅ Sếp đã chốt <b>${esc(chosen.label)}</b>. Em ghi vào bộ nhớ công ty để mọi phòng áp dụng thống nhất từ giờ ạ.`, ap.mission_id);
      this.setAgent('coo', 'idle');
      // mission họp chỉ có task khung → đóng THẲNG về done (không sinh báo cáo COO thừa)
      db.prepare('UPDATE missions SET report_html=? WHERE id=?')
        .run(`<ul><li>🗳️ Cuộc họp chiến lược đã chốt: <b>${esc(chosen.label)}</b></li></ul>`, ap.mission_id);
      if (this.mission(ap.mission_id).status !== 'done') this.setMission(ap.mission_id, 'done', { progress: 100 });
      return { ok: true };
    }

    // Approval Gate KHÔNG fail-open: decision lạ → từ chối xử lý, tuyệt đối không tự duyệt
    const VALID = ['approve', 'accept', 'edited', 'reject', 'drop', 'retry_strong'];
    if (!VALID.includes(decision)) return { ok: false, error: 'Quyết định không hợp lệ: ' + String(decision).slice(0, 30) };
    const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(ap.task_id);
    const st = decision === 'reject' || decision === 'drop' ? 'rejected' : (decision === 'edited' ? 'edited' : 'approved');
    db.prepare('UPDATE approvals SET status=?, decided_at=? WHERE id=?').run(st, now(), approvalId);
    this.emit('approval.update', { approvalId, status: st });

    if (ap.type === 'real_action') {
      if (st === 'approved' || st === 'edited') {
        if (st === 'edited' && editedText && editedText.trim()) {
          // "Sửa" (chương 9.2): bản CEO sửa là bản chạy — sinh artifact phiên bản mới
          await this.regenArtifact(task, editedText.trim(), 'CEO sửa nội dung trước khi duyệt');
        }
        this.setTask(task, 'done');
        db.prepare('UPDATE tasks SET done_at=? WHERE id=?').run(now(), task.id);
        this.taskEvent(task.id, 'coo', 'real_action', { approvalId, action: ap.action_json, executed: true, mode: 'mock', edited: st === 'edited' });
        db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,?,?)')
          .run('decision', `CEO đã duyệt: ${ap.title}${note ? ' — ghi chú: ' + note : ''}`, ap.mission_id, now());
        this.setAgent('coo', 'work', 'CEO đã duyệt — chuyển lệnh cho kênh thực thi');
        this.emit('toast', { title: '✅ Đã thực hiện (mô phỏng MCP)', body: ap.title, cls: '' });
        // đọc lại task từ DB để n8n nhận đúng BẢN CEO ĐÃ SỬA (regenArtifact vừa cập nhật output_ref)
        const freshTask = db.prepare('SELECT * FROM tasks WHERE id=?').get(task.id);
        await this.fireN8n(ap, freshTask);
        await this.emitRealArtifact(ap, freshTask); // sinh .eml/.ics thật + ghi sổ chiến dịch
      } else if (note && note.trim()) {
        // từ chối KÈM LÝ DO → task quay lại NV làm lại theo góp ý CEO (chương 9.3)
        const brief = JSON.parse(task.brief || '{}');
        brief.ceo_feedback = note.trim();
        db.prepare('UPDATE tasks SET brief=?, status=? WHERE id=?').run(JSON.stringify(brief), 'todo', task.id);
        this.setTask(task, 'todo');
        this.chat('coo', `Dạ, em chuyển lại cho ${esc(this.agent(task.assignee_id).name)} sửa "<b>${esc(task.title)}</b>" theo góp ý của sếp: <i>${esc(note)}</i>`, ap.mission_id);
        if (this.mission(ap.mission_id).status === 'waiting_approval') this.setMission(ap.mission_id, 'running');
        setTimeout(() => this.tick(), 800);
      } else {
        // từ chối không lý do → hủy hành động, giữ file trong Xưởng
        db.prepare('UPDATE tasks SET real_action_json=NULL WHERE id=?').run(task.id);
        this.setTask(task, 'done');
        this.chat('coo', `Dạ, em đã hủy hành động "${esc(ap.title)}". File vẫn nằm trong Xưởng để sếp dùng sau ạ.`, ap.mission_id);
      }
    } else if (ap.type === 'decision') {
      if (decision === 'drop') {
        this.setTask(task, 'failed');
        this.chat('coo', `Đã hủy nhánh "<b>${esc(task.title)}</b>" theo quyết định của sếp.`, ap.mission_id);
      } else if (decision === 'retry_strong') {
        // Escalation 5.2b: làm lại bằng model mạnh hơn, mang theo toàn bộ nhận xét cũ
        const lastRev = db.prepare('SELECT feedback FROM reviews WHERE task_id=? ORDER BY id DESC LIMIT 1').get(task.id);
        const brief = JSON.parse(task.brief || '{}');
        brief.model_boost = true;
        if (lastRev && lastRev.feedback) brief.ceo_feedback = lastRev.feedback;
        db.prepare('UPDATE tasks SET brief=?, review_round=0 WHERE id=?').run(JSON.stringify(brief), task.id);
        this.setTask(task, 'todo');
        this.chat('coo', `💪 Em cho ${esc(this.agent(task.assignee_id).name)} làm lại "<b>${esc(task.title)}</b>" bằng model mạnh hơn, kèm toàn bộ nhận xét cũ ạ.`, ap.mission_id);
        if (this.mission(ap.mission_id).status === 'waiting_approval') this.setMission(ap.mission_id, 'running');
        setTimeout(() => this.tick(), 800);
      } else {
        // CEO chấp nhận bản dưới ngưỡng → vẫn phải sinh FILE vào Xưởng + ghi sổ (như task đạt)
        this.setTask(task, 'done');
        db.prepare('UPDATE tasks SET done_at=? WHERE id=?').run(now(), task.id);
        db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,?,?)')
          .run('decision', `CEO chấp nhận "${task.title}" điểm ${task.score} (dưới ngưỡng, có ghi chú)`, ap.mission_id, now());
        if (task.output_ref && !db.prepare('SELECT 1 FROM artifacts WHERE task_id=?').get(task.id)) {
          const brief = JSON.parse(task.brief || '{}');
          try {
            const art = await buildArtifact({ title: task.title, content: task.output_ref, format: brief.format_dau_ra || 'docx', version: 1, taskId: task.id });
            const artId = uid('art');
            db.prepare(`INSERT INTO artifacts(id,mission_id,task_id,agent_id,name,type,path,version,score,created_at)
              VALUES(?,?,?,?,?,?,?,1,?,?)`).run(artId, task.mission_id, task.id, task.assignee_id, art.fileName, art.type, art.absPath, task.score, now());
            this.emit('artifact.new', { artifactId: artId, name: art.fileName, icon: ICONS[art.type] || '📄', agentId: task.assignee_id, score: task.score });
          } catch (e) { log('accept artifact err: ' + e.message); }
          this.recordBiz(task, task.assignee_id);
        }
      }
    }
    this.setAgent('coo', 'idle');
    this.checkMissionDone(ap.mission_id);
    return { ok: true };
  }

  /* ---------- Kết thúc & báo cáo ---------- */
  checkMissionDone(missionId) {
    const m = this.mission(missionId);
    if (!m || !['running', 'waiting_approval'].includes(m.status)) return;
    let rows = db.prepare('SELECT id,status,deps_json FROM tasks WHERE mission_id=?').all(missionId);
    if (!rows.length) return;
    let byId = Object.fromEntries(rows.map(r => [r.id, r]));
    // cascade: task todo phụ thuộc nhánh đã hủy → hủy luôn (tránh zombie trong mission done)
    let cascaded = false;
    for (const r of rows) {
      if (r.status !== 'todo') continue;
      if (JSON.parse(r.deps_json || '[]').some(d => byId[d] && byId[d].status === 'failed')) {
        this.setTask({ id: r.id, mission_id: missionId, status: r.status }, 'failed');
        cascaded = true;
      }
    }
    if (cascaded) {
      rows = db.prepare('SELECT id,status,deps_json FROM tasks WHERE mission_id=?').all(missionId);
      byId = Object.fromEntries(rows.map(r => [r.id, r]));
    }
    const inFlight = [...this.active.keys()].some(tid => byId[tid]);
    const activeNow = rows.some(r => ['doing', 'submitted', 'reviewing', 'rejected'].includes(r.status));
    // task todo chỉ tính "đang chạy" nếu deps đã xong (chạy được ngay);
    // todo bị chặn bởi nhánh waiting_approval → mission phải hiện waiting_approval (đặc tả 5.1)
    const runnableTodo = rows.some(r => r.status === 'todo' &&
      JSON.parse(r.deps_json || '[]').every(d => !byId[d] || byId[d].status === 'done'));
    if (inFlight || activeNow || runnableTodo) {
      if (m.status === 'waiting_approval') this.setMission(missionId, 'running');
      return;
    }
    const anyWaiting = rows.some(r => r.status === 'waiting_approval');
    if (anyWaiting) { if (m.status !== 'waiting_approval') this.setMission(missionId, 'waiting_approval'); return; }
    // tất cả done/failed → báo cáo
    if (m.status !== 'reporting') this.runReport(missionId).catch(e => log('report err: ' + e.message));
  }

  async runReport(missionId) {
    const m = this.mission(missionId);
    if (m.status === 'reporting' || m.status === 'done') return;
    if (this._reporting && this._reporting.has(missionId)) return; // chống runReport chạy 2 lần song song
    if (!this._reporting) this._reporting = new Set();
    this._reporting.add(missionId);
    this.setMission(missionId, 'reporting');
    this.typing(true);
    this.setAgent('coo', 'work', 'Tổng hợp kết quả · viết báo cáo cho CEO…');
    const tasks = db.prepare('SELECT * FROM tasks WHERE mission_id=?').all(missionId);
    const arts = db.prepare('SELECT * FROM artifacts WHERE mission_id=?').all(missionId);
    const scores = tasks.filter(t => t.score).map(t => t.score);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    let html;
    try {
      html = await this.llm('report', {
        level: 'coo', agentId: 'coo', missionId, skipBudget: true, // báo cáo là bước kết — không để budget guard chặn nửa chừng
        system: 'Bạn là AI COO báo cáo cho CEO. Chỉ trả về HTML đơn giản.',
        user: P.report(m, tasks.map(t => `"${t.title}" [${t.status}${t.score ? ' ' + t.score + 'đ' : ''}]`).join('; '),
          arts.map(a => a.name).join('; '), this.mission(missionId).spent_vnd),
        ctx: {
          doneCount: tasks.filter(t => t.status === 'done').length, avgScore: avg, costVnd: this.mission(missionId).spent_vnd,
          taskLines: tasks.map(t => `${t.status === 'done' ? '✅' : '⚠️'} ${esc(t.title)}${t.score ? ` — ${t.score}/100` : ''}`),
          pendingApprovals: db.prepare("SELECT COUNT(*) c FROM approvals WHERE status='pending'").get().c
        }
      });
      html = sanitizeHtml(html); // chống XSS từ đầu ra LLM khi dùng engine thật
    } catch (e) {
      html = `<ul>${tasks.map(t => `<li>${t.status === 'done' ? '✅' : '⚠️'} ${esc(t.title)}${t.score ? ` — ${t.score}/100` : ''}</li>`).join('')}</ul>`;
    }
    const fileChips = arts.map(a => `<span class="filelink" data-art="${a.id}">${ICONS[a.type] || '📄'} ${esc(a.name)}</span>`).join('');
    db.prepare('UPDATE missions SET report_html=?, progress=100 WHERE id=?').run(html, missionId);
    this.typing(false);
    this.chat('coo', `📨 <b>Báo cáo nhiệm vụ "${esc(m.title)}"</b>:${html}${fileChips}`, missionId);
    this.setMission(missionId, 'done', { progress: 100 });
    this.setAgent('coo', 'done', 'Đã gửi báo cáo cho CEO');
    setTimeout(() => this.setAgent('coo', 'idle'), 2500);
    this.emit('toast', { title: '📨 COO đã gửi báo cáo', body: `${arts.length} file đính kèm trong Xưởng sản phẩm`, cls: '' });
    db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,?,?)')
      .run('lesson', `Nhiệm vụ "${m.title}" hoàn thành, điểm TB ${avg || '—'}, chi phí ${this.mission(missionId).spent_vnd}đ`, missionId, now());
    if (this._reporting) this._reporting.delete(missionId);
  }

  /* ============ COO CHỦ ĐỘNG — SÁNG KIẾN (Phase 3) ============ */
  hasActiveMission() {
    // coi cả mission đang chờ CEO (waiting_approval/over_budget/paused) là "đang bận" — không quấy bằng sáng kiến
    return db.prepare("SELECT COUNT(*) c FROM missions WHERE status IN ('briefing','planning','running','reporting','waiting_approval','over_budget','paused')").get().c > 0;
  }

  async runInitiativeCheck(force) {
    if (!force) {
      if (this.hasActiveMission()) return 0;                       // đang bận thì không quấy
      const pend = db.prepare("SELECT COUNT(*) c FROM initiatives WHERE status='pending'").get().c;
      if (pend >= 3) return 0;                                     // đã có sáng kiến chờ, không dồn thêm
      const lastI = db.prepare('SELECT created_at FROM initiatives ORDER BY created_at DESC LIMIT 1').get();
      if (lastI && Date.now() - new Date(lastI.created_at).getTime() < 8 * 60000) return 0; // giãn nhịp ≥8 phút
      if (!db.prepare('SELECT 1 FROM company WHERE id=1').get()) return 0; // chưa onboard
    }
    const dna = this.dna();
    const state = biz.stateForInitiative();
    let proposals = [];
    try {
      if (INITIATIVE && INITIATIVE.propose) proposals = INITIATIVE.propose({ dna, state, weekday: new Date().getDay() }) || [];
    } catch (e) { log('initiative propose err: ' + e.message); }
    proposals = (proposals || []).slice(0, 3).filter(p => p && p.command && p.title);
    if (!proposals.length) return 0;

    const enabled = new Set(this.roster().map(r => r.dept_id));
    const fresh = [];
    for (const p of proposals) {
      if (p.phong && !enabled.has(p.phong)) continue;
      // dedup theo KHÓA ỔN ĐỊNH (command đã chuẩn hóa) + không lặp lại sáng kiến đã quyết trong 24h
      const cmdKey = String(p.command || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 120);
      const dup = db.prepare(
        "SELECT 1 FROM initiatives WHERE (status='pending' OR decided_at > ?) AND LOWER(command) LIKE ?")
        .get(new Date(Date.now() - 24 * 3600000).toISOString(), '%' + cmdKey.slice(0, 40) + '%');
      if (dup) continue;
      const id = uid('ini');
      db.prepare(`INSERT INTO initiatives(id,title,command,ly_do,phong,loai,status,created_at)
        VALUES(?,?,?,?,?,?,'pending',?)`)
        .run(id, String(p.title).slice(0, 80), String(p.command).slice(0, 300), String(p.ly_do || '').slice(0, 400),
          p.phong || null, p.loai || 'co_hoi', now());
      fresh.push({ id, ...p });
    }
    if (!fresh.length) return 0;
    const icon = { co_hoi: '💡', rui_ro: '⚠️', dinh_ky: '📆', nhan_su: '🎓' };
    this.chat('coo', `🔔 <b>Em có ${fresh.length} đề xuất chủ động cho sếp</b> (dựa trên tình hình công ty):<ul>` +
      fresh.map(p => `<li>${icon[p.loai] || '💡'} <b>${esc(p.title)}</b> — ${esc(p.ly_do || '')}</li>`).join('') +
      `</ul>Sếp mở mục <b>💡 Sáng kiến</b> để đồng ý hoặc bỏ qua nhé ạ.`, null);
    this.emit('initiative.new', { count: fresh.length });
    this.emit('toast', { title: '💡 COO đề xuất việc mới', body: `${fresh.length} sáng kiến chủ động — xem mục Sáng kiến`, cls: 'amber' });
    return fresh.length;
  }

  async decideInitiative(id, accept) {
    const ini = db.prepare('SELECT * FROM initiatives WHERE id=?').get(id);
    if (!ini || ini.status !== 'pending') return { ok: false, error: 'Sáng kiến không tồn tại hoặc đã xử lý' };
    db.prepare('UPDATE initiatives SET status=?, decided_at=? WHERE id=?').run(accept ? 'accepted' : 'dismissed', now(), id);
    this.emit('initiative.update', { id });
    if (accept) {
      // phòng chủ trì bị tắt sau khi đề xuất → báo CEO, không tạo mission mù (planner sẽ tự chọn phòng bật)
      if (ini.phong) {
        const dep = db.prepare('SELECT enabled FROM departments WHERE id=?').get(ini.phong);
        if (dep && !dep.enabled) this.chat('coo', `Lưu ý: phòng chủ trì sáng kiến này hiện đã tắt — em sẽ giao cho phòng phù hợp đang bật ạ.`, null);
      }
      this.chat('ceo', `Đồng ý đề xuất: ${esc(ini.title)}`, null);
      const mid = await this.createMission(ini.command, 'go');
      return { ok: true, missionId: mid };
    }
    return { ok: true };
  }

  /* ============ HỌP CHIẾN LƯỢC ĐA AGENT (Phase 3) ============ */
  isStrategic(command) {
    const n = ' ' + String(command || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ') + ' ';
    // Chỉ nhận diện mẫu QUYẾT ĐỊNH rõ ràng — tránh nuốt lệnh thường có chứa 'phương án'/'lựa chọn'
    return /( co nen | nen hay khong| co the mo rong| chien luoc | dinh huong chien luoc | quyet dinh chien luoc | trieu tap hop | to chuc hop ban | can quyet dinh | huong di nao | chon huong )/.test(n)
      || /\bco nen\b.*\bkhong\b/.test(n);
  }

  async runMeeting(missionId) {
    const m = this.mission(missionId);
    const dna = this.dna();
    const managers = this.roster().filter(r => r.is_manager);
    if (!managers.length || !MEETING) return this.runPlanning(missionId, null, { fromMeeting: true }); // fallback
    this.setMission(missionId, 'running');
    this.chat('coo', `Đây là quyết định chiến lược — em triệu tập <b>cuộc họp</b> với các trưởng phòng để nghe đủ góc nhìn trước khi trình sếp ạ.`, missionId);
    this.setAgent('coo', 'work', 'Chủ trì cuộc họp chiến lược…');
    const perspectives = [];
    for (const mgr of managers) {
      this.packet('coo', mgr.id, 'gold');
      this.setAgent(mgr.id, 'think', 'Chuẩn bị góc nhìn cho cuộc họp…');
      await sleep(700);
      let per;
      try {
        per = MEETING.perspective(mgr.dept_id, m.ceo_command, { dna, command: m.ceo_command, deptName: this.deptName(mgr.dept_id) });
      } catch { per = null; }
      if (per) {
        const stanceIcon = { ung_ho: '👍', than_trong: '🤔', phan_doi: '✋' };
        this.setAgent(mgr.id, 'review', `${stanceIcon[per.stance] || '💬'} ${(per.goc_nhin || '').slice(0, 40)}…`);
        this.agentLog(mgr.id, `Ý kiến họp: ${per.de_xuat || per.goc_nhin || ''}`, 'a');
        perspectives.push({ deptId: mgr.dept_id, deptName: this.deptName(mgr.dept_id), agentId: mgr.id, ...per });
        this.packet(mgr.id, 'coo', 'jade');
      }
      await sleep(400);
      this.setAgent(mgr.id, 'idle');
    }
    // COO tổng hợp
    this.setAgent('coo', 'review', 'Tổng hợp ý kiến các phòng thành phương án…');
    await sleep(900);
    let synth;
    try { synth = MEETING.synthesize(m.ceo_command, perspectives, { dna, command: m.ceo_command }); } catch { synth = null; }
    if (!synth || !synth.options || !synth.options.length) {
      // không tổng hợp được → chuyển sang lập kế hoạch thường
      return this.runPlanning(missionId, null, { fromMeeting: true });
    }
    const meetId = uid('mt');
    db.prepare('INSERT INTO meetings(id,mission_id,topic,perspectives_json,synthesis_json,created_at) VALUES(?,?,?,?,?,?)')
      .run(meetId, missionId, m.ceo_command, JSON.stringify(perspectives), JSON.stringify(synth), now());
    // tạo 1 task "khung" để approval bám vào (giữ mô hình dữ liệu nhất quán)
    const tid = uid('t');
    db.prepare(`INSERT INTO tasks(id,mission_id,dept_id,assignee_id,reviewer_id,title,brief,deps_json,status,review_round,created_at)
      VALUES(?,?,?,?,?,?,?,?,'waiting_approval',0,?)`)
      .run(tid, missionId, 'bgd', 'coo', 'coo', 'Quyết định: ' + m.ceo_command.slice(0, 80),
        JSON.stringify({ muc_tieu: m.ceo_command }), JSON.stringify([]), now());
    // preview là VĂN BẢN THÔ (client sẽ esc 1 lần) — không nhúng thẻ <b> để tránh escape 2 lần
    const perspHtml = perspectives.map(p => {
      const si = { ung_ho: '👍 Ủng hộ', than_trong: '🤔 Thận trọng', phan_doi: '✋ Phản đối' }[p.stance] || '💬';
      return `● ${p.deptName} (${si}): ${p.goc_nhin || ''}`;
    }).join('\n\n');
    const opts = synth.options.map(o => ({ key: o.key, label: `${o.key}. ${o.label}` }));
    this.createApproval({ id: tid, mission_id: missionId, dept_id: 'bgd', score: null },
      'decision',
      `🗳️ Quyết định chiến lược: ${m.ceo_command.slice(0, 70)}`,
      `${synth.tom_tat || 'Các trưởng phòng đã họp và nêu góc nhìn. Sếp chọn hướng để cả công ty chạy theo:'}\n\n${synth.options.map(o => `${o.key}. ${o.label} — ${o.mo_ta}\n   ✅ ${o.uu_diem}\n   ⚠️ ${o.nhuoc_diem}${o.phong_ung_ho && o.phong_ung_ho.length ? '\n   Ủng hộ: ' + o.phong_ung_ho.map(d => this.deptName(d)).join(', ') : ''}`).join('\n\n')}`,
      opts, perspHtml.slice(0, 1600), { meetingId: meetId });
    db.prepare('UPDATE meetings SET synthesis_json=? WHERE id=?').run(JSON.stringify(synth), meetId);
    this.setMission(missionId, 'waiting_approval');
    this.setAgent('coo', 'wait', 'Trình phương án — chờ CEO quyết');
    this.chat('coo', `📋 <b>Cuộc họp xong</b> — em đã trình ${synth.options.length} phương án trong Hộp phê duyệt. Sếp chọn giúp em nhé ạ.`, missionId);
    this.emit('toast', { title: '🗳️ Có phương án chờ CEO chọn', body: m.ceo_command.slice(0, 50), cls: 'amber' });
  }

  /* Chạy tiếp mission over_budget sau khi CEO nâng trần */
  resumeMission(missionId, newBudget) {
    const m = this.mission(missionId);
    if (!m) return { ok: false };
    if (newBudget) db.prepare('UPDATE missions SET budget_vnd=? WHERE id=?').run(newBudget, missionId);
    if (['over_budget', 'paused'].includes(m.status)) {
      const nTasks = db.prepare('SELECT COUNT(*) c FROM tasks WHERE mission_id=?').get(missionId).c;
      this.chat('coo', `▶ Em chạy tiếp nhiệm vụ "<b>${esc(m.title)}</b>" theo trần mới ạ.`, missionId);
      if (nTasks === 0) {
        // chạm trần từ lúc chưa kịp lập kế hoạch → lập kế hoạch lại từ đầu
        this.setMission(missionId, 'briefing');
        this.runPlanning(missionId, null).catch(e => this.failMission(missionId, e));
      } else {
        this.setMission(missionId, 'running');
        this.tick();
      }
    }
    return { ok: true };
  }

  pauseMission(missionId) {
    const m = this.mission(missionId);
    if (m && ['running', 'waiting_approval'].includes(m.status)) {
      db.prepare("UPDATE tasks SET status='todo' WHERE mission_id=? AND status IN ('doing','submitted','reviewing')").run(missionId);
      this.setMission(missionId, 'paused');
      this.chat('coo', `⏸ Đã tạm dừng "<b>${esc(m.title)}</b>" theo lệnh sếp.`, missionId);
    }
    return { ok: true };
  }

  /* ---------- Khôi phục sau khi tắt app (5.3 checkpoint) ---------- */
  resume() {
    const rows = db.prepare("SELECT * FROM missions WHERE status IN ('running','planning','reporting','briefing')").all();
    for (const m of rows) {
      db.prepare("UPDATE tasks SET status='todo' WHERE mission_id=? AND status IN ('doing','submitted','reviewing')").run(m.id);
      const nTasks = db.prepare('SELECT COUNT(*) c FROM tasks WHERE mission_id=?').get(m.id).c;
      if (m.status === 'briefing') {
        // đang chờ CEO trả lời câu hỏi brief-back → giữ nguyên để CEO trả lời tiếp
        if (m.plan_json && JSON.parse(m.plan_json).brief) { this.chat('system', `🔄 Khôi phục phiên: <b>${esc(m.title)}</b> đang chờ sếp trả lời câu hỏi của COO…`, m.id); continue; }
        // tắt app khi COO chưa kịp hỏi → lập kế hoạch lại (không kẹt vĩnh viễn)
        this.runPlanning(m.id, null).catch(e => this.failMission(m.id, e));
      } else if (m.status === 'planning' || nTasks === 0) {
        db.prepare("UPDATE missions SET status='briefing' WHERE id=?").run(m.id);
        this.runPlanning(m.id, null).catch(e => this.failMission(m.id, e));
      } else {
        db.prepare("UPDATE missions SET status='running' WHERE id=?").run(m.id);
      }
      this.chat('system', `🔄 Đang khôi phục phiên làm việc: <b>${esc(m.title)}</b>…`, m.id);
    }
    if (rows.length) setTimeout(() => this.tick(), 1500);
  }

  async withRetry(fn) {
    const delays = [1000, 4000, 10000]; // backoff theo chương 10
    let lastErr;
    for (let i = 0; i <= delays.length; i++) {
      try { return await fn(); } catch (e) {
        if (e.message === 'OVER_BUDGET') throw e;
        lastErr = e;
        if (i < delays.length) await sleep(delays[i]);
      }
    }
    throw lastErr;
  }
}

function extractOutput(text) {
  const m = text.match(/```output\s*([\s\S]*?)```/);
  if (m) return m[1].trim();
  return text.replace(/```[a-z]*\n?/g, '').trim();
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function friendlyError(e) {
  const msg = e.message || String(e);
  if (/401|invalid.*key|authentication/i.test(msg)) return 'API key không đúng hoặc hết hạn';
  if (/429|rate.limit/i.test(msg)) return 'Chạm giới hạn tốc độ API — em sẽ giãn nhịp';
  if (/ENOTFOUND|ECONN|fetch failed|network/i.test(msg)) return 'Không kết nối được mạng/API';
  if (/credit|billing/i.test(msg)) return 'Tài khoản API hết hạn mức';
  return msg.slice(0, 160);
}

module.exports = { Orchestrator };
