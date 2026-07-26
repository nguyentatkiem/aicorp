'use strict';
/* AICORP client — kết nối backend thật qua REST + socket.io, hình ảnh bám 1-1 file demo */

const $ = s => document.querySelector(s);
const el = html => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const vnd = n => (n || 0).toLocaleString('vi-VN') + 'đ';
const api = (p, opt) => fetch('/api' + p, opt ? { headers: { 'Content-Type': 'application/json' }, ...opt } : undefined).then(r => r.json());
const post = (p, body) => api(p, { method: 'POST', body: JSON.stringify(body || {}) });

let STATE = null, ORG = null, AGENTS = {}, POS = {}, LINES = {}, feed = [], currentDetail = null;
let activeMission = null, mode = 'ask';

/* ================= KHỞI ĐỘNG ================= */
async function init() {
  STATE = await api('/state');
  if (!STATE.onboarded) { showWizard(); return; }
  boot();
}

async function boot() {
  $('#coname').textContent = STATE.company.name;
  $('#coava').textContent = '🌿';
  $('#ceoname').textContent = 'CEO ' + (STATE.company.name.split(' ').slice(-1)[0] || '');
  $('#enginename').textContent = STATE.engine.kind === 'api' ? 'Claude API' : (STATE.engine.kind === 'sub' ? 'Gói Sub' : 'Demo');
  ORG = await api('/org');
  buildOrg();
  applyView(false);
  connectSocket();
  await Promise.all([loadChats(), refreshTasks(), refreshStats(), refreshMission()]);
  bindUI();
  showMission();
  refreshInitiativeBadge();
  refreshCRMBadge();
  setInterval(refreshStats, 15000);
  setInterval(refreshInitiativeBadge, 30000);
  setInterval(refreshCRMBadge, 45000);
  setInterval(ambient, 7000);
}

/* ================= SƠ ĐỒ SỐNG ================= */
const canvas = () => $('#orgcanvas'), svg = () => $('#orgsvg');
const NODE_W = 150, NODE_H = 54, ROW_GAP = 70, DEPT_W = 174, DEPT_GAP = 14;

function makeNode(a, x, y, extraCls) {
  const n = el(`<div class="node st-idle ${extraCls || ''}" id="node-${a.id}" style="left:${x}px;top:${y}px">
    <div class="thinkdots"><i></i><i></i><i></i></div>
    <div class="qbadge">?</div>
    <div class="nscore"></div>
    <div class="nrow">
      <div class="nava">${a.ava}<span class="sdot"></span></div>
      <div><div class="nname">${esc(a.name)}</div><div class="nrole">${esc(a.role)}</div></div>
    </div>
    <div class="nlog"></div>
  </div>`);
  n.addEventListener('click', e => { e.stopPropagation(); showAgent(a.id); });
  canvas().appendChild(n);
  POS[a.id] = { x, y, w: extraCls ? (extraCls.includes('ceo') ? 170 : 180) : NODE_W, h: NODE_H };
  AGENTS[a.id] = { el: n, ...a, logs: [], state: 'idle' };
}

function buildOrg() {
  canvas().querySelectorAll('.node,.dept,.packet').forEach(n => n.remove());
  svg().innerHTML = ''; POS = {}; AGENTS = {}; LINES = {};
  const depts = ORG.depts;
  const totalW = depts.length * (DEPT_W + DEPT_GAP) - DEPT_GAP;
  const canvasW = Math.max(1200, totalW + 200);
  const maxMembers = Math.max(...depts.map(d => ORG.agents.filter(a => a.dept_id === d.id).length), 3);
  canvas().style.width = canvasW + 'px';
  canvas().style.height = (300 + maxMembers * ROW_GAP + 120) + 'px';

  const ceoName = 'CEO ' + (STATE.company.name.split(' ').slice(-1)[0] || 'của bạn');
  makeNode({ id: 'ceo', ava: '👤', name: ceoName, role: 'Người thật duy nhất · ra lệnh & duyệt' }, canvasW / 2 - 85, 18, 'ceo-node');
  const coo = ORG.agents.find(a => a.id === 'coo');
  makeNode({ id: 'coo', ava: coo?.ava || '🤖', name: 'AI COO', role: 'Điều phối · giao việc · tổng hợp' }, canvasW / 2 - 90, 108, 'coo-node');

  const startX = (canvasW - totalW) / 2, deptY = 232;
  depts.forEach((d, i) => {
    const members = ORG.agents.filter(a => a.dept_id === d.id).sort((a, b) => (b.is_manager ? 1 : 0) - (a.is_manager ? 1 : 0));
    const dx = startX + i * (DEPT_W + DEPT_GAP);
    const h = 44 + members.length * ROW_GAP + 4;
    const box = el(`<div class="dept" id="dept-${d.id}" style="left:${dx}px;top:${deptY}px;width:${DEPT_W}px;height:${h}px">
      <div class="dh" style="color:${d.color}">${d.emoji} ${esc(d.name)}<span class="load" id="load-${d.id}">nghỉ</span></div>
      <div class="bar" id="bar-${d.id}" style="width:0%;background:${d.color}"></div>
    </div>`);
    canvas().appendChild(box);
    members.forEach((m, j) => makeNode({ ...m, deptId: d.id }, dx + 12, deptY + 44 + j * ROW_GAP));
  });
  drawLines(depts);
}

function center(id) { const p = POS[id]; return { x: p.x + p.w / 2, y: p.y + p.h / 2 }; }
function bottomOf(id) { const p = POS[id]; return { x: p.x + p.w / 2, y: p.y + p.h + 2 }; }
function topOf(id) { const p = POS[id]; return { x: p.x + p.w / 2, y: p.y - 2 }; }
function pathVia(pts) { return 'M' + pts.map(p => `${p.x} ${p.y}`).join(' L '); }
function addLine(a, b, pts) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', pathVia(pts));
  svg().appendChild(p);
  // vùng bấm rộng vô hình — bấm đường nối xem lần bàn giao gần nhất (đặc tả 7.4)
  const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hit.setAttribute('d', pathVia(pts));
  // inline style để thắng CSS '#orgsvg path' (CSS đè presentation attribute)
  hit.style.stroke = 'transparent';
  hit.style.strokeWidth = '12';
  hit.style.fill = 'none';
  hit.style.filter = 'none';
  hit.style.pointerEvents = 'stroke';
  hit.style.cursor = 'pointer';
  hit.addEventListener('click', e => { e.stopPropagation(); showHandoff(a, b); });
  svg().appendChild(hit);
  LINES[a + '>' + b] = { el: p, pts };
}

/* Bấm đường nối → chi tiết lần bàn giao gần nhất giữa 2 agent */
async function showHandoff(a, b) {
  const tasks = await api('/tasks');
  const t = tasks.find(x => [x.assignee_id, x.reviewer_id].includes(b) || [x.assignee_id, x.reviewer_id].includes(a));
  if (t) showTaskDetail(t.id);
  else toast('🔗 Chưa có bàn giao', 'Đường nối này chưa có lần giao việc nào trong các nhiệm vụ gần đây', 'amber');
}
function drawLines(depts) {
  addLine('ceo', 'coo', [bottomOf('ceo'), topOf('coo')]);
  const busY = 210;
  depts.forEach(d => {
    const members = ORG.agents.filter(a => a.dept_id === d.id).sort((a, b) => (b.is_manager ? 1 : 0) - (a.is_manager ? 1 : 0));
    if (!members.length) return;
    const tp = members[0].id;
    addLine('coo', tp, [bottomOf('coo'), { x: bottomOf('coo').x, y: busY }, { x: topOf(tp).x, y: busY }, topOf(tp)]);
    const railX = POS[tp].x - 7;
    for (let j = 1; j < members.length; j++) {
      const cur = members[j].id;
      addLine(tp, cur, [{ x: POS[tp].x, y: center(tp).y }, { x: railX, y: center(tp).y }, { x: railX, y: center(cur).y }, { x: POS[cur].x, y: center(cur).y }]);
    }
  });
}
function lineKey(a, b) { return LINES[a + '>' + b] ? a + '>' + b : (LINES[b + '>' + a] ? b + '>' + a : null); }

function sendPacket(from, to, color, dur) {
  if (!POS[from] || !POS[to]) return;
  dur = dur || 900;
  const key = lineKey(from, to);
  let pts;
  if (key) {
    pts = LINES[key].pts.slice(); if (key.startsWith(to + '>')) pts.reverse();
    LINES[key].el.classList.add('hot'); setTimeout(() => LINES[key].el.classList.remove('hot'), dur + 300);
  } else pts = [center(from), center(to)];
  const pk = el(`<div class="packet ${color || 'gold'}"></div>`);
  canvas().appendChild(pk);
  const total = pts.reduce((s, p, i) => i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0, 0);
  const t0 = performance.now();
  function step(t) {
    let k = Math.min(1, (t - t0) / dur), dist = k * total, acc = 0, x = pts[0].x, y = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (acc + seg >= dist) { const r = (dist - acc) / seg; x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r; y = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r; break; }
      acc += seg; x = pts[i].x; y = pts[i].y;
    }
    pk.style.left = x + 'px'; pk.style.top = y + 'px';
    if (k < 1) requestAnimationFrame(step); else pk.remove();
  }
  requestAnimationFrame(step);
}

const STATES = ['idle', 'think', 'work', 'review', 'wait', 'done'];
function setState(id, st, logLine, cls) {
  const a = AGENTS[id]; if (!a) return;
  STATES.forEach(s => a.el.classList.remove('st-' + s));
  a.el.classList.add('st-' + st);
  a.state = st;
  if (st === 'done') { a.el.classList.remove('flash'); void a.el.offsetWidth; a.el.classList.add('flash'); }
  if (logLine) pushLog(id, logLine, cls || (st === 'think' ? 'v' : st === 'review' ? 'a' : st === 'wait' ? 'r' : 'g'));
  updateCounters(); updateDeptLoads();
  if (follow && ['think', 'work', 'review', 'wait'].includes(st)) focusNode(id);
  if (currentDetail === id) showAgent(id);
}
function pushLog(id, text, cls) {
  const a = AGENTS[id]; if (!a) return;
  const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  a.logs.push({ time, text, cls: cls || 'g' });
  if (a.logs.length > 40) a.logs.shift();
  const lg = a.el.querySelector('.nlog'); if (lg) lg.textContent = '» ' + text;
  feed.push({ time, who: a.name, ava: a.ava, text }); if (feed.length > 30) feed.shift();
  if (currentDetail === id) showAgent(id);
  if (currentDetail === null) showMission();
}
function showScore(id, score, pass) {
  const a = AGENTS[id]; if (!a) return;
  const s = a.el.querySelector('.nscore');
  s.textContent = score + '/100 ' + (pass ? '✔' : '✘');
  s.className = 'nscore show ' + (pass ? 'pass' : 'fail');
  setTimeout(() => s.classList.remove('show'), 3200);
}
function updateCounters() {
  const n = Object.values(AGENTS).filter(a => ['think', 'work', 'review'].includes(a.state)).length;
  $('#activeagents').textContent = n;
}
function updateDeptLoads() {
  (ORG.depts || []).forEach(d => {
    const members = ORG.agents.filter(a => a.dept_id === d.id);
    const busy = members.filter(m => AGENTS[m.id] && ['think', 'work', 'review'].includes(AGENTS[m.id].state)).length;
    const lo = $('#load-' + d.id), bar = $('#bar-' + d.id);
    if (!lo) return;
    lo.textContent = busy ? busy + ' đang chạy' : 'nghỉ';
    bar.style.width = (busy / Math.max(members.length, 1) * 100) + '%';
  });
}

/* ---------- PAN / ZOOM / CAMERA ---------- */
let vx = -80, vy = -40, vz = 0.92, follow = true;
function applyView(smooth) {
  canvas().style.transition = smooth ? 'transform .8s cubic-bezier(.4,0,.2,1)' : 'none';
  canvas().style.transform = `translate(${vx}px,${vy}px) scale(${vz})`;
}
function focusNode(id) {
  if (!POS[id]) return;
  const c = center(id), r = $('#orgwrap').getBoundingClientRect();
  vx = r.width / 2 - c.x * vz; vy = r.height / 2 - c.y * vz - 30;
  applyView(true);
}

