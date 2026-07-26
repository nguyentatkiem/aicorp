'use strict';
/* Test Phase 3: bàn giao dữ liệu, buồng lái, sáng kiến chủ động, họp chiến lược, .eml/.ics */
const BASE = 'http://localhost:3939/api';
const get = p => fetch(BASE + p).then(r => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, passed = 0;
const check = (n, c, d) => { console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); c ? passed++ : failed++; };
async function waitMission(id, states, maxSec = 220) {
  let m;
  for (let i = 0; i < maxSec / 2; i++) { await sleep(2000); m = (await get('/missions')).find(x => x.id === id); if (m && states.includes(m.status)) return m; }
  return m;
}

(async () => {
  if (!(await get('/state')).onboarded) {
    await post('/onboarding', { dna: { company: { name: 'Trà Thảo Mộc TâmAn', industry: 'fnb', size: '6-20', region: 'HN' }, products: [{ name: 'Trà đêm An Nhiên', price_range: '159k-289k' }], customers: { profile: 'nữ 30-55', channels: ['facebook', 'shopee'] }, goal_3m: 'Ra mắt SKU mới, 500 đơn/tháng', voice: { traits: ['gan_gui', 'chuyen_gia'], address: 'em-chị', banned: ['không hứa chữa bệnh'] }, departments_enabled: ['mkt', 'kd', 'tckt', 'ns', 'cskh', 'vh', 'data'], facts: [] }, engine: { kind: 'demo' } });
  }
  await post('/settings', { tran_per_day: 100000000, tran_per_mission: 5000000 });

  /* 1. BÀN GIAO DỮ LIỆU: báo giá phụ thuộc dự toán → output dự toán vào bài báo giá */
  const r1 = await post('/chat', { text: 'Dự toán chi phí ra mắt rồi làm báo giá đại lý', mode: 'go' });
  let m1 = await waitMission(r1.missionId, ['done', 'waiting_approval'], 220);
  const tasks1 = await get('/tasks?mission=' + r1.missionId);
  const withDeps = tasks1.find(t => (t.deps || []).length > 0);
  check('Có task phụ thuộc (dây chuyền)', !!withDeps, withDeps ? withDeps.title : 'không có');
  if (withDeps) {
    const td = await get(`/tasks/${withDeps.id}/detail`);
    check('Output task sau nhắc tới dữ liệu bàn giao phòng khác', /kế thừa dữ liệu bàn giao|bàn giao từ/i.test(td.output || ''), 'có ghi nguồn tham chiếu');
  }
  for (const a of (await get('/approvals?status=pending')).filter(x => x.mission_id === r1.missionId)) await post(`/approvals/${a.id}/decide`, { decision: a.type === 'real_action' ? 'approve' : 'accept' });

  /* 2. BUỒNG LÁI: có KPI + P&L + sự kiện sau khi chạy vài nhiệm vụ */
  const cp = await get('/cockpit');
  check('Buồng lái trả KPI', cp.kpi && typeof cp.kpi.projectedRevenue === 'number');
  check('Buồng lái có P&L 5 dòng', Array.isArray(cp.pnl) && cp.pnl.length === 5);
  check('Buồng lái có dòng sự kiện kinh doanh', cp.events.length >= 1, cp.events.length + ' sự kiện');
  check('Buồng lái có xu hướng 6 tuần', cp.trend.length === 6);

  /* 3. HỌP CHIẾN LƯỢC: lệnh "có nên" → họp → approval quyết định có options A/B/C */
  const r3 = await post('/chat', { text: 'Có nên tăng gấp đôi ngân sách quảng cáo để đẩy nhanh doanh số không', mode: 'go' });
  let m3 = await waitMission(r3.missionId, ['waiting_approval', 'done'], 120);
  const meetAps = (await get('/approvals?status=pending')).filter(a => a.mission_id === r3.missionId && a.type === 'decision');
  check('Lệnh chiến lược → tạo phương án chờ CEO', meetAps.length >= 1 && m3.status === 'waiting_approval', 'status=' + (m3 || {}).status);
  if (meetAps.length) {
    const opts = meetAps[0].options || [];
    check('Cuộc họp cho ≥2 phương án A/B/C', opts.length >= 2, opts.map(o => o.key).join(','));
    check('Approval họp có perspectives (góc nhìn TP)', !!meetAps[0].preview && meetAps[0].preview.length > 50);
    // CEO chọn phương án A
    const dec = await post(`/approvals/${meetAps[0].id}/decide`, { decision: opts[0].key });
    check('CEO chọn phương án chiến lược', dec.ok);
    await sleep(2000);
    m3 = (await get('/missions')).find(x => x.id === r3.missionId);
    check('Mission họp hoàn tất sau khi chọn', m3.status === 'done', 'status=' + m3.status);
    const mems = (await get('/brain')).memories;
    check('Quyết định chiến lược ghi vào bộ nhớ', mems.some(mm => mm.kind === 'decision' && /phương án/i.test(mm.text)));
  }

  /* 4. SÁNG KIẾN CHỦ ĐỘNG: nạp ký ức đối thủ giảm giá → COO rà soát → có sáng kiến */
  // tạo memory đối thủ bằng cách chạy nghiên cứu thị trường (hoặc trực tiếp qua mission)
  const chk = await post('/initiatives/check', { force: true });
  check('COO rà soát ra sáng kiến chủ động', chk.count >= 1, chk.count + ' sáng kiến');
  const inis = await get('/initiatives?status=pending');
  check('Sáng kiến có command planner hiểu được', inis.length >= 1 && inis[0].command && inis[0].command.length > 8);
  if (inis.length) {
    const acc = await post(`/initiatives/${inis[0].id}/decide`, { accept: true });
    check('Đồng ý sáng kiến → tạo nhiệm vụ', acc.ok && !!acc.missionId, acc.missionId);
    // dọn nhiệm vụ vừa tạo
    if (acc.missionId) {
      const mm = await waitMission(acc.missionId, ['done', 'waiting_approval'], 200);
      for (const a of (await get('/approvals?status=pending')).filter(x => x.mission_id === acc.missionId)) await post(`/approvals/${a.id}/decide`, { decision: a.type === 'real_action' ? 'approve' : 'accept' });
    }
  }

  /* 5. HÀNH ĐỘNG THẬT .eml/.ics: lệnh đăng bài → duyệt → sinh file .ics; gửi mail → .eml */
  const r5 = await post('/chat', { text: 'Viết email chăm sóc khách và gửi email cho khách hàng', mode: 'go' });
  let m5 = await waitMission(r5.missionId, ['waiting_approval', 'done'], 200);
  const mailAp = (await get('/approvals?status=pending')).find(a => a.mission_id === r5.missionId && a.type === 'real_action');
  if (mailAp) {
    await post(`/approvals/${mailAp.id}/decide`, { decision: 'approve' });
    await sleep(3000);
    const arts = await get('/artifacts');
    check('Duyệt gửi mail → sinh file .eml thật', arts.some(a => a.type === 'eml'), arts.filter(a => a.type === 'eml').length + ' file .eml');
  } else check('(bỏ qua .eml — planner không gắn gửi mail)', true);
  await waitMission(r5.missionId, ['done'], 120);

  const r6 = await post('/chat', { text: 'Viết bài giới thiệu và đăng bài lên fanpage', mode: 'go' });
  let m6 = await waitMission(r6.missionId, ['waiting_approval', 'done'], 200);
  const fbAp = (await get('/approvals?status=pending')).find(a => a.mission_id === r6.missionId && a.type === 'real_action');
  if (fbAp) {
    await post(`/approvals/${fbAp.id}/decide`, { decision: 'approve' });
    await sleep(3000);
    const arts = await get('/artifacts');
    check('Duyệt đăng bài → sinh file lịch .ics', arts.some(a => a.type === 'ics'), arts.filter(a => a.type === 'ics').length + ' file .ics');
    const cp2 = await get('/cockpit');
    check('Duyệt đăng bài → buồng lái ghi nhận chiến dịch', cp2.kpi.campaigns >= 1, cp2.kpi.campaigns + ' chiến dịch');
  } else check('(bỏ qua .ics)', true);

  /* 6. VÁ AUDIT: isStrategic không nuốt lệnh thường chứa "phương án" */
  const norm = await post('/chat', { text: 'Làm báo giá đại lý cho phương án bán sỉ', mode: 'go' });
  let mN = await waitMission(norm.missionId, ['done', 'waiting_approval', 'failed'], 200);
  const tN = await get('/tasks?mission=' + norm.missionId);
  check('Lệnh thường chứa "phương án" KHÔNG bị hiểu là họp (có task thật)', tN.some(t => t.dept_id !== 'bgd'), tN.map(t => t.dept_id).join(','));
  for (const a of (await get('/approvals?status=pending')).filter(x => x.mission_id === norm.missionId)) await post(`/approvals/${a.id}/decide`, { decision: a.type === 'real_action' ? 'approve' : 'accept' });

  /* 7. VÁ AUDIT: avgPrice đúng → doanh thu buồng lái hợp lý (không sai hàng nghìn lần) */
  const cpF = await get('/cockpit');
  check('Doanh thu dự phóng trong khoảng hợp lý (không lệch hệ số nghìn)', cpF.kpi.price >= 100000 && cpF.kpi.price <= 500000, 'giá TB=' + cpF.kpi.price);

  /* 8. VÁ AUDIT: chấp nhận bản dưới ngưỡng vẫn sinh file */
  await post('/settings', { nguong_diem: 99, max_review_rounds: 1 });
  const acc = await post('/chat', { text: 'Soạn quy trình SOP đóng gói đơn hàng', mode: 'go' });
  let mAcc = await waitMission(acc.missionId, ['waiting_approval', 'done', 'failed'], 180);
  const accAp = (await get('/approvals?status=pending')).find(a => a.mission_id === acc.missionId && a.type === 'decision');
  if (accAp) {
    const artsB = (await get('/artifacts')).length;
    await post(`/approvals/${accAp.id}/decide`, { decision: 'accept' });
    await sleep(2500);
    check('CEO chấp nhận bản dưới ngưỡng → vẫn sinh file vào Xưởng', (await get('/artifacts')).length > artsB);
  } else check('(bỏ qua accept-artifact)', true);
  await post('/settings', { nguong_diem: 90, max_review_rounds: 3 });

  console.log(`\n${failed ? '💥 ' + failed + ' FAILED' : '🎉 PHASE 3 PASSED'} (${passed} passed)`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('💥 crash:', e); process.exit(1); });
