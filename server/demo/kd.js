'use strict';
/* Phòng Kinh doanh (dept 'kd') — module demo sinh sản phẩm & nhận xét review.
   outputs[agentId](brief, ctx) -> markdown 500–2500 ký tự, tôn trọng brief.format_dau_ra
   reviews[agentId](brief, ctx, pass) -> { feedback_chi_tiet, loi_cu_the }
   Chịu được brief rỗng {} và ctx.dna/ctx.task = null. Không dependency ngoài. */

/* ---------------- Helpers đọc DNA an toàn ---------------- */

function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* Tách khoảng giá, để token đầu THỪA HƯỞNG đơn vị ở token cuối:
   "1,5-3 triệu" → ["1,5 triệu","3 triệu"]; "159k-289k" → ["159k","289k"] */
function splitPriceRange(s) {
  const parts = String(s || '').split(/[-–—]|đến/i).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return parts;
  const unit = /(tr|trieu|triệu|m|k)\b/i.exec(parts[parts.length - 1]);
  if (unit) {
    return parts.map(p => /(tr|trieu|triệu|m|k)\b/i.test(p) ? p : p + unit[1]);
  }
  return parts;
}

function parseMoney(tok) {
  if (!tok) return null;
  const t = String(tok).trim().toLowerCase().replace(/\s+/g, '');
  const m = t.match(/^([\d.,]+)(tr|trieu|triệu|m|k)?/);
  if (!m || !m[1]) return null;
  let num = m[1];
  const suf = m[2] || '';
  if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, '');
  else num = num.replace(',', '.');
  const v = parseFloat(num);
  if (!isFinite(v) || v <= 0) return null;
  if (suf === 'k') return Math.round(v * 1e3);
  if (suf) return Math.round(v * 1e6);
  return v < 1000 ? Math.round(v * 1e3) : Math.round(v);
}

function roundK(n) { return Math.round(n / 1000) * 1000; }
function vnd(n) { return n.toLocaleString('vi-VN') + 'đ'; }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function dnaOf(ctx) {
  const d = (ctx && ctx.dna) || {};
  const co = d.company || {};
  const p0 = (Array.isArray(d.products) && d.products[0]) || {};
  const cus = d.customers || {};
  const vo = d.voice || {};
  const toks = splitPriceRange(p0.price_range).map(parseMoney).filter(Boolean);
  let low = toks.length ? Math.min.apply(null, toks) : 0;
  let high = toks.length ? Math.max.apply(null, toks) : 0;
  const est = !low || !high;
  if (est) { low = 150000; high = 300000; }
  if (low === high) low = roundK(high * 0.7) || high;
  const adr = String(vo.address || '').split(/[-–]/).map(s => s.trim()).filter(Boolean);
  const banned = (Array.isArray(vo.banned) && vo.banned.length)
    ? vo.banned : ['không cam kết quá lời', 'không nói xấu đối thủ'];
  return {
    company: clip(co.name || 'công ty', 45),
    product: clip(p0.name || 'sản phẩm chủ lực', 45),
    low, high, est,
    avg: roundK((low + high) / 2),
    customer: clip(cus.profile || 'khách hàng mục tiêu của công ty', 80),
    channels: (Array.isArray(cus.channels) && cus.channels.length) ? cus.channels : ['facebook', 'zalo'],
    seller: adr[0] || 'em',
    cust: adr[1] || 'anh/chị',
    bannedTxt: clip(banned.join('; '), 120),
    goal: String(d.goal_3m || '')
  };
}

function roundOf(ctx) { const r = ctx && ctx.round; return (typeof r === 'number' && r > 0) ? r : 0; }
function fmtOf(brief) { return (brief && brief.format_dau_ra) || 'docx'; }
function revLine(r, html) {
  if (!r) return '';
  const s = '_(Bản sửa vòng ' + r + ' — đã xử lý toàn bộ nhận xét)_';
  return html ? '<p>' + s + '</p>\n' : s + '\n\n';
}
function perDay(g) { return vnd(Math.ceil(g.high / 30 / 1000) * 1000); }
function donThangOf(g) {
  const m = g.goal.match(/(\d[\d.,]*)\s*đơn/i);
  if (m) { const v = parseInt(m[1].replace(/[.,]/g, ''), 10); if (v > 0) return v; }
  return 200;
}

/* ---------------- NV Kịch bản Sales ---------------- */