/* ================= CHAT ================= */
function chatMsg(role, html) {
  const who = role === 'ceo' ? ($('#ceoname').textContent || 'CEO') : role === 'coo' ? 'AI COO' : 'Hệ thống';
  const m = el(`<div class="msg ${role}"><div class="who">${esc(who)}</div>${html}</div>`);
  $('#msgs').appendChild(m);
  m.querySelectorAll('.filelink').forEach(f => f.addEventListener('click', () => {
    const id = f.dataset.art; if (id) window.open('/api/artifacts/' + id + '/file');
    else switchScreen('factory');
  }));
  $('#msgs').scrollTop = $('#msgs').scrollHeight;
  return m;
}
let typingEl = null;
function cooTyping(on) {
  if (on && !typingEl) {
    typingEl = el('<div class="typing"><i></i><i></i><i></i></div>');
    $('#msgs').appendChild(typingEl); $('#msgs').scrollTop = $('#msgs').scrollHeight;
    $('#coostatus').textContent = '● Đang soạn…';
  }
  if (!on && typingEl) { typingEl.remove(); typingEl = null; $('#coostatus').textContent = '● Sẵn sàng nhận lệnh'; }
}
async function loadChats() {
  const rows = await api('/chats');
  $('#msgs').innerHTML = '';
  if (!rows.length) {
    const sg = await api('/suggestions').catch(() => null);
    const chips = sg && sg.suggestions ? sg.suggestions.map(s =>
      `<span class="filelink sugchip" data-sug="${esc(s)}">💡 ${esc(s)}</span>`).join('') : '';
    const m = chatMsg('coo', `Chào sếp! Em là AI COO của <b>${esc(STATE.company.name)}</b>. Cả công ty đã sẵn sàng — sếp giao nhiệm vụ đầu tiên nhé. Em gợi ý 3 việc hợp ngành mình:<br>${chips}`);
    m.querySelectorAll('.sugchip').forEach(c => c.addEventListener('click', () => {
      $('#ceoinput').value = c.dataset.sug; $('#ceoinput').focus();
    }));
  }
  rows.forEach(r => chatMsg(r.role, r.html));
}
async function sendCEO() {
  const inp = $('#ceoinput'); const v = inp.value.trim(); if (!v) return;
  inp.value = '';
  const res = await post('/chat', { text: v, mode });
  if (!res.ok) toast('⚠️ Lỗi', res.error || 'Không gửi được', 'red');
}

/* ================= DETAIL PANEL ================= */
async function refreshMission() { activeMission = await api('/missions/active'); }
function showMission() {
  currentDetail = null;
  $('#detailtitle').innerHTML = `🎯 Nhiệm vụ đang chạy <button style="margin-left:auto;color:var(--muted);font-size:11px" onclick="showMissionHistory()">📜 Lịch sử</button>`;
  const m = activeMission;
  const stMap = { briefing: 'Đang hỏi lại CEO', planning: 'Đang lập kế hoạch', running: 'Đang chạy', waiting_approval: 'Chờ CEO duyệt', reporting: 'Đang viết báo cáo', done: '✅ Hoàn thành', failed: '❌ Lỗi', over_budget: '⛔ Chạm trần chi phí', paused: '⏸ Tạm dừng' };
  const feedHtml = feed.slice(-12).reverse().map(f => `<div class="ln">[${f.time}] ${f.ava} <b style="color:var(--text)">${esc(f.who)}</b>: ${esc(f.text)}</div>`).join('') || '<div class="ln">Chưa có hoạt động…</div>';
  if (!m) {
    $('#detailbody').innerHTML = `<div class="dp-card"><div style="font-weight:800;font-size:14px">Chưa có nhiệm vụ nào</div>
      <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Giao việc cho AI COO ở khung chat bên trái để công ty bắt đầu chạy.</div></div>
      <div class="dp-card"><h4>Diễn biến trực tiếp</h4><div class="livelog">${feedHtml}</div></div>`;
    return;
  }
  const resumeBtn = ['over_budget', 'paused'].includes(m.status)
    ? `<button class="btn jade" style="margin-top:9px;width:100%" onclick="resumeMission('${m.id}')">▶ Chạy tiếp</button>` : '';
  $('#detailbody').innerHTML = `
   <div class="dp-card">
     <div style="font-weight:800;font-size:14px">🎯 ${esc(m.title)}</div>
     <div style="font-size:11px;color:var(--muted);margin-top:3px">${stMap[m.status] || m.status} · chế độ: ${m.mode === 'go' ? 'Cứ làm đi' : 'Hỏi kỹ trước khi làm'}</div>
     <div class="mission-prog"><i style="width:${m.progress || 0}%"></i></div>
     <div style="font-size:11px;color:var(--muted)">${m.progress || 0}% · ${m.taskCount || 0} đầu việc</div>
     ${resumeBtn}
   </div>
   <div class="dp-card"><h4>Thống kê</h4>
     <div class="stat-row"><span>Task hoàn thành</span><b>${m.doneCount || 0}/${m.taskCount || 0}</b></div>
     <div class="stat-row"><span>Vòng review đã chạy</span><b>${m.reviewCount || 0}</b></div>
     <div class="stat-row"><span>Bị trả lại làm lại</span><b>${m.rejectedCount || 0} lần</b></div>
     <div class="stat-row"><span>Chi phí nhiệm vụ</span><b>${vnd(m.spent_vnd)}</b></div>
     <div class="stat-row"><span>Trần nhiệm vụ</span><b>${vnd(m.budget_vnd)}</b></div>
   </div>
   <div class="dp-card"><h4>Diễn biến trực tiếp</h4><div class="livelog">${feedHtml}</div></div>`;
}
window.resumeMission = async id => { await post(`/missions/${id}/resume`); await refreshMission(); showMission(); };
window.showMissionPanel = showMission;

function showAgent(id) {
  const a = AGENTS[id]; if (!a) return;
  currentDetail = id;
  const stName = { idle: '😴 Nghỉ', think: '🧠 Đang suy nghĩ', work: '⚡ Đang làm việc', review: '🔍 Đang review', wait: '🔔 Chờ CEO duyệt', done: '✅ Vừa hoàn thành' }[a.state];
  $('#detailtitle').innerHTML = `👤 Hồ sơ agent <button style="margin-left:auto;color:var(--muted);font-size:11px" onclick="currentDetail=null;showMissionPanel()">← Về nhiệm vụ</button>`;
  const info = ORG.agents.find(x => x.id === id) || {};
  $('#detailbody').innerHTML = `
   <div class="dp-card agent-prof">
     <div class="ap-top"><div class="ap-ava">${a.ava}</div>
       <div><div class="ap-name">${esc(a.name)}</div><div class="ap-role">${esc(a.role || '')}</div>
       <div style="font-size:11px;margin-top:3px;color:var(--amber)">${stName}</div></div></div>
     <div class="kpi-grid">
       <div class="kpi"><b>${info.tasks_done || 0}</b><span>task xong</span></div>
       <div class="kpi"><b style="color:var(--jade)">${info.avg_score ? info.avg_score.toFixed(1) : '—'}</b><span>điểm TB</span></div>
       <div class="kpi"><b>${Math.round((info.rejected_rate || 0) * 100)}%</b><span>bị trả lại</span></div>
     </div>
   </div>
   <div class="dp-card"><h4>Nhật ký suy nghĩ (live)</h4>
     <div class="livelog">${a.logs.slice(-14).reverse().map(l => `<div class="ln ${l.cls}">[${l.time}] ${esc(l.text)}</div>`).join('') || '<div class="ln">Chưa có hoạt động trong phiên này.</div>'}</div>
   </div>
   ${info.skills && info.skills.length ? `<div class="dp-card"><h4>Skill được gắn</h4>${info.skills.map(s => `<span class="chip">🧩 ${esc(s)}</span>`).join('')}</div>` : ''}
   ${id !== 'ceo' ? `<div class="dp-card"><h4>Thao tác của CEO</h4>
     <div class="dp-actions">
       <button onclick="openDM('${id}')">💬 Nhắn riêng</button>
       <button onclick="switchScreen('factory')">📁 Xem file</button>
       <button onclick="openAgentEdit('${id}')">✏️ Sửa kỹ năng</button>
       ${id !== 'coo' ? `<button style="color:var(--red);border-color:var(--red)" onclick="toggleAgentEnabled('${id}')">⏸ Tạm dừng</button>` : ''}
     </div>
   </div>` : ''}`;
}

/* ================= KANBAN + TIMELINE ================= */
const KCOLS = [
  { id: 'todo', name: '⏳ Chờ làm' }, { id: 'doing', name: '⚡ Đang làm' },
  { id: 'review', name: '🔍 Đang review' }, { id: 'wait', name: '🔔 Chờ CEO' }, { id: 'done', name: '✅ Hoàn thành' }
];
const COLMAP = { todo: 'todo', doing: 'doing', submitted: 'review', reviewing: 'review', rejected: 'doing', waiting_approval: 'wait', done: 'done', failed: 'done' };
let TASKS = [];
async function refreshTasks() {
  await refreshMission();
  TASKS = activeMission ? await api('/tasks?mission=' + activeMission.id) : [];
  renderKanban(); renderTimeline(); updateMissionBar();
}
function deptOf(id) { return (ORG.depts || []).find(d => d.id === id) || { name: id, color: '#93A0BC' }; }
function agentAva(id) { const a = ORG.agents.find(x => x.id === id); return a ? a.ava : '🤖'; }
function renderKanban() {
  $('#kanban').innerHTML = KCOLS.map(c => {
    const cards = TASKS.filter(t => COLMAP[t.status] === c.id);
    return `<div class="kcol"><div class="kh">${c.name}<span class="cnt">${cards.length}</span></div>
     <div class="kbody">${cards.map(t => `
      <div class="kcard ${['doing', 'reviewing'].includes(t.status) ? 'hot' : ''}" onclick="showTaskDetail('${t.id}')">
        <div class="kt">${t.status === 'failed' ? '⚠️ ' : ''}${esc(t.title)}</div>
        <div class="km"><span class="kdept" style="background:${deptOf(t.dept_id).color}22;color:${deptOf(t.dept_id).color}">${esc(deptOf(t.dept_id).name.replace('P. ', ''))}</span>
        ${t.score ? `<span class="kscore">${t.score}/100</span>` : ''}
        ${t.review_round > 1 ? `<span style="color:var(--red)">vòng ${t.review_round}</span>` : ''}
        <span class="kava">${agentAva(t.assignee_id)}</span></div>
      </div>`).join('')}</div></div>`;
  }).join('');
}
function renderTimeline() {
  if (!activeMission || !TASKS.length) { $('#timeline').innerHTML = '<div class="tl-sub" style="padding:20px">Chưa có nhiệm vụ.</div>'; return; }
  // Trục thời gian THẬT: từ lúc mission bắt đầu đến max(done_at, bây giờ)
  const stProg = { todo: 0, doing: 45, submitted: 70, reviewing: 80, rejected: 45, waiting_approval: 90, done: 100, failed: 100 };
  const t0 = new Date(activeMission.created_at).getTime();
  const tEnd = Math.max(Date.now(), ...TASKS.map(t => t.done_at ? new Date(t.done_at).getTime() : 0)) + 1000;
  const span = Math.max(tEnd - t0, 60000);
  const fmtDur = ms => ms < 90000 ? Math.round(ms / 1000) + 's' : Math.round(ms / 60000) + ' phút';
  $('#timeline').innerHTML = `<div class="tl-mission">🎯 ${esc(activeMission.title)}</div>
   <div class="tl-sub">${TASKS.length} đầu việc · bắt đầu ${new Date(activeMission.created_at).toLocaleString('vi-VN')} · tổng ${fmtDur(span)}</div>
   <div class="tl-grid">` + TASKS.map(t => {
    const d = deptOf(t.dept_id), prog = stProg[t.status] || 0;
    const s = Math.max(0, (new Date(t.created_at).getTime() - t0) / span * 100);
    const e = ((t.done_at ? new Date(t.done_at).getTime() : tEnd) - t0) / span * 100;
    const w = Math.max(e - s, 6);
    return `<div class="tl-row"><div class="tl-label" title="${esc(t.title)}">${esc(t.title)}</div>
    <div class="tl-track" onclick="showTaskDetail('${t.id}')" style="cursor:pointer"><div class="tl-bar" style="left:${s}%;width:${Math.min(w, 100 - s)}%;background:${d.color}26;border:1px solid ${d.color}88;color:${d.color}">
      <div style="position:absolute;inset:0;width:${prog}%;background:${d.color}33;border-radius:5px"></div>
      <span style="position:relative">${t.status === 'done' ? '✅ ' : ''}${prog}%${t.score ? ' · ' + t.score + 'đ' : ''}</span></div></div></div>`;
  }).join('') + '</div>';
}
function updateMissionBar() {
  const bar = $('#missionbar');
  if (activeMission && !['done', 'failed'].includes(activeMission.status)) {
    bar.style.display = 'flex';
    $('#mbtitle').textContent = activeMission.title;
    const stMap = { briefing: 'chờ sếp trả lời câu hỏi của COO', planning: 'COO đang lập kế hoạch…', running: 'các phòng đang chạy song song', waiting_approval: 'chờ CEO duyệt trong Hộp phê duyệt', reporting: 'COO đang tổng hợp báo cáo', over_budget: '⛔ chạm trần chi phí', paused: 'tạm dừng' };
    $('#mbstatus').textContent = stMap[activeMission.status] || activeMission.status;
  } else bar.style.display = 'none';
}

