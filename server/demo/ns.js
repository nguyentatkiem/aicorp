'use strict';
/* Phòng Nhân sự (dept 'ns') — module nội dung cho DemoEngine.
   Agents: tp_ns (trưởng phòng · kế hoạch + review), nv_hire (tuyển dụng), nv_train (đào tạo).
   Mọi nội dung nội suy từ ctx.dna (12 ngành bất kỳ) — chịu được brief rỗng {} và ctx.dna = null. */

const INDUSTRY_NAME = {
  banle: 'bán lẻ', fnb: 'F&B', thoitrang: 'thời trang', mypham: 'mỹ phẩm',
  giaoduc: 'giáo dục', suckhoe: 'sức khỏe', noithat: 'nội thất', bds: 'bất động sản',
  dichvu: 'dịch vụ', sanxuat: 'sản xuất', tmdt: 'thương mại điện tử', khac: 'kinh doanh'
};

const POSITION = {
  banle: 'Nhân viên bán hàng kiêm trực page', fnb: 'Nhân viên bán hàng & CSKH đa kênh',
  thoitrang: 'Nhân viên tư vấn bán hàng', mypham: 'Nhân viên tư vấn & livestream',
  giaoduc: 'Nhân viên tư vấn tuyển sinh', suckhoe: 'Nhân viên chăm sóc khách hàng',
  noithat: 'Nhân viên kinh doanh dự án', bds: 'Chuyên viên kinh doanh',
  dichvu: 'Nhân viên kinh doanh dịch vụ', sanxuat: 'Nhân viên kinh doanh B2B',
  tmdt: 'Nhân viên vận hành sàn TMĐT', khac: 'Nhân viên kinh doanh'
};

/* [dải lương cứng triệu/tháng, cơ chế thưởng] — mặt bằng SME Việt Nam 2026 */
const SALARY = {
  banle: ['8–11', 'thưởng 0,5–1% doanh số cá nhân'],
  fnb: ['9–12', 'thưởng 0,8% doanh số + thưởng KPI quý'],
  thoitrang: ['9–12', 'thưởng 0,7% doanh số cá nhân'],
  mypham: ['10–13', 'thưởng 1% doanh số phiên live'],
  giaoduc: ['9–12', 'thưởng 250–400k/hồ sơ nhập học'],
  suckhoe: ['10–13', 'thưởng KPI hài lòng khách hàng'],
  noithat: ['10–14', 'hoa hồng 0,5–1%/hợp đồng'],
  bds: ['7–9', 'hoa hồng 1,5–2,5%/giao dịch'],
  dichvu: ['9–12', 'thưởng 1–2% giá trị hợp đồng mới'],
  sanxuat: ['10–14', 'thưởng theo sản lượng ký mới'],
  tmdt: ['10–14', 'thưởng theo tăng trưởng GMV gian hàng'],
  khac: ['9–12', 'thưởng KPI tháng']
};

/* ---------- helper lấy an toàn từ DNA ---------- */
function info(ctx) {
  const dna = (ctx && ctx.dna) || {};
  const co = dna.company || {};
  const prod = (Array.isArray(dna.products) && dna.products[0]) || {};
  const cust = dna.customers || {};
  const voice = dna.voice || {};
  const ind = INDUSTRY_NAME[co.industry] ? co.industry : 'khac';
  return {
    company: co.name || 'Công ty',
    industry: ind,
    industryName: INDUSTRY_NAME[ind],
    region: co.region || 'Việt Nam',
    product: prod.name || 'sản phẩm/dịch vụ chủ lực',
    price: prod.price_range || 'theo bảng giá hiện hành',
    customer: cust.profile || 'khách hàng mục tiêu hiện có của công ty',
    channels: (Array.isArray(cust.channels) && cust.channels.length) ? cust.channels.join(', ') : 'các kênh bán hiện có',
    goal: dna.goal_3m || 'mục tiêu tăng trưởng quý tới',
    address: (voice.address || 'em - anh/chị'),
    banned: (Array.isArray(voice.banned) && voice.banned.length) ? voice.banned.join('; ') : ''
  };
}

function fm(brief) {
  const f = brief && brief.format_dau_ra;
  return (f === 'xlsx' || f === 'pptx' || f === 'html' || f === 'md' || f === 'docx') ? f : 'docx';
}

function round(ctx) { return (ctx && ctx.round) > 0 ? ctx.round : 0; }

function fixNote(ctx, html) {
  const r = round(ctx);
  if (!r) return '';
  return html
    ? `<p><em>(Bản sửa vòng ${r} — đã xử lý toàn bộ nhận xét)</em></p>\n`
    : `_(Bản sửa vòng ${r} — đã xử lý toàn bộ nhận xét)_\n\n`;
}

function fixedList(ctx, items) {
  if (!round(ctx)) return '';
  return `**Điểm đã sửa:** ${items.join('; ')}.\n\n`;
}