function outSales(brief, ctx) {
  const g = dnaOf(ctx), r = roundOf(ctx), fmt = fmtOf(brief);
  const pd = perDay(g);
  const combo = vnd(roundK(g.high * 2 * 0.9));
  /* [khách nói, đòn bẩy ngắn, câu đáp đầy đủ] */
  const tc = [
    ['“Đắt quá”', 'Quy đổi giá/ngày + mời đơn thử ' + vnd(g.low),
      'Dạ ' + g.seller + ' hiểu ạ. Tính kỹ thì chỉ khoảng ' + pd + '/ngày — chưa bằng ly cà phê. ' + g.cust + ' bắt đầu bằng đơn thử ' + vnd(g.low) + ' để cảm nhận trước cũng được ạ.'],
    ['“Để suy nghĩ thêm”', 'Chốt lịch hẹn cụ thể, không để trôi',
      'Dạ! ' + g.seller + ' gửi ' + g.cust + ' bảng so sánh 2 lựa chọn kèm phản hồi khách cũ. 9h sáng mai ' + g.seller + ' nhắn lại xem ' + g.cust + ' chọn hướng nào nhé ạ?'],
    ['“Dùng loại khác rồi, không hợp”', 'Hỏi rõ điểm chưa ưng → nêu 1 khác biệt + đổi/hoàn 7 ngày',
      g.cust + ' cho ' + g.seller + ' hỏi trước dùng loại nào, chưa ưng điểm gì ạ? Nghe xong mới nêu đúng 1 khác biệt của ' + g.product + ' giải quyết điểm đó, kèm chính sách đổi/hoàn 7 ngày.'],
    ['“Bên khác rẻ hơn”', 'Không chê đối thủ — so 3 giá trị',
      'Dạ mỗi bên một phân khúc ạ. Mời ' + g.cust + ' so 3 điểm: nguồn gốc chất lượng, hậu mãi và hỗ trợ sau mua. Rẻ hơn vài chục nghìn mà thiếu 3 điểm này thì rủi ro về mình ạ.'],
    ['“Không tin quảng cáo”', 'Bằng chứng thật + hạ rào cản vào đơn nhỏ',
      'Đúng là nên cẩn thận ạ. ' + g.seller + ' gửi ' + g.cust + ' ảnh phản hồi thật của khách cũ; ' + g.cust + ' chỉ cần thử đơn nhỏ nhất ' + vnd(g.low) + ', chưa ưng ' + g.seller + ' hỗ trợ đổi/hoàn ạ.']
  ];
  const chot = [
    ['Tầng 1 — chốt thử', '“' + g.cust + ' thấy phần tư vấn vậy đã đúng nhu cầu mình chưa ạ?” (đo độ sẵn sàng)'],
    ['Tầng 2 — chốt lựa chọn', '“Vậy ' + g.cust + ' lấy đơn thử ' + vnd(g.low) + ' hay combo tiết kiệm ' + combo + ' ạ?” (chỉ hỏi A hay B, không hỏi có/không)'],
    ['Tầng 3 — chốt quyền lợi', '“Chốt hôm nay ' + g.seller + ' giữ được freeship + quà tặng — ' + g.seller + ' lên đơn cho ' + g.cust + ' luôn nhé ạ?”']
  ];
  const cam = 'Điều cấm khi tư vấn: ' + g.bannedTxt + '. KPI: phản hồi tin đầu ≥35%, chốt sau tư vấn ≥12%.';
  const fixed = r ? '\n\n**Đã sửa theo nhận xét:** thêm câu hỏi khám phá trước khi báo giá; bỏ giảm giá trực tiếp ở từ chối “đắt quá”; chốt lịch hẹn cụ thể thay vì để khách trôi.' : '';

  if (fmt === 'pptx') {
    return revLine(r) + '# Kịch bản tư vấn & chốt đơn — ' + g.product + '\n\n' +
      '## Slide 1 — Bối cảnh\n- Đơn vị: ' + g.company + ' · Kênh: ' + g.channels.join(', ') + '\n- Khách mục tiêu: ' + g.customer + '\n- Xưng hô chuẩn DNA: ' + g.seller + '–' + g.cust + ' · Khoảng giá: ' + vnd(g.low) + '–' + vnd(g.high) + '\n\n' +
      '## Slide 2 — Luồng tư vấn 5 bước\n- Mở thoại → Khám phá (≥2 câu hỏi trước khi báo giá) → Kê giải pháp → Xử lý từ chối → Chốt 3 tầng\n- Nguyên tắc: chưa rõ nhu cầu thì chưa báo giá trọn gói\n\n' +
      '## Slide 3 — 5 từ chối & đòn bẩy\n' + tc.map(x => '- ' + x[0] + ' → ' + x[1]).join('\n') + '\n\n' +
      '## Slide 4 — Câu chốt 3 tầng\n' + chot.map(c => '- **' + c[0] + ':** ' + c[1]).join('\n') + '\n\n' +
      '## Slide 5 — Điều cấm & KPI\n- ' + cam + fixed;
  }
  if (fmt === 'xlsx') {
    return revLine(r) + '# Bảng kịch bản xử lý từ chối — ' + g.product + '\n\n' +
      '| # | Khách nói | Đòn bẩy | Câu đáp chuẩn (xưng ' + g.seller + '–' + g.cust + ') |\n|---|---|---|---|\n' +
      tc.map((x, i) => '| ' + (i + 1) + ' | ' + x[0] + ' | ' + x[1] + ' | ' + x[2] + ' |').join('\n') + '\n\n' +
      '**Câu chốt 3 tầng:** ' + chot.map(c => c[1]).join(' → ') + '\n\n' +
      'Ghi chú công thức: giá quy đổi ' + pd + '/ngày = giá cao nhất ' + vnd(g.high) + ' ÷ 30 ngày; combo tiết kiệm = 2 × ' + vnd(g.high) + ' × 90% = ' + combo + '. ' + cam + fixed;
  }
  if (fmt === 'html') {
    return revLine(r, true) + '<h1>Kịch bản tư vấn &amp; chốt đơn — ' + esc(g.product) + '</h1>' +
      '<p><b>' + esc(g.company) + '</b> · Khách: ' + esc(g.customer) + ' · Xưng hô: ' + esc(g.seller + '–' + g.cust) + '</p>' +
      '<table><tr><th>Khách nói</th><th>Câu đáp chuẩn</th></tr>' +
      tc.map(x => '<tr><td>' + esc(x[0]) + '</td><td>' + esc(x[2]) + '</td></tr>').join('') + '</table>' +
      '<h2>Câu chốt 3 tầng</h2><ol>' + chot.map(c => '<li><b>' + esc(c[0]) + ':</b> ' + esc(c[1]) + '</li>').join('') + '</ol>' +
      '<p><i>' + esc(cam) + '</i></p>';
  }
  return revLine(r) + '# Kịch bản tư vấn & chốt đơn — ' + g.product + '\n' +
    '**Đơn vị:** ' + g.company + ' · **Khách mục tiêu:** ' + g.customer + ' · **Xưng hô:** ' + g.seller + '–' + g.cust + '\n\n' +
    '## 1. Mở thoại — khám phá trước, báo giá sau\n' +
    '- **KH:** “' + g.product + ' giá sao ' + g.seller + ' ơi?”\n' +
    '- **NV:** “Dạ ' + g.seller + ' chào ' + g.cust + ' ạ! Giá từ ' + vnd(g.low) + '–' + vnd(g.high) + ' tùy lựa chọn. Để tư vấn đúng, cho ' + g.seller + ' hỏi nhỏ: ' + g.cust + ' đang muốn giải quyết điều gì nhất ạ?”\n' +
    '- **KH:** (nêu nhu cầu)\n' +
    '- **NV:** “Vậy hợp ' + g.cust + ' nhất là gói này, vì đúng 2 điểm ' + g.cust + ' cần…” (kê giải pháp, CHƯA chốt vội)\n\n' +
    '## 2. Xử lý 5 từ chối phổ biến (Đồng cảm → Làm rõ → Quy đổi → Bảo chứng)\n' +
    tc.map((x, i) => (i + 1) + '. **' + x[0] + '** — ' + x[2]).join('\n') + '\n\n' +
    '## 3. Câu chốt 3 tầng\n' + chot.map(c => '- **' + c[0] + ':** ' + c[1]).join('\n') + '\n\n> ' + cam + fixed;
}

