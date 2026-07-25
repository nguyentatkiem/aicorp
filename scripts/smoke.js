'use strict';
/* Smoke test AICORP — chạy toàn bộ AI Loop ở chế độ demo, kiểm các mục nghiệm thu chương 11 */
const BASE = 'http://localhost:3939/api';
const get = p => fetch(BASE + p).then(r => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));

let failed = 0;
function check(name, cond, detail) {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failed++;
}

(async () => {
  // 1. Onboarding
  let st = await get('/state');
  if (!st.onboarded) {
    const r = await post('/onboarding', {
      dna: {
        company: { name: 'Trà Thảo Mộc TâmAn', industry: 'fnb', size: '6-20', region: 'Hà Nội' },
        products: [{ name: 'Trà đêm An Nhiên', price_range: '159k-289k' }],
        customers: { profile: 'Nữ 30-55, văn phòng, mất ngủ/stress', channels: ['facebook', 'shopee'] },
        goal_3m: 'Ra mắt SKU mới, 500 đơn/tháng',
        voice: { traits: ['gan_gui', 'chuyen_gia'], address: 'em-chi', banned: ['không hứa chữa bệnh'] },
        departments_enabled: ['mkt', 'kd', 'tckt', 'cskh'], facts: []
      },
      engine: { kind: 'demo' }
    });
    check('Onboarding DNA', r.ok);
  } else check('Onboarding DNA (đã có sẵn)', true);
  st = await get('/state');
  check('State onboarded', st.onboarded === true);

  const org = await get('/org');
  check('Org: 4 phòng ban bật', org.depts.length === 4, org.depts.map(d => d.id).join(','));
  check('Org: có agent + COO', org.agents.some(a => a.id === 'coo') && org.agents.length >= 13, org.agents.length + ' agent');

  // 2. Mission mode "ask" → COO hỏi lại → trả lời → chạy
  const m1 = await post('/chat', { text: 'Tháng sau ra mắt trà đêm An Nhiên. Chuẩn bị content, dự toán chi phí, báo giá đại lý và FAQ.', mode: 'ask' });
  check('Tạo mission (mode ask)', m1.ok && m1.kind === 'mission', m1.missionId);
  await sleep(4000);
  let act = await get('/missions/active');
  check('COO brief-back (hỏi lại CEO)', act.status === 'briefing', 'status=' + act.status);

  const ans = await post('/chat', { text: 'Facebook trước. TikTok đẩy sau 1 tuần.', mode: 'ask' });
  check('CEO trả lời brief-back', ans.kind === 'answer');

  // đợi mission chạy xong (demo ~60-90s)
  let tries = 0, m;
  while (tries++ < 60) {
    await sleep(3000);
    m = await get('/missions/active');
    if (['waiting_approval', 'done', 'failed', 'over_budget'].includes(m.status)) break;
  }
  check('Mission chạy đến trạng thái cuối', ['waiting_approval', 'done'].includes(m.status), 'status=' + m.status + ' progress=' + m.progress);

  const tasks = await get('/tasks?mission=' + m.id);
  check('Có task được phân rã', tasks.length >= 3, tasks.length + ' task');
  check('Có vòng review bị trả lại (nv_content 87đ vòng 1)', m.rejectedCount >= 1, m.rejectedCount + ' lần trả lại');
  check('Task có điểm review ≥ ngưỡng', tasks.some(t => t.score >= 90));

  const arts = await get('/artifacts');
  check('Xưởng có artifact', arts.length >= 2, arts.length + ' file');
  const fs = require('fs');
  const okFiles = arts.filter(a => { try { return fs.statSync(a.path).size > 200; } catch { return false; } });
  check('File thật tồn tại trên đĩa (>200 bytes)', okFiles.length === arts.length, okFiles.map(a => a.type).join(','));

  // 3. Approval gate: hành động thật dừng chờ duyệt
  const aps = await get('/approvals?status=pending');
  check('Hành động thật dừng ở Hộp phê duyệt', aps.length >= 1, aps.map(a => a.type).join(','));
  if (aps.length) {
    const r = await post(`/approvals/${aps[0].id}/decide`, { decision: 'approve' });
    check('CEO duyệt approval', r.ok);
    await sleep(6000);
    m = await get('/missions/active');
  }
  // đợi báo cáo
  tries = 0;
  while (tries++ < 20 && m.status !== 'done') { await sleep(3000); m = await get('/missions/active'); }
  check('Mission done + có báo cáo COO', m.status === 'done' && !!m.report_html, 'status=' + m.status);
  check('Chi phí được ghi nhận', m.spent_vnd > 0, m.spent_vnd + 'đ');

  // 4. Budget guard: mission trần 500đ phải dừng over_budget
  const m2 = await post('/chat', { text: 'Viết 3 bài Facebook test budget guard', mode: 'go', budget_vnd: 500 });
  await sleep(6000);
  let m2s = (await get('/missions')).find(x => x.id === m2.missionId);
  let t2 = 0;
  while (t2++ < 15 && !['over_budget', 'done', 'failed'].includes(m2s.status)) { await sleep(2000); m2s = (await get('/missions')).find(x => x.id === m2.missionId); }
  check('Budget guard dừng mission trần 500đ', m2s.status === 'over_budget', 'status=' + m2s.status + ' spent=' + m2s.spent_vnd);

  // 5. Brain upload
  fs.writeFileSync('/tmp/aicorp-test-banggia.csv', 'SKU,Giá vốn,Giá bán\nTrà đêm An Nhiên,41200,189000');
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync('/tmp/aicorp-test-banggia.csv')]), 'bang-gia-test.csv');
  const up = await fetch(BASE + '/brain/upload', { method: 'POST', body: fd }).then(r => r.json());
  check('Nạp file vào Brain + index', up.ok && up.chunks > 0, up.chunks + ' chunks');

  console.log(failed ? `\n💥 ${failed} kiểm tra FAILED` : '\n🎉 Tất cả kiểm tra PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('💥 Smoke crash:', e); process.exit(1); });