function position(brief, i) {
  const mt = (brief && brief.muc_tieu) || '';
  const m = mt.match(/tuyển(?:\s+dụng)?(?:\s+vị\s+trí)?\s+["“]?([^,.;:"”\n]{4,45})/i);
  if (m) {
    const p = m[1].trim().replace(/\s+cho\s+.*$/i, '').trim();
    if (p.length >= 4) return p.charAt(0).toUpperCase() + p.slice(1);
  }
  return POSITION[i.industry];
}

/* ---------- NV TUYỂN DỤNG (nv_hire) ---------- */
function starQuestions(i) {
  return [
    ['Lần vượt chỉ tiêu gần nhất: bối cảnh, cách làm, kết quả?', 'Đủ 4 lớp STAR, có con số'],
    ['Vị khách khó tính nhất và cách xử lý?', 'Lắng nghe trước, không đổ lỗi'],
    ['Lần phải học sản phẩm mới hoàn toàn trong 1 tuần?', 'Tự học có phương pháp'],
    ['Một lần mắc lỗi với khách và cách khắc phục?', 'Nhận trách nhiệm, có phòng ngừa'],
    ['Hàng chục tin nhắn dồn cùng lúc — ưu tiên ra sao?', 'Ưu tiên có tiêu chí, không cảm tính'],
    ['Lần thuyết phục khách đang phân vân về giá?', 'Bán giá trị, không vội giảm giá'],
    ['Lần phối hợp phòng khác để kịp tiến độ?', 'Chủ động kết nối, rõ vai'],
    ['Tháng hụt 30% chỉ tiêu ở tuần 3 — đã làm gì?', 'Kế hoạch bù bằng con số'],
    ['Lý do thật sự rời nơi làm việc cũ?', 'Trung thực, có bài học'],
    [`Vì sao chọn ${i.company}, điều gì giữ bạn 2 năm?`, 'Hiểu công ty, động lực thật']
  ];
}

function cvTableMd() {
  return '| Tiêu chí lọc CV | Trọng số | Đạt tối đa khi |\n|---|---|---|\n' +
    '| Kinh nghiệm đúng vị trí | 30 | ≥2 năm, có kết quả kèm số |\n' +
    '| Kỹ năng công cụ | 20 | Kể tên công cụ đã dùng thật |\n' +
    '| Thành tích định lượng | 20 | Có % hoặc con số cụ thể |\n' +
    '| Phù hợp văn hóa & giọng | 20 | Thư ứng tuyển đúng tông |\n' +
    '| Hình thức CV | 10 | ≤2 trang, không lỗi chính tả |\n' +
    '\n_Ngưỡng: ≥70 mời PV · 55–69 dự bị · <55 loại (tổng trọng số = 100)._';
}

function jdBlock(i, pos, sal) {
  const banned = i.banned ? `\n- Tuân thủ điều cấm khi tư vấn: ${i.banned}` : '';
  return `**Tóm tắt:** ${pos} bán ${i.product} (${i.price}) cho nhóm "${i.customer}" trên ${i.channels} — góp vào mục tiêu "${i.goal}".\n` +
    '**Trách nhiệm chính:**\n' +
    `- Tư vấn, chốt đơn trên ${i.channels}; phản hồi ≤15 phút giờ làm\n` +
    '- Chăm sóc sau bán, hướng dẫn dùng, xin đánh giá 5 sao\n' +
    '- Cập nhật CRM cuối ngày; báo cáo số theo tuần\n' +
    '- Phối hợp Marketing trả lời bình luận, gom FAQ\n' +
    `- Giữ giọng thương hiệu, xưng hô "${i.address}"${banned}\n` +
    `**Bắt buộc:** ≥1 năm bán hàng/CSKH; thạo Excel, chat đa kênh; chuẩn chính tả. **Ưu tiên:** từng làm ${i.industryName}, dựng nội dung ngắn.\n` +
    `**Quyền lợi:** lương cứng ${sal[0]} triệu + ${sal[1]}; xét tăng 6 tháng/lần, BHXH từ tháng 3.\n` +
    "**Ứng tuyển:** gửi CV → lọc ≤3 ngày → PV 45' → kết quả trong 24h.";
}

