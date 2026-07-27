'use strict';
/* Test Pha B — HÀNH ĐỘNG THẬT QUA MCP.
   Gán write_file (filesystem MCP) cho 1 phòng → giao việc sinh "hành động thật" → CEO duyệt →
   AICORP GỌI TOOL MCP THẬT → tệp thật xuất hiện trên đĩa + nhật ký "Kết quả thật". */
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:3939/api';
const H = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3939' };
const get = p => fetch(BASE + p).then(r => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, passed = 0;
const check = (n, c, d) => { console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); c ? passed++ : failed++; };
async function waitMission(id, states, maxSec = 220) {
  let m;
  for (let i = 0; i < maxSec / 2; i++) { await sleep(2000); m = (await get('/missions')).find(x => x.id === id); if (m && states.includes(m.status)) return m; }
  return m;
}
async function waitConnected(id, maxSec = 30) {
  for (let i = 0; i < maxSec; i++) { const sv = (await get('/mcp')).servers.find(s => s.id === id); if (sv && sv.status === 'connected') return sv; await sleep(1000); }
  return (await get('/mcp')).servers.find(s => s.id === id);
}

(async () => {
  const HOME = process.env.AICORP_HOME || path.join(require('os').homedir(), 'AICORP');
  const WS = path.join(HOME, 'workspace');
  fs.mkdirSync(WS, { recursive: true });

  if (!(await get('/state')).onboarded) {
    await post('/onboarding', { dna: { company: { name: 'Trà Thảo Mộc TâmAn', industry: 'fnb', size: '6-20', region: 'HN' }, products: [{ name: 'Trà đêm An Nhiên', price_range: '159k-289k' }], customers: { profile: 'Nữ 30-55', channels: ['facebook'] }, goal_3m: '500 đơn/tháng', voice: { traits: ['gan_gui', 'chuyen_gia'], address: 'em-chị', banned: ['không hứa chữa bệnh'] }, departments_enabled: ['mkt', 'kd', 'tckt', 'ns', 'cskh', 'vh', 'data'], facts: [] }, engine: { kind: 'demo' } });
  }
  await post('/settings', { tran_per_day: 100000000, tran_per_mission: 5000000 });

  /* 1. Thêm MCP filesystem trỏ vào workspace + assign write_file cho phòng Marketing */
  const add = await post('/mcp/servers', { name: 'Tệp công ty', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', WS] });
  check('Thêm MCP filesystem (workspace)', add.ok, add.id);
  const sv = await waitConnected(add.id, 30);
  check('Kết nối + có write_file', sv && sv.status === 'connected' && sv.tools.some(t => t.name === 'write_file'), sv && sv.status);
  await post('/mcp/assign', { serverId: add.id, tool: 'write_file', deptId: 'mkt', on: true });
  check('Gán write_file cho phòng Marketing', ((await get('/mcp')).servers.find(s => s.id === add.id).assignments || []).some(a => a.tool_name === 'write_file' && a.dept_id === 'mkt'));

  /* 2. Giao việc sinh "hành động thật" cho Marketing */
  const actsBefore = (await get('/mcp')).actions.length;
  const mis = await post('/chat', { text: 'Soạn bài giới thiệu Trà đêm An Nhiên rồi xuất ra tệp', mode: 'go' });
  let m = await waitMission(mis.missionId, ['waiting_approval', 'reporting', 'done'], 200);
  check('Nhiệm vụ chạy tới điểm cần duyệt', m && ['waiting_approval', 'reporting', 'done'].includes(m.status), m && m.status);

  /* 3. Tìm approval hành động thật → phải là hành động MCP (tiêu đề nhắc MCP) */
  let ap = (await get('/approvals?status=pending')).find(a => a.mission_id === mis.missionId && a.type === 'real_action');
  check('Có phê duyệt "hành động thật"', !!ap, ap && ap.title);
  check('Đã NÂNG thành hành động MCP (không mô phỏng)', ap && /MCP/i.test(ap.title || ''), ap && (ap.title || '').slice(0, 50));
  /* AUDIT #2/#8: cổng duyệt hiện ĐỦ khoá tham số (không cắt cả cụm giấu field nguy hiểm) */
  check('Cổng duyệt hiện đủ khoá tham số (path & content)', ap && /path=/.test(ap.context || '') && /content=/.test(ap.context || ''), ap && (ap.context || '').slice(-60));

  /* 4. CEO duyệt → GỌI TOOL MCP THẬT */
  if (ap) await post(`/approvals/${ap.id}/decide`, { decision: 'approve' });
  await sleep(4000);

  /* 5. Bằng chứng: tệp THẬT xuất hiện trên đĩa + nhật ký kết quả */
  const outDir = path.join(WS, 'mcp-out');
  let files = [];
  try { files = fs.readdirSync(outDir).filter(f => f.endsWith('.md')); } catch {}
  check('Tệp THẬT được ghi ra đĩa qua MCP', files.length >= 1, files.join(', '));
  if (files.length) {
    const content = fs.readFileSync(path.join(outDir, files[0]), 'utf8');
    check('Nội dung tệp không rỗng (deliverable thật)', content.trim().length > 20, content.length + ' ký tự');
  } else check('Nội dung tệp không rỗng (deliverable thật)', false);

  const actions = (await get('/mcp')).actions;
  check('Nhật ký "Kết quả thật" có bản ghi mới', actions.length > actsBefore, `${actsBefore}→${actions.length}`);
  const wfAct = actions.find(a => a.tool === 'write_file');
  check('Bản ghi là write_file, KHÔNG lỗi', wfAct && wfAct.isError === false, wfAct && (wfAct.result || '').slice(0, 40));

  /* 5b. AUDIT #4/#9: kênh kinh doanh (facebook) KHÔNG bị write_file cướp — vẫn theo luồng mock */
  const mis2 = await post('/chat', { text: 'Viết bài rồi đăng lên fanpage', mode: 'go' });
  await waitMission(mis2.missionId, ['waiting_approval', 'reporting', 'done'], 200);
  const ap2 = (await get('/approvals?status=pending')).find(a => a.mission_id === mis2.missionId && a.type === 'real_action' && /fanpage|đăng|facebook/i.test(a.title || ''));
  check('Kênh facebook KHÔNG bị write_file cướp (giữ mock)', ap2 && !/qua MCP/i.test(ap2.title || ''), ap2 ? (ap2.title || '').slice(0, 40) : '(không có approval facebook)');
  if (ap2) await post(`/approvals/${ap2.id}/decide`, { decision: 'reject' });

  /* 6. Dọn kết nối test */
  await fetch(BASE + '/mcp/servers/' + add.id, { method: 'DELETE', headers: H });

  console.log(`\n${failed === 0 ? '🎉 MCP-B PASSED' : '💥 MCP-B FAILED'} (${passed} passed${failed ? ', ' + failed + ' failed' : ''})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('💥', e); process.exit(1); });
