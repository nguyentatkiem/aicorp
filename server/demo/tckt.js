'use strict';
/*
 * Phòng Tài chính – Kế toán (dept_id: tckt) — module demo offline.
 * Sinh sản phẩm công việc của:
 *   - nv_cash : dự toán 3 kịch bản, unit economics, điểm hòa vốn, P&L tháng
 *   - nv_debt : đối soát công nợ có tuổi nợ, 3 mức tin nhắc nợ, bảng lương BHXH 2026
 *   - tp_tc   : phân tích sức khỏe tài chính + review (chấm bài) nhân viên
 * Toàn bộ số liệu được TÍNH từ ctx.dna (giá bán, ngành, quy mô, mục tiêu),
 * dùng được cho 12 ngành — không hardcode ngành cụ thể.
 */

/* ==================== 1. Helpers DNA an toàn ==================== */

const IND_LABEL = {
  banle: 'bán lẻ', fnb: 'F&B', thoitrang: 'thời trang', mypham: 'mỹ phẩm',
  giaoduc: 'giáo dục', suckhoe: 'sức khỏe', noithat: 'nội thất', bds: 'bất động sản',
  dichvu: 'dịch vụ', sanxuat: 'sản xuất', tmdt: 'TMĐT', khac: 'chung'
};
/* Tỷ lệ giá vốn/giá bán tham chiếu theo ngành (chuẩn nghề, ghi rõ trong giả định) */
const COGS_RATE = {
  banle: 0.68, fnb: 0.35, thoitrang: 0.48, mypham: 0.40, giaoduc: 0.18,
  suckhoe: 0.38, noithat: 0.55, bds: 0.60, dichvu: 0.30, sanxuat: 0.58,
  tmdt: 0.62, khac: 0.45
};
const UNIT_BY_IND = {
  giaoduc: 'học viên', suckhoe: 'lượt khách', noithat: 'đơn hàng',
  bds: 'giao dịch', dichvu: 'hợp đồng', sanxuat: 'đơn hàng'
};
/* Ngành có hàng vật lý (dòng "sản xuất mẫu & bao bì") */
const PHYSICAL = new Set(['banle', 'fnb', 'thoitrang', 'mypham', 'noithat', 'sanxuat', 'tmdt']);

/* CP cố định phân bổ cho sản phẩm/dự án theo quy mô (đ/tháng) */
const FIXED_BY_SIZE = {
  '1-5':   { thue: 6e6,  luong: 18e6,  mkt: 6e6,  vh: 3e6,  mul: 0.5 },
  '6-20':  { thue: 12e6, luong: 40e6,  mkt: 12e6, vh: 6e6,  mul: 1 },
  '21-50': { thue: 25e6, luong: 110e6, mkt: 30e6, vh: 15e6, mul: 2.5 },
  '50+':   { thue: 50e6, luong: 260e6, mkt: 60e6, vh: 30e6, mul: 5 }
};

function dnaOf(ctx) { return (ctx && ctx.dna) || null; }
function companyName(dna) { return (dna && dna.company && dna.company.name) || 'công ty'; }
function industryOf(dna) {
  const i = dna && dna.company && dna.company.industry;
  return COGS_RATE[i] !== undefined ? i : 'khac';
}
function firstProduct(dna) {
  const p = (dna && Array.isArray(dna.products) && dna.products[0]) || {};
  return { name: p.name || 'sản phẩm chủ lực', range: p.price_range || '' };
}
function channelsOf(dna) {
  const c = dna && dna.customers && dna.customers.channels;
  return Array.isArray(c) && c.length ? c : ['kênh chính'];
}
function pronouns(dna) {
  const a = (dna && dna.voice && dna.voice.address) || '';
  const parts = String(a).split(/[-–—]/).map(s => s.trim()).filter(Boolean);
  return { self: parts[0] || 'em', other: parts[1] || 'anh/chị' };
}
function bannedOf(dna) {
  const b = dna && dna.voice && dna.voice.banned;
  return Array.isArray(b) ? b : [];
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function sizeKey(dna) {
  const s = String((dna && dna.company && dna.company.size) || '6-20');
  const n = parseInt(s, 10);
  if (isFinite(n)) {
    if (n <= 5) return '1-5';
    if (n <= 20) return '6-20';
    if (n <= 50) return '21-50';
    return '50+';
  }
  return FIXED_BY_SIZE[s] ? s : '6-20';
}

/* "159k-289k" / "1.5tr-3tr" / "2-5 tỷ" / "159.000-289.000" → {low, high} VND */
function parsePriceRange(str) {
  if (!str || typeof str !== 'string') return null;
  const MUL = { k: 1e3, 'nghìn': 1e3, 'ngàn': 1e3, tr: 1e6, 'triệu': 1e6, m: 1e6, 'tỷ': 1e9, 'tỉ': 1e9 };
  const re = /(\d[\d.,]*)\s*(k|nghìn|ngàn|tr|triệu|m|tỷ|tỉ)?/gi;
  const toks = []; let mt;
  while ((mt = re.exec(str)) !== null) toks.push({ num: mt[1], suf: (mt[2] || '').toLowerCase() });
  if (!toks.length) return null;
  const sufChung = (toks.map(t => t.suf).find(Boolean)) || '';
  const vals = toks.map(t => {
    let s = t.num.replace(/[.,]$/, ''), v;
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) v = parseFloat(s.replace(/[.,]/g, '')); // 159.000 → 159000
    else v = parseFloat(s.replace(',', '.'));
    v *= (MUL[t.suf || sufChung] || 1);
    if (v > 0 && v < 1000) v *= 1000; // "159-289" hiểu là nghìn đồng
    return v;
  }).filter(v => isFinite(v) && v > 0);
  if (!vals.length) return null;
  return { low: Math.min.apply(null, vals), high: Math.max.apply(null, vals) };
}

function roundK(n) { return Math.round(n / 1000) * 1000; }
function vnd(n) { return Math.round(n).toLocaleString('vi-VN'); }
function pct(x) { return (x * 100).toFixed(1).replace('.', ',') + '%'; }
function dmy(d) { return d.toLocaleDateString('vi-VN'); }
function briefText(brief) {
  brief = brief || {};
  return [brief.muc_tieu || '']
    .concat(brief.tieu_chi_cham || [], brief.dau_vao || []).join(' ');
}