function hireOutput(brief, ctx) {
  brief = brief || {};
  const i = info(ctx);
  const pos = position(brief, i);
  const sal = SALARY[i.industry];
  const f = fm(brief);
  const qs = starQuestions(i);
  const fixed = fixedList(ctx, ['lương ghi dải số', 'trọng số CV đủ 100 + ngưỡng', 'câu 4, 7 sang STAR']);

  if (f === 'xlsx') {
    return fixNote(ctx) + fixed +
      `# Khung lọc CV có trọng số — ${pos} · ${i.company}\n\n` +
      `**JD tóm tắt:** bán ${i.product} (${i.price}) cho "${i.customer}" trên ${i.channels}. Lương cứng ${sal[0]} triệu + ${sal[1]}.\n\n` +
      cvTableMd() + '\n\n' +
      '| Ứng viên mẫu | KN (30) | Công cụ (20) | Thành tích (20) | Văn hóa (20) | CV (10) | Tổng | Kết luận |\n|---|---|---|---|---|---|---|---|\n' +
      '| A | 26 | 16 | 18 | 16 | 8 | 84 | Mời phỏng vấn |\n' +
      '| B | 15 | 12 | 8 | 14 | 9 | 58 | Dự bị |\n' +
      '| C | 9 | 6 | 4 | 10 | 5 | 34 | Loại |\n\n' +
      `_Công thức: Tổng = Σ điểm 5 tiêu chí, mỗi tiêu chí chấm 0 → trọng số. Giả định mặt bằng lương ${i.region} 2026 cho vị trí này: ${sal[0]} triệu/tháng._`;
  }

  if (f === 'pptx') {
    return fixNote(ctx) + fixed + `# Bộ tuyển dụng ${pos} — ${i.company}\n\n` +
      `## Vì sao tuyển & chân dung ứng viên\n- Mục tiêu công ty: "${i.goal}" → cần thêm 1 ${pos}\n- Ứng viên phục vụ nhóm khách: ${i.customer}\n- Kênh làm việc chính: ${i.channels}\n\n` +
      `## JD tóm tắt\n- Tư vấn, chốt đơn ${i.product} (${i.price}); phản hồi ≤15 phút\n- Chăm sóc sau bán, cập nhật CRM, báo cáo tuần\n- Bắt buộc: ≥1 năm kinh nghiệm, thạo chat đa kênh + Excel\n- Ưu tiên: từng làm ngành ${i.industryName}\n\n` +
      `## Quyền lợi & dải lương\n- Lương cứng ${sal[0]} triệu/tháng (mặt bằng ${i.region} 2026)\n- ${sal[1]}\n- Xét tăng lương 6 tháng/lần, BHXH từ tháng thứ 3\n\n` +
      `## Khung lọc CV thang 100\n- Kinh nghiệm 30 · Công cụ 20 · Thành tích 20 · Văn hóa 20 · Hình thức 10\n- Ngưỡng: ≥70 mời phỏng vấn · 55–69 dự bị · <55 loại\n\n` +
      `## Phỏng vấn STAR — 10 câu (trích 3)\n- "${qs[0][0]}" → nghe: ${qs[0][1]}\n- "${qs[7][0]}" → nghe: ${qs[7][1]}\n- "${qs[9][0]}" → nghe: ${qs[9][1]}\n- Chấm 0–10/câu; trung bình ≥7 và không câu nào ≤3 → offer`;
  }

  if (f === 'html') {
    return fixNote(ctx, true) +
      `<h1>Bộ tuyển dụng: ${pos} — ${i.company}</h1>\n` +
      `<p><b>Vai trò:</b> bán ${i.product} (${i.price}) cho "${i.customer}" trên ${i.channels} — phục vụ mục tiêu "${i.goal}".</p>\n` +
      `<h2>Quyền lợi</h2><p style="font-size:1.4em"><b>Lương cứng ${sal[0]} triệu/tháng</b> + ${sal[1]}</p>\n` +
      '<h2>Khung lọc CV (thang 100)</h2>\n<table><tr><th>Tiêu chí</th><th>Trọng số</th></tr>' +
      '<tr><td>Kinh nghiệm đúng vị trí</td><td>30</td></tr><tr><td>Kỹ năng công cụ</td><td>20</td></tr>' +
      '<tr><td>Thành tích định lượng</td><td>20</td></tr><tr><td>Phù hợp văn hóa</td><td>20</td></tr>' +
      '<tr><td>Hình thức CV</td><td>10</td></tr></table>\n' +
      '<p>Ngưỡng: <b>≥70</b> mời phỏng vấn · 55–69 dự bị · &lt;55 loại.</p>\n' +
      '<h2>Phỏng vấn STAR</h2><ul>' + qs.slice(0, 5).map(q => `<li>${q[0]} <i>(nghe: ${q[1]})</i></li>`).join('') + '</ul>' +
      '<p>Đủ 10 câu trong tài liệu đính kèm. Chấm 0–10/câu, trung bình ≥7 → offer.</p>';
  }

  // docx | md
  return fixNote(ctx) + fixed + `# Bộ tuyển dụng: ${pos} — ${i.company}\n\n` +
    '## 1. Mô tả công việc\n' + jdBlock(i, pos, sal) + '\n\n' +
    '## 2. Khung lọc CV (thang 100)\n' + cvTableMd() + '\n\n' +
    '## 3. 10 câu phỏng vấn STAR\n| # | Câu hỏi | Ý cần nghe |\n|---|---|---|\n' +
    qs.map((q, n) => `| ${n + 1} | ${q[0]} | ${q[1]} |`).join('\n') +
    '\n\n_Chấm 0–10/câu: trung bình ≥7, không câu nào ≤3 → đề xuất offer._';
}

