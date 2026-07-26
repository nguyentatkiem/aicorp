'use strict';
/* Test Bộ não thứ 2 (Second Brain kiểu Obsidian):
   seed liên kết, CRUD, wikilink/phantom/backlink, đổi slug giữ backlink, FTS + chống injection,
   chống path-traversal, chống XSS tiêu đề, chưng cất note khi mission xong, retrieve, reindex. */
const path = require('path');
const BASE = 'http://localhost:3939/api';
const H = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3939' };
const get = p => fetch(BASE + p).then(r => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }).then(r => r.json());
const put = (p, b) => fetch(BASE + p, { method: 'PUT', headers: H, body: JSON.stringify(b || {}) }).then(r => r.json());
const del = p => fetch(BASE + p, { method: 'DELETE', headers: H }).then(r => r.json());
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
    await post('/onboarding', { dna: { company: { name: 'Trà Thảo Mộc TâmAn', industry: 'fnb', size: '6-20', region: 'HN' }, products: [{ name: 'Trà đêm An Nhiên', price_range: '159k-289k' }], customers: { profile: 'Nữ 30-55', channels: ['facebook'] }, goal_3m: 'Ra mắt SKU mới, 500 đơn/tháng', voice: { traits: ['gan_gui', 'chuyen_gia'], address: 'em-chị', banned: ['không hứa chữa bệnh'] }, departments_enabled: ['mkt', 'kd', 'tckt', 'ns', 'cskh', 'vh', 'data'], facts: [] }, engine: { kind: 'demo' } });
  }
  await post('/settings', { tran_per_day: 100000000, tran_per_mission: 5000000 });

  /* 1. Seed liên kết nhau */
  let ov = await get('/brain2');
  check('Seed ≥6 note nền tảng', ov.stats.total >= 6, ov.stats.total + ' note');
  check('Có liên kết giữa các note', ov.stats.links >= 5, ov.stats.links + ' liên kết');
  check('Không note lẻ (mọi note đều nối)', ov.stats.orphans === 0, ov.stats.orphans + ' lẻ');
  let g = await get('/brain2/graph');
  check('Graph có node + edge', g.nodes.length >= 6 && g.edges.length >= 5, `${g.nodes.length} node, ${g.edges.length} edge`);
  check('Seed không tạo node ma lạ', g.nodes.filter(n => n.phantom).length === 0, g.nodes.filter(n => n.phantom).map(n => n.title).join(','));

  /* 2. Tạo note trỏ tới note MA → phantom */
  const c1 = await post('/brain2/notes', { title: 'Chiến dịch Ra Mắt', body: 'Bán [[Trà đêm An Nhiên]] qua [[Kênh Zalo OA]] (chưa có).', type: 'decision', tags: 'marketing' });
  check('Tạo note OK', c1.ok && c1.slug === 'chien-dich-ra-mat', c1.slug);
  g = await get('/brain2/graph');
  check('Wikilink tới note thật đã nối', g.edges.some(e => e.from === 'chien-dich-ra-mat' && e.to === 'tra-dem-an-nhien'));
  check('Note ma "Kênh Zalo OA" xuất hiện', g.nodes.some(n => n.phantom && n.title === 'Kênh Zalo OA'));

  /* 3. Đổi tiêu đề → slug đổi, backlink được giữ */
  const u1 = await put('/brain2/notes/chien-dich-ra-mat', { title: 'Chiến dịch Ra Mắt Q3' });
  check('Đổi tiêu đề → slug đổi', u1.ok && u1.slug === 'chien-dich-ra-mat-q3', u1.slug);
  const traView = await get('/brain2/notes/tra-dem-an-nhien');
  check('Backlink giữ nguyên sau đổi slug', traView.backlinks.some(b => b.slug === 'chien-dich-ra-mat-q3'));

  /* 4. Tạo note MA → thành thật, phantom biến mất */
  await post('/brain2/notes', { title: 'Kênh Zalo OA', body: 'Kênh chăm khách.', type: 'concept' });
  const zalo = await get('/brain2/notes/kenh-zalo-oa');
  check('Note ma thành thật + nhận backlink', zalo.backlinks.some(b => b.slug === 'chien-dich-ra-mat-q3'));
  g = await get('/brain2/graph');
  check('Phantom "Kênh Zalo OA" đã hết', !g.nodes.some(n => n.phantom && n.title === 'Kênh Zalo OA'));

  /* 5. Xoá → backlink trở lại note ma */
  await del('/brain2/notes/kenh-zalo-oa');
  g = await get('/brain2/graph');
  check('Xoá note → link trỏ tới nó thành ma lại', g.nodes.some(n => n.phantom && n.title === 'Kênh Zalo OA'));
  check('GET note đã xoá → 404', (await get('/brain2/notes/kenh-zalo-oa')).error != null);

  /* 5b. AUDIT: đổi tên note vào một [[wikilink]] ma đang tồn tại → KHÔNG crash/hỏng dữ liệu (lỗi HIGH) */
  await post('/brain2/notes', { title: 'Alpha Note', body: 'nội dung', type: 'concept' });
  await post('/brain2/notes', { title: 'Hub Note', body: 'Trỏ [[Alpha Note]] và [[Beta Note]] (ma).', type: 'concept' });
  const ren = await put('/brain2/notes/alpha-note', { title: 'Beta Note' });   // slug mới trùng đích ma (hub→beta-note)
  check('Đổi tên vào wikilink ma → không crash (UNIQUE)', ren.ok === true, JSON.stringify(ren).slice(0, 80));
  const betaV = await get('/brain2/notes/' + (ren.slug || 'beta-note'));
  check('Note đổi tên nhất quán title↔slug↔file', !betaV.error && betaV.title === 'Beta Note', betaV.title);
  const hubV = await get('/brain2/notes/hub-note');
  check('Backlink gộp đúng (không nhân đôi/treo) sau đổi tên', hubV.outgoing.filter(o => /beta-note/.test(o.to_slug)).length === 1 && hubV.outgoing.some(o => o.to_title === 'Beta Note' && o.resolved));
  await del('/brain2/notes/' + (ren.slug || 'beta-note')); await del('/brain2/notes/hub-note');

  /* 5c. AUDIT: note chỉ trỏ note ma → tính mồ côi nhất quán + node ma có degree>0 */
  await post('/brain2/notes', { title: 'Le Loi', body: 'Chỉ trỏ [[Note Khong Co That ABC]].', type: 'concept' });
  const gp = await get('/brain2/graph');
  const ghost = gp.nodes.find(n => n.phantom && n.title === 'Note Khong Co That ABC');
  check('Node ma có degree ≥ 1 (đếm cạnh vào)', ghost && ghost.degree >= 1, ghost ? 'degree=' + ghost.degree : 'không thấy');
  await del('/brain2/notes/le-loi');

  /* 6. Tìm kiếm FTS + chống injection */
  check('FTS tìm theo từ khoá', (await get('/brain2?q=' + encodeURIComponent('khách hàng'))).notes.some(n => /Khách/.test(n.title)));
  const inj = await get('/brain2?q=' + encodeURIComponent('a* OR (b" NEAR/'));
  check('FTS query độc hại → không sập (trả mảng)', Array.isArray(inj.notes));

  /* 7. Chống path traversal ở slug */
  const trav = await fetch(BASE + '/brain2/notes/' + encodeURIComponent('../../../../etc/passwd')).then(r => r.status);
  check('Slug path-traversal → 404 (không đọc file ngoài)', trav === 404, 'HTTP ' + trav);
  const badCreate = await post('/brain2/notes', { title: '../../evil', body: 'x' });
  check('Tạo note tiêu đề path → slug được làm sạch', badCreate.ok && /^[a-z0-9-]+$/.test(badCreate.slug), badCreate.slug);
  if (badCreate.slug) await del('/brain2/notes/' + badCreate.slug);

  /* 8. Chống XSS tiêu đề (loại < >) */
  const xss = await post('/brain2/notes', { title: 'Ghi chú <img src=x onerror=alert(1)>', body: '<script>alert(2)</script> nội dung', type: 'concept' });
  const xssView = await get('/brain2/notes/' + xss.slug);
  check('Tiêu đề bị loại thẻ < >', !/[<>]/.test(xssView.title), xssView.title);
  if (xss.slug) await del('/brain2/notes/' + xss.slug);

  /* 9. Chưng cất note khi nhiệm vụ hoàn thành */
  const before = (await get('/brain2')).stats.total;
  const mis = await post('/chat', { text: 'Viết bài giới thiệu Trà đêm An Nhiên cho fanpage', mode: 'go' });
  let m = await waitMission(mis.missionId, ['waiting_approval', 'reporting', 'done'], 200);
  for (let i = 0; i < 6 && m && m.status !== 'done'; i++) { await clearApprovals(mis.missionId); m = await waitMission(mis.missionId, ['waiting_approval', 'done'], 60); }
  await sleep(2500);
  const afterOv = await get('/brain2');
  check('Mission xong → có note "Bài học" mới', afterOv.stats.total > before && afterOv.notes.some(n => n.type === 'retro' || /Bài học/.test(n.title)), `${before}→${afterOv.stats.total}`);
  const retro = afterOv.notes.find(n => n.type === 'retro' || /Bài học/.test(n.title));
  if (retro) {
    const rv = await get('/brain2/notes/' + retro.slug);
    check('Note bài học tự nối [[thực thể]]', rv.outgoing.length >= 1, rv.outgoing.map(o => o.to_title).join(','));
  } else check('Note bài học tự nối [[thực thể]]', false, 'không có note retro');

  /* 10. Reindex từ đĩa không mất dữ liệu */
  const rc = await post('/brain2/reindex', {});
  check('Reindex chạy OK', rc.ok && rc.count >= 6, rc.count + ' file');
  check('Sau reindex số note không tụt', (await get('/brain2')).stats.total >= afterOv.stats.total);

  /* 11. retrieve() cấp ngữ cảnh cho agent (unit, không cần mạng) */
  const sb = require('../server/secondbrain');
  const ctx = sb.retrieve('Trà đêm An Nhiên khách hàng');
  check('retrieve() trả ngữ cảnh liên kết cho agent', ctx.includes('Bộ não thứ 2') && ctx.length > 40, ctx.slice(0, 50).replace(/\n/g, ' '));

  console.log(`\n${failed === 0 ? '🎉 BRAIN2 PASSED' : '💥 BRAIN2 FAILED'} (${passed} passed${failed ? ', ' + failed + ' failed' : ''})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('💥', e); process.exit(1); });