/* ---------------- NV Báo giá (B2B/đại lý) ---------------- */

function outQuote(brief, ctx) {
  const g = dnaOf(ctx), r = roundOf(ctx), fmt = fmtOf(brief);
  const base = g.high;
  const tiers = [
    { tn: 'Bậc 1', ql: '10–49', min: 10, ck: 0.15 },
    { tn: 'Bậc 2', ql: '50–99', min: 50, ck: 0.22 },
    { tn: 'Bậc 3', ql: '≥100', min: 100, ck: 0.30 }
  ].map(t => { t.gia = roundK(base * (1 - t.ck)); return t; });
  const ngay = new Date().toLocaleDateString('vi-VN');
  const tbl = '| Bậc | SL/đơn | Giá lẻ đề xuất | Chiết khấu | Giá đại lý | Giá trị đơn tối thiểu |\n|---|---|---|---|---|---|\n' +
    tiers.map(t => '| ' + t.tn + ' | ' + t.ql + ' | ' + vnd(base) + ' | ' + Math.round(t.ck * 100) + '% | ' + vnd(t.gia) + ' | ' + vnd(t.gia * t.min) + ' |').join('\n');
  const note = 'Ghi chú công thức: Giá đại lý = giá lẻ đề xuất × (1 − chiết khấu), làm tròn 1.000đ; giá lẻ đề xuất lấy mức trần khoảng giá ' + vnd(g.low) + '–' + vnd(g.high) + (g.est ? ' (tạm tính do DNA chưa khai báo giá)' : '') + '. Biên bậc 3 đạt 30% để đại lý ôm được số lượng.';
  const congno = [
    '- Đơn đầu tiên: thanh toán 100% trước khi giao.',
    '- Từ đơn thứ 3 và từ Bậc 2: cọc 50%, công nợ phần còn lại tối đa 30 ngày.',
    '- Hạn mức công nợ = 2 × giá trị đơn trung bình 3 tháng gần nhất, đối soát cuối tháng.',
    '- Quá hạn 7 ngày: nhắc lần 1 · quá 15 ngày: tạm ngừng cấp hàng · lãi chậm trả 1,5%/tháng trên dư nợ quá hạn.'
  ].join('\n');
  const hopdong = [
    '- Giá & chiết khấu theo Phụ lục 01; điều chỉnh giá báo trước 30 ngày bằng văn bản.',
    '- Đổi hàng lỗi do sản xuất trong 7 ngày; không nhận trả hàng cận hạn dùng dưới 2 tháng.',
    '- Đại lý không bán dưới giá lẻ đề xuất −5%; vi phạm lần 2 hạ một bậc chiết khấu trong 3 tháng.',
    '- Truyền thông sản phẩm tuân thủ điều cấm của hãng: ' + g.bannedTxt + '.'
  ].join('\n');
  const fixed = r ? '\n\n**Đã sửa theo nhận xét:** đưa chiết khấu về đúng khung 15–30%; bổ sung hạn mức công nợ + chế tài quá hạn; thêm điều khoản chống phá giá.' : '';

  if (fmt === 'pptx') {
    return revLine(r) + '# Báo giá đại lý — ' + g.product + '\n\n' +
      '## Slide 1 — Tổng quan hợp tác\n- ' + g.company + ' · Ngày phát hành: ' + ngay + ' · Hiệu lực 30 ngày\n- Sản phẩm: ' + g.product + ' · Giá lẻ đề xuất ' + vnd(base) + '\n\n' +
      '## Slide 2 — Bảng giá theo bậc số lượng\n' + tbl + '\n' + note + '\n\n' +
      '## Slide 3 — Thanh toán & công nợ\n' + congno + '\n\n' +
      '## Slide 4 — Hợp đồng nguyên tắc (điều khoản chính)\n' + hopdong + '\n\n' +
      '## Slide 5 — Bước tiếp theo\n- Gửi báo giá → đàm phán bậc → ký hợp đồng nguyên tắc → lên đơn đầu tiên (mục tiêu ≤7 ngày làm việc)' + fixed;
  }
  if (fmt === 'html') {
    return revLine(r, true) + '<h1>Báo giá đại lý — ' + esc(g.product) + '</h1>' +
      '<p><b>' + esc(g.company) + '</b> · Phát hành ' + esc(ngay) + ' · Hiệu lực 30 ngày · Giá chưa gồm VAT</p>' +
      '<table><tr><th>Bậc</th><th>SL/đơn</th><th>Chiết khấu</th><th>Giá đại lý</th><th>Đơn tối thiểu</th></tr>' +
      tiers.map(t => '<tr><td>' + t.tn + '</td><td>' + t.ql + '</td><td>' + Math.round(t.ck * 100) + '%</td><td><b>' + vnd(t.gia) + '</b></td><td>' + vnd(t.gia * t.min) + '</td></tr>').join('') + '</table>' +
      '<p>' + esc(note) + '</p><h2>Công nợ</h2><p>' + esc(congno.replace(/^- /gm, '• ')) + '</p>' +
      '<h2>Hợp đồng nguyên tắc</h2><p>' + esc(hopdong.replace(/^- /gm, '• ')) + '</p>';
  }
  /* docx/md/xlsx đều cần bảng — dùng chung khung tài liệu */
  return revLine(r) + '# Báo giá đại lý & chính sách hợp tác — ' + g.product + '\n' +
    '_' + g.company + ' · Ngày phát hành: ' + ngay + ' · Hiệu lực 30 ngày · Giá chưa gồm VAT_\n\n' +
    '## 1. Bảng giá theo bậc số lượng\n' + tbl + '\n\n' + note + '\n\n' +
    '## 2. Thanh toán & công nợ\n' + congno + '\n\n' +
    '## 3. Hợp đồng nguyên tắc — điều khoản chính\n' + hopdong + fixed;
}