/* ---------- NV ĐÀO TẠO (nv_train) ---------- */
function scheduleRows(i) {
  const banned = i.banned ? ` + ĐIỀU CẤM: ${i.banned}` : ' + điều cấm khi tư vấn';
  return [
    ['1', `Giới thiệu công ty, DNA, giọng "${i.address}"`, `Học ${i.product} (${i.price}): điểm bán${banned}`, 'Thuộc 3 điểm bán, nhắc điều cấm đúng 100%'],
    ['2', `Chân dung khách: ${i.customer}`, `Quan sát mentor trực ${i.channels} 2h, ghi 10 mẫu câu`, 'Nhận diện 5 tình huống thường gặp'],
    ['3', 'Quy trình đơn hàng, CRM, biểu mẫu', 'Đóng vai tư vấn 5 ca — mentor chấm 0–10', 'Điểm trung bình ≥6/10'],
    ['4', 'Xử lý khiếu nại & đổi trả', 'Trực kênh thật, mentor duyệt trước khi gửi', '10 phản hồi thật được duyệt'],
    ['5', 'Ôn tập + hỏi đáp mở', "Bài test 10 câu + phỏng vấn ngược 15'", 'Test ≥8/10 → bàn giao chính thức']
  ];
}

function testQuestions(i) {
  return [
    `Nêu 3 điểm bán chính của ${i.product}?`,
    `Khách hỏi giá — nêu đúng dải giá (${i.price}) kèm 1 câu tăng giá trị?`,
    `Điều TUYỆT ĐỐI không nói với khách? (đáp án: ${i.banned || 'cam kết quá lời, hứa điều chưa chắc chắn'})`,
    'Khách phàn nàn giao chậm — 3 bước xử lý theo quy trình?',
    `Xưng hô chuẩn với khách là gì? (đáp án: "${i.address}")`,
    'Quy trình lên đơn trên CRM gồm mấy bước, kể tên?',
    'Khi nào được phép hứa thời gian giao hàng với khách?',
    'Khách so sánh với bên khác rẻ hơn — hướng trả lời đúng?',
    'Tình huống nào phải chuyển ngay cho quản lý?',
    `Mục tiêu 3 tháng của công ty và vai trò của bạn? (đáp án: ${i.goal})`
  ];
}

function mentorChecklist() {
  return '- [ ] Ngày 0: chuẩn bị tài khoản (email, CRM, kênh chat), gửi tài liệu DNA trước 1 ngày\n' +
    '- [ ] Cuối mỗi ngày: phản hồi 10 phút theo công thức 2 khen – 1 góp ý\n' +
    '- [ ] Ngày 3: điểm đóng vai <6/10 → báo quản lý, kéo dài hội nhập thêm 3 ngày\n' +
    '- [ ] Ngày 5: chấm test, ký biên bản bàn giao, đặt mục tiêu 30 ngày đầu';
}

