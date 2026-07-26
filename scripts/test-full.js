'use strict';
/* Bộ test tích hợp đầy đủ AICORP v2 — chạy với server mới khởi động trên AICORP_HOME sạch.
   Cách chạy:  AICORP_NO_OPEN=1 AICORP_HOME=/tmp/aicorp-test node server/index.js  (cửa sổ 1)
               node scripts/test-full.js                                            (cửa sổ 2) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:3939/api';
const get = p => fetch(BASE + p).then(r => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
const patch = (p, b) => fetch(BASE + p, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
const del = p => fetch(BASE + p, { method: 'DELETE' }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failed = 0, passed = 0;
function check(name, cond, detail) {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  cond ? passed++ : failed++;
}

async function waitMission(id, states, maxSec = 200) {
  let m;
  for (let i = 0; i < maxSec / 2; i++) {
    await sleep(2000);
    m = (await get('/missions')).find(x => x.id === id);
    if (m && states.includes(m.status)) return m;
  }
  return m;
}

(async () => {
  /* ---------- 1. ONBOARDING ---------- */
  let st = await get('/state');
  if (!st.onboarded) {
    await post('/onboarding', {
      dna: {
        company: { name: 'Trà Thảo Mộc TâmAn', industry: 'fnb', size: '6-20', region: 'Hà Nội' },
        products: [{ name: 'Trà đêm An Nhiên', price_range: '159k-289k' }],
        customers: { profile: 'Nữ 30-55, văn phòng, mất ngủ/stress', channels: ['facebook', 'shopee'] },
        goal_3m: 'Ra mắt SKU mới, 500 đơn/tháng',
        voice: { traits: ['gan_gui', 'chuyen_gia'], address: 'em-chị', banned: ['không hứa chữa bệnh'] },
        departments_enabled: ['mkt', 'kd', 'tckt', 'ns', 'cskh', 'vh', 'data'], facts: []
      },
      engine: { kind: 'demo' }
    });
  }
  st = await get('/state');
  check('Onboarding + state', st.onboarded === true);
  const org = await get('/org');
  check('Org đủ 7 phòng + BGĐ ẩn', org.depts.length === 7, org.depts.map(d => d.id).join(','));
  check('Skill library nạp từ skills-seed', (await get('/skills')).length >= 15, (await get('/skills')).length + ' skill');

  /* ---------- 2. PLANNER THÔNG MINH (định tuyến đúng phòng) ---------- */
  const intents = [
    ['Tuyển 2 nhân viên sale và soạn giáo trình hội nhập', ['ns']],
    ['Soạn SOP quy trình đóng gói và rà soát hợp đồng thuê kho', ['vh']],
    ['Phân tích số liệu bán hàng tháng 6 và làm dashboard cho CEO', ['data']]
  ];
  for (const [cmd, depts] of intents) {
    const r = await post('/chat', { text: cmd, mode: 'go' });
    const m = await waitMission(r.missionId, ['done', 'waiting_approval', 'failed', 'over_budget'], 240);
    const tasks = await get('/tasks?mission=' + r.missionId);
    const gotDepts = [...new Set(tasks.map(t => t.dept_id))];
    check(`Planner định tuyến "${cmd.slice(0, 40)}…"`, depts.every(d => gotDepts.includes(d)) && tasks.length >= 1,
      `${tasks.length} task → [${gotDepts.join(',')}] · mission=${m ? m.status : '?'}`);
  }

  /* ---------- 3. DM — NHẮN RIÊNG AGENT ---------- */
  const dm = await post('/agents/nv_content/dm', { text: 'Em đang làm được những gì?' });
  check('Nhắn riêng agent có trả lời', dm.ok && dm.reply && dm.reply.length > 20, (dm.reply || '').slice(0, 50) + '…');
  const aDetail = await get('/agents/nv_content');
  check('Lịch sử DM lưu lại', (aDetail.dms || []).length >= 2);

  /* ---------- 4. TUYỂN AGENT MỚI + SỬA + TẠM DỪNG ---------- */
  const hire = await post('/agents', { dept_id: 'kd', name: 'NV Chăm đại lý', avatar: '🤝', role_title: 'Chuyên viên kênh đại lý', level: 'nv', skills: ['loc-lead-ban-hang'] });
  check('Tuyển agent mới', hire.ok && hire.id, hire.id);
  const org2 = await get('/org');
  check('Agent mới xuất hiện trong org', org2.agents.some(a => a.id === hire.id));
  const pt = await patch(`/agents/${hire.id}`, { model: 'tp', skills: ['kich-ban-chot-don'] });
  const a2 = await get(`/agents/${hire.id}`);
  check('Sửa kỹ năng agent', pt.ok && a2.model === 'tp' && a2.skills.includes('kich-ban-chot-don'));
  await patch(`/agents/${hire.id}`, { enabled: 0 });
  check('Tạm dừng agent → biến khỏi org', !(await get('/org')).agents.some(a => a.id === hire.id));
  await patch(`/agents/${hire.id}`, { enabled: 1 });
  const noCoo = await patch('/agents/coo', { enabled: 0 });
  check('Không thể tạm dừng COO', !!noCoo.error);

  /* ---------- 5. REAL ACTION → SỬA RỒI DUYỆT + n8n WEBHOOK ---------- */
  let hookPayload = null;
  const hookSrv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => { try { hookPayload = JSON.parse(b); } catch {} res.end('ok'); });
  });
  await new Promise(r => hookSrv.listen(3991, '127.0.0.1', r));
  await patch('/connections/n8n_webhook', { url: 'http://127.0.0.1:3991/hook' });

  const pub = await post('/chat', { text: 'Viết bài giới thiệu sản phẩm và đăng bài lên fanpage', mode: 'go' });
  let pubM = await waitMission(pub.missionId, ['waiting_approval', 'done', 'failed'], 240);
  check('Lệnh "đăng bài" dừng chờ duyệt', pubM && pubM.status === 'waiting_approval', 'status=' + (pubM || {}).status);
  let aps = (await get('/approvals?status=pending')).filter(a => a.mission_id === pub.missionId && a.type === 'real_action');
  check('Approval real_action tồn tại', aps.length >= 1);
  if (aps.length) {
    const artsBefore = (await get('/artifacts')).filter(a => a.task_id === aps[0].task_id).length;
    const dec = await post(`/approvals/${aps[0].id}/decide`, { decision: 'edited', edited_text: '# Bài CEO đã sửa tay\n\nNội dung chính thức do CEO chốt trước khi đăng.' });
    check('CEO sửa rồi duyệt', dec.ok);
    await sleep(4000);
    const artsAfter = (await get('/artifacts')).filter(a => a.task_id === aps[0].task_id);
    // CEO sửa → sinh bản v2 (regen); duyệt bài Facebook → Phase 3 sinh thêm .ics lịch đăng ⇒ ≥ +1
    check('Artifact phiên bản mới sau khi CEO sửa', artsAfter.length >= artsBefore + 1 && artsAfter.some(a => a.type !== 'ics' && a.version >= 2), `${artsAfter.length - artsBefore} file mới`);
    for (let i = 0; i < 10 && !hookPayload; i++) await sleep(500);
    check('n8n webhook THẬT được bắn', !!hookPayload && hookPayload.event === 'real_action_approved', hookPayload ? hookPayload.approval.title.slice(0, 40) : 'không nhận được');
  }
  await waitMission(pub.missionId, ['done'], 100);
  hookSrv.close();

  /* ---------- 6. ESCALATION → RETRY VỚI MODEL MẠNH ---------- */
  await post('/settings', { nguong_diem: 99, max_review_rounds: 1 });
  const esc1 = await post('/chat', { text: 'Soạn 1 kịch bản tư vấn chốt đơn qua điện thoại', mode: 'go' });
  let escM = await waitMission(esc1.missionId, ['waiting_approval', 'done', 'failed'], 180);
  let escAps = (await get('/approvals?status=pending')).filter(a => a.mission_id === esc1.missionId && a.type === 'decision');
  check('Trượt hết vòng review → escalate lên CEO', escAps.length >= 1 && escM.status === 'waiting_approval',
    `${escAps.length} decision approval`);
  if (escAps.length) {
    const opt = escAps[0].options || [];
    check('Escalation có option model mạnh hơn', opt.some(o => o.key === 'retry_strong'));
    await post(`/approvals/${escAps[0].id}/decide`, { decision: 'retry_strong' });
    await sleep(12000); // task chạy lại rồi trượt tiếp (ngưỡng 99) → escalate lần 2
    let escAps2 = (await get('/approvals?status=pending')).filter(a => a.mission_id === esc1.missionId);
    check('Retry model mạnh chạy lại (escalate lần 2 vì ngưỡng 99)', escAps2.length >= 1);
    for (const ap of escAps2) await post(`/approvals/${ap.id}/decide`, { decision: 'accept' });
    escM = await waitMission(esc1.missionId, ['done'], 100);
    check('Chấp nhận có ghi chú → mission done', escM && escM.status === 'done');
  }
  await post('/settings', { nguong_diem: 90, max_review_rounds: 3 });

  /* ---------- 7. BUDGET GUARD + RESUME ---------- */
  const bg = await post('/chat', { text: 'Viết 3 bài Facebook test budget', mode: 'go', budget_vnd: 500 });
  let bgM = await waitMission(bg.missionId, ['over_budget', 'done', 'failed'], 80);
  check('Budget guard chặn trần 500đ', bgM && bgM.status === 'over_budget');
  await post(`/missions/${bg.missionId}/resume`, { budget_vnd: 200000 });
  bgM = await waitMission(bg.missionId, ['done', 'waiting_approval'], 200);
  check('Nâng trần → chạy tiếp đến xong', bgM && ['done', 'waiting_approval'].includes(bgM.status), 'status=' + (bgM || {}).status);
  if (bgM && bgM.status === 'waiting_approval') {
    for (const ap of (await get('/approvals?status=pending')).filter(a => a.mission_id === bg.missionId)) {
      await post(`/approvals/${ap.id}/decide`, { decision: ap.type === 'real_action' ? 'approve' : 'accept' });
    }
    await waitMission(bg.missionId, ['done'], 60);
  }

  /* ---------- 8. CRON ĐỊNH KỲ ---------- */
  const cr = await post('/crons', { title: 'Test cron', command: 'Phân tích nhanh số liệu bán hàng hôm qua', mode: 'go', cadence: 'daily', hhmm: '00:00' });
  check('Tạo cron', cr.ok);
  const missionsBefore = (await get('/missions')).length;
  const fired = await post('/crons/check', { force: true });
  check('Cron bắn nhiệm vụ', fired.fired >= 1, fired.fired + ' fired');
  await sleep(3000);
  check('Mission mới từ cron', (await get('/missions')).length > missionsBefore);
  const fired2 = await post('/crons/check', { force: true });
  check('Cron không bắn 2 lần trong ngày', fired2.fired === 0);
  await del(`/crons/${cr.id}`);
  check('Xóa cron', (await get('/crons')).every(c => c.id !== cr.id));

  /* ---------- 9. BACKUP + SKILL ZIP ---------- */
  const bk = await fetch(BASE + '/backup');
  const buf = Buffer.from(await bk.arrayBuffer());
  check('Backup .aicorp là zip hợp lệ', buf.length > 2000 && buf[0] === 0x50 && buf[1] === 0x4B, Math.round(buf.length / 1024) + ' KB');

  const AdmZip = require(path.join(__dirname, '..', 'node_modules', 'adm-zip'));
  const z = new AdmZip();
  z.addFile('SKILL.md', Buffer.from('---\nname: skill-test-tu-zip\ndescription: skill cài từ zip để test\n---\n\nCông thức test: luôn chào khách theo tên.\n'));
  const fd = new FormData();
  fd.append('file', new Blob([z.toBuffer()]), 'skill-test.zip');
  const inst = await fetch(BASE + '/skills/install', { method: 'POST', body: fd }).then(r => r.json());
  check('Cài skill từ .zip', inst.ok && inst.slug === 'skill-test-tu-zip', inst.slug || inst.error);
  check('Skill zip vào thư viện', (await get('/skills')).some(s => s.id === 'skill-test-tu-zip'));

  // adm-zip tự chuẩn hóa '../' khi TẠO zip → phải vá bytes để tạo zip độc thật sự
  const zEvil = new AdmZip();
  zEvil.addFile('AA/evil/SKILL.md', Buffer.from('---\nname: evil\n---\nx'));
  let evilBuf = zEvil.toBuffer();
  // tên entry xuất hiện trong local header + central dir — thay 'AA/' bằng '../' (cùng độ dài)
  const needle = Buffer.from('AA/evil/SKILL.md');
  let idx;
  while ((idx = evilBuf.indexOf(needle)) !== -1) Buffer.from('../evil/SKILL.md').copy(evilBuf, idx);
  const fdE = new FormData();
  fdE.append('file', new Blob([evilBuf]), 'evil.zip');
  const instE = await fetch(BASE + '/skills/install', { method: 'POST', body: fdE }).then(r => r.json());
  check('Chặn zip-slip khi cài skill (zip vá bytes chứa ../)', !!instE.error, instE.error || 'KHÔNG chặn!');

  /* ---------- 10. BẢO MẬT ---------- */
  const fdT = new FormData();
  fdT.append('file', new Blob(['test']), '../../../evil-path.txt');
  const up = await fetch(BASE + '/brain/upload', { method: 'POST', body: fdT }).then(r => r.json());
  const evilDoc = (await get('/brain')).docs.find(d => d.id === up.id);
  check('Tên file upload được làm sạch', up.ok && evilDoc && !evilDoc.name.includes('..') && !evilDoc.path.includes('..'), evilDoc ? evilDoc.name : '?');

  const settings = await get('/settings');
  check('API settings không lộ key', !JSON.stringify(settings).includes('sk-ant'));

  const xssCmd = 'Test <script>alert(1)</script> nhiệm vụ';
  await post('/chat', { text: xssCmd, mode: 'go' });
  await sleep(2500);
  const chats = await get('/chats');
  check('Lệnh CEO chứa <script> bị escape', !chats.some(c => (c.html || '').includes('<script>')));

  /* ---------- 11. TASK DETAIL / MISSION FULL / SUGGESTIONS ---------- */
  const anyTask = (await get('/tasks'))[0];
  if (anyTask) {
    const td = await get(`/tasks/${anyTask.id}/detail`);
    check('API chi tiết task', !!td.brief !== undefined && Array.isArray(td.reviews));
  }
  const anyM = (await get('/missions'))[0];
  const mf = await get(`/missions/${anyM.id}/full`);
  check('API mission full', Array.isArray(mf.tasks) && Array.isArray(mf.artifacts));
  const sug = await get('/suggestions');
  check('Gợi ý nhiệm vụ theo ngành', Array.isArray(sug.suggestions) && sug.suggestions.length === 3);

  /* ---------- 12. CHẤT LƯỢNG ĐẦU RA MODULE (file thật, có nội dung) ---------- */
  const arts = await get('/artifacts');
  const big = arts.filter(a => { try { return fs.statSync(a.path).size > 1500; } catch { return false; } });
  check('Artifact dày dặn (>1.5KB do module phòng ban)', big.length >= Math.min(3, arts.length), `${big.length}/${arts.length} file`);

  console.log(`\n${failed ? '💥 ' + failed + ' FAILED' : '🎉 TẤT CẢ PASSED'} (${passed} passed)`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('💥 Test crash:', e); process.exit(1); });
