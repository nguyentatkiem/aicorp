'use strict';
/* ORCHESTRATOR — AI Loop (chương 5): mission/task state machine, review engine,
   approval gate, budget guard, checkpoint & resume. Phát sự kiện WebSocket theo quy ước 2.4 */
const fs = require('fs');
const path = require('path');
const { db, uid, now, getSetting, setSetting, getCredentials, log } = require('./db');
const { makeEngine, parseJson } = require('./engine');
const P = require('./prompts');
const { buildArtifact, ICONS } = require('./artifacts');

const sleep = ms => new Promise(r => setTimeout(r, ms));

class Orchestrator {
  constructor(io) {
    this.io = io;
    this.active = new Map();          // taskId -> true (đang chạy)
    this.engine = makeEngine(
      () => getSetting('engine_kind', 'demo'),
      () => getCredentials().anthropic_api_key || process.env.ANTHROPIC_API_KEY
    );
    setInterval(() => this.tick().catch(e => log('tick error: ' + e.message)), 3000);
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
    const est = this.estimateNext(model);
    if (m.spent_vnd + est > (m.budget_vnd || Infinity)) { this.overBudget(m, 'trần nhiệm vụ'); return false; }
    if (this.todayVnd() + est > getSetting('tran_per_day', 100000)) { this.overBudget(m, 'trần ngày'); return false; }
    return true;
  }

  overBudget(m, why) {
    if (m.status === 'over_budget') return;
    db.prepare("UPDATE tasks SET status='todo' WHERE mission_id=? AND status IN ('doing','submitted','reviewing')").run(m.id);
    this.setMission(m.id, 'over_budget');
    this.chat('coo', `⛔ <b>Nhiệm vụ tạm dừng vì chạm ${why}</b> (đã dùng ${m.spent_vnd.toLocaleString('vi-VN')}đ / trần ${(m.budget_vnd || 0).toLocaleString('vi-VN')}đ). Sếp có thể nâng trần trong Cài đặt rồi bấm "Chạy tiếp", hoặc hủy nhiệm vụ ạ.`, m.id);
    this.setAgent('coo', 'wait', 'Chạm trần chi phí — chờ CEO quyết');
    log(`mission ${m.id} over_budget (${why})`);
  }

  /* ---------- gọi engine có kiểm soát ---------- */
  async llm(kind, { level, agentId, missionId, system, user, ctx }) {
    const model = this.modelFor(level || 'nv');
    if (missionId && !this.budgetOk(missionId, model)) throw new Error('OVER_BUDGET');
    const res = await this.engine.call(kind, { model, system, user, ctx, maxTokens: 4096 });
    this.addCost(missionId, agentId || 'coo', model, res.inputTokens, res.outputTokens);
    return res.text;
  }