function trainOutput(brief, ctx) {
  brief = brief || {};
  const i = info(ctx);
  const pos = position(brief, i);
  const f = fm(brief);
  const rows = scheduleRows(i);
  const fixed = fixedList(ctx, ['đưa điều cấm vào ngày 1', 'test ghi rõ ngưỡng ≥8/10 và phương án thi lại', 'thêm mốc cảnh báo ngày 3 cho mentor']);
  const table = '| Ngày | Sáng (8h30–12h) | Chiều (13h30–17h30) | Mục tiêu đạt |\n|---|---|---|---|\n' +
    rows.map(r => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`).join('\n');

  if (f === 'xlsx') {
    return fixNote(ctx) + fixed + `# Lịch hội nhập 5 ngày — ${pos} · ${i.company}\n\n` + table + '\n\n' +
      '| Theo dõi học viên | Chỉ số đo | Ngưỡng đạt | Người chấm |\n|---|---|---|---|\n' +
      '| Điểm đóng vai (ngày 3) | Trung bình 5 ca, thang 10 | ≥6,0 | Mentor |\n' +
      '| Phản hồi thật được duyệt (ngày 4) | Số phản hồi | 10 | Mentor |\n' +
      '| Bài test cuối (ngày 5) | Số câu đúng /10 | ≥8 | TP Nhân sự |\n\n' +
      '_Giả định: học viên làm giờ hành chính; trượt test → ôn 1 ngày, thi lại tối đa 1 lần; câu điều cấm sai → cả bài không đạt._';
  }

  if (f === 'pptx') {
    return fixNote(ctx) + fixed + `# Giáo trình hội nhập 5 ngày — ${i.company}\n\n` +
      `## Mục tiêu chương trình\n- Vị trí: ${pos}, phục vụ mục tiêu "${i.goal}"\n- Sau 5 ngày: tự xử lý 80% tình huống khách phổ biến\n- Nghiệm thu: test 10 câu, đạt khi ≥8/10\n\n` +
      `## Ngày 1–2: Nền tảng\n- DNA, giọng "${i.address}", ${i.product} (${i.price})${i.banned ? `\n- Điều cấm: ${i.banned}` : ''}\n- Chân dung khách: ${i.customer}\n- Quan sát mentor làm thật trên ${i.channels}\n\n` +
      '## Ngày 3–4: Thực hành\n- Đóng vai 5 ca, mentor chấm 0–10 (đạt ≥6)\n- Trực kênh thật — mentor duyệt từng phản hồi trước khi gửi\n- Mốc cảnh báo: ngày 3 dưới 6 điểm → kéo dài +3 ngày\n\n' +
      "## Ngày 5: Nghiệm thu\n- Test 10 câu (sản phẩm 3 · quy trình 3 · tình huống 3 · mục tiêu 1)\n- Phỏng vấn ngược 15' — học viên hỏi lại công ty\n- Ký biên bản bàn giao, đặt mục tiêu 30 ngày\n\n" +
      '## Checklist mentor\n- Ngày 0 chuẩn bị tài khoản · cuối ngày 2 khen – 1 góp ý\n- Ngày 3 kiểm tra điểm · Ngày 5 chấm test và bàn giao';
  }

  if (f === 'html') {
    return fixNote(ctx, true) + `<h1>Giáo trình hội nhập 5 ngày — ${i.company}</h1>\n` +
      `<p>Vị trí <b>${pos}</b> · nghiệm thu bằng bài test 10 câu, đạt khi <b>≥8/10</b>.</p>\n` +
      '<table><tr><th>Ngày</th><th>Sáng</th><th>Chiều</th><th>Mục tiêu đạt</th></tr>' +
      rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('') +
      '</table>\n<h2>Checklist mentor</h2><ul><li>Ngày 0: chuẩn bị tài khoản, gửi tài liệu DNA trước</li>' +
      '<li>Cuối mỗi ngày: 2 khen – 1 góp ý</li><li>Ngày 3: dưới 6/10 → báo quản lý, kéo dài +3 ngày</li>' +
      '<li>Ngày 5: chấm test, ký bàn giao</li></ul>';
  }

  // docx | md
  return fixNote(ctx) + fixed + `# Giáo trình hội nhập 5 ngày — ${i.company}\n\n` +
    `**Đối tượng:** nhân sự mới vị trí ${pos}. **Mục tiêu:** sau 5 ngày tự xử lý 80% tình huống khách phổ biến, đạt test cuối ≥8/10.\n\n` +
    '## Lịch 5 ngày\n' + table + '\n\n' +
    '## Checklist người hướng dẫn\n' + mentorChecklist() + '\n\n' +
    '## Bài test cuối (10 câu — đạt khi ≥8 câu đúng)\n' +
    testQuestions(i).map((q, n) => `${n + 1}. ${q}`).join('\n') +
    '\n\n_Trượt: ôn 1 ngày, thi lại tối đa 1 lần. Câu điều cấm trả lời sai → cả bài không đạt._';
}