/* Mục tiêu đơn/tháng: bắt số trong goal_3m, fallback theo ngành + quy mô */
function targetOrders(dna, ind, sk) {
  const g = (dna && dna.goal_3m) || '';
  const m = g.match(/([\d.,]+)\s*(đơn|khách|học viên|hợp đồng|giao dịch|suất|căn|sp|sản phẩm)/i);
  if (m) {
    const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
    if (n > 0 && n < 1e6) return n;
  }
  if (ind === 'bds') return 6;
  if (ind === 'noithat') return 25;
  if (ind === 'sanxuat' || ind === 'dichvu') return 40;
  return { '1-5': 150, '6-20': 400, '21-50': 1200, '50+': 3000 }[sk] || 400;
}

/* Mô hình kinh tế thống nhất cho cả phòng — mọi vai dùng chung để số khớp nhau */
function econ(dna) {
  const ind = industryOf(dna);
  const prod = firstProduct(dna);
  const pr = parsePriceRange(prod.range) || { low: 250000, high: 250000 };
  const price = roundK((pr.low + pr.high) / 2) || 250000;
  const rate = COGS_RATE[ind];
  let cogs = roundK(price * rate);
  if (price - cogs <= 0) cogs = roundK(price * 0.55);
  const margin = price - cogs;
  const sk = sizeKey(dna);
  const f = FIXED_BY_SIZE[sk];
  const fixedTotal = f.thue + f.luong + f.mkt + f.vh;
  const be = Math.ceil(fixedTotal / margin);
  const target = targetOrders(dna, ind, sk);
  const rev = target * price;
  const cogsTotal = target * cogs;
  const gross = rev - cogsTotal;
  const op = gross - fixedTotal;
  return {
    ind, indLabel: IND_LABEL[ind], prodName: prod.name, rangeLabel: prod.range || 'ước tính',
    price, cogs, cogsRate: rate, margin, sk, f, fixedTotal, be, target,
    unit: UNIT_BY_IND[ind] || 'đơn', rev, cogsTotal, gross, op,
    safety: be > 0 ? (target - be) / be : 0,
    physical: PHYSICAL.has(ind), channels: channelsOf(dna)
  };
}

/* ==================== 2. Helpers trình bày ==================== */

function mdTable(header, rows) {
  const line = a => '| ' + a.join(' | ') + ' |';
  return [line(header), '|' + header.map(() => '---').join('|') + '|']
    .concat(rows.map(line)).join('\n');
}
const HTML_STYLE = '<style>.fk{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}'
  + '.fk>div{flex:1;min-width:120px;border:1px solid #ccc;border-radius:8px;padding:10px}'
  + '.fk b{font-size:24px;display:block}.fk span{font-size:12px;color:#666}'
  + 'table.fin{border-collapse:collapse;width:100%}table.fin th,table.fin td{padding:4px;border-bottom:1px solid #ddd;text-align:left}'
  + '.fn{font-size:12px;color:#666}</style>';
function htmlTable(header, rows) {
  return '<table class="fin"><thead><tr>' + header.map(h => '<th>' + h + '</th>').join('')
    + '</tr></thead><tbody>'
    + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')
    + '</tbody></table>';
}
function kpiBox(value, label) {
  return '<div><b>' + value + '</b><span>' + label + '</span></div>';
}
function roundPrefix(round) {
  return round > 0 ? '_(Bản sửa vòng ' + round + ' — đã xử lý toàn bộ nhận xét)_\n\n' : '';
}

/* ==================== 3. NV_CASH — dự toán, hòa vốn, P&L ==================== */

function launchBudget(e) {
  const m = e.f.mul;
  const base = [
    [e.physical ? 'Sản xuất mẫu & bao bì' : 'Xây dựng sản phẩm / tài liệu demo', 4.2, 6.5, 8.8],
    ['Quảng cáo test (' + e.channels.join(', ') + ')', 3.0, 5.0, 8.0],
    ['KOC / seeding / ưu đãi mở bán', 1.5, 2.5, 4.0],
    ['Vận hành, chụp ảnh, thiết kế', 1.0, 1.6, 2.2]
  ].map(r => [r[0], roundK(r[1] * 1e6 * m), roundK(r[2] * 1e6 * m), roundK(r[3] * 1e6 * m)]);
  const sub = [1, 2, 3].map(i => base.reduce((s, r) => s + r[i], 0));
  const dp = sub.map(v => roundK(v * 0.1));
  const tong = sub.map((v, i) => v + dp[i]);
  return { base, dp, tong };
}

function beVerdict(e) {
  if (e.target >= e.be) {
    if (e.safety < 0.15) {
      return 'Mục tiêu ' + e.target + ' ' + e.unit + '/tháng chỉ cao hơn hòa vốn ' + pct(e.safety)
        + ' — biên an toàn mỏng (chuẩn nghề ≥15%). Đề xuất: tăng giá trị đơn bằng combo/upsell hoặc đàm phán giảm 5–10% giá vốn.';
    }
    return 'Mục tiêu ' + e.target + ' ' + e.unit + '/tháng cao hơn hòa vốn ' + pct(e.safety)
      + ' — biên an toàn đạt chuẩn (≥15%). Giữ kỷ luật chi: CP cố định không vượt ' + vnd(e.fixedTotal) + 'đ/tháng.';
  }
  const giam = e.fixedTotal - e.target * e.margin;
  return 'CẢNH BÁO: mục tiêu ' + e.target + ' ' + e.unit + '/tháng THẤP HƠN hòa vốn ' + e.be
    + ' → lỗ ' + vnd(-e.op) + 'đ/tháng. Cần thêm ' + (e.be - e.target) + ' ' + e.unit
    + ' hoặc cắt ' + vnd(giam) + 'đ chi phí cố định.';
}

function cashAssumptions(e) {
  return '_Giả định: giá vốn ≈ ' + Math.round(e.cogsRate * 100) + '% giá bán (tham chiếu ngành ' + e.indLabel
    + '); giá bán = trung điểm khoảng giá ' + e.rangeLabel
    + '; CP cố định phân bổ/tháng = thuê ' + vnd(e.f.thue) + ' + lương ' + vnd(e.f.luong)
    + ' + marketing ' + vnd(e.f.mkt) + ' + vận hành ' + vnd(e.f.vh)
    + '; chưa gồm thuế TNDN. Công thức: Hòa vốn = CP cố định ÷ (giá bán − giá vốn); Tổng = Σ dòng + dự phòng 10%._';
}