/* ---------------- NV Chăm Lead ---------------- */

function outLead(brief, ctx) {
  const g = dnaOf(ctx), r = roundOf(ctx), fmt = fmtOf(brief);
  const S = i => g.channels[i % g.channels.length];
  /* [tên, nguồn, nhu cầu, ngân sách, quyền QĐ, thời điểm, hành động] — điểm neo theo skill loc-lead-ban-hang */
  const rows = [
    ['Chị Ngọc', S(0), 25, 22, 25, 20, 'Gọi trong 1h, tư vấn combo, chốt ngay trong cuộc gọi'],
    ['Anh Long', S(1), 22, 18, 25, 15, 'Gọi trong 1h, gửi báo giá 2 lựa chọn ngay sau cuộc gọi'],
    ['Chị Thu', S(0), 20, 15, 25, 12, 'Nuôi 7 ngày: N1 nội dung giá trị · N3 case khách cũ · N5 ưu đãi nhẹ · N7 gọi'],
    ['Cô Hạnh', S(1), 18, 12, 10, 15, 'Nuôi 7 ngày + xác minh người quyết định (mua cho ai dùng?)'],
    ['Anh Minh', S(2), 10, 8, 10, 10, 'Email giá trị 1 lần/tháng, chấm lại điểm sau 30 ngày']
  ].map(x => {
    const tot = x[2] + x[3] + x[4] + x[5];
    return { ten: x[0], src: x[1], d: [x[2], x[3], x[4], x[5]], tot, loai: tot >= 75 ? 'NÓNG' : tot >= 50 ? 'ẤM' : 'LẠNH', act: x[6] };
  });
  const tbl = '| Lead | Nguồn | Nhu cầu | Ngân sách | Quyền QĐ | Thời điểm | Tổng | Loại | Hành động tiếp theo |\n|---|---|---|---|---|---|---|---|---|\n' +
    rows.map(x => '| ' + x.ten + ' | ' + x.src + ' | ' + x.d.join(' | ') + ' | **' + x.tot + '** | ' + x.loai + ' | ' + x.act + ' |').join('\n');
  const note = 'Ghi chú thang chấm: mỗi tiêu chí 0–25đ; neo Nhu cầu: hỏi giá + nêu rõ vấn đề = 22–25đ, chỉ tương tác bài viết = 5–10đ; neo Ngân sách: sẵn chi ≥ ' + vnd(g.low) + ' = 20–25đ. Ngưỡng: ≥75 Nóng (gọi ≤1h) · 50–74 Ấm (nuôi 7 ngày) · <50 Lạnh (email tháng).';
  const msgs = [
    ['NÓNG — gửi ngay, gọi trong 1h', '“Dạ ' + g.cust + ' ơi, ' + g.seller + ' bên ' + g.company + ' ạ. Về ' + g.product + ' ' + g.cust + ' quan tâm, ' + g.seller + ' đã soạn 2 lựa chọn kèm giá ' + vnd(g.low) + '–' + vnd(g.high) + '. ' + g.seller + ' xin ' + g.cust + ' 5 phút gọi trong hôm nay để tư vấn đúng nhu cầu nhé ạ?”'],
    ['ẤM — ngày 2 & ngày 5', '“Chào ' + g.cust + ', ' + g.seller + ' gửi ' + g.cust + ' chia sẻ ngắn: điều nhiều khách của ' + g.company + ' cân nhắc nhất khi chọn ' + g.product + ' (kèm phản hồi thật). Khi nào ' + g.cust + ' sẵn sàng, ' + g.seller + ' tư vấn kỹ hơn ạ.” — không chào giá lại, chỉ tăng niềm tin'],
    ['LẠNH — 1 lần/tháng', '“' + g.seller + ' chào ' + g.cust + ' ạ! ' + g.seller + ' gửi ' + g.cust + ' 3 mẹo nhỏ hữu ích tháng này (không bán hàng). Khi nào cần, ' + g.cust + ' cứ nhắn ' + g.seller + ' nhé ạ.” — giữ hiện diện, chấm lại điểm sau mỗi phản hồi']
  ];
  const fixed = r ? '\n\n**Đã sửa theo nhận xét:** xếp lại đúng ngưỡng phân loại; mẫu tin lạnh bỏ chào giá, chỉ gửi giá trị; bổ sung neo điểm cho tiêu chí Ngân sách.' : '';

  if (fmt === 'pptx') {
    return revLine(r) + '# Chấm điểm & nuôi dưỡng lead — ' + g.company + '\n\n' +
      '## Slide 1 — Khung chấm 100đ\n- 4 tiêu chí × 25đ: Nhu cầu · Ngân sách · Quyền quyết định · Thời điểm\n- ≥75 NÓNG (gọi ≤1h) · 50–74 ẤM (nuôi 7 ngày) · <50 LẠNH (email tháng)\n\n' +
      '## Slide 2 — Kết quả chấm 5 lead tuần này\n- 2 Nóng (92đ, 80đ) · 2 Ấm (72đ, 55đ) · 1 Lạnh (38đ) — nguồn: ' + g.channels.join(', ') + '\n- 100% lead nóng phải được gọi trong SLA 1 giờ\n\n' +
      '## Slide 3 — Bảng chấm chi tiết\n' + tbl + '\n\n' +
      '## Slide 4 — 3 mẫu tin nuôi dưỡng\n' + msgs.map(m => '- **' + m[0] + ':** ' + m[1]).join('\n') + '\n\n' +
      '## Slide 5 — KPI\n- Nóng→đơn ≥30% · Ấm→Nóng ≥20%/tháng · chấm lead mới trong 15 phút' + fixed;
  }
  if (fmt === 'html') {
    return revLine(r, true) + '<h1>Lead tuần này — ' + esc(g.company) + '</h1>' +
      '<p style="font-size:1.4em"><b>2 NÓNG</b> · 2 ẤM · 1 LẠNH — SLA gọi lead nóng ≤1h</p>' +
      '<table><tr><th>Lead</th><th>Nguồn</th><th>Tổng/100</th><th>Loại</th><th>Hành động</th></tr>' +
      rows.map(x => '<tr><td>' + esc(x.ten) + '</td><td>' + esc(x.src) + '</td><td><b>' + x.tot + '</b></td><td>' + x.loai + '</td><td>' + esc(x.act) + '</td></tr>').join('') + '</table>' +
      '<h2>Mẫu tin nuôi dưỡng</h2><ul>' + msgs.map(m => '<li><b>' + esc(m[0]) + ':</b> ' + esc(m[1]) + '</li>').join('') + '</ul>' +
      '<p><i>' + esc(note) + '</i></p>';
  }
  return revLine(r) + '# Chấm điểm & nuôi dưỡng lead — ' + g.company + '\n' +
    'Khung 100đ = 4 tiêu chí × 25đ (Nhu cầu · Ngân sách · Quyền quyết định · Thời điểm). Khách mục tiêu: ' + g.customer + '.\n\n' +
    '## 1. Bảng chấm 5 lead mẫu\n' + tbl + '\n\n' + note + '\n\n' +
    '## 2. Ba mẫu tin nuôi dưỡng (xưng ' + g.seller + '–' + g.cust + ')\n' +
    msgs.map(m => '- **' + m[0] + ':** ' + m[1]).join('\n') + fixed;
}