/* ---------- TP NHÂN SỰ (tp_ns) — kế hoạch phòng ---------- */
function tpOutput(brief, ctx) {
  brief = brief || {};
  const i = info(ctx);
  const pos = position(brief, i);
  const f = fm(brief);
  const fixed = fixedList(ctx, ['bổ sung chỉ số từng tuần', 'ngân sách tách khoản rõ ràng', 'thêm phương án rủi ro thiếu CV']);
  const planTable = '| Tuần | Hoạt động | Chỉ số cần đạt |\n|---|---|---|\n' +
    `| 1 | Đăng tin 3 kênh (site tuyển dụng, Facebook, giới thiệu nội bộ) | ≥25 CV về |\n` +
    '| 2 | Lọc CV theo khung 100 điểm (≥70 mời), phỏng vấn vòng 1 | 6–8 buổi phỏng vấn |\n' +
    '| 3 | Phỏng vấn vòng 2 + gửi offer | 1–2 offer, tỷ lệ nhận ≥80% |\n' +
    '| 4 | Hội nhập 5 ngày theo giáo trình | Test cuối ≥8/10 |';
  const assignTable = '| Việc | Phụ trách | Hạn | Đầu ra |\n|---|---|---|---|\n' +
    `| JD + khung lọc CV + 10 câu phỏng vấn STAR | NV Tuyển dụng | +2 ngày | Tài liệu tuyển ${pos} |\n` +
    '| Giáo trình hội nhập 5 ngày + bài test | NV Đào tạo | +3 ngày | Giáo trình kèm checklist |\n' +
    '| Review theo rubric phòng NS (ngưỡng 90) | TP Nhân sự | +1 ngày sau nộp | Phiếu chấm |';

  if (f === 'pptx') {
    return fixNote(ctx) + fixed + `# Kế hoạch nhân sự — ${i.company}\n\n` +
      `## Bối cảnh & mục tiêu\n- Mục tiêu công ty: "${i.goal}"\n- Nút thắt: thiếu 1 ${pos} phục vụ ${i.channels}\n- Phạm vi: tuyển trong 3 tuần + hội nhập 1 tuần\n\n` +
      '## Phân công trong phòng\n- NV Tuyển dụng: JD, khung lọc CV, bộ phỏng vấn (+2 ngày)\n- NV Đào tạo: giáo trình 5 ngày + test (+3 ngày)\n- TP: review theo rubric, ngưỡng đạt 90/100\n\n' +
      '## Tiến độ 4 tuần\n- Tuần 1: đăng tin 3 kênh, ≥25 CV\n- Tuần 2: lọc + phỏng vấn vòng 1 (6–8 buổi)\n- Tuần 3: vòng 2 + offer (tỷ lệ nhận ≥80%)\n- Tuần 4: hội nhập, test ≥8/10\n\n' +
      '## Ngân sách & rủi ro\n- Tin tuyển 1,5–2 triệu · thưởng giới thiệu nội bộ 1 triệu/người nhận việc\n- Thiếu CV tuần 1 → mở nhóm tuyển ngành + tăng 500k ngân sách tin';
  }
  if (f === 'html') {
    return fixNote(ctx, true) + `<h1>Kế hoạch nhân sự — ${i.company}</h1>\n` +
      `<p>Phục vụ mục tiêu: <b>"${i.goal}"</b> — tuyển 1 ${pos} trong 3 tuần, hội nhập tuần thứ 4.</p>\n` +
      '<table><tr><th>Tuần</th><th>Hoạt động</th><th>Chỉ số</th></tr>' +
      '<tr><td>1</td><td>Đăng tin 3 kênh</td><td>≥25 CV</td></tr>' +
      '<tr><td>2</td><td>Lọc CV + phỏng vấn vòng 1</td><td>6–8 buổi</td></tr>' +
      '<tr><td>3</td><td>Vòng 2 + offer</td><td>Tỷ lệ nhận ≥80%</td></tr>' +
      '<tr><td>4</td><td>Hội nhập 5 ngày</td><td>Test ≥8/10</td></tr></table>\n' +
      '<p>Ngân sách: tin tuyển 1,5–2 triệu; thưởng giới thiệu nội bộ 1 triệu/người nhận việc.</p>';
  }
  // docx | md | xlsx (xlsx vẫn hợp lệ vì có 2 bảng số liệu)
  return fixNote(ctx) + fixed + `# Kế hoạch nhân sự — ${i.company}\n\n` +
    `## Bối cảnh\nMục tiêu công ty "${i.goal}" cần thêm 1 ${pos} phục vụ nhóm khách "${i.customer}" trên ${i.channels}. Phòng NS phụ trách trọn gói: tuyển trong 3 tuần, hội nhập tuần thứ 4.\n\n` +
    '## Phân công trong phòng\n' + assignTable + '\n\n' +
    '## Tiến độ 4 tuần\n' + planTable + '\n\n' +
    '## Ngân sách & rủi ro\n- Chi phí tin tuyển 1,5–2 triệu; thưởng giới thiệu nội bộ 1 triệu/ứng viên nhận việc\n' +
    '- Rủi ro thiếu CV tuần 1 → mở thêm nhóm tuyển dụng ngành, tăng ngân sách tin 500k\n' +
    `- Lương chào: ${SALARY[i.industry][0]} triệu + ${SALARY[i.industry][1]} (mặt bằng ${i.region} 2026)\n\n` +
    '_Ghi chú: chỉ số tuần dựa trên tỷ lệ chuyển đổi tuyển dụng SME phổ biến: 25 CV → 7 phỏng vấn → 1,5 offer._';
}

