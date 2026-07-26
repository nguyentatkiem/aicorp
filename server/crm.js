'use strict';
/* CRM sống (v4) — khách hàng, lead pipeline, ticket, đơn hàng mô phỏng.
   Công ty giờ VẬN HÀNH TRÊN THỰC THỂ THẬT: campaign sinh lead, sales chốt đơn → doanh thu thật,
   CSKH xử lý ticket. Buồng lái lấy doanh thu từ đơn hàng thay vì ước lượng. */
const { db, uid, now } = require('./db');
let CC = null;
try { CC = require('./demo/crm-content'); } catch { /* fallback nội bộ */ }

const STAGES = ['moi', 'am', 'nong', 'chot', 'mat'];
const STAGE_LABEL = { moi: 'Mới', am: 'Ấm', nong: 'Nóng', chot: 'Đã chốt', mat: 'Đã mất' };

/* ---------- fallback sinh nội dung khi thiếu module ---------- */
const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương', 'Lý'];
const TEN_NU = ['Thị Hương', 'Thị Lan', 'Thị Mai', 'Thu Hà', 'Ngọc Anh', 'Thùy Linh', 'Minh Châu', 'Kim Ngân', 'Bích Ngọc', 'Phương Thảo'];
const TEN_NAM = ['Văn Hùng', 'Minh Quân', 'Quốc Bảo', 'Đức Anh', 'Hoàng Long', 'Tuấn Kiệt', 'Thành Đạt', 'Gia Huy', 'Anh Tú', 'Xuân Trường'];
const CITY = ['Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Nha Trang', 'Huế', 'Vũng Tàu'];
function fbCustomer(i, dna) {
  const isFemale = /nữ|chị|phụ nữ|mẹ/i.test(((dna || {}).customers || {}).profile || '') ? true : (i % 3 !== 0);
  const ten = isFemale ? TEN_NU[i % TEN_NU.length] : TEN_NAM[i % TEN_NAM.length];
  const seg = ['mới', 'tiềm năng', 'thân thiết', 'VIP', 'đại lý'][i % 5];
  const chans = ((dna || {}).customers || {}).channels || ['facebook'];
  const source = { facebook: 'Facebook', shopee: 'Shopee', tiktok: 'TikTok Shop', zalo: 'Zalo', website: 'Website' }[chans[i % chans.length]] || 'Giới thiệu';
  const phone = '09' + String(10000000 + (i * 1234567 % 89999999)).padStart(8, '0');
  return { name: `${HO[i % HO.length]} ${ten}`, phone, segment: seg, source, city: CITY[i % CITY.length], note: 'Quan tâm sản phẩm, đang cân nhắc' };
}
function customerOf(i, dna) {
  if (CC && CC.customer) { try { const c = CC.customer(i, dna); if (c && c.name && c.phone) return c; } catch {} }
  return fbCustomer(i, dna);
}
function productOf(i, dna) {
  if (CC && CC.productFor) { try { const p = CC.productFor(i, dna); if (p) return p; } catch {} }
  const ps = (dna || {}).products || [];
  return (ps[i % Math.max(ps.length, 1)] || {}).name || 'sản phẩm chủ lực';
}
function leadNoteOf(product, stage, dna) {
  if (CC && CC.leadNote) { try { const n = CC.leadNote(product, stage, dna); if (n) return n; } catch {} }
  return { moi: `Vừa để lại thông tin về ${product}`, am: `Đã tư vấn ${product}, đang cân nhắc`, nong: `Hỏi giá & ưu đãi ${product}, sẵn sàng chốt`, chot: `Đã mua ${product}`, mat: `Ngừng phản hồi` }[stage] || '';
}
function ticketOf(kind, product, dna) {
  if (CC && CC.ticket) { try { const t = CC.ticket(kind, product, dna); if (t && t.content) return t; } catch {} }
  const m = {
    khieu_nai: { content: `Đơn ${product} giao chậm hơn hẹn`, suggestedResolution: 'Xin lỗi, kiểm tra vận đơn, tặng ưu đãi lần sau' },
    hoi_dap: { content: `Hỏi cách dùng ${product}`, suggestedResolution: 'Hướng dẫn chi tiết theo tài liệu sản phẩm' },
    doi_tra: { content: `Muốn đổi ${product} do không hợp`, suggestedResolution: 'Áp dụng chính sách đổi trả, hỗ trợ đổi mẫu khác' }
  };
  return m[kind] || m.hoi_dap;
}
function avgPrice(dna) { try { return require('./biz').avgPrice(dna); } catch { return 200000; } }