/* ================= XƯỞNG SẢN PHẨM ================= */
async function refreshFactory() {
  const rows = await api('/artifacts');
  $('#factorytbl').innerHTML = rows.length ? `<table class="tbl">
   <tr><th>Tên file</th><th>Phòng ban</th><th>Người tạo</th><th>Điểm review</th><th>Phiên bản</th><th>Ngày</th><th></th></tr>` +
    rows.map(r => `<tr><td>${r.icon} ${esc(r.name)}</td>
     <td><span class="ftag" style="background:${r.dept_color || '#93A0BC'}22;color:${r.dept_color || '#93A0BC'}">${esc((r.dept_name || '—').replace('P. ', ''))}</span></td>
     <td>${r.agent_ava || ''} ${esc(r.agent_name || '')}</td>
     <td style="color:var(--jade);font-family:'JetBrains Mono',monospace">${r.score || '—'}/100</td>
     <td>v${r.version}</td>
     <td>${new Date(r.created_at).toLocaleDateString('vi-VN')}</td>
     <td><button class="btn ghost" style="padding:5px 12px" onclick="window.open('/api/artifacts/${r.id}/file')">Xem</button></td></tr>`).join('') + '</table>'
    : '<div style="color:var(--muted);font-size:12.5px">Chưa có file nào. Giao nhiệm vụ cho công ty để bắt đầu sản xuất.</div>';
}

/* ================= HỘP PHÊ DUYỆT ================= */
async function refreshApprovals() {
  const rows = await api('/approvals?status=pending');
  const badge = $('#apbadge');
  badge.style.display = rows.length ? 'flex' : 'none';
  badge.textContent = rows.length;
  $('#aphead').textContent = rows.length + ' việc chờ CEO';
  $('#approvallist').innerHTML = rows.length ? rows.map(r => `
   <div class="appr-card">
     <div class="at">${esc(r.title)} <span class="ftag" style="background:rgba(246,168,33,.12);color:var(--amber)">${r.type === 'real_action' ? 'Hành động thật' : 'Quyết định'}${r.task_score ? ' · ' + r.task_score + '/100' : ''}</span></div>
     <div class="actx">${esc(r.context)}</div>
     ${r.preview ? `<div class="preview-box">${esc(r.preview)}</div>` : ''}
     <div style="display:flex;gap:9px;flex-wrap:wrap">
       ${(r.options || []).map(o => {
         const cls = o.key === 'approve' || o.key === 'accept' ? 'jade' : (o.key === 'reject' || o.key === 'drop' ? 'danger' : 'ghost');
         return `<button class="btn ${cls}" onclick="decide('${r.id}','${o.key}')">${esc(o.label)}</button>`;
       }).join('')}
       ${r.type === 'real_action' ? `<button class="btn ghost" onclick="openApprovalEdit('${r.id}','${r.task_id}')">✏️ Sửa rồi duyệt</button>` : ''}
     </div>
   </div>`).join('')
    : '<div class="card" style="color:var(--muted)">✨ Không có việc nào chờ duyệt. Khi agent muốn đăng bài/gửi mail/chi tiền, thẻ phê duyệt sẽ xuất hiện ở đây.</div>';
}
window.decide = async (id, key) => {
  // Giữ NGUYÊN key cho phương án họp (A/B/C) và escalate (retry_strong, accept, drop) — chỉ 'reject' mới hỏi lý do
  const known = ['approve', 'accept', 'drop', 'reject', 'retry_strong'];
  const decision = known.includes(key) ? key : key;   // A/B/C và mọi option key khác → gửi nguyên
  let note = null;
  if (decision === 'reject') note = prompt('Lý do từ chối (để nhân viên rút kinh nghiệm):') || '';
  await post(`/approvals/${id}/decide`, { decision, note });
  refreshApprovals(); refreshTasks(); refreshInitiativeBadge();
};

/* ================= NHÂN SỰ ================= */
async function refreshHR() {
  const rows = await api('/agents');
  $('#hrsub').textContent = `${rows.length} agent · ${new Set(rows.map(r => r.dept)).size} phòng ban đang bật.`;
  const lvName = { coo: 'Opus', tp: 'Sonnet', nv: 'Haiku' };
  const lvColor = { coo: 'var(--amber)', tp: 'var(--amber)', nv: 'var(--cyan)' };
  $('#hrtbl').innerHTML = `<table class="tbl">
   <tr><th>Agent</th><th>Phòng</th><th>Model</th><th>Task xong</th><th>Điểm TB</th><th>Tỷ lệ bị trả lại</th><th>Trạng thái</th><th>Thao tác</th></tr>` +
    rows.map(a => {
      const st = AGENTS[a.id] ? AGENTS[a.id].state : 'idle';
      const stTxt = { idle: '😴 Nghỉ', think: '<span class="dot live"></span> Đang suy nghĩ', work: '<span class="dot live"></span> Đang làm', review: '<span class="dot amber"></span> Đang review', wait: '🔔 Chờ CEO', done: '✅ Vừa xong' }[st];
      const rr = Math.round((a.rejected_rate || 0) * 100);
      return `<tr><td style="cursor:pointer" onclick="showAgentOrOpen('${a.id}')">${a.ava} <b>${esc(a.name)}</b> — ${esc(a.role)}</td><td>${esc(a.dept)}</td>
      <td><span class="ftag" style="background:rgba(246,168,33,.12);color:${lvColor[a.level] || 'var(--cyan)'}">${lvName[a.level] || a.level}</span></td>
      <td>${a.tasks_done}</td>
      <td style="font-family:'JetBrains Mono',monospace;color:var(--jade)">${a.avg_score ? a.avg_score.toFixed(1) : '—'}</td>
      <td>${rr > 15 ? rr + '% ⚠️' : (rr ? rr + '%' : '—')}</td><td>${stTxt}</td>
      <td style="white-space:nowrap">
        ${a.id !== 'coo' ? `<button class="btn ghost" style="padding:4px 9px;font-size:11px" onclick="openAgentEdit('${a.id}')">✏️</button>` : ''}
        ${rr > 15 && a.id !== 'coo' ? `<button class="btn ghost" style="padding:4px 9px;font-size:11px;color:var(--amber);border-color:var(--amber)" onclick="openAgentEdit('${a.id}', true)">🎓 Đào tạo lại</button>` : ''}
        ${a.id !== 'coo' ? `<button class="btn ghost" style="padding:4px 9px;font-size:11px" onclick="openDM('${a.id}')">💬</button>` : ''}
      </td></tr>`;
    }).join('') + '</table>';
}
window.showAgentOrOpen = id => { if (AGENTS[id]) { switchScreen('home'); showAgent(id); focusNode(id); } };

/* ================= BRAIN ================= */
async function refreshBrain() {
  const b = await api('/brain');
  const dna = b.dna || {};
  const kindTag = { decision: ['Quyết định CEO', 'var(--amber)'], lesson: ['Bài học', 'var(--jade)'], fact: ['Ghi nhớ', 'var(--cyan)'], contact: ['Khách quen', 'var(--violet)'] };
  $('#dnabody').innerHTML = `
   <div class="stat-row"><span>Công ty</span><b>${esc(dna.company?.name || '—')}</b></div>
   <div class="stat-row"><span>Ngành</span><b>${esc(dna.company?.industry || '—')}</b></div>
   <div class="stat-row"><span>Sản phẩm chủ lực</span><b>${esc((dna.products || []).map(p => p.name).join(', ') || '—')}</b></div>
   <div class="stat-row"><span>Khách mục tiêu</span><b>${esc(dna.customers?.profile || '—')}</b></div>
   <div class="stat-row"><span>Kênh bán</span><b>${esc((dna.customers?.channels || []).join(' · ') || '—')}</b></div>
   <div class="stat-row"><span>Giọng thương hiệu</span><b>${esc((dna.voice?.traits || []).join(' + '))} · ${esc(dna.voice?.address || '')}</b></div>
   <div class="stat-row"><span>Điều cấm</span><b style="color:var(--red)">${esc((dna.voice?.banned || []).join('; ') || '—')}</b></div>
   <div class="stat-row"><span>Mục tiêu 3 tháng</span><b>${esc(dna.goal_3m || '—')}</b></div>`;
  $('#braindocs').innerHTML = (b.docs.length ? b.docs.map(d => `
   <div class="setrow"><div class="sl"><b>📄 ${esc(d.name)}</b><span>${d.chunks ? `Đã index · ${d.chunks} đoạn — agent tra cứu được` : 'Đã lưu (chưa trích text)'}</span></div>
   <span class="ftag" style="background:rgba(49,201,126,.12);color:var(--jade)">Sẵn sàng</span></div>`).join('')
    : '<div style="color:var(--muted);font-size:12px">Kéo file bảng giá / catalogue / quy trình (.txt .md .csv) vào đây để agent tra cứu khi làm việc.</div>');
  $('#memlist').innerHTML = b.memories.length ? b.memories.map(m => {
    const [label, color] = kindTag[m.kind] || ['Ghi chú', 'var(--muted)'];
    return `<div class="setrow"><div class="sl"><b style="color:${color}">${label} · ${new Date(m.created_at).toLocaleDateString('vi-VN')}</b><span>${esc(m.text)}</span></div></div>`;
  }).join('') : '<div style="color:var(--muted);font-size:12px">Bộ nhớ sẽ tự đầy lên sau mỗi nhiệm vụ và mỗi quyết định của CEO.</div>';
}

/* ================= KẾT NỐI & SKILL ================= */
async function refreshConnect() {
  const st = await api('/settings');
  $('#enginecards').innerHTML = `
   <div class="wopt ${st.engine_kind === 'api' ? 'on' : ''}" onclick="setEngine('api')"><b>🔑 Claude API ${st.engine_kind === 'api' ? '<span class="ftag" style="background:rgba(49,201,126,.12);color:var(--jade);float:right">Đang dùng</span>' : ''}</b>
     Trả theo lượng dùng. Gán model theo cấp bậc: COO dùng Opus, Trưởng phòng Sonnet, Nhân viên Haiku — tối ưu chi phí như trả lương thật.<br>
     <small>${st.hasKey ? '<span style="color:var(--jade)">Đã có key · Kết nối OK</span>' : 'Chưa có key — vào Cài đặt để nhập'}</small></div>
   <div class="wopt ${st.engine_kind === 'demo' ? 'on' : ''}" onclick="setEngine('demo')"><b>🎬 Chế độ Demo ${st.engine_kind === 'demo' ? '<span class="ftag" style="background:rgba(49,201,126,.12);color:var(--jade);float:right">Đang dùng</span>' : ''}</b>
     Chạy thử toàn bộ AI Loop không cần key, không tốn tiền — nội dung mô phỏng. Phù hợp để làm quen giao diện.<br>
     <small>Gói Sub Claude (Pro/Max) qua Agent SDK: sắp ra mắt ở v1</small></div>`;
  const conns = await api('/connections');
  $('#connlist').innerHTML = conns.map(c => `
   <div class="setrow"><div class="sl"><b>${esc(c.name)}</b><span>${esc(c.config?.note || '')}${c.id === 'n8n_webhook' && c.config?.url ? ` · <span style="color:var(--jade)">${esc(c.config.url.slice(0, 40))}</span>` : ''}</span></div>
   ${c.id === 'n8n_webhook' ? `<button class="btn ghost n8nbtn" style="padding:4px 10px;font-size:11px" data-url="${esc(c.config?.url || '')}">⚙ URL</button>` : ''}
   <div class="toggle ${c.enabled ? 'on' : ''}" onclick="toggleConn('${c.id}',this)"></div></div>`).join('');
  document.querySelectorAll('.n8nbtn').forEach(b => b.onclick = () => editN8nUrl(b.dataset.url));
  const skills = await api('/skills');
  $('#skilllist').innerHTML = skills.map(s => `
   <div class="setrow"><div class="sl"><b>🧩 ${esc(s.name)}</b><span>Gắn cho: ${(s.assigned || []).join(', ') || '—'} · ${esc(s.description || '')}</span></div>
   <div class="toggle ${s.enabled ? 'on' : ''}" onclick="toggleSkill('${s.id}',this)"></div></div>`).join('');
}
window.setEngine = async k => { await post('/settings', { engine_kind: k }); STATE.engine.kind = k; $('#enginename').textContent = k === 'api' ? 'Claude API' : 'Demo'; refreshConnect(); toast('⚡ Đã đổi engine', k === 'api' ? 'Claude API — chạy thật' : 'Demo — chạy thử miễn phí'); };
window.editN8nUrl = async cur => {
  const u = prompt('URL webhook n8n (để trống để xóa):', cur || '');
  if (u === null) return;
  const r = await fetch('/api/connections/n8n_webhook', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: u.trim() }) }).then(x => x.json());
  if (r.ok) { toast('🔄 Đã lưu URL n8n', u.trim() || '(đã xóa)'); refreshConnect(); }
  else toast('⚠️', r.error || 'Lỗi', 'red');
};
window.toggleConn = async (id, elx) => { const r = await post(`/connections/${id}/toggle`); elx.classList.toggle('on', !!r.enabled); };
window.toggleSkill = async (id, elx) => { await post(`/skills/${id}/toggle`); elx.classList.toggle('on'); };