/* ---------- DEFAULT — tài liệu nhân sự theo brief bất kỳ ---------- */
function defaultOutput(brief, ctx) {
  brief = brief || {};
  const i = info(ctx);
  const f = fm(brief);
  const title = brief.muc_tieu || 'Tài liệu nhân sự theo yêu cầu';
  const crits = (Array.isArray(brief.tieu_chi_cham) && brief.tieu_chi_cham.length)
    ? brief.tieu_chi_cham : ['Đúng mục tiêu brief', 'Áp dụng được ngay', 'Có mốc thời gian và người phụ trách'];
  const fixed = fixedList(ctx, ['bổ sung con số ngưỡng cho từng bước', 'ghi rõ người phụ trách và thời hạn']);
  const steps = '| Bước | Nội dung | Phụ trách | Hạn |\n|---|---|---|---|\n' +
    '| 1 | Soạn khung tài liệu, thống nhất phạm vi với TP | NV phòng NS | Ngày 1 |\n' +
    '| 2 | Hoàn thiện nội dung chi tiết theo DNA công ty | NV phòng NS | Ngày 2–3 |\n' +
    '| 3 | TP review theo rubric (ngưỡng 90/100), trả sửa nếu cần | TP Nhân sự | Ngày 4 |\n' +
    '| 4 | Ban hành + phổ biến 30 phút cho nhân sự liên quan | TP Nhân sự | Ngày 5 |';

  if (f === 'html') {
    return fixNote(ctx, true) + `<h1>${title}</h1>\n<p>Đơn vị: phòng Nhân sự ${i.company} · phạm vi gắn với mục tiêu "${i.goal}".</p>\n` +
      '<table><tr><th>Bước</th><th>Nội dung</th><th>Hạn</th></tr>' +
      '<tr><td>1</td><td>Soạn khung, chốt phạm vi</td><td>Ngày 1</td></tr>' +
      '<tr><td>2</td><td>Hoàn thiện nội dung theo DNA</td><td>Ngày 2–3</td></tr>' +
      '<tr><td>3</td><td>TP review (ngưỡng 90/100)</td><td>Ngày 4</td></tr>' +
      '<tr><td>4</td><td>Ban hành + phổ biến</td><td>Ngày 5</td></tr></table>\n' +
      '<p>Nghiệm thu: ' + crits.join(' · ') + '.</p>';
  }
  const body = fixNote(ctx) + fixed + `# ${title} — ${i.company}\n\n` +
    `## Bối cảnh\nPhòng Nhân sự thực hiện theo brief, gắn với mục tiêu công ty "${i.goal}". Đối tượng áp dụng: đội ngũ phục vụ nhóm khách "${i.customer}".\n\n` +
    '## Nguyên tắc soạn thảo\n' +
    `- Ngôn ngữ đúng giọng thương hiệu, xưng hô nội bộ "${i.address}" khi ví dụ hội thoại\n` +
    (i.banned ? `- Không vi phạm điều cấm của công ty: ${i.banned}\n` : '- Không cam kết vượt quá chính sách hiện hành\n') +
    '- Mọi quy định kèm con số đo được (thời hạn, ngưỡng điểm, số lần)\n\n' +
    '## Kế hoạch triển khai\n' + steps + '\n\n' +
    '## Tiêu chí nghiệm thu\n' + crits.map(c => `- ${c}`).join('\n');
  if (f === 'pptx') {
    return fixNote(ctx) + fixed + `# ${title} — ${i.company}\n\n` +
      `## Bối cảnh & phạm vi\n- Gắn với mục tiêu "${i.goal}"\n- Đối tượng: đội phục vụ "${i.customer}"\n\n` +
      `## Nguyên tắc\n- Đúng giọng thương hiệu ("${i.address}")\n- ${i.banned ? 'Tôn trọng điều cấm: ' + i.banned : 'Không cam kết vượt chính sách'}\n- Quy định nào cũng có con số đo được\n\n` +
      '## Triển khai 5 ngày\n- Ngày 1: soạn khung, chốt phạm vi với TP\n- Ngày 2–3: hoàn thiện nội dung theo DNA\n- Ngày 4: TP review theo rubric (ngưỡng 90/100)\n- Ngày 5: ban hành + phổ biến 30 phút\n\n' +
      '## Nghiệm thu\n' + crits.map(c => `- ${c}`).join('\n') + '\n\n' +
      '## Theo dõi sau ban hành\n- 100% nhân sự liên quan được phổ biến trong 5 ngày\n- Sau 2 tuần: ≥80% phản hồi "áp dụng được ngay"\n- Sau 1 tháng: rà soát, cập nhật nếu có ≥3 vướng mắc lặp lại';
  }
  return body; // docx | md | xlsx (đã có bảng triển khai)
}

/* ---------- REVIEWS của TP Nhân sự ---------- */
function reviewHire(brief, ctx, pass) {
  const i = info(ctx);
  const pos = position(brief || {}, i);
  const sal = SALARY[i.industry];
  if (pass) {
    return {
      feedback_chi_tiet: `Đạt. Bộ tuyển ${pos} đủ 5 mục JD chuẩn, dải lương ${sal[0]} triệu khớp mặt bằng ${i.region} 2026, khung lọc CV trọng số cộng đúng 100 kèm ngưỡng hành động, 10 câu phỏng vấn đúng dạng STAR có "ý cần nghe". Góp ý nhỏ: vòng 2 nên thêm 1 câu kiểm tra hiểu biết về ${i.product} trước khi offer.`,
      loi_cu_the: []
    };
  }
  return {
    feedback_chi_tiet: `Chưa đạt theo rubric phòng NS (ngưỡng 90/100): mất điểm nặng ở "Số liệu hợp lý" và "Chuẩn nghề". 3 lỗi dưới đây phải sửa hết trước khi nộp lại — đã ghi rõ cách sửa, không cần hỏi lại. Lưu ý giữ nguyên phần chân dung ứng viên vì đã bám đúng nhóm khách "${i.customer}".`,
    loi_cu_the: [
      { vi_tri: 'JD, mục Quyền lợi', loi: `Lương ghi "thoả thuận", không có con số — tin tuyển ở ${i.region} sẽ bị ứng viên bỏ qua`, cach_sua: `Ghi rõ lương cứng ${sal[0]} triệu/tháng + ${sal[1]}, tách bạch lương cứng/thưởng/phụ cấp` },
      { vi_tri: 'Khung lọc CV, cột trọng số', loi: 'Tổng trọng số 5 tiêu chí chỉ đạt 90/100 và thiếu ngưỡng hành động sau khi chấm', cach_sua: 'Chỉnh về 30/20/20/20/10 (tổng đúng 100); thêm ngưỡng: ≥70 mời phỏng vấn, 55–69 dự bị, <55 loại' },
      { vi_tri: 'Câu phỏng vấn số 4 và 7', loi: 'Dạng giả định "bạn sẽ làm gì nếu…" — không kiểm chứng được hành vi quá khứ theo STAR', cach_sua: 'Đổi thành "kể lại một lần anh/chị đã…" và bổ sung cột "ý cần nghe" cho từng câu' }
    ]
  };
}