function cashRoundExtra(e, round) {
  const cogs2 = roundK(e.cogs * 1.1);
  const be2 = Math.ceil(e.fixedTotal / Math.max(1, e.price - cogs2));
  return '\n\n## Bổ sung theo nhận xét TP (vòng ' + round + ')\n'
    + '- **Độ nhạy giá vốn:** nếu giá vốn tăng 10% (' + vnd(cogs2) + 'đ), hòa vốn tăng từ '
    + e.be + ' lên **' + be2 + ' ' + e.unit + '/tháng** (+' + (be2 - e.be) + ').\n'
    + '- **Kiểm tra chéo:** tổng từng kịch bản đã cộng lại bằng tay khớp 100%; hòa vốn tính 2 cách (chia trực tiếp và dò từ P&L) cho cùng kết quả; biên an toàn đã nêu ở mục 3.';
}

function cashCore(e) {
  const b = launchBudget(e);
  const rows = b.base.map(r => [r[0], vnd(r[1]), vnd(r[2]), vnd(r[3])]);
  rows.push(['Dự phòng 10%', vnd(b.dp[0]), vnd(b.dp[1]), vnd(b.dp[2])]);
  rows.push(['**Tổng**', '**' + vnd(b.tong[0]) + '**', '**' + vnd(b.tong[1]) + '**', '**' + vnd(b.tong[2]) + '**']);
  const budgetTable = mdTable(['Hạng mục (đ)', 'Tiết kiệm', 'Chuẩn', 'Đẩy mạnh'], rows);
  const pnlRows = [
    ['Doanh thu (' + e.target + ' ' + e.unit + ' × ' + vnd(e.price) + 'đ)', vnd(e.rev)],
    ['Giá vốn hàng bán', '(' + vnd(e.cogsTotal) + ')'],
    ['Lãi gộp', vnd(e.gross) + ' (' + pct(e.gross / e.rev) + ')'],
    ['Chi phí cố định phân bổ', '(' + vnd(e.fixedTotal) + ')'],
    ['**LN hoạt động**', '**' + vnd(e.op) + ' (' + pct(e.op / e.rev) + ')**']
  ];
  const pnlTable = mdTable(['Chỉ tiêu (đ/tháng)', 'Kịch bản chuẩn'], pnlRows);
  return { budgetTable, pnlTable, tongChuan: b.tong[1] };
}