/* ================= CÀI ĐẶT ================= */
const MODEL_OPTS = ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'];
async function loadSettings() {
  const s = await api('/settings');
  $('#set_engine').value = s.engine_kind;
  ['coo', 'tp', 'nv'].forEach(lv => {
    const sel = $('#set_model_' + lv);
    sel.innerHTML = MODEL_OPTS.map(m => `<option value="${m}" ${s.models[lv] === m ? 'selected' : ''}>${m}</option>`).join('');
  });
  $('#set_tran_mission').value = s.tran_per_mission;
  $('#set_tran_day').value = s.tran_per_day;
  $('#set_rounds').value = s.max_review_rounds;
  $('#set_nguong').value = s.nguong_diem;
  $('#set_concurrent').value = s.max_concurrent;
  $('#set_usdvnd').value = s.usd_vnd;
  $('#keystatus').textContent = s.hasKey ? '✅ Đã lưu key (nhập key mới để thay)' : 'Chưa có key';
  $('#usedtoday').textContent = `Đã dùng hôm nay: ${vnd(STATE.todayVnd)}`;
  renderCrons();
}
async function saveSettings() {
  const body = {
    engine_kind: $('#set_engine').value,
    models: { coo: $('#set_model_coo').value, tp: $('#set_model_tp').value, nv: $('#set_model_nv').value },
    tran_per_mission: +$('#set_tran_mission').value,
    tran_per_day: +$('#set_tran_day').value,
    max_review_rounds: +$('#set_rounds').value,
    nguong_diem: +$('#set_nguong').value,
    max_concurrent: +$('#set_concurrent').value,
    usd_vnd: +$('#set_usdvnd').value
  };
  if ($('#set_apikey').value.trim()) body.apiKey = $('#set_apikey').value.trim();
  await post('/settings', body);
  $('#savestatus').textContent = '✅ Đã lưu!';
  setTimeout(() => $('#savestatus').textContent = '', 2500);
  $('#set_apikey').value = '';
  STATE = await api('/state');
  $('#enginename').textContent = STATE.engine.kind === 'api' ? 'Claude API' : 'Demo';
  loadSettings();
}

/* ================= TOAST / FLY ================= */
function toast(title, body, cls) {
  // escape title/body — chúng có thể chứa tên task/agent do LLM/người dùng sinh (chống XSS)
  const t = el(`<div class="toast ${cls || ''}"><b>${esc(title)}</b><span style="color:var(--muted)">${esc(body)}</span></div>`);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 4600);
}
function flyFile(fromId, icon) {
  const n = AGENTS[fromId]?.el; if (!n) return;
  const r = n.getBoundingClientRect();
  const f = el(`<div class="flyfile" style="left:${r.left + r.width / 2}px;top:${r.top}px">${icon || '📄'}</div>`);
  document.body.appendChild(f);
  const target = document.querySelector('[data-screen="factory"]').getBoundingClientRect();
  requestAnimationFrame(() => { f.style.left = (target.left + 18) + 'px'; f.style.top = (target.top + 10) + 'px'; f.style.transform = 'scale(.4)'; f.style.opacity = '.2'; });
  setTimeout(() => f.remove(), 1200);
}

/* ================= TOPBAR STATS ================= */
async function refreshStats() {
  const s = await api('/stats');
  $('#missioncount').textContent = s.runningMissions;
  $('#costtoday').textContent = vnd(s.todayVnd);
  $('#costcap').textContent = ' / trần ' + vnd(s.tranDay);
  const pct = s.todayVnd / Math.max(s.tranDay, 1);
  $('#costpill').className = 'top-pill cost-pill' + (pct >= 0.9 ? ' danger' : pct >= 0.7 ? ' warn' : '');
  const badge = $('#apbadge');
  badge.style.display = s.pendingApprovals ? 'flex' : 'none';
  badge.textContent = s.pendingApprovals;
}

/* ================= SOCKET ================= */
function connectSocket() {
  const socket = io();
  socket.on('agent.state', d => setState(d.agentId, d.state, d.logLine));
  socket.on('agent.log', d => pushLog(d.agentId, d.text, d.level === 'error' ? 'r' : undefined));
  socket.on('packet.send', d => sendPacket(d.fromId, d.toId, d.color));
  socket.on('review.score', d => showScore(d.agentId, d.score, d.pass));
  socket.on('task.update', () => { debounce('tasks', refreshTasks, 400); });
  socket.on('mission.update', d => { debounce('mission', async () => { await refreshMission(); if (currentDetail === null) showMission(); updateMissionBar(); refreshStats(); }, 300); });
  socket.on('artifact.new', d => {
    flyFile(d.agentId, d.icon); debounce('factory', refreshFactory, 500);
    if ($('#screen-cockpit').classList.contains('active')) debounce('cockpit', refreshCockpit, 800);
  });
  socket.on('approval.new', d => {
    refreshApprovals(); refreshStats();
    // không đè modal CEO đang mở (đang soạn DM / sửa nội dung…) — chỉ nhắc bằng toast
    if (!$('#modalwrap').classList.contains('show')) showApprovalModal(d);
  });
  socket.on('approval.update', () => { refreshApprovals(); refreshStats(); });
  socket.on('cost.update', d => {
    $('#costtoday').textContent = vnd(d.todayVnd);
    const pct = d.todayVnd / Math.max(d.tranDay || 100000, 1);
    $('#costpill').className = 'top-pill cost-pill' + (pct >= 0.9 ? ' danger' : pct >= 0.7 ? ' warn' : '');
    if (currentDetail === null) debounce('mission2', async () => { await refreshMission(); showMission(); }, 800);
  });
  socket.on('chat.message', d => { cooTyping(false); chatMsg(d.role, d.html); });
  socket.on('chat.typing', d => cooTyping(d.on));
  socket.on('toast', d => toast(d.title, d.body, d.cls));
  socket.on('org.update', async () => {
    ORG = await api('/org'); buildOrg(); applyView(false);
    if ($('#screen-hr').classList.contains('active')) refreshHR();
  });
  socket.on('initiative.new', () => { refreshInitiativeBadge(); if ($('#screen-initiatives').classList.contains('active')) refreshInitiatives(); });
  socket.on('initiative.update', () => { refreshInitiativeBadge(); if ($('#screen-initiatives').classList.contains('active')) refreshInitiatives(); });
  socket.on('crm.update', () => { refreshCRMBadge(); if ($('#screen-crm').classList.contains('active')) debounce('crm', refreshCRM, 500); if ($('#screen-cockpit').classList.contains('active')) debounce('cockpit', refreshCockpit, 600); });
  socket.on('playbook.new', () => { if ($('#screen-hr').classList.contains('active')) refreshPlaybooks(); });
}
const debTimers = {};
function debounce(key, fn, ms) { clearTimeout(debTimers[key]); debTimers[key] = setTimeout(fn, ms); }

async function showApprovalModal(d) {
  const rows = await api('/approvals?status=pending');
  const r = rows.find(x => x.id === d.approvalId) || rows[0];
  if (!r) return;
  $('#modal').innerHTML = `
   <div style="font-weight:800;font-size:16px;display:flex;gap:9px;align-items:center">🔔 Việc chờ CEO duyệt</div>
   <div style="color:var(--muted);font-size:12.5px;margin:9px 0 13px;line-height:1.6"><b style="color:var(--text)">${esc(r.title)}</b><br>${esc(r.context)}</div>
   ${r.preview ? `<div class="preview-box">${esc(r.preview)}</div>` : ''}
   <div style="display:flex;gap:9px;flex-wrap:wrap">
     ${(r.options || []).map(o => {
       const cls = o.key === 'approve' || o.key === 'accept' ? 'jade' : (o.key === 'reject' || o.key === 'drop' ? 'danger' : 'ghost');
       return `<button class="btn ${cls}" onclick="modalDecide('${r.id}','${o.key}')">${esc(o.label)}</button>`;
     }).join('')}
     ${r.type === 'real_action' ? `<button class="btn ghost" onclick="openApprovalEdit('${r.id}','${r.task_id}')">✏️ Sửa rồi duyệt</button>` : ''}
     <button class="btn ghost" onclick="closeModal();toast('📥 Đã chuyển vào Hộp phê duyệt','Sếp quyết sau — các nhánh khác vẫn chạy','amber')">Để trong Hộp phê duyệt</button>
   </div>`;
  $('#modalwrap').classList.add('show');
}
window.closeModal = () => $('#modalwrap').classList.remove('show');
window.modalDecide = async (id, key) => { closeModal(); await window.decide(id, key); };
$('#modalwrap').addEventListener('click', e => { if (e.target.id === 'modalwrap') closeModal(); });

/* ================= MODAL CHUNG ================= */
function openModal(html) { $('#modal').innerHTML = html; $('#modalwrap').classList.add('show'); }

/* ---------- Chi tiết task (bấm thẻ kanban / thanh timeline) ---------- */
window.showTaskDetail = async id => {
  const t = await api(`/tasks/${id}/detail`);
  if (t.error) return toast('⚠️', t.error, 'red');
  const d = deptOf(t.dept_id);
  const stMap = { todo: '⏳ Chờ làm', doing: '⚡ Đang làm', submitted: '📤 Đã nộp', reviewing: '🔍 Đang review', rejected: '↩️ Bị trả lại', waiting_approval: '🔔 Chờ CEO', done: '✅ Hoàn thành', failed: '❌ Hủy' };
  openModal(`
   <div style="font-weight:800;font-size:15px">${esc(t.title)}</div>
   <div style="font-size:11.5px;color:var(--muted);margin:6px 0 12px">
     <span class="ftag" style="background:${d.color}22;color:${d.color}">${esc(d.name)}</span>
     ${t.assignee_ava || ''} ${esc(t.assignee_name || '')} · review bởi ${esc(t.reviewer_name || '')} · ${stMap[t.status] || t.status}
     ${t.score ? ` · <b style="color:var(--jade)">${t.score}/100</b>` : ''}
   </div>
   ${t.brief ? `<div class="dp-card" style="margin-bottom:10px"><h4>Brief giao việc</h4>
     <div style="font-size:12px;line-height:1.6"><b>Mục tiêu:</b> ${esc(t.brief.muc_tieu || '')}<br>
     <b>Định dạng:</b> ${esc(t.brief.format_dau_ra || '')} · <b>Tiêu chí chấm:</b> ${(t.brief.tieu_chi_cham || []).map(esc).join(' · ')}</div></div>` : ''}
   ${t.reviews.length ? `<div class="dp-card" style="margin-bottom:10px"><h4>Các vòng review</h4>
     ${t.reviews.map(r => `<div style="font-size:12px;padding:5px 0;border-bottom:1px solid var(--line)">
       <b style="color:${r.pass ? 'var(--jade)' : 'var(--red)'}">Vòng ${r.round}: ${r.score}/100 ${r.pass ? '✔ Đạt' : '✘ Trả lại'}</b><br>
       <span style="color:var(--muted)">${esc(r.feedback || '')}</span></div>`).join('')}</div>` : ''}
   ${t.output ? `<div class="preview-box" style="max-height:220px">${esc(t.output.slice(0, 2500))}${t.output.length > 2500 ? '…' : ''}</div>` : ''}
   ${t.artifacts.length ? `<div style="margin-bottom:12px">${t.artifacts.map(a => `<span class="filelink" onclick="window.open('/api/artifacts/${a.id}/file')">${a.icon} ${esc(a.name)} (v${a.version})</span>`).join('')}</div>` : ''}
   <button class="btn ghost" onclick="closeModal()">Đóng</button>`);
};

