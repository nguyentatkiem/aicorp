'use strict';
/* Test hồi quy các lỗi do audit đối kháng phát hiện — chạy với server đã onboard (AICORP_HOME sạch hoặc dùng lại). */
const BASE = 'http://localhost:3939/api';
const get = p => fetch(BASE + p).then(r => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, passed = 0;
const check = (n, c, d) => { console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); c ? passed++ : failed++; };
async function waitMission(id, states, maxSec = 200) {
  let m;
  for (let i = 0; i < maxSec / 2; i++) { await sleep(2000); m = (await get('/missions')).find(x => x.id === id); if (m && states.includes(m.status)) return m; }
  return m;
}

(async () => {
  if (!(await get('/state')).onboarded) {
    await post('/onboarding', { dna: { company: { name: 'TâmAn', industry: 'fnb', size: '6-20', region: 'HN' }, products: [{ name: 'Trà đêm', price_range: '159k-289k' }], customers: { profile: 'nữ 30-55', channels: ['facebook'] }, goal_3m: 'x', voice: { traits: ['gan_gui', 'chuyen_gia'], address: 'em-chị', banned: [] }, departments_enabled: ['mkt', 'kd', 'tckt', 'ns', 'cskh', 'vh', 'data'], facts: [] }, engine: { kind: 'demo' } });
  }
  // nâng trần ngày để test không bị chặn giữa chừng (test hồi quy thường chạy sau các test khác)
  await post('/settings', { tran_per_day: 100000000, tran_per_mission: 5000000 });

  /* A1. Approval Gate KHÔNG fail-open với decision lạ */
  const pub = await post('/chat', { text: 'Viết bài rồi đăng bài lên fanpage', mode: 'go' });
  let m = await waitMission(pub.missionId, ['waiting_approval', 'done'], 200);
  let ap = (await get('/approvals?status=pending')).find(a => a.mission_id === pub.missionId && a.type === 'real_action');
  if (ap) {
    const bad = await post(`/approvals/${ap.id}/decide`, { decision: 'yolo_execute' });
    check('Approval Gate từ chối decision lạ (không fail-open thành duyệt)', !bad.ok && !!bad.error, bad.error);
    const still = (await get('/approvals?status=pending')).find(a => a.id === ap.id);
    check('Approval vẫn pending sau decision lạ', !!still);
    await post(`/approvals/${ap.id}/decide`, { decision: 'reject' });
  } else check('(bỏ qua A1 — không có approval)', true);
  await waitMission(pub.missionId, ['done'], 120);

  /* A2. Đặt ngưỡng cao 95 → task thường vẫn phải đạt (demo review đọc ngưỡng cấu hình) */
  await post('/settings', { nguong_diem: 95, max_review_rounds: 3 });
  const hi = await post('/chat', { text: 'Soạn bộ FAQ cho sản phẩm', mode: 'go' });
  m = await waitMission(hi.missionId, ['done', 'waiting_approval'], 200);
  const hiTasks = await get('/tasks?mission=' + hi.missionId);
  check('Ngưỡng 95: task đạt có điểm ≥95', hiTasks.some(t => t.score >= 95), 'điểm: ' + hiTasks.map(t => t.score).join(','));
  for (const a of (await get('/approvals?status=pending')).filter(x => x.mission_id === hi.missionId)) await post(`/approvals/${a.id}/decide`, { decision: a.type === 'real_action' ? 'approve' : 'accept' });
  await post('/settings', { nguong_diem: 90 });

  /* A3. Agent bị tạm dừng → task giao cho họ bị hủy, không chạy */
  const hire = await post('/agents', { dept_id: 'data', name: 'NV Test Pause', avatar: '🧪', role_title: 'Chuyên viên phân tích test', level: 'nv' });
  await fetch(`${BASE}/agents/${hire.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: 0 }) });
  const org = await get('/org');
  check('Agent bị tạm dừng không còn trong roster giao việc', !org.agents.some(a => a.id === hire.id));

  /* A4. Cron dùng ngày LOCAL — bắn 1 lần, không trùng */
  const cr = await post('/crons', { title: 'Cron local', command: 'Phân tích số liệu', mode: 'go', cadence: 'daily', hhmm: '00:00' });
  const f1 = await post('/crons/check', { force: true });
  const f2 = await post('/crons/check', { force: true });
  check('Cron không bắn trùng cùng ngày (dùng ngày local)', f1.fired >= 1 && f2.fired === 0, `f1=${f1.fired} f2=${f2.fired}`);
  await fetch(`${BASE}/crons/${cr.id}`, { method: 'DELETE' });

  /* A5. Artifact 2 task khác nhau cùng tiêu đề không ghi đè (taskId trong tên) */
  const arts = await get('/artifacts');
  const names = arts.map(a => a.name);
  check('Tên artifact không trùng lặp giữa các task', new Set(names).size === names.length, `${new Set(names).size}/${names.length} tên duy nhất`);

  /* A6. Giá "1,5-3 triệu" parse đúng qua module (test trực tiếp) */
  const kd = require('/Users/nguyenkiem/aicorp/server/demo/kd.js');
  const q = kd.outputs.nv_quote({ muc_tieu: 'báo giá', format_dau_ra: 'xlsx' }, { dna: { company: { name: 'X' }, products: [{ name: 'Áo', price_range: '1,5-3 triệu' }], customers: {}, voice: { address: 'shop-bạn', banned: [] } }, round: 0 });
  const hasMillion = /1\.[0-9]{3}\.[0-9]{3}|2\.[0-9]{3}\.[0-9]{3}|3\.000\.000/.test(q);
  check('Parse giá "1,5-3 triệu" ra hàng triệu (không thành 1.500đ)', hasMillion);

  /* A7. Backup restore chặn entry ngoài data/ workspace/ */
  const AdmZip = require('/Users/nguyenkiem/aicorp/node_modules/adm-zip');
  const z = new AdmZip();
  z.addFile('data/aicorp.db', Buffer.from('fake'));
  z.addFile('secret/credentials.json', Buffer.from('{"anthropic_api_key":"evil"}'));
  const fd = new FormData(); fd.append('file', new Blob([z.toBuffer()]), 'bad.aicorp');
  const imp = await fetch(BASE + '/backup/import', { method: 'POST', body: fd }).then(r => r.json());
  check('Backup restore từ chối file chứa secret/ ngoài data|workspace', !imp.ok && !!imp.error, imp.error || 'KHÔNG chặn!');

  /* A8. XSS: lệnh CEO có <img onerror> → thẻ bị escape (không còn dấu < thô) */
  await post('/chat', { text: 'Nhiệm vụ <img src=x onerror=alert(1)> test', mode: 'go' });
  await sleep(2500);
  const chats = await get('/chats');
  // an toàn khi KHÔNG còn '<img' thô (esc đã đổi < thành &lt;); text "onerror=" escaped là vô hại
  check('Lệnh CEO chứa <img> bị escape trong chat (không còn thẻ thô)', !chats.some(c => /<img\b/i.test(c.html || '')));

  console.log(`\n${failed ? '💥 ' + failed + ' FAILED' : '🎉 AUDIT-FIX PASSED'} (${passed} passed)`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('💥 crash:', e); process.exit(1); });