/* ---------- Seed khách hàng + phễu lead ban đầu (công ty khởi động đã có sẵn khách/lead) ---------- */
function seedCustomers(dna, n) {
  if (db.prepare('SELECT COUNT(*) c FROM customers').get().c > 0) return 0;
  n = n || 12;
  const ins = db.prepare('INSERT INTO customers(id,name,phone,segment,source,city,note,ltv,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const insL = db.prepare('INSERT INTO leads(id,customer_id,product,score,stage,source,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const price = avgPrice(dna);
  // phễu ban đầu: rải lead qua các giai đoạn để sales có việc làm ngay
  const initStages = ['moi', 'moi', 'moi', 'am', 'am', 'nong', 'nong', 'chot'];
  const initScore = { moi: 15, am: 45, nong: 72, chot: 100, mat: 0 };
  for (let i = 0; i < n; i++) {
    const c = customerOf(i, dna);
    const prod = productOf(i, dna);
    const stage = i < initStages.length ? initStages[i] : null;
    let seg = c.segment;
    let ltv = 0;
    if (stage === 'chot') { seg = c.segment; ltv = price * (1 + i % 2); }   // đã chốt → có LTV thật
    else if (stage) { seg = 'tiềm năng'; ltv = 0; }                          // đang trong phễu, chưa mua → LTV=0
    else { ltv = (seg === 'VIP' || seg === 'đại lý') ? price * (3 + i % 4) : (seg === 'thân thiết' ? price * 2 : 0); }
    const cid = uid('cus');
    ins.run(cid, c.name, c.phone, seg, c.source, c.city, c.note, Math.round(ltv), 'active', now());
    if (stage) insL.run(uid('ld'), cid, prod, initScore[stage], stage, c.source, leadNoteOf(prod, stage, dna), now(), now());
    if (stage === 'chot') db.prepare('INSERT INTO orders(id,customer_id,product,amount_vnd,status,created_at) VALUES(?,?,?,?,?,?)')
      .run(uid('ord'), cid, prod, Math.round(price * (1 + i % 2)), 'done', now());
  }
  return n;
}

/* ---------- Sinh lead mới (khi campaign được duyệt / hoạt động marketing) ---------- */
function spawnLeads(dna, count, source, missionId) {
  count = Math.max(1, Math.min(count || 3, 12));
  const price = avgPrice(dna);
  const ins = db.prepare('INSERT INTO customers(id,name,phone,segment,source,city,note,ltv,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  const insL = db.prepare('INSERT INTO leads(id,customer_id,product,score,stage,source,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const base = db.prepare('SELECT COUNT(*) c FROM customers').get().c;
  const out = [];
  for (let k = 0; k < count; k++) {
    const i = base + k;
    const c = customerOf(i, dna);
    const cid = uid('cus');
    ins.run(cid, c.name, c.phone, 'tiềm năng', source || c.source, c.city, c.note, 0, 'active', now());
    const prod = productOf(i, dna);
    const lid = uid('ld');
    insL.run(lid, cid, prod, 10 + (i * 7 % 25), 'moi', source || c.source, leadNoteOf(prod, 'moi', dna), now(), now());
    out.push(lid);
  }
  return out;
}

/* ---------- Chấm & đẩy lead qua phễu (khi NV Chăm Lead / sales làm việc) ---------- */
function advancePipeline(dna, missionId) {
  const moved = { scored: 0, warmed: 0, hot: 0 };
  // chấm & nuôi cả lead MỚI và ẤM (mỗi vòng cộng điểm — 'am' không còn là ngõ cụt)
  const cands = db.prepare("SELECT * FROM leads WHERE stage IN ('moi','am') ORDER BY stage DESC, created_at LIMIT 10").all();
  for (const l of cands) {
    const sc = Math.min(100, (l.score || 0) + 25 + (l.id.charCodeAt(3) % 20));
    const stage = sc >= 60 ? 'nong' : 'am';
    db.prepare('UPDATE leads SET score=?, stage=?, note=?, updated_at=? WHERE id=?')
      .run(sc, stage, leadNoteOf(l.product, stage, dna), now(), l.id);
    moved.scored++; if (stage === 'nong') moved.hot++; else moved.warmed++;
  }
  return moved;
}

/* ---------- Chốt đơn (khi NV Sales chốt) → doanh thu THẬT ---------- */
function closeDeals(dna, missionId) {
  const price = avgPrice(dna);
  const hots = db.prepare("SELECT * FROM leads WHERE stage='nong' ORDER BY score DESC LIMIT 5").all();
  let closed = 0, revenue = 0;
  for (const l of hots) {
    // ~60% lead nóng chốt (deterministic theo id)
    const win = (l.id.charCodeAt(4) % 10) < 6;
    if (win) {
      const amount = Math.round(price * (1 + (l.id.charCodeAt(5) % 3)));   // 1-3 sản phẩm
      db.prepare("UPDATE leads SET stage='chot', note=?, updated_at=? WHERE id=?").run(leadNoteOf(l.product, 'chot', dna), now(), l.id);
      db.prepare('INSERT INTO orders(id,customer_id,product,amount_vnd,status,source_mission,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(uid('ord'), l.customer_id, l.product, amount, 'done', missionId || null, now());
      if (l.customer_id) db.prepare("UPDATE customers SET ltv=ltv+?, segment=CASE WHEN segment='tiềm năng' THEN 'mới' ELSE segment END WHERE id=?").run(amount, l.customer_id);
      closed++; revenue += amount;
    } else {
      db.prepare("UPDATE leads SET stage='mat', note=?, updated_at=? WHERE id=?").run('Không chốt được — để nuôi lại sau', now(), l.id);
    }
  }
  return { closed, revenue };
}

/* ---------- Sinh & xử lý ticket CSKH ---------- */
function spawnTickets(dna, count) {
  count = Math.max(1, Math.min(count || 2, 6));
  const kinds = ['khieu_nai', 'hoi_dap', 'doi_tra'];
  const buyers = db.prepare("SELECT id FROM customers WHERE ltv>0 ORDER BY created_at DESC LIMIT 20").all();
  const ins = db.prepare('INSERT INTO tickets(id,customer_id,kind,content,status,created_at) VALUES(?,?,?,?,?,?)');
  const out = [];
  for (let k = 0; k < count; k++) {
    const kind = kinds[k % kinds.length];
    const t = ticketOf(kind, productOf(k, dna), dna);
    const cid = buyers.length ? buyers[k % buyers.length].id : null;
    const id = uid('tk');
    ins.run(id, cid, kind, t.content, 'moi', now());
    out.push(id);
  }
  return out;
}
function resolveTickets(dna) {
  const open = db.prepare("SELECT * FROM tickets WHERE status!='xong' ORDER BY created_at LIMIT 8").all();
  let n = 0;
  for (const t of open) {
    const r = ticketOf(t.kind, productOf(0, dna), dna);
    db.prepare("UPDATE tickets SET status='xong', resolution=?, resolved_at=? WHERE id=?").run(r.suggestedResolution, now(), t.id);
    n++;
  }
  return n;
}

/* ---------- Doanh thu thật 30 ngày (cho buồng lái) ---------- */
function revenueMonth() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return db.prepare("SELECT COALESCE(SUM(amount_vnd),0) s FROM orders WHERE status='done' AND created_at>=?").get(d.toISOString()).s;
}
function pipelineSnapshot() {
  const byStage = {};
  for (const s of STAGES) byStage[s] = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(score),0) sc FROM leads WHERE stage=?').get(s).c;
  const ordersN = db.prepare('SELECT COUNT(*) c FROM orders').get().c;
  const openTickets = db.prepare("SELECT COUNT(*) c FROM tickets WHERE status!='xong'").get().c;
  const customersN = db.prepare('SELECT COUNT(*) c FROM customers').get().c;
  return { byStage, ordersN, openTickets, customersN, revenueMonth: revenueMonth() };
}

/* ---------- Nhịp khách hàng tự nhiên (gọi định kỳ để pipeline luôn sống) ---------- */
function ambientTick(dna) {
  // trickle: 0-2 lead mới + thi thoảng 1 ticket, chỉ khi đã có khách nền
  const total = db.prepare('SELECT COUNT(*) c FROM customers').get().c;
  if (total === 0) return { leads: 0, tickets: 0 };
  // TRẦN phễu: không để lead chưa xử lý phình vô hạn khi app chạy dài ngày
  const openPipe = db.prepare("SELECT COUNT(*) c FROM leads WHERE stage IN ('moi','am','nong')").get().c;
  const openTk = db.prepare("SELECT COUNT(*) c FROM tickets WHERE status!='xong'").get().c;
  const nowMin = new Date().getMinutes();
  const nLead = openPipe >= 40 ? 0 : (nowMin % 3);   // ngừng đổ lead khi phễu đã đầy (>=40)
  const leads = nLead ? spawnLeads(dna, nLead, 'Tự nhiên').length : 0;
  const nTicket = (openTk < 15 && nowMin % 7 === 0 && db.prepare("SELECT COUNT(*) c FROM customers WHERE ltv>0").get().c > 0) ? 1 : 0;
  const tickets = nTicket ? spawnTickets(dna, nTicket).length : 0;
  return { leads, tickets };
}

function view(dna) {
  const leads = db.prepare(`SELECT l.*, c.name cust_name, c.phone cust_phone, c.city cust_city
    FROM leads l LEFT JOIN customers c ON c.id=l.customer_id ORDER BY l.updated_at DESC LIMIT 200`).all();
  const customers = db.prepare('SELECT * FROM customers ORDER BY ltv DESC, created_at DESC LIMIT 60').all();
  const tickets = db.prepare(`SELECT t.*, c.name cust_name FROM tickets t LEFT JOIN customers c ON c.id=t.customer_id
    ORDER BY (t.status!='xong') DESC, t.created_at DESC LIMIT 40`).all();
  const orders = db.prepare(`SELECT o.*, c.name cust_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
    ORDER BY o.created_at DESC LIMIT 40`).all();
  return { stages: STAGES, stageLabel: STAGE_LABEL, leads, customers, tickets, orders, snapshot: pipelineSnapshot() };
}

module.exports = {
  STAGES, STAGE_LABEL, seedCustomers, spawnLeads, advancePipeline, closeDeals,
  spawnTickets, resolveTickets, revenueMonth, pipelineSnapshot, ambientTick, view
};