/* ---------- Lịch sử nhiệm vụ ---------- */
window.showMissionHistory = async () => {
  const rows = await api('/missions');
  const stIcon = { done: '✅', failed: '❌', over_budget: '⛔', paused: '⏸', running: '⚡', waiting_approval: '🔔', briefing: '💬', planning: '🧠', reporting: '📨' };
  openModal(`
   <div style="font-weight:800;font-size:15px;margin-bottom:12px">📜 Lịch sử nhiệm vụ</div>
   ${rows.length ? rows.map(m => `
    <div class="setrow" style="cursor:pointer" onclick="showMissionFull('${m.id}')">
      <div class="sl"><b>${stIcon[m.status] || ''} ${esc(m.title)}</b>
      <span>${new Date(m.created_at).toLocaleString('vi-VN')} · ${m.progress}% · ${vnd(m.spent_vnd)}</span></div>
      <span style="color:var(--dim)">›</span>
    </div>`).join('') : '<div style="color:var(--muted)">Chưa có nhiệm vụ nào.</div>'}
   <button class="btn ghost" style="margin-top:12px" onclick="closeModal()">Đóng</button>`);
};
window.showMissionFull = async id => {
  const m = await api(`/missions/${id}/full`);
  if (m.error) return;
  openModal(`
   <div style="font-weight:800;font-size:15px">🎯 ${esc(m.title)}</div>
   <div style="font-size:11.5px;color:var(--muted);margin:5px 0 12px">${new Date(m.created_at).toLocaleString('vi-VN')} · ${m.status} · chi phí ${vnd(m.spent_vnd)}</div>
   ${m.report_html ? `<div class="dp-card" style="margin-bottom:10px"><h4>Báo cáo của COO</h4><div style="font-size:12.5px;line-height:1.6">${m.report_html}</div></div>` : ''}
   <div class="dp-card" style="margin-bottom:10px"><h4>${m.tasks.length} đầu việc</h4>
     ${m.tasks.map(t => `<div style="font-size:12px;padding:4px 0;cursor:pointer" onclick="showTaskDetail('${t.id}')">
       ${t.status === 'done' ? '✅' : t.status === 'failed' ? '❌' : '⏳'} ${esc(t.title)} ${t.score ? `— <b style="color:var(--jade)">${t.score}đ</b>` : ''}</div>`).join('')}</div>
   ${m.artifacts.length ? `<div style="margin-bottom:12px">${m.artifacts.map(a => `<span class="filelink" onclick="window.open('/api/artifacts/${a.id}/file')">${a.icon} ${esc(a.name)}</span>`).join('')}</div>` : ''}
   <div style="display:flex;gap:8px">
     ${['over_budget', 'paused'].includes(m.status) ? `<button class="btn jade" onclick="closeModal();resumeMission('${m.id}')">▶ Chạy tiếp</button>` : ''}
     <button class="btn ghost" onclick="showMissionHistory()">← Danh sách</button>
     <button class="btn ghost" onclick="closeModal()">Đóng</button>
   </div>`);
};

/* ---------- Nhắn riêng 1-1 với agent ---------- */
window.openDM = async id => {
  const a = await api(`/agents/${id}`);
  if (a.error) return;
  const msgs = (a.dms || []).map(m => `<div class="msg ${m.role === 'ceo' ? 'ceo' : 'coo'}" style="max-width:100%">${esc(m.text)}</div>`).join('');
  openModal(`
   <div style="font-weight:800;font-size:15px">${a.avatar} Nhắn riêng với ${esc(a.name)}</div>
   <div style="font-size:11px;color:var(--muted);margin:4px 0 10px">${esc(a.role_title)} · ${esc(a.dept_name)}</div>
   <div id="dmlog" style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;padding:10px;background:var(--bg);border-radius:10px;border:1px solid var(--line)">
     ${msgs || '<div style="color:var(--dim);font-size:12px">Chưa có tin nhắn nào — sếp hỏi gì cứ nhắn ạ.</div>'}
   </div>
   <div style="display:flex;gap:8px;margin-top:10px">
     <input class="inp" id="dminput" placeholder="Nhắn cho ${esc(a.name)}…" style="flex:1" onkeydown="if(event.key==='Enter')sendDM('${id}')">
     <button class="btn" onclick="sendDM('${id}')">Gửi</button>
   </div>
   <button class="btn ghost" style="margin-top:10px" onclick="closeModal()">Đóng</button>`);
  const lg = $('#dmlog'); lg.scrollTop = lg.scrollHeight;
  $('#dminput').focus();
};
window.sendDM = async id => {
  const inp = $('#dminput'); const v = inp.value.trim(); if (!v) return;
  inp.value = ''; inp.disabled = true;
  const lg = $('#dmlog');
  lg.insertAdjacentHTML('beforeend', `<div class="msg ceo" style="max-width:100%">${esc(v)}</div><div class="typing" id="dmtyping"><i></i><i></i><i></i></div>`);
  lg.scrollTop = lg.scrollHeight;
  const r = await post(`/agents/${id}/dm`, { text: v });
  const tp = $('#dmtyping'); if (tp) tp.remove();
  if (r.ok) lg.insertAdjacentHTML('beforeend', `<div class="msg coo" style="max-width:100%">${esc(r.reply)}</div>`);
  inp.disabled = false; inp.focus(); lg.scrollTop = lg.scrollHeight;
};

/* ---------- Sửa kỹ năng / Đào tạo lại agent ---------- */
window.openAgentEdit = async (id, trainMode) => {
  const [a, skills] = await Promise.all([api(`/agents/${id}`), api('/skills')]);
  if (a.error) return;
  let prompt = a.system_prompt || '';
  if (trainMode && a.failFeedbacks && a.failFeedbacks.length) {
    const lessons = a.failFeedbacks.map(f => '- ' + f.feedback.slice(0, 160)).join('\n');
    if (!prompt.includes('KINH NGHIỆM CẦN NHỚ')) prompt += `\n\nKINH NGHIỆM CẦN NHỚ (từ các lần bị trả lại):\n${lessons}`;
  }
  openModal(`
   <div style="font-weight:800;font-size:15px">${trainMode ? '🎓 Đào tạo lại' : '✏️ Sửa kỹ năng'}: ${a.avatar} ${esc(a.name)}</div>
   ${trainMode ? '<div style="font-size:11.5px;color:var(--amber);margin:5px 0">Em đã gom các nhận xét bị trả lại gần đây vào phần "KINH NGHIỆM CẦN NHỚ" — sếp duyệt/sửa rồi lưu.</div>' : ''}
   <div class="wfield" style="margin-top:10px"><label>Chức danh</label><input class="inp" id="ae_role" value="${esc(a.role_title)}" style="width:100%"></div>
   <div class="wfield"><label>Model (cấp bậc)</label><select class="sel" id="ae_model" style="width:100%">
     ${['nv', 'tp', 'coo'].map(l => `<option value="${l}" ${a.model === l ? 'selected' : ''}>${{ nv: 'Haiku (nhân viên)', tp: 'Sonnet (trưởng phòng)', coo: 'Opus (điều phối)' }[l]}</option>`).join('')}</select></div>
   <div class="wfield"><label>Skill được gắn</label><div style="display:flex;flex-wrap:wrap;gap:6px">
     ${skills.map(s => `<label class="chip" style="cursor:pointer"><input type="checkbox" class="ae_skill" value="${s.id}" ${a.skills.includes(s.id) ? 'checked' : ''}> ${esc(s.id)}</label>`).join('')}</div></div>
   <div class="wfield"><label>Vai trò & nguyên tắc (system prompt)</label>
     <textarea class="inp" id="ae_prompt" rows="7">${esc(prompt)}</textarea></div>
   <div style="display:flex;gap:8px">
     <button class="btn" onclick="saveAgentEdit('${id}')">💾 Lưu</button>
     <button class="btn ghost" onclick="closeModal()">Hủy</button>
   </div>`);
};
window.saveAgentEdit = async id => {
  const body = {
    role_title: $('#ae_role').value,
    model: $('#ae_model').value,
    system_prompt: $('#ae_prompt').value,
    skills: [...document.querySelectorAll('.ae_skill:checked')].map(c => c.value)
  };
  const r2 = await fetch(`/api/agents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
  closeModal();
  if (r2.ok) { toast('✅ Đã cập nhật agent', 'Có hiệu lực từ lượt làm việc kế tiếp'); ORG = await api('/org'); if ($('#screen-hr').classList.contains('active')) refreshHR(); }
  else toast('⚠️ Lỗi', r2.error || '', 'red');
};
window.toggleAgentEnabled = async id => {
  const a = await api(`/agents/${id}`);
  const r = await fetch(`/api/agents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: a.enabled ? 0 : 1 }) }).then(x => x.json());
  if (r.ok) toast(a.enabled ? '⏸ Đã tạm dừng agent' : '▶ Đã kích hoạt lại', `${a.name} — ${a.enabled ? 'không nhận việc mới' : 'sẵn sàng nhận việc'}`, a.enabled ? 'amber' : '');
  else toast('⚠️', r.error || 'Lỗi', 'red');
};

/* ---------- Tuyển nhân viên AI mới (4.4) ---------- */
window.openHire = async () => {
  const [org, skills] = await Promise.all([api('/org'), api('/skills')]);
  const AVAS = ['🧑‍💼', '👩‍💻', '🧑‍🎨', '🧑‍🔬', '🕵️', '🧑‍🏫', '🧙', '🦸'];
  openModal(`
   <div style="font-weight:800;font-size:15px">＋ Tuyển nhân viên AI mới</div>
   <div style="font-size:11.5px;color:var(--muted);margin:5px 0 12px">Mô tả vai trò bằng lời — hệ thống dựng hồ sơ, nhân viên xuất hiện ngay trên Sơ đồ sống.</div>
   <div class="wgrid">
     <div class="wfield"><label>Phòng ban</label><select class="sel" id="h_dept" style="width:100%">
       ${org.depts.map(d => `<option value="${d.id}">${d.emoji} ${esc(d.name)}</option>`).join('')}</select></div>
     <div class="wfield"><label>Avatar</label><select class="sel" id="h_ava" style="width:100%">${AVAS.map(a => `<option>${a}</option>`).join('')}</select></div>
   </div>
   <div class="wgrid">
     <div class="wfield"><label>Tên</label><input class="inp" id="h_name" placeholder="VD: NV Chăm sóc đại lý" style="width:100%"></div>
     <div class="wfield"><label>Chức danh</label><input class="inp" id="h_role" placeholder="VD: Chuyên viên kênh đại lý" style="width:100%"></div>
   </div>
   <div class="wfield"><label>Mô tả công việc (để dựng system prompt)</label>
     <textarea class="inp" id="h_desc" rows="3" placeholder="VD: Chăm sóc hệ thống đại lý: soạn tin chúc mừng doanh số, nhắc công nợ lịch sự, tổng hợp phản hồi đại lý hằng tuần"></textarea></div>
   <div class="wgrid">
     <div class="wfield"><label>Cấp bậc model</label><select class="sel" id="h_level" style="width:100%">
       <option value="nv">Haiku — nhân viên (nhanh, rẻ)</option><option value="tp">Sonnet — việc khó</option></select></div>
     <div class="wfield"><label>Skill gắn kèm</label><select class="sel" id="h_skill" style="width:100%"><option value="">— không —</option>
       ${skills.map(s => `<option value="${s.id}">${esc(s.id)}</option>`).join('')}</select></div>
   </div>
   <div style="display:flex;gap:8px">
     <button class="btn" onclick="submitHire()">🎉 Tuyển vào công ty</button>
     <button class="btn ghost" onclick="closeModal()">Hủy</button>
   </div>`);
};
window.submitHire = async () => {
  const desc = $('#h_desc').value.trim();
  const body = {
    dept_id: $('#h_dept').value, name: $('#h_name').value.trim(), avatar: $('#h_ava').value,
    role_title: $('#h_role').value.trim() || $('#h_name').value.trim(), level: $('#h_level').value,
    skills: $('#h_skill').value ? [$('#h_skill').value] : [],
    role_block: desc ? `Bạn phụ trách: ${desc}. Làm đúng brief được giao, kết quả chuyên nghiệp, đúng giọng DNA thương hiệu, trả đúng format yêu cầu.` : undefined
  };
  const r = await post('/agents', body);
  closeModal();
  if (r.ok) { ORG = await api('/org'); buildOrg(); applyView(false); refreshHR(); }
  else toast('⚠️ Chưa tuyển được', r.error || '', 'red');
};

/* ---------- CEO sửa nội dung rồi duyệt (ch9 "Sửa") ---------- */
window.openApprovalEdit = async (apId, taskId) => {
  const t = await api(`/tasks/${taskId}/detail`);
  openModal(`
   <div style="font-weight:800;font-size:15px">✏️ Sửa nội dung trước khi duyệt</div>
   <div style="font-size:11.5px;color:var(--muted);margin:5px 0 10px">Bản sếp sửa sẽ là bản chạy thật (sinh file phiên bản mới trong Xưởng).</div>
   <textarea class="inp" id="apedit_text" rows="14" style="font-family:'JetBrains Mono',monospace;font-size:11.5px">${esc(t.output || t.brief && t.brief.muc_tieu || '')}</textarea>
   <div style="display:flex;gap:8px;margin-top:10px">
     <button class="btn jade" onclick="submitApprovalEdit('${apId}')">✔ Duyệt bản đã sửa</button>
     <button class="btn ghost" onclick="closeModal()">Hủy</button>
   </div>`);
};
window.submitApprovalEdit = async apId => {
  const txt = $('#apedit_text').value;
  closeModal();
  const r = await post(`/approvals/${apId}/decide`, { decision: 'edited', edited_text: txt });
  if (r.ok) toast('✅ Đã duyệt bản CEO sửa', 'File phiên bản mới đã vào Xưởng');
  refreshApprovals(); refreshTasks();
};