/* ---------------- TP Kinh doanh — kế hoạch phòng ---------------- */

function outTp(brief, ctx) {
  const g = dnaOf(ctx), r = roundOf(ctx), fmt = fmtOf(brief);
  const donThang = donThangOf(g);
  const donTuan = Math.ceil(donThang / 4);
  const leadTuan = Math.ceil(donTuan / 0.12 / 10) * 10;
  const doanhThu = donThang * g.avg;
  const muc = (brief && brief.muc_tieu) || (g.goal || 'Tăng trưởng đơn hàng cho ' + g.product);
  const tbl = '| Hạng mục | Phụ trách | Đầu ra | Hạn | Nghiệm thu |\n|---|---|---|---|---|\n' +
    '| Kịch bản tư vấn & xử lý 5 từ chối | NV Kịch bản Sales | docx | T+2 | Đủ 5 từ chối, chốt 3 tầng, đúng xưng hô ' + g.seller + '–' + g.cust + ' |\n' +
    '| Báo giá đại lý + chiết khấu bậc | NV Báo giá | xlsx | T+2 | CK đúng khung 15–30%, có điều khoản công nợ |\n' +
    '| Chấm 100% lead mới + tin nuôi dưỡng | NV Chăm Lead | xlsx | T+1 | Khung 4×25đ, SLA gọi lead nóng ≤1h |\n' +
    '| Review & tổng hợp trình COO | TP Kinh doanh | md | T+3 | Từng bài đạt rubric ≥90 mới trình |';
  const kpi = [
    '- Đơn mục tiêu: ' + donThang.toLocaleString('vi-VN') + '/tháng → ' + donTuan.toLocaleString('vi-VN') + '/tuần.',
    '- Lead cần có: ' + leadTuan.toLocaleString('vi-VN') + '/tuần (giả định tỷ lệ lead→đơn 12%, làm tròn chục).',
    '- Doanh thu tháng ≈ ' + vnd(doanhThu) + ' (= ' + donThang.toLocaleString('vi-VN') + ' đơn × giá trung bình ' + vnd(g.avg) + ').',
    '- SLA gọi lead nóng ≤1h · tỷ lệ báo giá B2B → ký ≥25%.'
  ].join('\n');
  const rui = [
    '- Lead tăng nhưng tỷ lệ chốt giảm → TP nghe lại 5 cuộc gọi/tuần, chỉnh kịch bản theo lỗi lặp.',
    '- Đại lý ép chiết khấu vượt khung → giữ trần 30%, bù bằng hỗ trợ marketing, không phá giá.'
  ].join('\n');
  const fixed = r ? '\n\n**Đã sửa theo nhận xét:** gắn hạn chót từng hạng mục; KPI quy về con số đo được hằng tuần; thêm phương án cho 2 rủi ro chính.' : '';

  if (fmt === 'pptx') {
    return revLine(r) + '# Kế hoạch hành động phòng Kinh doanh — ' + g.company + '\n\n' +
      '## Slide 1 — Mục tiêu kỳ\n- ' + muc + '\n- Khách mục tiêu: ' + g.customer + ' · Kênh: ' + g.channels.join(', ') + '\n\n' +
      '## Slide 2 — Phân công & hạn chót\n' + tbl + '\n\n' +
      '## Slide 3 — KPI tuần (tính từ mục tiêu)\n' + kpi + '\n\n' +
      '## Slide 4 — Rủi ro & phương án\n' + rui + '\n\n' +
      '## Slide 5 — Nguyên tắc phòng\n- Mọi bài nộp chấm theo rubric-review-sales, ngưỡng 90 · Điều cấm: ' + g.bannedTxt + fixed;
  }
  if (fmt === 'html') {
    return revLine(r, true) + '<h1>Kế hoạch phòng Kinh doanh — ' + esc(g.company) + '</h1>' +
      '<p>Mục tiêu: ' + esc(muc) + '</p>' +
      '<p style="font-size:1.3em"><b>' + donTuan + ' đơn/tuần</b> · ' + leadTuan + ' lead/tuần · doanh thu tháng ≈ <b>' + esc(vnd(doanhThu)) + '</b></p>' +
      '<table><tr><th>Hạng mục</th><th>Phụ trách</th><th>Hạn</th></tr>' +
      '<tr><td>Kịch bản tư vấn + 5 từ chối</td><td>NV Kịch bản Sales</td><td>T+2</td></tr>' +
      '<tr><td>Báo giá đại lý CK bậc 15–30%</td><td>NV Báo giá</td><td>T+2</td></tr>' +
      '<tr><td>Chấm lead 4×25đ + nuôi dưỡng</td><td>NV Chăm Lead</td><td>T+1</td></tr>' +
      '<tr><td>Review rubric ≥90, trình COO</td><td>TP Kinh doanh</td><td>T+3</td></tr></table>' +
      '<p><i>Giả định: lead→đơn 12% · SLA gọi lead nóng ≤1h · ' + esc(g.bannedTxt) + '</i></p>';
  }
  return revLine(r) + '# Kế hoạch hành động phòng Kinh doanh — ' + g.company + '\n' +
    '**Mục tiêu kỳ:** ' + muc + '\n\n' +
    '## 1. Phân công & hạn chót\n' + tbl + '\n\n' +
    '## 2. KPI tuần (suy từ mục tiêu, có công thức)\n' + kpi + '\n\n' +
    '## 3. Rủi ro & phương án\n' + rui + fixed;
}