function cashOutput(brief, ctx) {
  brief = brief || {}; ctx = ctx || {};
  const e = econ(dnaOf(ctx));
  const round = ctx.round || 0;
  const fmt = brief.format_dau_ra || 'docx';
  const c = cashCore(e);
  const title = brief.muc_tieu || ('Dự toán ra mắt & P&L — ' + e.prodName);
  const beLine = 'Hòa vốn = ' + vnd(e.fixedTotal) + ' ÷ (' + vnd(e.price) + ' − ' + vnd(e.cogs)
    + ') = **' + e.be + ' ' + e.unit + '/tháng**.';

  if (fmt === 'pptx') {
    return roundPrefix(round)
      + '## 1. Tóm tắt cho CEO\n'
      + '- Ngân sách ra mắt (kịch bản chuẩn): **' + vnd(c.tongChuan) + 'đ**\n'
      + '- Điểm hòa vốn: **' + e.be + ' ' + e.unit + '/tháng** — mục tiêu ' + e.target + '\n'
      + '- LN hoạt động dự kiến: ' + vnd(e.op) + 'đ/tháng (' + pct(e.op / e.rev) + ')\n\n'
      + '## 2. Dự toán 3 kịch bản\n' + c.budgetTable + '\n\n'
      + '## 3. Unit economics — ' + e.prodName + '\n'
      + '- Giá bán TB ' + vnd(e.price) + 'đ (trung điểm ' + e.rangeLabel + ') · giá vốn ' + vnd(e.cogs) + 'đ ('
      + Math.round(e.cogsRate * 100) + '%)\n- Lãi gộp/' + e.unit + ': **' + vnd(e.margin) + 'đ** (' + pct(e.margin / e.price) + ')\n\n'
      + '## 4. Hòa vốn & P&L tháng\n' + beLine + '\n' + c.pnlTable + '\n\n'
      + '## 5. Rủi ro & đề xuất\n- ' + beVerdict(e) + '\n- ' + cashAssumptions(e)
      + (round > 0 ? '\n\n## 6. Bổ sung sau review\n' + cashRoundExtra(e, round).replace(/^\n+## [^\n]+\n/, '') : '');
  }
  if (fmt === 'html') {
    return roundPrefix(round) + HTML_STYLE
      + '<h2>Dự toán & hòa vốn — ' + e.prodName + ' (' + companyName(dnaOf(ctx)) + ')</h2>'
      + '<div class="fk">'
      + kpiBox(vnd(e.price) + 'đ', 'Giá bán trung bình')
      + kpiBox(vnd(e.margin) + 'đ', 'Lãi gộp/' + e.unit + ' (' + pct(e.margin / e.price) + ')')
      + kpiBox(e.be, 'Hòa vốn (' + e.unit + '/tháng)')
      + kpiBox(vnd(e.op) + 'đ', 'LN tháng @' + e.target + ' ' + e.unit) + '</div>'
      + htmlTable(['Chỉ tiêu (đ/tháng)', 'Kịch bản chuẩn'],
        [['Doanh thu', vnd(e.rev)], ['Giá vốn', '(' + vnd(e.cogsTotal) + ')'],
         ['Lãi gộp', vnd(e.gross)], ['CP cố định phân bổ', '(' + vnd(e.fixedTotal) + ')'],
         ['<b>LN hoạt động</b>', '<b>' + vnd(e.op) + '</b>']])
      + '<p style="color:' + (e.op < 0 || e.safety < 0.1 ? '#c0392b' : '#27ae60') + '"><b>Nhận định:</b> '
      + beVerdict(e) + '</p><p class="fn">' + cashAssumptions(e).replace(/_/g, '') + '</p>'
      + (round > 0 ? '<p class="fn"><b>Vòng ' + round + ':</b> đã bổ sung độ nhạy giá vốn +10% (hòa vốn '
        + Math.ceil(e.fixedTotal / Math.max(1, e.price - roundK(e.cogs * 1.1))) + ' ' + e.unit + ') và kiểm tra chéo mọi dòng tổng.</p>' : '');
  }
  /* docx / md / xlsx — xlsx bắt buộc bảng + ghi chú công thức (đã có sẵn) */
  return roundPrefix(round)
    + '# ' + title + '\n'
    + '_Phòng Tài chính – Kế toán · ' + companyName(dnaOf(ctx)) + ' · kỳ lập: '
    + (new Date().getMonth() + 1) + '/' + new Date().getFullYear() + '_\n\n'
    + '## 1. Dự toán 3 kịch bản (chi phí ra mắt)\n' + c.budgetTable + '\n\n'
    + '## 2. Unit economics (từ khoảng giá DNA: ' + e.rangeLabel + ')\n'
    + '- Giá bán trung bình: **' + vnd(e.price) + 'đ**\n'
    + '- Giá vốn ước tính: **' + vnd(e.cogs) + 'đ** (' + Math.round(e.cogsRate * 100) + '% giá bán, ngành ' + e.indLabel + ')\n'
    + '- Lãi gộp/' + e.unit + ': **' + vnd(e.margin) + 'đ** (biên ' + pct(e.margin / e.price) + ')\n\n'
    + '## 3. Điểm hòa vốn & P&L tháng\n' + beLine + '\n\n' + c.pnlTable + '\n\n'
    + '**Nhận định:** ' + beVerdict(e) + '\n\n' + cashAssumptions(e)
    + (round > 0 ? cashRoundExtra(e, round) : '');
}

/* ==================== 4. NV_DEBT — công nợ, nhắc nợ, lương ==================== */

const DEBT_QTY_SMALL = [45, 28, 60, 22, 35, 18];
const DEBT_QTY_BIG = [2, 1, 3, 1, 2, 1]; // hàng giá trị lớn (nội thất, BĐS…)
const DEBT_PAID = [0.5, 0, 0.3, 0, 0.6, 0];
const DEBT_AGES = [12, 25, 38, 52, 75, 96]; // tuổi nợ (ngày, từ ngày phát hành HĐ)

function agingBucket(age) {
  if (age <= 30) return 'Trong hạn';
  if (age <= 60) return 'Quá hạn N1 (31–60)';
  if (age <= 90) return 'Quá hạn N2 (61–90)';
  return 'Quá hạn N3 (>90)';
}

function debtLedger(e) {
  const yr = new Date().getFullYear();
  const partners = [
    'Đại lý Minh Phát', 'Nhà phân phối An Khang', 'Khách sỉ Hồng Ngọc',
    'Đối tác ' + cap(String(e.channels[0] || 'kênh chính')), 'CTV Thu Trang', 'Khách DN Tuấn Kiệt'
  ];
  const qty = e.price > 20e6 ? DEBT_QTY_BIG : DEBT_QTY_SMALL;
  const rows = partners.map((p, i) => {
    const giaTri = roundK(e.price * qty[i]);
    const daTra = roundK(giaTri * DEBT_PAID[i]);
    return {
      p, so: 'HĐ-' + yr + '-0' + (41 + i), giaTri, daTra,
      conNo: giaTri - daTra, age: DEBT_AGES[i], bucket: agingBucket(DEBT_AGES[i])
    };
  });
  const tGiaTri = rows.reduce((s, r) => s + r.giaTri, 0);
  const tDaTra = rows.reduce((s, r) => s + r.daTra, 0);
  const tConNo = tGiaTri - tDaTra;
  const quaHan = rows.filter(r => r.age > 30).reduce((s, r) => s + r.conNo, 0);
  return { rows, tGiaTri, tDaTra, tConNo, quaHan };
}

function debtTableMd(L) {
  const rows = L.rows.map(r => [r.p, r.so, vnd(r.giaTri), vnd(r.daTra), vnd(r.conNo), r.age + ' ngày', r.bucket]);
  rows.push(['**Tổng**', '', '**' + vnd(L.tGiaTri) + '**', '**' + vnd(L.tDaTra) + '**', '**' + vnd(L.tConNo) + '**', '', '']);
  return mdTable(['Đối tác', 'Chứng từ', 'Giá trị (đ)', 'Đã trả (đ)', 'Còn nợ (đ)', 'Tuổi nợ', 'Nhóm'], rows);
}

function reminderMsgs(dna, L) {
  const p = pronouns(dna), co = companyName(dna);
  const r1 = L.rows[2], r2 = L.rows[4], r3 = L.rows[5];
  const d2 = new Date(Date.now() + 3 * 864e5), d3 = new Date(Date.now() + 5 * 864e5);
  return [
    ['Mức 1 — nhắc nhẹ (quá hạn ≤15 ngày, gửi ' + r1.so + ')',
      'Dạ ' + p.self + ' chào ' + p.other + ', ' + p.self + ' là kế toán ' + co + '. Hóa đơn ' + r1.so
      + ' còn ' + vnd(r1.conNo) + 'đ vừa quá hạn ' + (r1.age - 30) + ' ngày, ' + p.other + ' kiểm tra và cho '
      + p.self + ' xin lịch thanh toán ạ. Nếu đã chuyển rồi, ' + p.other + ' bỏ qua tin này giúp ' + p.self + ' nhé!'],
    ['Mức 2 — nhắc lần 2 (quá hạn 30–60 ngày, gửi ' + r2.so + ')',
      cap(p.self) + ' chào ' + p.other + ', khoản ' + r2.so + ' còn ' + vnd(r2.conNo) + 'đ đã quá hạn '
      + (r2.age - 30) + ' ngày. Mong ' + p.other + ' xác nhận thanh toán trước ngày ' + dmy(d2)
      + '; nếu dòng tiền đang khó, ' + co + ' có thể chia 2 đợt (50% trước ' + dmy(d2) + ', 50% sau 15 ngày).'],
    ['Mức 3 — thông báo chính thức (quá hạn >60 ngày, gửi ' + r3.so + ')',
      'Kính gửi ' + p.other + ', đây là thông báo nhắc nợ lần 3 của ' + co + '. Khoản ' + r3.so + ' còn '
      + vnd(r3.conNo) + 'đ đã quá hạn ' + (r3.age - 30) + ' ngày. Đề nghị thanh toán trước 17h ngày ' + dmy(d3)
      + ' (5 ngày làm việc). Sau thời hạn, ' + co + ' buộc tạm ngừng cung cấp đơn mới, áp dụng lãi chậm trả'
      + ' theo hợp đồng và chuyển hồ sơ sang bộ phận pháp lý. Rất mong ' + p.other + ' hợp tác.']
  ];
}

const SALARY_STAFF = [
  ['Trần Thị Thu Hà', 'Kế toán tổng hợp', 14e6],
  ['Nguyễn Văn Long', 'NV kinh doanh', 12e6],
  ['Phạm Minh Anh', 'NV marketing', 11e6],
  ['Lê Quốc Bảo', 'NV vận hành / kho', 9e6],
  ['Đỗ Thùy Linh', 'NV CSKH', 8.5e6]
];
const BH_NLD = 0.105, BH_NSDLD = 0.215;

function salaryTableMd() {
  let tg = 0, tn = 0, td = 0, te = 0, tc = 0;
  const rows = SALARY_STAFF.map(([ten, vt, g]) => {
    const nld = g * BH_NLD, net = g - nld, er = g * BH_NSDLD, cost = g + er;
    tg += g; tn += nld; td += net; te += er; tc += cost;
    return [ten, vt, vnd(g), vnd(nld), vnd(net), vnd(er), vnd(cost)];
  });
  rows.push(['**Tổng**', '', '**' + vnd(tg) + '**', '**' + vnd(tn) + '**', '**' + vnd(td) + '**', '**' + vnd(te) + '**', '**' + vnd(tc) + '**']);
  return mdTable(['Họ tên', 'Vị trí', 'Gross (đ)', 'Trích NLĐ 10,5%', 'Thực nhận (đ)', 'Trích NSDLĐ 21,5%', 'Chi phí Cty (đ)'], rows);
}

const SALARY_NOTE = '_Tỷ lệ 2026 — NLĐ 10,5% (BHXH 8% + BHYT 1,5% + BHTN 1%); NSDLĐ 21,5% (BHXH 17,5% + BHYT 3% + BHTN 1%).'
  + ' Giả định lương đóng BH = lương gross (dưới mức trần); chưa gồm kinh phí công đoàn 2% và thuế TNCN.'
  + ' Công thức: Thực nhận = Gross − 10,5%; Chi phí Cty = Gross × 121,5%._';

const DEBT_NOTE = '_Giả định: điều khoản thanh toán 30 ngày; tuổi nợ tính từ ngày phát hành HĐ; Còn nợ = Giá trị − Đã trả.'
  + ' Quá hạn ≥6 tháng: trích lập dự phòng 30% theo TT 48/2019/TT-BTC — nhóm N3 cần theo dõi hằng tuần._';

function debtRoundExtra(L, round) {
  return '\n\n## Bổ sung theo nhận xét TP (vòng ' + round + ')\n'
    + '- Đối chiếu lại: tổng còn nợ ' + vnd(L.tConNo) + 'đ khớp cộng tay 6 dòng; quá hạn ' + pct(L.quaHan / L.tConNo) + '.\n'
    + '- Đã thêm hạn chót + lãi chậm trả (tin mức 3), tách từng quỹ BH, khuyến nghị trích lập TT 48/2019.';
}

function debtOutput(brief, ctx) {
  brief = brief || {}; ctx = ctx || {};
  const dna = dnaOf(ctx), e = econ(dna), round = ctx.round || 0;
  const fmt = brief.format_dau_ra || 'docx';
  const t = briefText(brief);
  const wantsSalary = /lương|bhxh|payroll|bảo hiểm/i.test(t);
  const L = debtLedger(e);

  if (wantsSalary) {
    const head = '# ' + (brief.muc_tieu || 'Bảng lương tháng — ' + companyName(dna)) + '\n'
      + '_Kỳ lương ' + (new Date().getMonth() + 1) + '/' + new Date().getFullYear() + ' · 5 nhân sự · đơn vị: đồng_\n\n';
    if (fmt === 'pptx') {
      return roundPrefix(round) + '## 1. Tổng quan quỹ lương\n- Tổng gross 54.500.000đ · tổng chi phí công ty '
        + vnd(54.5e6 * (1 + BH_NSDLD)) + 'đ/tháng\n\n## 2. Bảng lương chi tiết\n' + salaryTableMd()
        + '\n\n## 3. Cấu phần bảo hiểm 2026\n- NLĐ 10,5% = BHXH 8% + BHYT 1,5% + BHTN 1%\n- NSDLĐ 21,5% = BHXH 17,5% + BHYT 3% + BHTN 1%\n\n'
        + '## 4. Lưu ý tuân thủ\n- ' + SALARY_NOTE.replace(/_/g, '') + '\n\n## 5. Việc tiếp theo\n- Chốt chấm công trước ngày 3; nộp BH trước ngày cuối tháng.'
        + (round > 0 ? debtRoundExtra(L, round) : '');
    }
    const body = head + '## Bảng lương có BHXH/BHYT/BHTN\n' + salaryTableMd() + '\n\n' + SALARY_NOTE
      + '\n\n**Lịch tuân thủ:** chốt công ngày 3 · trả lương ngày 5 · nộp tiền BH chậm nhất ngày cuối tháng · tờ khai thuế TNCN theo quý.'
      + (round > 0 ? debtRoundExtra(L, round) : '');
    if (fmt === 'html') {
      return roundPrefix(round) + HTML_STYLE + '<h2>' + (brief.muc_tieu || 'Bảng lương tháng') + '</h2>'
        + htmlTable(['Họ tên', 'Vị trí', 'Gross', 'NLĐ 10,5%', 'Thực nhận', 'NSDLĐ 21,5%', 'Chi phí Cty'],
          SALARY_STAFF.map(([ten, vt, g]) => [ten, vt, vnd(g), vnd(g * BH_NLD), vnd(g * (1 - BH_NLD)), vnd(g * BH_NSDLD), vnd(g * (1 + BH_NSDLD))]))
        + '<p class="fn">' + SALARY_NOTE.replace(/_/g, '') + '</p>'
        + (round > 0 ? '<p class="fn"><b>Vòng ' + round + ':</b> đã tách từng quỹ BH và đối chiếu lại mọi dòng tổng.</p>' : '');
    }
    return roundPrefix(round) + body;
  }

  const msgs = reminderMsgs(dna, L);
  if (fmt === 'html') {
    return roundPrefix(round) + HTML_STYLE
      + '<h2>Đối soát công nợ — ' + companyName(dna) + '</h2>'
      + '<div class="fk">'
      + kpiBox(vnd(L.tConNo) + 'đ', 'Tổng phải thu')
      + kpiBox(vnd(L.quaHan) + 'đ', 'Đang quá hạn')
      + kpiBox(pct(L.quaHan / L.tConNo), 'Tỷ lệ quá hạn') + '</div>'
      + htmlTable(['Đối tác', 'Chứng từ', 'Còn nợ (đ)', 'Tuổi nợ', 'Nhóm'],
        L.rows.map(r => [r.p, r.so, vnd(r.conNo), r.age + ' ngày', r.bucket]))
      + '<h3>Quy trình nhắc 3 mức</h3><ol>'
      + '<li>Quá hạn ≤15 ngày: tin thân thiện, xin lịch thanh toán.</li>'
      + '<li>Quá hạn 30–60: xác nhận trước hạn cụ thể, đề xuất chia 2 đợt.</li>'
      + '<li>Quá hạn >60: thông báo chính thức — hạn chót 5 ngày làm việc, ngừng cung cấp + lãi chậm trả.</li></ol>'
      + '<p><b>Mẫu tin mức 3:</b> ' + msgs[2][1] + '</p>'
      + '<p class="fn">' + DEBT_NOTE.replace(/_/g, '') + '</p>'
      + (round > 0 ? '<p class="fn"><b>Vòng ' + round + ':</b> đã đối chiếu lại tổng ' + vnd(L.tConNo) + 'đ và bổ sung hạn chót, chế tài ở tin mức 3.</p>' : '');
  }
  if (fmt === 'pptx') {
    return roundPrefix(round)
      + '## 1. Bức tranh công nợ\n- Tổng phải thu **' + vnd(L.tConNo) + 'đ**, trong đó quá hạn ' + vnd(L.quaHan)
      + 'đ (' + pct(L.quaHan / L.tConNo) + ') — cần hành động ngay\n\n'
      + '## 2. Bảng tuổi nợ\n' + debtTableMd(L) + '\n\n'
      + '## 3. Quy trình nhắc 3 mức\n- Mức 1 (quá hạn ≤15 ngày): tin nhắn thân thiện\n- Mức 2 (30–60): xác nhận lịch trả, đề xuất chia đợt\n- Mức 3 (>60): thông báo chính thức, hạn chót 5 ngày làm việc\n\n'
      + '## 4. Mẫu tin mức 3 (trích)\n- ' + msgs[2][1] + '\n\n'
      + '## 5. Ghi chú & tuân thủ\n- ' + DEBT_NOTE.replace(/_/g, '')
      + (round > 0 ? debtRoundExtra(L, round) : '');
  }
  /* docx / md / xlsx */
  return roundPrefix(round)
    + '# ' + (brief.muc_tieu || 'Đối soát công nợ & lịch nhắc nợ — ' + companyName(dna)) + '\n\n'
    + '## 1. Bảng đối soát (kỳ ' + (new Date().getMonth() + 1) + '/' + new Date().getFullYear() + ')\n'
    + debtTableMd(L) + '\n\n'
    + 'Quá hạn: **' + vnd(L.quaHan) + 'đ** (' + pct(L.quaHan / L.tConNo) + ' tổng phải thu).\n\n'
    + '## 2. Lịch nhắc nợ 3 mức (tăng dần)\n'
    + msgs.map(m => '**' + m[0] + '**\n> ' + m[1]).join('\n\n') + '\n\n' + DEBT_NOTE
    + (round > 0 ? debtRoundExtra(L, round) : '');
}

/* ==================== 5. TP_TC — phân tích sức khỏe tài chính ==================== */

function healthChecks(e) {
  const grossPct = e.margin / e.price;
  const fixedPct = e.fixedTotal / e.rev;
  const opPct = e.op / e.rev;
  return [
    { name: 'Biên lãi gộp', val: pct(grossPct), ref: '≥ 40%', ok: grossPct >= 0.4 },
    { name: 'CP cố định / doanh thu', val: pct(fixedPct), ref: '≤ 55%', ok: fixedPct <= 0.55 },
    { name: 'Hòa vốn so mục tiêu', val: e.be + ' / ' + e.target + ' ' + e.unit, ref: 'mục tiêu > hòa vốn', ok: e.target > e.be },
    { name: 'Biên an toàn doanh thu', val: pct(e.safety), ref: '≥ 15%', ok: e.safety >= 0.15 },
    { name: 'Biên LN hoạt động', val: pct(opPct), ref: '≥ 10%', ok: opPct >= 0.1 }
  ];
}

function tpRecommend(e, checks) {
  const rec = [];
  if (!checks[1].ok) rec.push('Rà soát CP cố định: mục tiêu cắt ' + vnd(Math.max(0, e.fixedTotal - e.rev * 0.5)) + 'đ/tháng trong 60 ngày (đưa tỷ lệ về ≤50% doanh thu).');
  if (!checks[3].ok) rec.push('Nâng biên an toàn lên ≥15%: cần đạt ' + Math.ceil(e.be * 1.15) + ' ' + e.unit + '/tháng hoặc tăng giá trị đơn trung bình qua combo/upsell.');
  if (!checks[4].ok) rec.push('Đàm phán giá vốn với nhà cung cấp: mỗi 5% giảm giá vốn → LN tháng tăng ' + vnd(e.target * e.cogs * 0.05) + 'đ.');
  if (!rec.length) rec.push('Các chỉ số đều đạt ngưỡng — duy trì kỷ luật chi và cân nhắc tái đầu tư ' + vnd(e.op * 0.3) + 'đ/tháng (30% LN) cho tăng trưởng.');
  rec.push('Lập dashboard theo dõi tuần: doanh thu, ' + e.unit + ' mới, tồn quỹ — cảnh báo đỏ khi lệch kế hoạch >10%.');
  return rec.slice(0, 3);
}

function tpOutput(brief, ctx) {
  brief = brief || {}; ctx = ctx || {};
  const dna = dnaOf(ctx), e = econ(dna), round = ctx.round || 0;
  const fmt = brief.format_dau_ra || 'docx';
  const checks = healthChecks(e);
  const rec = tpRecommend(e, checks);
  const tbl = mdTable(['Chỉ số', 'Giá trị', 'Ngưỡng tham chiếu', 'Đánh giá'],
    checks.map(c => [c.name, c.val, c.ref, c.ok ? '✅ Đạt' : '⚠️ Chưa đạt']));
  const banned = bannedOf(dna);
  const extra = round > 0
    ? '\n\n## Bổ sung theo nhận xét (vòng ' + round + ')\n- Đã ghi rõ nguồn số (mô hình kinh tế từ DNA + đơn giá ' + e.rangeLabel + '); các ngưỡng tham chiếu lấy theo chuẩn nghề SME ngành ' + e.indLabel + '; khuyến nghị đã xếp theo thứ tự ưu tiên tác động.' : '';

  if (fmt === 'pptx') {
    return roundPrefix(round)
      + '## 1. Kết luận nhanh\n- ' + (checks.filter(c => !c.ok).length === 0
        ? 'Sức khỏe tài chính TỐT — đủ điều kiện tăng tốc.'
        : 'Có ' + checks.filter(c => !c.ok).length + '/5 chỉ số dưới ngưỡng — cần xử lý theo thứ tự ưu tiên bên dưới.') + '\n\n'
      + '## 2. Bảng chỉ số\n' + tbl + '\n\n'
      + '## 3. Điểm cần chú ý\n- Hòa vốn ' + e.be + ' ' + e.unit + '/tháng, mục tiêu ' + e.target + ' → biên an toàn ' + pct(e.safety) + '\n- LN hoạt động dự kiến ' + vnd(e.op) + 'đ/tháng\n\n'
      + '## 4. Khuyến nghị ưu tiên\n' + rec.map(r => '- ' + r).join('\n') + '\n\n'
      + '## 5. Giả định\n- ' + cashAssumptions(e).replace(/_/g, '') + extra;
  }
  if (fmt === 'html') {
    return roundPrefix(round) + HTML_STYLE
      + '<h2>Sức khỏe tài chính — ' + companyName(dna) + '</h2>'
      + '<div class="fk">'
      + kpiBox(pct(e.margin / e.price), 'Biên lãi gộp')
      + kpiBox(e.be + '/' + e.target, 'Hòa vốn / mục tiêu (' + e.unit + ')')
      + kpiBox(vnd(e.op) + 'đ', 'LN hoạt động/tháng') + '</div>'
      + htmlTable(['Chỉ số', 'Giá trị', 'Ngưỡng', 'Đánh giá'],
        checks.map(c => [c.name, c.val, c.ref, c.ok ? 'Đạt' : '<b style="color:#c0392b">Chưa đạt</b>']))
      + '<h3>Khuyến nghị</h3><ul>' + rec.map(r => '<li>' + r + '</li>').join('') + '</ul>'
      + (round > 0 ? '<p class="fn"><b>Vòng ' + round + ':</b> đã dẫn nguồn số liệu và gắn con số tác động cho từng khuyến nghị.</p>' : '');
  }
  return roundPrefix(round)
    + '# ' + (brief.muc_tieu || 'Phân tích sức khỏe tài chính — ' + companyName(dna)) + '\n'
    + '_TP Tài chính lập · dựa trên DNA (' + e.indLabel + ', quy mô ' + e.sk + ') và đơn giá ' + e.rangeLabel + '_\n\n'
    + '## 1. Bảng chỉ số chính\n' + tbl + '\n\n'
    + '## 2. Chẩn đoán\n'
    + '- Mỗi ' + e.unit + ' ' + e.prodName + ' đem về lãi gộp ' + vnd(e.margin) + 'đ; cần ' + e.be + ' ' + e.unit + '/tháng để gánh hết ' + vnd(e.fixedTotal) + 'đ chi phí cố định.\n'
    + '- ' + beVerdict(e) + '\n'
    + (banned.length ? '- Lưu ý tuân thủ khi truyền thông số liệu: ' + banned.join('; ') + '.\n' : '')
    + '\n## 3. Khuyến nghị ưu tiên (30–60–90 ngày)\n' + rec.map((r, i) => (i + 1) + '. ' + r).join('\n')
    + '\n\n' + cashAssumptions(e) + extra;
}

/* ==================== 6. Router default ==================== */

function defaultOutput(brief, ctx) {
  const t = briefText(brief);
  if (/lương|bhxh|bảo hiểm|payroll|công nợ|đối soát|nhắc nợ|thu hồi|đòi nợ/i.test(t)) return debtOutput(brief, ctx);
  if (/dự toán|kịch bản|p&l|pnl|giá vốn|hòa vốn|dòng tiền|ngân sách|chi phí/i.test(t)) return cashOutput(brief, ctx);
  return tpOutput(brief, ctx);
}

/* ==================== 7. Reviews của TP Tài chính ==================== */

function reviewCash(brief, ctx, pass) {
  const e = econ(dnaOf(ctx || {}));
  if (pass) {
    return {
      feedback_chi_tiet: 'Duyệt. Số học khớp: tổng 3 kịch bản cộng lại đúng từng dòng, hòa vốn ' + e.be + ' '
        + e.unit + '/tháng đúng công thức CP cố định ÷ lãi gộp đơn vị (' + vnd(e.fixedTotal) + ' ÷ ' + vnd(e.margin)
        + '), giả định ghi rõ nguồn. Đủ căn cứ trình CEO. Góp ý nhỏ: thêm cột "% cơ cấu" cho kịch bản chuẩn để CEO đọc nhanh hơn.',
      loi_cu_the: [{ vi_tri: 'Bảng dự toán, mục 1', loi: 'Thiếu cột tỷ trọng % từng hạng mục', cach_sua: 'Thêm cột "% tổng" tính trên kịch bản chuẩn' }]
    };
  }
  return {
    feedback_chi_tiet: 'CHƯA DUYỆT — trả lại sửa trong hôm nay. Ba lỗi phải xử lý: (1) chưa có phân tích độ nhạy'
      + ' khi giá vốn biến động — với ' + e.prodName + ', giá vốn tăng 10% là kịch bản rất thực tế; (2) chưa ghi'
      + ' phương pháp kiểm tra chéo (tổng cộng tay so với công thức) — quy tắc phòng là mọi bảng nộp lên phải tự đối chiếu trước;'
      + ' (3) biên an toàn doanh thu chưa được nêu và so với ngưỡng chuẩn nghề 15%. Sửa xong 3 điểm này thì đạt.',
    loi_cu_the: [
      { vi_tri: 'Mục 3 — Điểm hòa vốn', loi: 'Thiếu phân tích độ nhạy giá vốn ±10%', cach_sua: 'Thêm dòng: giá vốn ' + vnd(roundK(e.cogs * 1.1)) + 'đ (+10%) → hòa vốn mới, ghi chênh lệch số ' + e.unit },
      { vi_tri: 'Bảng mục 1, dòng Tổng', loi: 'Không ghi cách kiểm tra chéo tổng', cach_sua: 'Ghi chú "tổng đã cộng tay khớp công thức" và nêu 2 cách tính hòa vốn cho cùng kết quả' },
      { vi_tri: 'Phần Nhận định', loi: 'Chưa nêu biên an toàn so ngưỡng ≥15%', cach_sua: 'Tính (mục tiêu − hòa vốn) ÷ hòa vốn = ' + pct(e.safety) + ' và kết luận đạt/chưa đạt kèm hướng xử lý' }
    ]
  };
}

function reviewDebt(brief, ctx, pass) {
  const e = econ(dnaOf(ctx || {}));
  const L = debtLedger(e);
  if (pass) {
    return {
      feedback_chi_tiet: 'Duyệt. Tổng còn nợ ' + vnd(L.tConNo) + 'đ khớp cộng dòng, tuổi nợ xếp nhóm đúng chuẩn'
        + ' 30/60/90, tin nhắc 3 mức tăng dần đúng giọng thương hiệu, bảng lương đúng tỷ lệ 10,5%/21,5%.'
        + ' Góp ý nhỏ: thêm cột "người phụ trách thu" để gắn trách nhiệm từng khoản.',
      loi_cu_the: [{ vi_tri: 'Bảng đối soát', loi: 'Chưa gắn người phụ trách từng khoản nợ', cach_sua: 'Thêm cột phân công + ngày hẹn gọi tiếp theo' }]
    };
  }
  return {
    feedback_chi_tiet: 'CHƯA DUYỆT. Bốn lỗi: (1) phần bảo hiểm ghi gộp 10,5%/21,5% nhưng chưa tách cấu phần'
      + ' từng quỹ (BHXH 8% + BHYT 1,5% + BHTN 1% phía NLĐ; 17,5% + 3% + 1% phía NSDLĐ) — kế toán phải tra được từng quỹ khi quyết toán;'
      + ' (2) khoản quá hạn nhóm N3 (>90 ngày) chưa kèm khuyến nghị trích lập dự phòng theo TT 48/2019/TT-BTC;'
      + ' (3) tin nhắc mức 3 thiếu hạn chót ngày cụ thể và điều khoản lãi chậm trả — thiếu thì không có hiệu lực đòi;'
      + ' (4) chân bảng chưa ghi công thức Còn nợ = Giá trị − Đã trả để người sau kiểm tra. Sửa đủ 4 điểm rồi nộp lại.',
    loi_cu_the: [
      { vi_tri: 'Chú thích bảng lương', loi: 'Tỷ lệ BH ghi gộp, chưa tách quỹ', cach_sua: 'Ghi rõ: NLĐ = 8% BHXH + 1,5% BHYT + 1% BHTN; NSDLĐ = 17,5% + 3% + 1%' },
      { vi_tri: 'Bảng đối soát, các dòng nhóm N3', loi: 'Thiếu khuyến nghị trích lập dự phòng', cach_sua: 'Thêm ghi chú ngưỡng TT 48/2019: quá hạn ≥6 tháng trích 30%, ≥1 năm trích 50%' },
      { vi_tri: 'Tin nhắc nợ mức 3', loi: 'Không có hạn chót và chế tài', cach_sua: 'Thêm "trước 17h ngày …", nêu tạm ngừng cung cấp + lãi chậm trả theo hợp đồng' },
      { vi_tri: 'Chân bảng đối soát', loi: 'Thiếu công thức đối chiếu', cach_sua: 'Ghi "Còn nợ = Giá trị − Đã trả; tổng đã cộng tay khớp 100%"' }
    ]
  };
}

function reviewTp(brief, ctx, pass) {
  const e = econ(dnaOf(ctx || {}));
  if (pass) {
    return {
      feedback_chi_tiet: 'Đạt. Bộ chỉ số đủ 5 nhóm, ngưỡng tham chiếu rõ, khuyến nghị xếp theo ưu tiên tác động.'
        + ' Góp ý nhỏ: bổ sung so sánh với kỳ trước khi có dữ liệu 2 tháng để thấy xu hướng.',
      loi_cu_the: [{ vi_tri: 'Bảng chỉ số', loi: 'Chưa có cột so kỳ trước', cach_sua: 'Thêm cột "kỳ trước" và mũi tên xu hướng khi đủ dữ liệu' }]
    };
  }
  return {
    feedback_chi_tiet: 'CHƯA ĐẠT. (1) Chỉ số nêu ra nhưng không dẫn nguồn số gốc (đơn giá ' + e.rangeLabel
      + ', chi phí cố định) — người đọc không kiểm chứng được; (2) khuyến nghị chưa gắn con số tác động cụ thể'
      + ' (giảm bao nhiêu, thu về bao nhiêu đ/tháng); (3) thiếu phần giả định ở cuối tài liệu. Bổ sung rồi nộp lại.',
    loi_cu_the: [
      { vi_tri: 'Mục 1 — Bảng chỉ số', loi: 'Không dẫn nguồn dữ liệu đầu vào', cach_sua: 'Ghi rõ nguồn: khoảng giá DNA, CP cố định phân bổ theo quy mô, mục tiêu từ goal_3m' },
      { vi_tri: 'Mục 3 — Khuyến nghị', loi: 'Khuyến nghị chung chung, thiếu số tác động', cach_sua: 'Mỗi khuyến nghị kèm con số: đ/tháng tiết kiệm hoặc số ' + e.unit + ' cần thêm' },
      { vi_tri: 'Cuối tài liệu', loi: 'Thiếu khối giả định', cach_sua: 'Thêm đoạn _Giả định:_ nêu tỷ lệ giá vốn, cấu phần CP cố định, công thức hòa vốn' }
    ]
  };
}

function reviewDefault(brief, ctx, pass) {
  const t = briefText(brief);
  if (/lương|công nợ|nhắc nợ|đối soát|bhxh/i.test(t)) return reviewDebt(brief, ctx, pass);
  if (/dự toán|hòa vốn|p&l|giá vốn|ngân sách|dòng tiền/i.test(t)) return reviewCash(brief, ctx, pass);
  return reviewTp(brief, ctx, pass);
}

/* ==================== 8. Export ==================== */

module.exports = {
  dept: 'tckt',
  outputs: {
    tp_tc: tpOutput,
    nv_cash: cashOutput,
    nv_debt: debtOutput,
    default: defaultOutput
  },
  reviews: {
    tp_tc: reviewTp,
    nv_cash: reviewCash,
    nv_debt: reviewDebt,
    default: reviewDefault
  }
};