/* ---------- Lịch nhiệm vụ định kỳ ---------- */
async function renderCrons() {
  const rows = await api('/crons');
  $('#cronlist').innerHTML = rows.length ? rows.map(c => `
   <div class="setrow"><div class="sl"><b>${esc(c.title)}</b>
     <span>${c.cadence === 'weekly' ? 'Hằng tuần (T2)' : 'Hằng ngày'} lúc ${c.hhmm} · ${c.last_run_at ? 'chạy gần nhất ' + new Date(c.last_run_at).toLocaleDateString('vi-VN') : 'chưa chạy lần nào'}</span></div>
   <div class="toggle ${c.enabled ? 'on' : ''}" onclick="toggleCron('${c.id}',this)"></div>
   <button style="color:var(--red);font-size:14px" onclick="delCron('${c.id}')">🗑</button></div>`).join('')
    : '<div style="color:var(--muted);font-size:12px">Chưa có lịch nào. VD: mỗi sáng 8h tự tổng hợp việc cần làm trong ngày.</div>';
}
window.toggleCron = async (id, elx) => { await post(`/crons/${id}/toggle`); elx.classList.toggle('on'); };
window.delCron = async id => { await fetch(`/api/crons/${id}`, { method: 'DELETE' }); renderCrons(); };

/* nhịp thở: agent rảnh thi thoảng "ngó việc" */
function ambient() {
  const idles = Object.keys(AGENTS).filter(id => AGENTS[id].state === 'idle' && id !== 'ceo');
  if (idles.length && Math.random() < .4) {
    const id = idles[Math.floor(Math.random() * idles.length)];
    const f = follow; follow = false;
    setState(id, 'think');
    setTimeout(() => { if (AGENTS[id] && AGENTS[id].state === 'think') setState(id, 'idle'); follow = f; }, 2200);
  }
}

/* ================= ĐIỀU HƯỚNG & BIND ================= */
function switchScreen(name) {
  document.querySelectorAll('.rail-btn').forEach(x => x.classList.toggle('active', x.dataset.screen === name));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name).classList.add('active');
  if (name === 'factory') refreshFactory();
  if (name === 'approvals') refreshApprovals();
  if (name === 'hr') refreshHR();
  if (name === 'brain') refreshBrain();
  if (name === 'connect') refreshConnect();
  if (name === 'settings') loadSettings();
  if (name === 'cockpit') refreshCockpit();
  if (name === 'initiatives') refreshInitiatives();
  if (name === 'crm') refreshCRM();
  if (name === 'hr') refreshPlaybooks();
}

/* ================= CRM — KHÁCH HÀNG & BÁN HÀNG (v4) ================= */
async function refreshCRM() {
  const c = await api('/crm');
  const s = c.snapshot;
  const stageIcon = { moi: '🌱', am: '☕', nong: '🔥', chot: '✅', mat: '💤' };
  const leadsByStage = st => c.leads.filter(l => l.stage === st);
  const pipe = c.stages.map(st => {
    const items = leadsByStage(st);
    return `<div class="pipe-col ${st}"><div class="ph">${stageIcon[st]} ${esc(c.stageLabel[st])}<span class="cnt">${items.length}</span></div>
     <div class="pipe-body">${items.slice(0, 30).map(l => `<div class="lead-card">
       <div class="ln">${esc(l.cust_name || 'Khách')}</div>
       <div class="lm"><span>${esc(l.product || '')}</span>${l.score ? `<span class="lsc">${l.score}đ</span>` : ''}${l.cust_city ? `<span>${esc(l.cust_city)}</span>` : ''}</div>
       </div>`).join('') || '<div style="font-size:11px;color:var(--dim);padding:6px">—</div>'}</div></div>`;
  }).join('');
  const openTk = c.tickets.filter(t => t.status !== 'xong');
  $('#crmbody').innerHTML = `
   <div class="kpi-row" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
     <div class="kpi-tile info"><div class="kv">${s.customersN}</div><div class="kl">Khách hàng</div></div>
     <div class="kpi-tile warn"><div class="kv">${s.byStage.moi + s.byStage.am + s.byStage.nong}</div><div class="kl">Lead trong phễu</div><div class="ks">${s.byStage.nong} nóng · sẵn sàng chốt</div></div>
     <div class="kpi-tile pos"><div class="kv">${s.ordersN}</div><div class="kl">Đơn đã chốt</div><div class="ks">doanh thu ${fmtVnd(s.revenueMonth)}/tháng</div></div>
     <div class="kpi-tile ${s.openTickets ? 'neg' : 'pos'}"><div class="kv">${s.openTickets}</div><div class="kl">Ticket đang mở</div><div class="ks">CSKH cần xử lý</div></div>
   </div>
   <div class="card"><h3>🧲 Phễu bán hàng (lead pipeline)</h3><div class="pipe-row">${pipe}</div>
     <div style="font-size:11px;color:var(--muted)">💡 Giao "chấm lead" cho NV Chăm Lead để đẩy lead qua phễu; giao "tư vấn chốt đơn" cho NV Sales để chốt lead nóng thành đơn (ra doanh thu thật).</div>
   </div>
   <div class="grid2">
     <div class="card"><h3>🎫 Ticket CSKH ${openTk.length ? `<span class="ftag" style="background:rgba(229,72,77,.12);color:var(--red);margin-left:auto">${openTk.length} đang mở</span>` : ''}</h3>
       ${c.tickets.length ? c.tickets.slice(0, 12).map(t => `<div class="lead-card ${t.status === 'xong' ? 'tk-done' : 'tk-open'}" style="margin-bottom:7px">
         <div class="ln">${{ khieu_nai: '😠 Khiếu nại', hoi_dap: '❓ Hỏi đáp', doi_tra: '↩️ Đổi trả' }[t.kind] || t.kind} — ${esc(t.cust_name || 'Khách')}</div>
         <div class="lm">${esc(t.content || '')}</div>
         ${t.resolution ? `<div class="lm" style="color:var(--jade)">✔ ${esc(t.resolution)}</div>` : ''}</div>`).join('')
         : '<div style="color:var(--muted);font-size:12px">Chưa có ticket. Ticket sẽ tự phát sinh khi có khách mua hàng.</div>'}
     </div>
     <div class="card"><h3>💰 Đơn hàng gần đây</h3>
       ${c.orders.length ? `<table class="tbl"><tr><th>Khách</th><th>Sản phẩm</th><th>Giá trị</th><th>Ngày</th></tr>` +
         c.orders.slice(0, 12).map(o => `<tr><td>${esc(o.cust_name || '—')}</td><td>${esc(o.product || '')}</td>
         <td style="color:var(--jade);font-family:'JetBrains Mono',monospace">${fmtVnd(o.amount_vnd)}</td><td>${new Date(o.created_at).toLocaleDateString('vi-VN')}</td></tr>`).join('') + '</table>'
         : '<div style="color:var(--muted);font-size:12px">Chưa có đơn. Giao việc "tư vấn chốt đơn" cho phòng Kinh doanh để chốt lead nóng.</div>'}
     </div>
   </div>`;
}
async function refreshCRMBadge() {
  try { const c = await api('/crm'); const b = $('#crmbadge'); const n = c.snapshot.openTickets; b.style.display = n ? 'flex' : 'none'; b.textContent = n; } catch {}
}

/* ================= PLAYBOOK (vòng học) ================= */
async function refreshPlaybooks() {
  const p = await api('/playbooks');
  $('#pbcount').textContent = `${p.count} công thức · dùng ${p.totalUses} lần`;
  $('#playbooklist').innerHTML = p.list.length ? p.list.map(pb => `
   <div class="pb-item"><div class="pbt">${esc(pb.dept_name || pb.dept_id)} · ${esc(pb.title)} <span class="ftag" style="background:rgba(49,201,126,.12);color:var(--jade)">${pb.score}đ</span></div>
     <div class="pbp">${esc(pb.pattern)}</div>
     <div class="pbm">Đã tái sử dụng ${pb.uses} lần · đúc kết ${new Date(pb.created_at).toLocaleDateString('vi-VN')}</div></div>`).join('')
    : '<div style="color:var(--muted);font-size:12px">Chưa có công thức nào. Khi một bài đạt ≥95 điểm, công ty sẽ tự đúc kết thành công thức và dùng lại cho việc sau.</div>';
  // gợi ý thăng chức / đào tạo lại
  if (p.review && (p.review.promote.length || p.review.retrain.length)) {
    const parts = [];
    if (p.review.promote.length) parts.push('⭐ Nên nâng vai: ' + p.review.promote.map(a => esc(a.name)).join(', '));
    if (p.review.retrain.length) parts.push('🎓 Nên đào tạo lại: ' + p.review.retrain.map(a => esc(a.name)).join(', '));
    $('#hrsub').innerHTML = parts.join(' · ');
  }
}

/* ================= BUỒNG LÁI KINH DOANH (Phase 3) ================= */
function fmtVnd(n) {
  const a = Math.abs(n || 0);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' tỷ';
  if (a >= 1e6) return Math.round(n / 1e6).toLocaleString('vi-VN') + ' tr';
  return (n || 0).toLocaleString('vi-VN') + 'đ';
}
async function refreshCockpit() {
  const c = await api('/cockpit');
  const k = c.kpi;
  const maxTrend = Math.max(1, ...c.trend.map(t => t.missions));
  $('#cockpitbody').innerHTML = `
   <div class="kpi-row">
     <div class="kpi-tile pos"><div class="kv">${fmtVnd(k.projectedRevenue)}</div><div class="kl">Doanh thu dự phóng / tháng</div><div class="ks">giá TB ${fmtVnd(k.price)}/sản phẩm</div></div>
     <div class="kpi-tile ${k.opProfit >= 0 ? 'pos' : 'neg'}"><div class="kv">${fmtVnd(k.opProfit)}</div><div class="kl">Lợi nhuận hoạt động dự phóng</div><div class="ks">sau giá vốn + chi phí AI</div></div>
     <div class="kpi-tile info"><div class="kv">${k.campaigns}</div><div class="kl">Chiến dịch đã lên lịch</div><div class="ks">${k.contentPieces} nội dung đã sản xuất</div></div>
     <div class="kpi-tile info"><div class="kv">${k.leadCount}</div><div class="kl">Lead trong pipeline</div><div class="ks">giá trị deal ${fmtVnd(k.dealValue)}</div></div>
     <div class="kpi-tile warn"><div class="kv">${fmtVnd(k.aiCostMonth)}</div><div class="kl">Chi phí vận hành AI / tháng</div><div class="ks">tổng lũy kế ${fmtVnd(k.aiCostTotal)}</div></div>
     <div class="kpi-tile pos"><div class="kv">${k.avgQuality || '—'}</div><div class="kl">Điểm chất lượng TB</div><div class="ks">${k.missionsDone} nhiệm vụ · ${k.artifacts} sản phẩm</div></div>
   </div>
   <div class="grid2">
     <div class="card"><h3>📊 P&amp;L dự phóng (tháng)</h3>
       <table class="pnl-table">${c.pnl.map(r => `<tr class="${r.kind === 'sub' ? 'sub' : r.kind === 'negsub' ? 'negsub' : ''}"><td>${esc(r.row)}</td><td class="num ${r.value >= 0 ? 'pos' : 'neg'}">${r.value < 0 ? '(' + fmtVnd(-r.value) + ')' : fmtVnd(r.value)}</td></tr>`).join('')}</table>
       <div style="font-size:10.5px;color:var(--dim);margin-top:10px">Số liệu dự phóng từ hoạt động công ty (dự toán tài chính, lead, chiến dịch) + chi phí AI thực. Càng giao việc, bức tranh càng rõ.</div>
     </div>
     <div class="card"><h3>📈 Nhịp hoạt động 6 tuần</h3>
       <div class="trend-wrap">${c.trend.map(t => `<div class="trend-col">
         <div class="trend-val">${t.missions}</div>
         <div class="trend-bar-wrap"><div class="trend-bar" style="height:${Math.round(t.missions / maxTrend * 100)}%"></div></div>
         <div class="trend-lbl">${esc(t.label)}</div></div>`).join('')}</div>
       <div style="font-size:11px;color:var(--muted);margin-top:6px">Số nhiệm vụ hoàn thành mỗi tuần</div>
       ${c.goal ? `<div style="margin-top:14px"><div style="font-size:12px;font-weight:600">🎯 Mục tiêu 3 tháng: ${esc(c.goal)}</div>
         <div class="goalbar"><i style="width:${k.goalProgress}%"></i></div>
         <div style="font-size:11px;color:var(--muted)">Tiến độ ước tính ${k.goalProgress}%</div></div>` : ''}
     </div>
   </div>
   <div class="card"><h3>🧾 Dòng sự kiện kinh doanh</h3>
     ${c.events.length ? c.events.map(e => `<div class="setrow"><div class="sl"><b>${bizIcon(e.kind)} ${esc(e.label)}</b>
       <span>${new Date(e.at).toLocaleString('vi-VN')}${e.amount_vnd ? ' · ' + fmtVnd(e.amount_vnd) : ''}</span></div></div>`).join('')
       : '<div style="color:var(--muted);font-size:12px">Chưa có sự kiện. Giao việc cho công ty để buồng lái bắt đầu ghi nhận.</div>'}
   </div>`;
}
function bizIcon(k) { return { revenue: '💰', deal: '🤝', lead: '🎯', content: '✍️', campaign: '📣', email: '✉️', research: '🔍', decision: '🗳️' }[k] || '•'; }