  brainSearch(query) {
    const words = (query || '').split(/\s+/).filter(w => w.length > 3).slice(0, 5);
    if (!words.length) return '';
    const like = words.map(() => 'text LIKE ?').join(' OR ');
    const rows = db.prepare(`SELECT text FROM brain_chunks WHERE ${like} LIMIT 3`).all(...words.map(w => `%${w}%`));
    const mems = db.prepare('SELECT kind,text FROM memories ORDER BY id DESC LIMIT 5').all()
      .map(m => `(${m.kind}) ${m.text}`);
    return [...mems, ...rows.map(r => r.text.slice(0, 400))].join('\n');
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
      const text = await this.llm('brief', {
        level: 'coo', agentId: 'coo', missionId,
        system: 'Bạn là AI COO. Chỉ trả về JSON hợp lệ.',
        user: P.briefBack(m.ceo_command, this.dna(), this.brainSearch(m.ceo_command)),
        ctx: { dna: this.dna(), answers: null }
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

  async runPlanning(missionId, answers) {
    const m = this.mission(missionId);
    this.setMission(missionId, 'planning');
    this.typing(true);
    this.setAgent('coo', 'work', 'Chia task · xếp dependency · chọn người phù hợp…');
    const roster = db.prepare(`SELECT a.id,a.dept_id,a.role_title,a.name,a.is_manager FROM agents a
      JOIN departments d ON d.id=a.dept_id WHERE d.enabled=1 AND a.enabled=1 AND a.id!='coo'`).all();
    const rosterTxt = roster.map(r => `${r.id} · ${r.dept_id} · ${r.name} — ${r.role_title}`).join('\n');
    const enabledDepts = [...new Set(roster.map(r => r.dept_id))];
    try {
      let tasks = null;
      for (let attempt = 0; attempt < 2 && !tasks; attempt++) {
        const text = await this.llm('plan', {
          level: 'coo', agentId: 'coo', missionId,
          system: 'Bạn là AI COO. Chỉ trả về JSON hợp lệ.',
          user: P.planWBS(m.ceo_command, answers, this.dna(), rosterTxt) + (attempt ? '\nCHÚ Ý: lần trước JSON lỗi, chỉ trả JSON thuần.' : ''),
          ctx: { dna: this.dna(), enabledDepts, answers }
        });
        try { tasks = parseJson(text).tasks; } catch { tasks = null; }
      }
      if (!tasks || !tasks.length) throw new Error('COO không lập được kế hoạch (JSON lỗi)');
      const validIds = new Set(roster.map(r => r.id));
      const managers = Object.fromEntries(roster.filter(r => r.is_manager).map(r => [r.dept_id, r.id]));
      const ins = db.prepare(`INSERT INTO tasks(id,mission_id,dept_id,assignee_id,reviewer_id,title,brief,deps_json,status,review_round,real_action_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,0,?,?)`);
      const created = [];
      const idMap = {};
      tasks.slice(0, 12).forEach((t, i) => {
        if (!validIds.has(t.assignee_id)) return;
        const tid = uid('t');
        idMap[t.id || `t${i + 1}`] = tid; idMap[String(i)] = tid;
        const reviewer = validIds.has(t.reviewer_id) ? t.reviewer_id : (managers[t.dept_id] || t.assignee_id);
        ins.run(tid, missionId, t.dept_id, t.assignee_id, reviewer, String(t.title).slice(0, 120),
          JSON.stringify(t.brief || {}), JSON.stringify(t.deps || []), 'todo',
          t.real_action ? JSON.stringify(t.real_action) : null, now());
        created.push({ tid, t });
      });
      // map deps sang id thật
      for (const { tid, t } of created) {
        const deps = (t.deps || []).map(d => idMap[d]).filter(Boolean);
        db.prepare('UPDATE tasks SET deps_json=? WHERE id=?').run(JSON.stringify(deps), tid);
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
        this.active.set(t.id, true);
        this.runTask(t).catch(e => {
          log(`task ${t.id} crash: ${e.stack || e.message}`);
          this.active.delete(t.id);
        }).finally(() => this.checkMissionDone(t.mission_id));
      }
      this.checkMissionDone(m.id);
    }
  }

  /* ---------- TASK lifecycle (5.2) ---------- */
  async runTask(task) {
    const nguong = getSetting('nguong_diem', 90);
    const maxRounds = getSetting('max_review_rounds', 3);
    const nv = this.agent(task.assignee_id);
    const tp = this.agent(task.reviewer_id);
    const brief = JSON.parse(task.brief || '{}');
    const dna = this.dna();

    this.setTask(task, 'doing');
    this.packet(tp.id, nv.id, 'gold');
    this.setAgent(nv.id, 'think', `Nhận brief: ${task.title}`);
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
          level: 'nv', agentId: nv.id, missionId: task.mission_id,
          system: P.agentSystem(nv, dna, this.skillTextFor(nv), this.brainSearch(task.title + ' ' + (brief.muc_tieu || ''))),
          user: P.execute(brief, feedback, round + 1),
          ctx: { dna, task, round }
        }));
      } catch (e) {
        if (e.message === 'OVER_BUDGET') { this.active.delete(task.id); return; }
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
          ctx: { dna, task, round }
        }));
        rev = parseJson(revText);
      } catch (e) {
        if (e.message === 'OVER_BUDGET') { this.active.delete(task.id); return; }
        rev = { score: nguong, feedback_chi_tiet: '(review lỗi kỹ thuật — chấp nhận tạm với ngưỡng tối thiểu)' };
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
          [{ key: 'accept', label: `✔ Chấp nhận bản hiện tại (${score}đ, có ghi chú)` }, { key: 'drop', label: '✖ Hủy nhánh này' }],
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
    const art = await buildArtifact({ title: task.title, content: output, format: brief.format_dau_ra || 'docx', version });
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
    }
    setTimeout(() => this.setAgent(nv.id, 'idle'), 2500);
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
  async decideApproval(approvalId, decision, note) {
    const ap = db.prepare('SELECT * FROM approvals WHERE id=?').get(approvalId);
    if (!ap || ap.status !== 'pending') return { ok: false, error: 'Approval không tồn tại hoặc đã quyết' };
    const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(ap.task_id);
    const st = decision === 'reject' || decision === 'drop' ? 'rejected' : (decision === 'edited' ? 'edited' : 'approved');
    db.prepare('UPDATE approvals SET status=?, decided_at=? WHERE id=?').run(st, now(), approvalId);
    this.emit('approval.update', { approvalId, status: st });

    if (ap.type === 'real_action') {
      if (st === 'approved' || st === 'edited') {
        this.setTask(task, 'done');
        db.prepare('UPDATE tasks SET done_at=? WHERE id=?').run(now(), task.id);
        this.taskEvent(task.id, 'coo', 'real_action', { approvalId, action: ap.action_json, executed: true, mode: 'mock' });
        db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,?,?)')
          .run('decision', `CEO đã duyệt: ${ap.title}${note ? ' — ghi chú: ' + note : ''}`, ap.mission_id, now());
        this.setAgent('coo', 'work', 'CEO đã duyệt — chuyển lệnh cho kênh MCP (mô phỏng)');
        this.emit('toast', { title: '✅ Đã thực hiện (mô phỏng MCP)', body: ap.title, cls: '' });
      } else if (note && note.trim()) {
        // từ chối KÈM LÝ DO → task quay lại NV làm lại theo góp ý CEO (chương 9.3)
        const brief = JSON.parse(task.brief || '{}');
        brief.ceo_feedback = note.trim();
        db.prepare('UPDATE tasks SET brief=?, status=? WHERE id=?').run(JSON.stringify(brief), 'todo', task.id);
        this.setTask(task, 'todo');
        this.chat('coo', `Dạ, em chuyển lại cho ${esc(this.agent(task.assignee_id).name)} sửa "<b>${esc(task.title)}</b>" theo góp ý của sếp: <i>${esc(note)}</i>`, ap.mission_id);
        this.setMission(ap.mission_id, 'running');
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
      } else {
        this.setTask(task, 'done');
        db.prepare('UPDATE tasks SET done_at=? WHERE id=?').run(now(), task.id);
        db.prepare('INSERT INTO memories(kind,text,source_mission,created_at) VALUES(?,?,?,?)')
          .run('decision', `CEO chấp nhận "${task.title}" điểm ${task.score} (dưới ngưỡng, có ghi chú)`, ap.mission_id, now());
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
    const rows = db.prepare('SELECT status FROM tasks WHERE mission_id=?').all(missionId);
    if (!rows.length) return;
    const activeStates = ['todo', 'doing', 'submitted', 'reviewing', 'rejected'];
    const anyActive = rows.some(r => activeStates.includes(r.status)) || [...this.active.keys()].some(tid => {
      const t = db.prepare('SELECT mission_id FROM tasks WHERE id=?').get(tid); return t && t.mission_id === missionId;
    });
    if (anyActive) { if (m.status === 'waiting_approval') this.setMission(missionId, 'running'); return; }
    const anyWaiting = rows.some(r => r.status === 'waiting_approval');
    if (anyWaiting) { if (m.status !== 'waiting_approval') this.setMission(missionId, 'waiting_approval'); return; }
    // tất cả done/failed → báo cáo
    if (m.status !== 'reporting') this.runReport(missionId).catch(e => log('report err: ' + e.message));
  }

  async runReport(missionId) {
    const m = this.mission(missionId);
    if (m.status === 'reporting' || m.status === 'done') return;
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
        level: 'coo', agentId: 'coo', missionId,
        system: 'Bạn là AI COO báo cáo cho CEO. Chỉ trả về HTML đơn giản.',
        user: P.report(m, tasks.map(t => `"${t.title}" [${t.status}${t.score ? ' ' + t.score + 'đ' : ''}]`).join('; '),
          arts.map(a => a.name).join('; '), this.mission(missionId).spent_vnd),
        ctx: { doneCount: tasks.filter(t => t.status === 'done').length, avgScore: avg, costVnd: this.mission(missionId).spent_vnd }
      });
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
  }

  /* Chạy tiếp mission over_budget sau khi CEO nâng trần */
  resumeMission(missionId, newBudget) {
    const m = this.mission(missionId);
    if (!m) return { ok: false };
    if (newBudget) db.prepare('UPDATE missions SET budget_vnd=? WHERE id=?').run(newBudget, missionId);
    if (['over_budget', 'paused'].includes(m.status)) {
      this.setMission(missionId, 'running');
      this.chat('coo', `▶ Em chạy tiếp nhiệm vụ "<b>${esc(m.title)}</b>" theo trần mới ạ.`, missionId);
      this.tick();
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
    const rows = db.prepare("SELECT * FROM missions WHERE status IN ('running','planning','reporting')").all();
    for (const m of rows) {
      db.prepare("UPDATE tasks SET status='todo' WHERE mission_id=? AND status IN ('doing','submitted','reviewing')").run(m.id);
      if (m.status === 'planning') { db.prepare("UPDATE missions SET status='briefing' WHERE id=?").run(m.id); this.runPlanning(m.id, null).catch(() => {}); }
      else db.prepare("UPDATE missions SET status='running' WHERE id=?").run(m.id);
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