/* ---------------- Default (agent chưa có bản riêng) ---------------- */

function outDefault(brief, ctx) {
  const g = dnaOf(ctx), r = roundOf(ctx), fmt = fmtOf(brief);
  const muc = (brief && brief.muc_tieu) || ('Đề xuất hành động kinh doanh cho ' + g.product);
  const donThang = donThangOf(g);
  const tbl = '| Chỉ tiêu | Hiện trạng giả định | Mục tiêu 30 ngày |\n|---|---|---|\n' +
    '| Tỷ lệ chốt từ lead nóng | 20% | 30% |\n' +
    '| SLA gọi lead nóng | 4 giờ | ≤1 giờ |\n' +
    '| Đơn/tháng | ' + Math.round(donThang / 2).toLocaleString('vi-VN') + ' | ' + donThang.toLocaleString('vi-VN') + ' |\n' +
    '| Kênh bán | ' + g.channels.join(', ') + ' | + kênh đại lý B2B |';
  const dx = [
    '- Chuẩn hóa kịch bản tư vấn: khám phá ≥2 câu hỏi trước khi báo giá, chốt 3 tầng, xử lý đủ 5 từ chối phổ biến.',
    '- Mở kênh đại lý với chiết khấu bậc 15–30% theo số lượng (10/50/100+), kèm hợp đồng nguyên tắc và hạn mức công nợ.',
    '- Siết quy trình lead: chấm 4 tiêu chí × 25đ ngay khi vào, lead ≥75đ gọi trong 1 giờ.'
  ].join('\n');
  const note = 'Giả định: giá bán ' + vnd(g.low) + '–' + vnd(g.high) + ' · khách mục tiêu: ' + g.customer + ' · điều cấm: ' + g.bannedTxt + '.';
  const fixed = r ? '\n\n**Đã sửa theo nhận xét:** lượng hóa toàn bộ chỉ tiêu, gắn mốc 30 ngày, bổ sung giả định tính toán.' : '';

  if (fmt === 'pptx') {
    return revLine(r) + '# ' + muc + '\n\n' +
      '## Slide 1 — Bối cảnh\n- ' + g.company + ' · ' + g.product + ' (' + vnd(g.low) + '–' + vnd(g.high) + ')\n- ' + g.customer + '\n\n' +
      '## Slide 2 — Chỉ tiêu 30 ngày\n' + tbl + '\n\n' +
      '## Slide 3 — Ba việc cần làm\n' + dx + '\n\n' +
      '## Slide 4 — Nguyên tắc & bước tiếp theo\n- ' + note + '\n- Tuần này: chốt kịch bản + bảng giá đại lý, tuần sau đo KPI lần đầu.' + fixed;
  }
  if (fmt === 'html') {
    return revLine(r, true) + '<h1>' + esc(muc) + '</h1>' +
      '<p><b>' + esc(g.company) + '</b> · ' + esc(g.product) + ' · ' + esc(vnd(g.low)) + '–' + esc(vnd(g.high)) + '</p>' +
      '<table><tr><th>Chỉ tiêu</th><th>Hiện trạng</th><th>Mục tiêu 30 ngày</th></tr>' +
      '<tr><td>Tỷ lệ chốt lead nóng</td><td>20%</td><td><b>30%</b></td></tr>' +
      '<tr><td>SLA gọi lead nóng</td><td>4 giờ</td><td><b>≤1 giờ</b></td></tr>' +
      '<tr><td>Đơn/tháng</td><td>' + Math.round(donThang / 2) + '</td><td><b>' + donThang + '</b></td></tr></table>' +
      '<p>' + esc(dx.replace(/^- /gm, '• ')) + '</p><p><i>' + esc(note) + '</i></p>';
  }
  return revLine(r) + '# ' + muc + '\n_' + g.company + ' — phòng Kinh doanh_\n\n' +
    '## 1. Chỉ tiêu 30 ngày\n' + tbl + '\n\n' +
    '## 2. Ba việc cần làm ngay\n' + dx + '\n\n' + note + fixed;
}

/* ---------------- Reviews của TP Kinh doanh ---------------- */

function tieuChiTxt(brief) {
  return (brief && Array.isArray(brief.tieu_chi_cham) && brief.tieu_chi_cham.length)
    ? ' Đã đối chiếu tiêu chí brief: ' + brief.tieu_chi_cham.join(', ') + '.' : '';
}