/* ================= SÁNG KIẾN CHỦ ĐỘNG ================= */
async function refreshInitiatives() {
  const [pending, done] = await Promise.all([api('/initiatives?status=pending'), Promise.all([api('/initiatives?status=accepted'), api('/initiatives?status=dismissed')])]);
  const hist = [...done[0], ...done[1]].sort((a, b) => (b.decided_at || '').localeCompare(a.decided_at || '')).slice(0, 15);
  const typ = { co_hoi: ['💡', 'Cơ hội'], rui_ro: ['⚠️', 'Rủi ro'], dinh_ky: ['📆', 'Định kỳ'], nhan_su: ['🎓', 'Nhân sự'] };
  $('#initiativelist').innerHTML = pending.length ? pending.map(p => {
    const [ic, tn] = typ[p.loai] || ['💡', ''];
    return `<div class="ini-card ${p.loai}">
     <div class="it">${ic} ${esc(p.title)} <span class="ityp">${tn}</span></div>
     <div class="ir">${esc(p.ly_do || '')}<br><span style="color:var(--dim)">→ Nếu đồng ý, em sẽ giao: "${esc(p.command)}"</span></div>
     <div style="display:flex;gap:9px">
       <button class="btn jade" onclick="decideIni('${p.id}',true)">✔ Đồng ý — giao việc ngay</button>
       <button class="btn ghost" onclick="decideIni('${p.id}',false)">Bỏ qua</button>
     </div></div>`;
  }).join('') : '<div class="card" style="color:var(--muted)">✨ Chưa có sáng kiến nào đang chờ. COO sẽ tự đề xuất khi rà thấy cơ hội/rủi ro, hoặc bấm "Nhờ COO rà soát ngay".</div>';
  $('#initiativehist').innerHTML = hist.length ? hist.map(p => {
    const [ic] = typ[p.loai] || ['💡'];
    return `<div class="setrow"><div class="sl"><b>${ic} ${esc(p.title)}</b><span>${p.status === 'accepted' ? '✅ Đã đồng ý' : '⏭ Đã bỏ qua'} · ${p.decided_at ? new Date(p.decided_at).toLocaleDateString('vi-VN') : ''}</span></div></div>`;
  }).join('') : '<div style="color:var(--muted);font-size:12px">Chưa có.</div>';
}
window.decideIni = async (id, accept) => {
  const r = await post(`/initiatives/${id}/decide`, { accept });
  if (r.ok && accept) { toast('🚀 Đã giao việc từ sáng kiến', 'Theo dõi trên Sơ đồ sống'); switchScreen('home'); }
  refreshInitiatives(); refreshInitiativeBadge();
};
async function refreshInitiativeBadge() {
  const p = await api('/initiatives?status=pending');
  const b = $('#inibadge');
  b.style.display = p.length ? 'flex' : 'none';
  b.textContent = p.length;
}

/* ================= ĐA CÔNG TY (v4) ================= */
async function toggleCompanyDropdown() {
  let dd = $('#coDropdown');
  if (dd && dd.classList.contains('show')) { dd.classList.remove('show'); return; }
  const data = await api('/companies');
  if (!dd) { dd = el('<div id="coDropdown"></div>'); document.body.appendChild(dd); }
  dd.innerHTML = data.companies.map(c => `
   <div class="co-item ${c.id === data.active ? 'active' : ''}" onclick="switchCompany('${c.id}','${c.id === data.active}')">
     <span class="cdot" style="${c.id === data.active ? '' : 'background:var(--dim)'}"></span>
     <span>${esc(c.name || '(công ty chưa đặt tên)')}</span>${c.id === data.active ? '<span style="margin-left:auto;font-size:10px">đang mở</span>' : ''}
   </div>`).join('') +
   `<div class="co-item co-new" onclick="newCompany()">➕ <span>Thêm công ty mới…</span></div>`;
  dd.classList.add('show');
}
window.switchCompany = async (id, isActive) => {
  if (isActive === 'true' || isActive === true) { $('#coDropdown').classList.remove('show'); return; }
  if (!confirm('Chuyển sang công ty khác? App sẽ tự thoát và bạn chạy lại "npm start" để vào công ty đã chọn.')) return;
  const r = await post(`/companies/${id}/switch`, {});
  if (r.ok) alert(r.message);
};
window.newCompany = async () => {
  const name = prompt('Tên công ty mới:');
  if (!name || !name.trim()) return;
  const r = await post('/companies', { name: name.trim() });
  if (r.ok) alert(r.message); else toast('⚠️', r.error || 'Lỗi', 'red');
};
function bindUI() {
  document.querySelectorAll('.rail-btn').forEach(b => b.addEventListener('click', () => switchScreen(b.dataset.screen)));
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.querySelectorAll('.tabpane').forEach(p => p.classList.remove('active'));
    $('#pane-' + t.dataset.tab).classList.add('active');
  }));
  $('#modeAsk').onclick = () => { mode = 'ask'; $('#modeAsk').classList.add('on'); $('#modeGo').classList.remove('on'); };
  $('#modeGo').onclick = () => { mode = 'go'; $('#modeGo').classList.add('on'); $('#modeAsk').classList.remove('on'); };
  $('#sendbtn').onclick = sendCEO;
  $('#ceoinput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCEO(); } });

  /* pan/zoom */
  const wrap = $('#orgwrap');
  let dragging = false, dx0 = 0, dy0 = 0;
  wrap.addEventListener('mousedown', e => { dragging = true; dx0 = e.clientX - vx; dy0 = e.clientY - vy; });
  window.addEventListener('mousemove', e => { if (dragging) { vx = e.clientX - dx0; vy = e.clientY - dy0; applyView(false); } });
  window.addEventListener('mouseup', () => dragging = false);
  wrap.addEventListener('wheel', e => { e.preventDefault(); vz = Math.min(1.6, Math.max(.4, vz * (e.deltaY < 0 ? 1.08 : 0.93))); applyView(false); }, { passive: false });
  $('#zin').onclick = () => { vz = Math.min(1.6, vz * 1.15); applyView(true); };
  $('#zout').onclick = () => { vz = Math.max(.4, vz * 0.87); applyView(true); };
  $('#zfit').onclick = () => { vx = -80; vy = -40; vz = 0.92; applyView(true); };
  $('#followbtn').onclick = function () { follow = !follow; this.classList.toggle('on', follow); };

  $('#savesettings').onclick = saveSettings;
  $('#testkey').onclick = async () => {
    $('#testresult').textContent = 'Đang kiểm tra…';
    const r = await post('/engine/test', { apiKey: $('#set_apikey').value.trim() });
    $('#testresult').textContent = r.message;
    $('#testresult').style.color = r.ok ? 'var(--jade)' : 'var(--red)';
  };
  $('#editdna').onclick = () => showWizard(STATE.dna);
  $('#brainfile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/brain/upload', { method: 'POST', body: fd }).then(x => x.json());
    toast(r.ok ? '📚 Đã nạp vào Brain' : '⚠️ Lỗi', r.ok ? `${f.name} · ${r.chunks} đoạn được index` : (r.error || ''), r.ok ? '' : 'red');
    refreshBrain();
  });
  $('#hirebtn').onclick = () => openHire();
  $('#cron_add').onclick = async () => {
    const cmd = $('#cron_cmd').value.trim();
    if (!cmd) return toast('⚠️ Thiếu nội dung', 'Nhập nhiệm vụ cần chạy định kỳ', 'red');
    const r = await post('/crons', { title: cmd.slice(0, 60), command: cmd, mode: 'go', cadence: $('#cron_cadence').value, hhmm: $('#cron_hhmm').value, dow: 1 });
    if (r.ok) { $('#cron_cmd').value = ''; renderCrons(); toast('⏰ Đã thêm lịch định kỳ', cmd.slice(0, 60)); }
    else toast('⚠️', r.error || 'Lỗi', 'red');
  };
  $('#skillzip').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/skills/install', { method: 'POST', body: fd }).then(x => x.json());
    toast(r.ok ? '🧩 Đã cài skill' : '⚠️ Lỗi', r.ok ? `${r.slug} — vào Nhân sự để gắn cho agent` : (r.error || ''), r.ok ? '' : 'red');
    e.target.value = '';
    refreshConnect();
  });
  $('#cobadge').onclick = toggleCompanyDropdown;
  document.addEventListener('click', e => {
    const dd = $('#coDropdown');
    if (dd && dd.classList.contains('show') && !dd.contains(e.target) && !$('#cobadge').contains(e.target)) dd.classList.remove('show');
  });
  $('#ini_check').onclick = async () => {
    $('#ini_check').textContent = 'Đang rà soát…';
    const r = await post('/initiatives/check', {});
    $('#ini_check').textContent = '🔄 Nhờ COO rà soát ngay';
    toast(r.count ? '💡 COO vừa đề xuất' : 'COO đã rà soát', r.count ? `${r.count} sáng kiến mới` : 'Hiện chưa có việc mới đáng đề xuất', r.count ? 'amber' : '');
    refreshInitiatives(); refreshInitiativeBadge();
  };
  $('#importfile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm(`Khôi phục từ "${f.name}" sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại và app sẽ tự thoát. Tiếp tục?`)) { e.target.value = ''; return; }
    const fd = new FormData(); fd.append('file', f);
    const r = await fetch('/api/backup/import', { method: 'POST', body: fd }).then(x => x.json());
    if (r.ok) alert(r.message);
    else toast('⚠️ Lỗi', r.error || '', 'red');
    e.target.value = '';
  });
}

/* ================= ONBOARDING WIZARD (chương 6) ================= */
const INDUSTRIES = [['banle', 'Bán lẻ'], ['fnb', 'F&B'], ['thoitrang', 'Thời trang'], ['mypham', 'Mỹ phẩm'], ['giaoduc', 'Giáo dục'], ['suckhoe', 'Sức khỏe-Dược'], ['noithat', 'Nội thất-Xây dựng'], ['bds', 'BĐS'], ['dichvu', 'Dịch vụ'], ['sanxuat', 'Sản xuất'], ['tmdt', 'TMĐT'], ['khac', 'Khác']];
const TRAITS = [['gan_gui', 'Gần gũi'], ['sang_trong', 'Sang trọng'], ['hai_huoc', 'Hài hước'], ['chuyen_gia', 'Chuyên gia'], ['toi_gian', 'Tối giản'], ['nang_luong', 'Năng lượng']];
const CHANNELS = ['Facebook', 'Zalo', 'TikTok Shop', 'Shopee', 'Website', 'Cửa hàng', 'B2B/Đại lý'];
const DEPT_PRESET = { fnb: ['mkt', 'kd', 'cskh', 'tckt'], banle: ['mkt', 'kd', 'cskh', 'tckt'], mypham: ['mkt', 'kd', 'cskh', 'tckt'], giaoduc: ['mkt', 'kd', 'cskh', 'ns'], suckhoe: ['mkt', 'kd', 'cskh', 'tckt'], default: ['mkt', 'kd', 'tckt', 'cskh', 'vh', 'data'] };
const ALL_DEPTS = [['mkt', '📣 Marketing'], ['kd', '💰 Kinh doanh'], ['tckt', '📊 Tài chính-KT'], ['ns', '👥 Nhân sự'], ['cskh', '🤝 CSKH'], ['vh', '⚙️ Vận hành-HC'], ['data', '💻 Dữ liệu-CN']];
const BANNED_HINT = { suckhoe: 'không hứa "chữa bệnh"\nkhông so sánh trực tiếp đối thủ\nkhông giảm giá quá 30%', fnb: 'không hứa "chữa bệnh"\nkhông so sánh trực tiếp đối thủ', default: 'không so sánh trực tiếp đối thủ\nkhông cam kết kết quả tuyệt đối' };

let W = { step: 1, engineKind: 'demo', apiKey: '', traits: [], channels: [], depts: [] };