function reviewTrain(brief, ctx, pass) {
  const i = info(ctx);
  if (pass) {
    return {
      feedback_chi_tiet: `Đạt. Giáo trình 5 ngày có mục tiêu đo được từng ngày, mốc cảnh báo ngày 3 (<6/10 kéo dài hội nhập), bài test ghi rõ ngưỡng ≥8/10 và phương án thi lại. Góp ý nhỏ: in checklist mentor thành phiếu A5 dán tại chỗ ngồi để tick trực tiếp, và cập nhật câu test số 10 mỗi quý theo mục tiêu mới.`,
      loi_cu_the: []
    };
  }
  return {
    feedback_chi_tiet: 'Chưa đạt theo rubric phòng NS (ngưỡng 90/100): giáo trình mới dừng ở mô tả hoạt động, thiếu chuẩn nghiệm thu — người hướng dẫn sẽ chấm cảm tính. Sửa đúng 3 điểm dưới đây rồi nộp lại, không cần hỏi thêm.',
    loi_cu_the: [
      { vi_tri: 'Lịch Ngày 1, buổi chiều', loi: `Phần học sản phẩm chưa đưa điều cấm khi tư vấn (${i.banned || 'cam kết quá lời'}) vào nội dung bắt buộc`, cach_sua: 'Thêm 30 phút "điều cấm & cách nói thay thế"; học viên nhắc lại đúng 100% mới sang ngày 2' },
      { vi_tri: 'Bài test cuối', loi: 'Có câu hỏi nhưng không ghi ngưỡng đạt và phương án khi trượt', cach_sua: 'Ghi rõ đạt khi ≥8/10; trượt → ôn 1 ngày, thi lại tối đa 1 lần; câu điều cấm sai → cả bài không đạt' },
      { vi_tri: 'Checklist người hướng dẫn', loi: 'Thiếu mốc cảnh báo giữa kỳ — mentor không biết khi nào phải can thiệp', cach_sua: 'Thêm mốc Ngày 3: điểm đóng vai <6/10 → báo quản lý ngay và kéo dài hội nhập thêm 3 ngày' }
    ]
  };
}

function reviewDefault(brief, ctx, pass) {
  const i = info(ctx);
  if (pass) {
    return {
      feedback_chi_tiet: `Đạt. Tài liệu bám đúng brief, quy định có con số đo được, kế hoạch triển khai rõ người – rõ hạn, đúng giọng "${i.address}". Góp ý nhỏ: bổ sung mục "câu hỏi thường gặp khi áp dụng" sau 2 tuần ban hành dựa trên phản hồi thực tế.`,
      loi_cu_the: []
    };
  }
  return {
    feedback_chi_tiet: 'Chưa đạt theo rubric phòng NS (ngưỡng 90/100): tài liệu đúng hướng nhưng chưa dùng được ngay vì thiếu định lượng và thiếu chủ thể chịu trách nhiệm. Sửa 2 điểm dưới đây rồi nộp lại.',
    loi_cu_the: [
      { vi_tri: 'Các mục quy định chính', loi: 'Quy định định tính ("nhanh chóng", "kịp thời") — không kiểm tra được khi vận hành', cach_sua: 'Gắn con số cho từng quy định: thời hạn theo ngày, ngưỡng điểm theo thang 10/100, số lần tối đa' },
      { vi_tri: 'Phần triển khai', loi: 'Không ghi ai phụ trách từng bước và hạn hoàn thành', cach_sua: 'Kẻ bảng Bước – Nội dung – Phụ trách – Hạn; mỗi bước đúng 1 người chịu trách nhiệm chính' }
    ]
  };
}

module.exports = {
  dept: 'ns',
  outputs: {
    tp_ns: tpOutput,
    nv_hire: hireOutput,
    nv_train: trainOutput,
    default: defaultOutput
  },
  reviews: {
    tp_ns: reviewDefault,
    nv_hire: reviewHire,
    nv_train: reviewTrain,
    default: reviewDefault
  }
};