function rvSales(brief, ctx, pass) {
  const g = dnaOf(ctx);
  if (pass) return {
    feedback_chi_tiet: 'Đạt. Kịch bản bám đúng xưng hô ' + g.seller + '–' + g.cust + ', đủ 5 từ chối và chốt 3 tầng, không vi phạm điều cấm (' + g.bannedTxt + ').' + tieuChiTxt(brief) + ' Góp ý nhỏ: rút câu đáp “bên khác rẻ hơn” còn ≤3 câu cho hợp nhịp chat.',
    loi_cu_the: [{ vi_tri: 'Mục 2, từ chối #4', loi: 'Câu đáp hơi dài so với nhịp nhắn tin', cach_sua: 'Rút còn 3 câu: đồng cảm → so 3 giá trị → mời trải nghiệm đơn thử ' + vnd(g.low) + '.' }]
  };
  return {
    feedback_chi_tiet: 'Chưa đạt ngưỡng, trả lại sửa. 3 lỗi phải xử lý hết: (1) từ chối “đắt quá” đang hạ giá trực tiếp — sai chính sách (giảm tối đa 5%), phải quy đổi giá trị ≈' + perDay(g) + '/ngày rồi mời đơn thử; (2) mở thoại báo giá ngay câu đầu, chưa có câu hỏi khám phá — thêm tối thiểu 2 câu hỏi nhu cầu trước khi tư vấn gói; (3) xưng hô lệch DNA — chuẩn là ' + g.seller + '–' + g.cust + ', soát lại toàn bài. Sửa đúng 3 điểm này là đủ điều kiện chấm lại, không cần hỏi thêm.',
    loi_cu_the: [
      { vi_tri: 'Mục 2, từ chối #1 “đắt quá”', loi: 'Giảm giá trực tiếp thay vì quy đổi giá trị', cach_sua: 'Dùng công thức: đồng cảm → quy đổi ' + perDay(g) + '/ngày (giá ' + vnd(g.high) + ' ÷ 30) → mời đơn thử ' + vnd(g.low) + '.' },
      { vi_tri: 'Mục 1, mở thoại', loi: 'Báo giá trọn gói ngay khi khách chưa nói nhu cầu', cach_sua: 'Chỉ nêu khoảng giá ' + vnd(g.low) + '–' + vnd(g.high) + ', sau đó hỏi 2 câu khám phá rồi mới kê gói.' },
      { vi_tri: 'Toàn bài', loi: 'Xưng hô không đồng nhất, lệch DNA', cach_sua: 'Thay toàn bộ về ' + g.seller + '–' + g.cust + '; đọc to từng câu kiểm tra độ tự nhiên.' }
    ]
  };
}

function rvQuote(brief, ctx, pass) {
  const g = dnaOf(ctx);
  const ck30 = vnd(roundK(g.high * 0.7));
  if (pass) return {
    feedback_chi_tiet: 'Đạt. Bậc chiết khấu đúng khung 15–30%, công thức tính lại khớp, điều khoản công nợ và hợp đồng nguyên tắc đủ ý.' + tieuChiTxt(brief) + ' Góp ý nhỏ: thêm cột thành tiền đã gồm VAT để đại lý khỏi hỏi lại.',
    loi_cu_the: [{ vi_tri: 'Bảng giá', loi: 'Chưa ghi rõ giá đã/chưa gồm VAT ngay cạnh bảng', cach_sua: 'Thêm dòng “Giá chưa gồm VAT” ngay dưới tiêu đề bảng.' }]
  };
  return {
    feedback_chi_tiet: 'Chưa đạt, trả lại sửa. 3 lỗi: (1) chiết khấu bậc 3 vượt khung cho phép 15–30% — kéo về 30%, giá đại lý = ' + ck30 + ' (= ' + vnd(g.high) + ' × 70%, làm tròn 1.000đ); (2) thiếu chế tài công nợ quá hạn — phải có mốc nhắc 7 ngày, ngừng cấp hàng 15 ngày, lãi chậm trả 1,5%/tháng; (3) hợp đồng nguyên tắc thiếu điều khoản chống phá giá — thêm sàn “không bán dưới giá lẻ đề xuất −5%”. Sửa xong tự tính lại toàn bộ cột thành tiền trước khi nộp.',
    loi_cu_the: [
      { vi_tri: 'Bảng giá, Bậc 3', loi: 'Chiết khấu vượt trần 30%', cach_sua: 'Đặt 30%: giá đại lý ' + ck30 + '; muốn ưu đãi thêm thì tặng hỗ trợ marketing, không phá khung.' },
      { vi_tri: 'Mục thanh toán & công nợ', loi: 'Không có chế tài khi quá hạn', cach_sua: 'Bổ sung: quá 7 ngày nhắc lần 1 · quá 15 ngày ngừng cấp hàng · lãi 1,5%/tháng trên dư nợ quá hạn.' },
      { vi_tri: 'Hợp đồng nguyên tắc', loi: 'Thiếu điều khoản giá bán tối thiểu của đại lý', cach_sua: 'Thêm: không bán dưới giá lẻ đề xuất −5%; vi phạm lần 2 hạ một bậc chiết khấu 3 tháng.' }
    ]
  };
}

