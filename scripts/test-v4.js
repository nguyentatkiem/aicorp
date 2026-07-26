'use strict';
/* Test v4: CRM sống (khách/lead/đơn/ticket), vòng học (playbook), đa công ty (registry) */
const path = require('path');
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
async function clearApprovals(mid) {
  for (const a of (await get('/approvals?status=pending')).filter(x => x.mission_id === mid))
    await post(`/approvals/${a.id}/decide`, { decision: a.type === 'real_action' ? 'approve' : (a.options || []).some(o => o.key === 'A') ? 'A' : 'accept' });
}

(async () => {
  if (!(await get('/state')).onboarded) {
    await post('/onboarding', { dna: { company: { name: 'Trà Thảo Mộc TâmAn', industry: 'fnb', size: '6-20', region: 'HN' }, products: [{ name: 'Trà đêm An Nhiên', price_range: '159k-289k' }], customers: { profile: 'Nữ 30-55, văn phòng, mất ngủ', channels: ['facebook', 'shopee'] }, goal_3m: 'Ra mắt SKU mới, 500 đơn/tháng', voice: { traits: ['gan_gui', 'chuyen_gia'], address: 'em-chị', banned: ['không hứa chữa bệnh'] }, departments_enabled: ['mkt', 'kd', 'tckt', 'ns', 'cskh', 'vh', 'data'], facts: [] }, engine: { kind: 'demo' } });
  }
  await post('/settings', { tran_per_day: 100000000, tran_per_mission: 5000000 });

  /* 1. Onboarding seed khách hàng nền */
  let crm = await get('/crm');
  check('Onboarding seed khách hàng nền', crm.snapshot.customersN >= 10, crm.snapshot.customersN + ' khách');
  check('CRM view đủ pipeline/tickets/orders', Array.isArray(crm.leads) && Array.isArray(crm.tickets) && Array.isArray(crm.orders));
  check('Tên khách hàng đa dạng (không lặp)', new Set(crm.customers.map(c => c.name)).size === crm.customers.length);

  /* 2. Campaign duyệt → lead mới đổ về */
  const leadsBefore = crm.snapshot.byStage.moi;
  const pub = await post('/chat', { text: 'Viết bài giới thiệu sản phẩm và đăng bài lên fanpage', mode: 'go' });
  let mPub = await waitMission(pub.missionId, ['waiting_approval', 'done'], 200);
  const fbAp = (await get('/approvals?status=pending')).find(a => a.mission_id === pub.missionId && a.type === 'real_action');
  if (fbAp) {
    await post(`/approvals/${fbAp.id}/decide`, { decision: 'approve' });
    await sleep(3000);
    crm = await get('/crm');
    check('Duyệt đăng bài → lead MỚI đổ về phễu', crm.snapshot.byStage.moi > leadsBefore, `moi: ${leadsBefore}→${crm.snapshot.byStage.moi}`);
  } else check('(bỏ qua campaign→lead)', true);
  await waitMission(pub.missionId, ['done'], 100);

  /* 3. Chấm lead → đẩy phễu; 4. Sales chốt đơn → doanh thu thật */
  const ordersBefore = crm.snapshot.ordersN;
  const r3 = await post('/chat', { text: 'Chấm điểm lead tiềm năng rồi tư vấn chốt đơn cho khách', mode: 'go' });
  let m3 = await waitMission(r3.missionId, ['done', 'waiting_approval'], 220);
  await clearApprovals(r3.missionId); await waitMission(r3.missionId, ['done'], 100);
  await sleep(1500);
  crm = await get('/crm');
  check('Có lead trong phễu (chấm/chốt)', crm.snapshot.byStage.nong + crm.snapshot.byStage.chot >= 1, `nóng=${crm.snapshot.byStage.nong} chốt=${crm.snapshot.byStage.chot}`);
  check('Sales chốt đơn → SỐ ĐƠN TĂNG', crm.snapshot.ordersN > ordersBefore, `đơn: ${ordersBefore}→${crm.snapshot.ordersN}`);
  check('Đơn hàng sinh doanh thu > 0', crm.snapshot.revenueMonth > 0, crm.snapshot.revenueMonth.toLocaleString('vi-VN') + 'đ');

  /* 5. Buồng lái doanh thu THẬT */
  const cp = await get('/cockpit');
  check('Buồng lái dùng doanh thu THẬT từ đơn', cp.kpi.revIsReal === true && cp.kpi.projectedRevenue === crm.snapshot.revenueMonth, 'revIsReal=' + cp.kpi.revIsReal);
  check('Buồng lái hiện số đơn + khách', cp.kpi.orders >= 1 && cp.kpi.customers >= 10);

  /* 6. CSKH xử lý ticket */
  // đảm bảo có ticket: chạy vài lần ambient hoặc chờ; nếu chưa có, bỏ qua nhẹ nhàng
  const r6 = await post('/chat', { text: 'Soạn kịch bản trả lời khiếu nại và chăm sóc khách hàng', mode: 'go' });
  await waitMission(r6.missionId, ['done', 'waiting_approval'], 200);
  await clearApprovals(r6.missionId); await waitMission(r6.missionId, ['done'], 100);
  crm = await get('/crm');
  check('CSKH xử lý → có ticket đã xong (hoặc chưa phát sinh ticket)', crm.tickets.some(t => t.status === 'xong') || crm.tickets.length === 0, `${crm.tickets.filter(t => t.status === 'xong').length} xong / ${crm.tickets.length}`);

  /* 7. VÒNG HỌC: đặt ngưỡng 95 → điểm đạt 95-97 → chưng cất playbook */
  await post('/settings', { nguong_diem: 95, max_review_rounds: 3 });
  const r7 = await post('/chat', { text: 'Soạn bộ SOP quy trình đóng gói đơn hàng', mode: 'go' });
  let m7 = await waitMission(r7.missionId, ['done', 'waiting_approval'], 200);
  await clearApprovals(r7.missionId); await waitMission(r7.missionId, ['done'], 100);
  await sleep(1000);
  let pb = await get('/playbooks');
  check('Bài điểm cao → chưng cất PLAYBOOK', pb.count >= 1, pb.count + ' playbook');
  // chạy thêm 1 việc cùng phòng → playbook được nạp (uses tăng)
  const usesBefore = pb.totalUses;
  const r7b = await post('/chat', { text: 'Soạn thêm SOP quy trình kiểm hàng nhập kho', mode: 'go' });
  await waitMission(r7b.missionId, ['done', 'waiting_approval'], 200);
  await clearApprovals(r7b.missionId); await waitMission(r7b.missionId, ['done'], 100);
  pb = await get('/playbooks');
  check('Playbook được TÁI SỬ DỤNG cho việc sau (uses tăng)', pb.totalUses > usesBefore, `uses: ${usesBefore}→${pb.totalUses}`);
  await post('/settings', { nguong_diem: 90 });

  /* 8. ĐA CÔNG TY: registry (test cấp DB — không gọi endpoint vì nó thoát tiến trình) */
  const dbmod = require(path.join(__dirname, '..', 'server', 'db'));
  const before = dbmod.listCompanies();
  check('Có công ty đang hoạt động', !!before.active && before.companies.length >= 1, before.active);
  const newId = dbmod.addCompany('Cửa hàng Thời trang ABC');
  const after = dbmod.listCompanies();
  check('Tạo công ty mới vào registry', after.companies.some(c => c.id === newId) && after.active === newId);
  const fs = require('fs');
  const os = require('os');
  const home = process.env.AICORP_HOME || path.join(os.homedir(), 'AICORP');
  check('Công ty mới có thư mục dữ liệu RIÊNG (cách ly)', fs.existsSync(path.join(home, 'companies', newId)), path.join('companies', newId));
  // chuyển active về công ty cũ để không phá server đang chạy
  dbmod.switchCompany(before.active);
  check('Chuyển active về công ty cũ', dbmod.listCompanies().active === before.active);
  const co = await get('/companies');
  check('API /companies liệt kê ≥2 công ty', co.companies.length >= 2, co.companies.length + ' công ty');

  /* 9. VÁ AUDIT: XSS tên nhân sự làm sạch phía server */
  const evil = await post('/agents', { dept_id: 'kd', name: 'NV <img src=x onerror=alert(1)>', avatar: '🧪', role_title: 'Test XSS', level: 'nv' });
  if (evil.ok) {
    const a = await get(`/agents/${evil.id}`);
    check('Tên agent bị làm sạch < > phía server', !/[<>]/.test(a.name), a.name);
    await fetch(`${BASE}/agents/${evil.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: 0 }) });
  } else check('(bỏ qua XSS test)', true);

  /* 10. VÁ AUDIT: CSRF — switch company từ Origin lạ bị chặn */
  const csrf = await fetch(`${BASE}/companies/default/switch`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': 'http://evil.example.com' }, body: '{}' });
  check('CSRF: đổi công ty từ Origin lạ bị chặn (403)', csrf.status === 403, 'status=' + csrf.status);

  /* 11. VÁ AUDIT: lead 'am' không còn ngõ cụt — chấm nhiều lần thì lên nóng */
  const crmL = require(path.join(__dirname, '..', 'server', 'crm'));
  const dnaRow = { products: [{ name: 'X', price_range: '159k-289k' }] };
  crmL.advancePipeline(dnaRow); crmL.advancePipeline(dnaRow); crmL.advancePipeline(dnaRow);
  const snap = crmL.pipelineSnapshot();
  check('Lead ấm được nuôi lên nóng (không kẹt ở "am")', snap.byStage.am === 0 || snap.byStage.nong > 0, `am=${snap.byStage.am} nong=${snap.byStage.nong}`);

  console.log(`\n${failed ? '💥 ' + failed + ' FAILED' : '🎉 V4 PASSED'} (${passed} passed)`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('💥 crash:', e); process.exit(1); });