function showWizard(prefill) {
  if (prefill) {
    W = {
      step: 1, engineKind: STATE?.engine?.kind || 'demo', apiKey: '',
      name: prefill.company?.name, industry: prefill.company?.industry, size: prefill.company?.size, region: prefill.company?.region,
      products: (prefill.products || []).map(p => `${p.name} | ${p.price_range}`).join('\n'),
      customers: prefill.customers?.profile, goal: prefill.goal_3m,
      traits: prefill.voice?.traits || [], address: prefill.voice?.address,
      banned: (prefill.voice?.banned || []).join('\n'),
      channels: prefill.customers?.channels || [], depts: prefill.departments_enabled || []
    };
  }
  $('#wizardwrap').classList.add('show');
  renderWizard();
}

function renderWizard() {
  const wz = $('#wizard');
  const prog = `<div class="wprog">${[1, 2, 3, 4, 5, 6, 7].map(i => `<i class="${i <= W.step ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (W.step === 1) body = `
    <h1>⚡ Bước 1 — Kích hoạt engine</h1><div class="wsub">Chọn nguồn sức mạnh cho công ty AI của sếp. Có thể đổi bất cứ lúc nào trong Cài đặt.</div>
    <div class="wgrid">
      <div class="wopt ${W.engineKind === 'demo' ? 'on' : ''}" data-ek="demo"><b>🎬 Chạy thử (Demo)</b><small>Không cần key, không tốn tiền. Toàn bộ AI Loop chạy mô phỏng — hợp để làm quen.</small></div>
      <div class="wopt ${W.engineKind === 'api' ? 'on' : ''}" data-ek="api"><b>🔑 Claude API</b><small>Nhập API key (console.anthropic.com). Chạy thật, trả theo lượng dùng, quy đổi VND.</small></div>
    </div>
    <div class="wfield" id="keyfield" style="margin-top:14px;${W.engineKind === 'api' ? '' : 'display:none'}">
      <label>API key Claude</label>
      <input class="inp" id="w_apikey" type="password" placeholder="sk-ant-…" value="${esc(W.apiKey)}">
      <div style="display:flex;gap:9px;align-items:center;margin-top:8px">
        <button class="btn ghost" id="w_testkey" style="padding:6px 14px">🔍 Kiểm tra kết nối</button>
        <span id="w_testresult" style="font-size:12px"></span>
      </div>
      <div class="hint">Lấy key tại console.anthropic.com → API Keys → Create Key. Key chỉ lưu trên máy sếp (file quyền 600).</div>
    </div>`;
  if (W.step === 2) body = `
    <h1>🏢 Bước 2 — Danh thiếp doanh nghiệp</h1><div class="wsub">Vài thông tin cơ bản để cả công ty AI hiểu mình đang làm cho ai. <button class="btn ghost" id="samplebtn" style="padding:4px 10px;font-size:11px">✨ Điền dữ liệu mẫu</button></div>
    <div class="wfield"><label>Tên công ty / thương hiệu</label><input class="inp" id="w_name" value="${esc(W.name || '')}" placeholder="VD: Trà Thảo Mộc TâmAn"></div>
    <div class="wgrid">
      <div class="wfield"><label>Ngành</label><select class="sel" id="w_industry">${INDUSTRIES.map(([v, l]) => `<option value="${v}" ${W.industry === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="wfield"><label>Quy mô</label><select class="sel" id="w_size">${['1-5', '6-20', '21-50', '50+'].map(v => `<option ${W.size === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    </div>
    <div class="wfield"><label>Khu vực</label><input class="inp" id="w_region" value="${esc(W.region || '')}" placeholder="VD: Hà Nội"></div>`;
  if (W.step === 3) body = `
    <h1>🛍️ Bước 3 — Sản phẩm & khách hàng</h1><div class="wsub">Mỗi dòng một sản phẩm, dạng: Tên | khoảng giá</div>
    <div class="wfield"><label>Sản phẩm/dịch vụ chính (1–5 dòng)</label><textarea class="inp" id="w_products" rows="4" placeholder="Trà đêm An Nhiên | 159k-289k">${esc(W.products || '')}</textarea></div>
    <div class="wfield"><label>Khách mục tiêu</label><input class="inp" id="w_customers" value="${esc(W.customers || '')}" placeholder="VD: Nữ 30-55, văn phòng, mất ngủ/stress"></div>
    <div class="wfield"><label>Kênh bán</label><div class="wgrid3">${CHANNELS.map(c => `<div class="wopt ${W.channels.includes(c.toLowerCase()) ? 'on' : ''}" data-ch="${c.toLowerCase()}">${c}</div>`).join('')}</div></div>
    <div class="wfield"><label>Mục tiêu 3 tháng tới (1 câu)</label><input class="inp" id="w_goal" value="${esc(W.goal || '')}" placeholder="VD: Ra mắt SKU mới, 500 đơn/tháng"></div>`;
  if (W.step === 4) body = `
    <h1>🎙️ Bước 4 — Giọng thương hiệu</h1><div class="wsub">Chọn đúng 2 tính từ mô tả giọng nói của thương hiệu.</div>
    <div class="wfield"><div class="wgrid3">${TRAITS.map(([v, l]) => `<div class="wopt ${W.traits.includes(v) ? 'on' : ''}" data-tr="${v}">${l}</div>`).join('')}</div></div>
    <div class="wfield"><label>Xưng hô với khách</label><select class="sel" id="w_address">
      ${[['shop-ban', 'shop — bạn'], ['em-anh_chi', 'em — anh/chị'], ['em-chi', 'em — chị'], ['chungtoi-quykhach', 'chúng tôi — quý khách']].map(([v, l]) => `<option value="${v}" ${W.address === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="wfield"><label>3 điều KHÔNG được nói (mỗi dòng một điều)</label><textarea class="inp" id="w_banned" rows="3">${esc(W.banned ?? (BANNED_HINT[W.industry] || BANNED_HINT.default))}</textarea></div>`;
  if (W.step === 5) {
    if (!W.depts.length) W.depts = DEPT_PRESET[W.industry] || DEPT_PRESET.default;
    body = `
    <h1>🏗️ Bước 5 — Chọn phòng ban</h1><div class="wsub">Preset theo ngành đã bật sẵn — sếp tùy chỉnh thoải mái. Ban giám đốc (AI COO) luôn có.</div>
    <div class="wgrid3">${ALL_DEPTS.map(([v, l]) => `<div class="wopt ${W.depts.includes(v) ? 'on' : ''}" data-dept="${v}">${l}</div>`).join('')}</div>
    <div class="dept-preview" id="deptpreview"></div>`;
  }
  if (W.step === 6) body = `
    <h1>📚 Bước 6 — Nạp tài liệu (bỏ qua được)</h1>
    <div class="wsub">Bảng giá, catalogue, quy trình… giúp agent trả lời chính xác. Có thể nạp sau trong Company Brain.</div>
    <div class="wopt" style="text-align:center;padding:26px"><b>📥 Sau khi khai trương</b><small>Vào mục 🧠 Company Brain → "＋ Nạp file" để kéo thả tài liệu (.txt .md .csv). Hệ thống tự index để agent tra cứu.</small></div>`;
  if (W.step === 7) body = `
    <h1>🎉 Bước 7 — Lễ khai trương</h1>
    <div class="wsub">Mọi thứ đã sẵn sàng. Bấm nút để dựng công ty <b>${esc(W.name || '')}</b>!</div>
    <div class="wopt" style="line-height:1.9">
      🏢 <b>${esc(W.name || '')}</b> · ${(INDUSTRIES.find(i => i[0] === W.industry) || ['', ''])[1]} · ${esc(W.size || '')} · ${esc(W.region || '')}<br>
      🗣️ Giọng: ${W.traits.map(t => (TRAITS.find(x => x[0] === t) || ['', ''])[1]).join(' + ')}<br>
      🏗️ Phòng ban: ${W.depts.map(d => (ALL_DEPTS.find(x => x[0] === d) || ['', ''])[1]).join(' · ')}<br>
      ⚡ Engine: ${W.engineKind === 'api' ? 'Claude API' : 'Demo (chạy thử miễn phí)'}
    </div>`;
  wz.innerHTML = prog + `<div class="wstep active">${body}</div>
   <div class="wnav">
     ${W.step > 1 ? '<button class="btn ghost" id="wback">← Quay lại</button>' : ''}
     <div class="spacer"></div>
     <button class="btn" id="wnext">${W.step === 7 ? '🎊 Khai trương công ty!' : 'Tiếp tục →'}</button>
   </div>`;

  wz.querySelectorAll('[data-ek]').forEach(o => o.onclick = () => { W.engineKind = o.dataset.ek; captureStep(); renderWizard(); });
  wz.querySelectorAll('[data-ch]').forEach(o => o.onclick = () => { const c = o.dataset.ch; W.channels = W.channels.includes(c) ? W.channels.filter(x => x !== c) : [...W.channels, c]; o.classList.toggle('on'); });
  wz.querySelectorAll('[data-tr]').forEach(o => o.onclick = () => {
    const t = o.dataset.tr;
    if (W.traits.includes(t)) W.traits = W.traits.filter(x => x !== t);
    else { W.traits = [...W.traits, t].slice(-2); }
    renderWizard();
  });
  wz.querySelectorAll('[data-dept]').forEach(o => o.onclick = () => { const d = o.dataset.dept; W.depts = W.depts.includes(d) ? W.depts.filter(x => x !== d) : [...W.depts, d]; o.classList.toggle('on'); });
  const sample = wz.querySelector('#samplebtn');
  if (sample) sample.onclick = () => {
    Object.assign(W, {
      name: 'Trà Thảo Mộc TâmAn', industry: 'fnb', size: '6-20', region: 'Hà Nội',
      products: 'Trà đêm An Nhiên | 159k-289k\nTrà detox Thanh Lọc | 129k-199k',
      customers: 'Nữ 30-55, văn phòng, mất ngủ/stress', goal: 'Ra mắt SKU mới, 500 đơn/tháng',
      traits: ['gan_gui', 'chuyen_gia'], address: 'em-chi',
      banned: 'không hứa "chữa bệnh"\nkhông so sánh trực tiếp đối thủ\nkhông giảm giá quá 30%',
      channels: ['facebook', 'shopee', 'tiktok shop'], depts: ['mkt', 'kd', 'tckt', 'cskh']
    });
    renderWizard();
  };
  const tk = wz.querySelector('#w_testkey');
  if (tk) tk.onclick = async () => {
    const r = await post('/engine/test', { apiKey: wz.querySelector('#w_apikey').value.trim() });
    const t = wz.querySelector('#w_testresult');
    t.textContent = r.message; t.style.color = r.ok ? 'var(--jade)' : 'var(--red)';
  };
  const back = wz.querySelector('#wback');
  if (back) back.onclick = () => { captureStep(); W.step--; renderWizard(); };
  wz.querySelector('#wnext').onclick = async () => {
    captureStep();
    if (W.step === 2 && !(W.name || '').trim()) { toast('⚠️ Thiếu thông tin', 'Nhập tên công ty đã nhé sếp', 'red'); return; }
    if (W.step === 4 && W.traits.length !== 2) { toast('⚠️ Chọn đúng 2 tính từ', 'Giọng thương hiệu cần đúng 2 tính từ', 'red'); return; }
    if (W.step === 5 && !W.depts.length) { toast('⚠️ Chọn ít nhất 1 phòng ban', '', 'red'); return; }
    if (W.step < 7) { W.step++; renderWizard(); return; }
    await finishWizard();
  };
}
function captureStep() {
  const g = id => { const e = $('#wizard').querySelector('#' + id); return e ? e.value : undefined; };
  if (W.step === 1 && W.engineKind === 'api') W.apiKey = g('w_apikey') ?? W.apiKey;
  if (W.step === 2) { W.name = g('w_name'); W.industry = g('w_industry'); W.size = g('w_size'); W.region = g('w_region'); }
  if (W.step === 3) { W.products = g('w_products'); W.customers = g('w_customers'); W.goal = g('w_goal'); }
  if (W.step === 4) { W.address = g('w_address'); W.banned = g('w_banned'); }
}
async function finishWizard() {
  const dna = {
    company: { name: (W.name || '').trim(), industry: W.industry || 'khac', size: W.size || '1-5', region: (W.region || '').trim() },
    products: (W.products || '').split('\n').filter(l => l.trim()).slice(0, 5).map(l => {
      const [name, price] = l.split('|').map(x => x.trim());
      return { name: name || l.trim(), price_range: price || '' };
    }),
    customers: { profile: (W.customers || '').trim(), channels: W.channels },
    goal_3m: (W.goal || '').trim(),
    voice: { traits: W.traits, address: W.address || 'em-anh_chi', banned: (W.banned || '').split('\n').filter(l => l.trim()) },
    departments_enabled: W.depts,
    facts: []
  };
  const r = await post('/onboarding', { dna, engine: { kind: W.engineKind, apiKey: W.apiKey || undefined } });
  if (!r.ok) { toast('⚠️ Lỗi', r.error || 'Không lưu được', 'red'); return; }
  location.reload();
}

init();