function rvLead(brief, ctx, pass) {
  const g = dnaOf(ctx);
  if (pass) return {
    feedback_chi_tiet: 'Đạt. Khung 4×25đ áp dụng đúng, phân loại khớp ngưỡng 75/50, mẫu tin đúng vai từng nhóm.' + tieuChiTxt(brief) + ' Góp ý nhỏ: ghi thêm bằng chứng chấm điểm (câu khách nói) vào cột ghi chú để lần sau chấm nhất quán.',
    loi_cu_the: [{ vi_tri: 'Bảng chấm', loi: 'Thiếu cột bằng chứng cho điểm số', cach_sua: 'Thêm cột “Căn cứ” trích 1 câu khách nói cho mỗi tiêu chí ≥20đ.' }]
  };
  return {
    feedback_chi_tiet: 'Chưa đạt, trả lại sửa. 3 lỗi: (1) lead tổng ≥75đ đang xếp nhóm Ấm — sai ngưỡng: ≥75 là NÓNG, hành động bắt buộc là gọi trong 1 giờ; (2) mẫu tin nhóm Lạnh đang chào ưu đãi — nhóm Lạnh chỉ nhận nội dung giá trị 1 lần/tháng, không chào bán; (3) tiêu chí Ngân sách chấm không có neo — bổ sung: sẵn chi ≥' + vnd(g.low) + ' = 20–25đ, kêu đắt nhưng vẫn hỏi tiếp = 15–21đ, chỉ săn mã giảm = 8–14đ. Sửa xong đối chiếu lại toàn bộ cột phân loại theo ngưỡng 75/50.',
    loi_cu_the: [
      { vi_tri: 'Bảng chấm, dòng lead có tổng ≥75', loi: 'Phân loại Ấm dù đạt ngưỡng Nóng', cach_sua: 'Đổi thành NÓNG, hành động “gọi trong 1h”; ngoài giờ thì nhắn xác nhận ngay, gọi 8h sáng hôm sau.' },
      { vi_tri: 'Mẫu tin nhóm Lạnh', loi: 'Chào giảm giá cho lead chưa có nhu cầu', cach_sua: 'Thay bằng tin giá trị thuần (mẹo dùng, câu chuyện khách), CTA duy nhất: “khi cần cứ nhắn ' + g.seller + '”.' },
      { vi_tri: 'Tiêu chí Ngân sách', loi: 'Không có neo điểm, chấm theo cảm giác', cach_sua: 'Ghi neo cụ thể theo mốc giá ' + vnd(g.low) + ' như trên, áp cho cả 5 lead rồi tính lại tổng.' }
    ]
  };
}

function rvTp(brief, ctx, pass) {
  const g = dnaOf(ctx);
  if (pass) return {
    feedback_chi_tiet: 'Kế hoạch đạt: phân công có người + hạn chót, KPI quy ra số đo được hằng tuần, có phương án rủi ro.' + tieuChiTxt(brief) + ' Góp ý nhỏ: thêm mốc review giữa tuần để chỉnh sớm.',
    loi_cu_the: [{ vi_tri: 'Mục KPI', loi: 'Chưa có mốc kiểm tra giữa tuần', cach_sua: 'Thêm checkpoint thứ 4: nếu lead < 50% mục tiêu tuần thì kích hoạt phương án bù.' }]
  };
  return {
    feedback_chi_tiet: 'Kế hoạch chưa đạt. 3 lỗi: (1) các hạng mục không có hạn chót cụ thể — mỗi dòng phân công phải có mốc T+n; (2) KPI định tính (“tăng mạnh”, “cải thiện”) — phải quy ra số: đơn/tuần, lead/tuần kèm giả định tỷ lệ chuyển đổi; (3) không nêu rủi ro — bổ sung tối thiểu 2 rủi ro kèm phương án. Chuẩn tham chiếu: mục tiêu ' + (g.goal || 'kỳ này') + ', giá trung bình ' + vnd(g.avg) + '.',
    loi_cu_the: [
      { vi_tri: 'Bảng phân công', loi: 'Thiếu cột hạn chót', cach_sua: 'Thêm cột Hạn theo mốc T+1/T+2/T+3 cho từng hạng mục.' },
      { vi_tri: 'Mục KPI', loi: 'KPI không đo được', cach_sua: 'Quy về: đơn/tuần = mục tiêu tháng ÷ 4; lead/tuần = đơn/tuần ÷ 12% (ghi rõ giả định).' },
      { vi_tri: 'Cuối tài liệu', loi: 'Không có mục rủi ro & phương án', cach_sua: 'Thêm 2 rủi ro: tỷ lệ chốt giảm (nghe lại 5 cuộc gọi/tuần) và đại lý ép chiết khấu (giữ trần 30%).' }
    ]
  };
}

function rvDefault(brief, ctx, pass) {
  const g = dnaOf(ctx);
  if (pass) return {
    feedback_chi_tiet: 'Đạt. Bài bám mục tiêu brief, số liệu có căn cứ, đúng giọng ' + g.seller + '–' + g.cust + ', không vi phạm điều cấm.' + tieuChiTxt(brief) + ' Góp ý nhỏ: bổ sung 1 dòng giả định tính toán ngay dưới bảng số.',
    loi_cu_the: [{ vi_tri: 'Bảng số liệu', loi: 'Thiếu dòng ghi chú giả định', cach_sua: 'Thêm “Giả định: …” ngay dưới bảng để người đọc tự kiểm chứng.' }]
  };
  return {
    feedback_chi_tiet: 'Chưa đạt, trả lại sửa. 3 lỗi: (1) số liệu đưa ra không có công thức/giả định — mọi con số tiền và tỷ lệ phải ghi rõ cách tính; (2) nội dung chưa bám chân dung khách “' + g.customer + '” — viết lại phần lợi ích theo đúng nỗi đau của nhóm này; (3) sai format brief yêu cầu (' + fmtOf(brief) + ') — xlsx phải có bảng + ghi chú công thức, pptx chia 4–7 slide bằng “## ”. Sửa đủ 3 điểm rồi nộp lại.',
    loi_cu_the: [
      { vi_tri: 'Các con số trong bài', loi: 'Không có căn cứ tính toán', cach_sua: 'Ghi công thức cạnh mỗi số, ví dụ: doanh thu = số đơn × giá trung bình ' + vnd(g.avg) + '.' },
      { vi_tri: 'Phần lợi ích/thông điệp', loi: 'Chưa đúng chân dung khách mục tiêu', cach_sua: 'Bám mô tả “' + g.customer + '”: chọn 2 nỗi đau chính của nhóm này làm trục nội dung.' },
      { vi_tri: 'Toàn bài', loi: 'Sai format đầu ra brief yêu cầu', cach_sua: 'Chuyển đúng format ' + fmtOf(brief) + ' theo chuẩn phòng (bảng cho xlsx, “## ” mỗi slide cho pptx).' }
    ]
  };
}

module.exports = {
  dept: 'kd',
  outputs: {
    tp_kd: outTp,
    nv_sales: outSales,
    nv_quote: outQuote,
    nv_lead: outLead,
    default: outDefault
  },
  reviews: {
    tp_kd: rvTp,
    nv_sales: rvSales,
    nv_quote: rvQuote,
    nv_lead: rvLead,
    default: rvDefault
  }
};
