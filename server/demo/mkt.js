'use strict';
/* ============================================================
   DEMO MODULE — PHÒNG MARKETING (dept: mkt)
   Sinh sản phẩm offline chất lượng cao cho DemoEngine:
   - nv_content : bộ bài đăng FB/Zalo + email marketing
   - nv_ads     : kịch bản video bán hàng + cấu trúc chiến dịch + CPL trần
   - nv_market  : bảng so sánh 5 đối thủ + nhận định chiến lược
   - tp_mkt     : kế hoạch marketing tổng thể theo tháng
   Mọi nội dung nội suy từ ctx.dna — KHÔNG hardcode ngành.
   ============================================================ */

/* ---------------- Từ điển ngành (12 ngành) ---------------- */
const NGANH = {
  banle:     { label: 'bán lẻ', doiThu: ['MinaMart', 'Tạp Hoá Xanh 24h', 'Chợ Nhà Mình', 'BeeStore Việt', 'Gian Hàng Phố'], trend: 'mua lặp lại qua nhóm Zalo khu dân cư và combo tích điểm đổi quà', pain: 'mua lặt vặt tốn thời gian' },
  fnb:       { label: 'F&B — thực phẩm & đồ uống', doiThu: ['Bếp Nhà May', 'Vị Mộc Foods', 'Hương Quê Việt', 'An Vị Store', 'Lá Lành Farm'], trend: 'video "một ngày sử dụng thật" và combo quà tặng chăm sóc sức khoẻ', pain: 'ăn uống vội vàng, thiếu lành mạnh' },
  thoitrang: { label: 'thời trang', doiThu: ['Lam Boutique', 'MOLA Studio', 'Tủ Đồ Của Na', 'Áo Nhà Mây', 'Sắc Concept'], trend: 'thử đồ trên livestream và bảng size kèm chiều cao – cân nặng người mặc thật', pain: 'mặc mãi không ưng dáng' },
  mypham:    { label: 'mỹ phẩm', doiThu: ['Hana Skin', 'LaBelle Cosmetic', 'Mộc Hương Beauty', 'SkinNote VN', 'Bơ Beauty Lab'], trend: 'soi bảng thành phần công khai và nhật ký sử dụng 28 ngày có ảnh thật', pain: 'da xuống cấp vì bận và stress' },
  giaoduc:   { label: 'giáo dục', doiThu: ['EduBee Academy', 'Học Viện Sao Việt', 'BrightPath Edu', 'Lớp Học Ong Vàng', 'Tri Thức Plus'], trend: 'học thử miễn phí 45 phút và lộ trình đầu ra đo được theo tuần', pain: 'học mãi không thấy tiến bộ' },
  suckhoe:   { label: 'sức khoẻ', doiThu: ['VitaCare Việt', 'An Khang Wellness', 'Sống Lành Store', 'BFine Health', 'Tâm Đức Care'], trend: 'nội dung chuyên gia giải thích cơ chế thay vì lời hứa kết quả', pain: 'mệt mỏi kéo dài không rõ lý do' },
  noithat:   { label: 'nội thất', doiThu: ['Mộc Décor', 'Gỗ An Home', 'Casa Việt Interior', 'Xưởng Mộc 79', 'Nội Thất LaMa'], trend: 'video before–after cải tạo góc nhỏ và báo giá trọn gói minh bạch', pain: 'góc làm việc lộn xộn, ngồi lâu đau lưng' },
  bds:       { label: 'bất động sản', doiThu: ['An Cư Land', 'Phú Hưng Homes', 'Việt Villa Realty', 'Tổ Ấm Invest', 'Nhà Đẹp Property'], trend: 'video thực tế căn 360° và bảng dòng tiền cho thuê minh bạch', pain: 'tiền để không thì mất giá' },
  dichvu:    { label: 'dịch vụ', doiThu: ['ProCare 24/7', 'Dịch Vụ Nhà Việt', 'OneTouch Service', 'Bảo Tín Team', 'Gọi Là Có Express'], trend: 'gói dùng thử lần đầu giá vốn và đánh giá công khai sau mỗi ca', pain: 'việc nhà chiếm hết cuối tuần' },
  sanxuat:   { label: 'sản xuất', doiThu: ['Vina Craft Factory', 'Xưởng Việt Production', 'MekongTech', 'Đại Thành Industry', 'HTX Tân Tiến'], trend: 'video quy trình sản xuất thật và chứng chỉ chất lượng đăng công khai', pain: 'nguồn hàng thiếu ổn định' },
  tmdt:      { label: 'thương mại điện tử', doiThu: ['ShopViet Center', 'MegaCart VN', 'Sàn Nhà Mình', 'Chợ Số 4.0', 'OrderNhanh Store'], trend: 'livestream chốt đơn khung giờ cố định và mã hoàn tiền cho đánh giá có ảnh', pain: 'mua online sợ hàng không như hình' },
  khac:      { label: 'đa ngành', doiThu: ['Tiên Phong Group', 'Bạn Đồng Hành Co.', 'ViệtSmart Solutions', 'Khởi Nguyên Team', 'Đích Đến Services'], trend: 'tư vấn cá nhân hoá 1-1 và case study khách hàng thật có số liệu', pain: 'bận rộn, thiếu thời gian' }
};

const TRAIT_VI = { gan_gui: 'gần gũi', chuyen_gia: 'chuyên gia', tre_trung: 'trẻ trung', sang_trong: 'sang trọng', hai_huoc: 'hài hước', chan_thanh: 'chân thành' };

/* ---------------- Helper an toàn ---------------- */
function unaccent(s) {
  // Bỏ dấu tiếng Việt: tách NFD rồi lọc các ký tự dấu kết hợp (U+0300–U+036F)
  return String(s).normalize('NFD').split('')
    .filter(ch => ch.charCodeAt(0) < 0x0300 || ch.charCodeAt(0) > 0x036f).join('')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
function vnd(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}
function roundTo(n, step) { return Math.round(n / step) * step; }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

function parseMoney(tok) {
  if (!tok) return null;
  const s = String(tok).toLowerCase().replace(/\s|đ|vnd/g, '');
  const m = s.match(/^([\d.,]+)(k|tr|m|triệu|trieu|nghìn|nghin|ngàn|ngan)?$/);
  if (!m) return null;
  const suf = m[2] || '';
  let v;
  if (suf === 'k' || /^ng/.test(suf)) v = parseFloat(m[1].replace(',', '.')) * 1000;
  else if (suf === 'tr' || suf === 'm' || /^tri/.test(suf)) v = parseFloat(m[1].replace(',', '.')) * 1000000;
  else {
    v = parseInt(m[1].replace(/[.,]/g, ''), 10);
    if (v && v < 1000) v *= 1000; // "159-289" hiểu là nghìn đồng
  }
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}
function parsePriceRange(str) {
  // token đầu thừa hưởng đơn vị token cuối: "1,5-3 triệu" → cả hai đều triệu
  let parts = String(str || '').split(/[-–~→]/).map(x => x.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const unit = /(k|tr|m|triệu|trieu|nghìn|nghin|ngàn|ngan)\b/i.exec(parts[parts.length - 1]);
    if (unit) parts = parts.map(p => /(k|tr|m|triệu|trieu|ngh|ng[aà]n)/i.test(p) ? p : p + unit[1]);
  }
  const nums = parts.map(parseMoney).filter(Boolean);
  if (!nums.length) return { min: 200000, max: 400000 };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: Math.min(nums[0], nums[1]), max: Math.max(nums[0], nums[1]) };
}

/* Gom toàn bộ ngữ cảnh an toàn từ dna (chịu được dna/brief null) */
function ngu(brief, ctx) {
  brief = brief || {};
  ctx = ctx || {};
  const dna = ctx.dna || {};
  const co = dna.company || {};
  const company = co.name || 'Doanh nghiệp của bạn';
  const nganh = NGANH[co.industry] || NGANH.khac;
  const region = co.region || 'toàn quốc';

  const p0 = (dna.products && dna.products[0]) || {};
  const prod = p0.name || 'sản phẩm chủ lực';
  const pr = parsePriceRange(p0.price_range);
  const avg = roundTo((pr.min + pr.max) / 2, 1000);
  const priceText = p0.price_range || (vnd(pr.min) + '–' + vnd(pr.max));

  const cu = dna.customers || {};
  const profile = cu.profile || 'khách hàng mục tiêu trên kênh online';
  const profileShort = profile.split(',')[0].trim() || 'khách mục tiêu';
  // Nỗi đau: lấy vế cuối của profile nếu là mô tả vấn đề; nếu là mô tả nhân khẩu học thì dùng nỗi đau mặc định của ngành
  const chunks = profile.split(',').map(s => s.trim()).filter(Boolean);
  const last = chunks[chunks.length - 1] || '';
  const laNhanKhau = /\d|văn phòng|sinh viên|nội trợ|nhân viên|kinh doanh|làm việc|khách|(^|\s)nam(\s|$)|(^|\s)nữ(\s|$)/i.test(last);
  const pain = (last && !laNhanKhau) ? last : nganh.pain;
  const channels = (cu.channels && cu.channels.length) ? cu.channels : ['facebook'];

  const vo = dna.voice || {};
  const addr = String(vo.address || 'em-anh/chị').split(/[-–]/);
  const xung = (addr[0] || 'em').trim();
  const khach = (addr[1] || 'anh/chị').trim();
  const traits = (vo.traits || []).map(t => TRAIT_VI[t] || String(t).replace(/_/g, ' ')).join(' + ') || 'chân thành + rõ ràng';
  const banned = vo.banned || [];
  const bannedText = banned.join('; ') || 'không hứa hẹn vượt quá công bố của sản phẩm';

  const goal = dna.goal_3m || 'tăng trưởng đơn hàng ổn định trong 3 tháng tới';
  const gm = goal.match(/(\d[\d.]*)\s*đơn/);
  const donThang = gm ? parseInt(gm[1].replace(/\./g, ''), 10) : 300;

  // Chân dung khách minh hoạ (giới tính + tuổi suy từ profile)
  const isMale = /(^|[\s,])nam([\s,]|$)/i.test(profile) && !/nữ/i.test(profile);
  const am = profile.match(/(\d{2})\s*[-–]\s*(\d{2})/);
  const a1 = am ? parseInt(am[1], 10) : 30, a2 = am ? parseInt(am[2], 10) : 45;
  const nghe = /văn phòng/i.test(profile) ? 'nhân viên văn phòng'
    : /chủ|kinh doanh/i.test(profile) ? 'chủ cửa hàng'
    : /mẹ|bỉm/i.test(profile) ? 'mẹ hai con'
    : 'nhân viên văn phòng';
  const persona = isMale
    ? { ten: 'anh Quốc Trung', tuoi: a1 + 4, nghe }
    : { ten: 'chị Thu Hà', tuoi: a1 + 4, nghe };
  const persona2 = isMale
    ? { ten: 'anh Đức Anh', tuoi: Math.max(a1 + 2, a2 - 6), nghe: 'kỹ sư' }
    : { ten: 'chị Mai Phương', tuoi: Math.max(a1 + 2, a2 - 6), nghe: 'kế toán trưởng' };

  const keyword = unaccent(prod.split(/\s+/)[0] || 'TUVAN').toUpperCase();
  const tags = ['#' + unaccent(company).replace(/[^a-zA-Z0-9]+/g, ''),
    '#' + unaccent(prod).replace(/[^a-zA-Z0-9]+/g, ''),
    '#' + unaccent(nganh.label.split(/[—-]/)[0].trim()).replace(/[^a-zA-Z0-9]+/g, '')].join(' ');

  // Unit economics dùng chung cho ads/kế hoạch
  const cpa = roundTo(avg * 0.25, 1000);                    // chi phí/đơn trần = 25% giá TB
  const cpl = Math.max(5000, roundTo(cpa * 0.2, 500));      // CPL trần = CPA × tỷ lệ chốt 20%
  const budgetNhom = Math.min(500000, Math.max(100000, roundTo(cpa * 2, 10000)));

  const fmt = brief.format_dau_ra || 'docx';
  const round = ctx.round || 0;
  const prefix = round > 0 ? '_(Bản sửa vòng ' + round + ' — đã xử lý toàn bộ nhận xét)_\n\n' : '';
  const mucTieu = brief.muc_tieu || '';
  const tieuChi = (brief.tieu_chi_cham || []).join(', ');

  return { brief, dna, company, nganh, region, prod, pr, avg, priceText, profile, profileShort, pain,
    channels, xung, khach, traits, banned, bannedText, goal, donThang, persona, persona2, keyword,
    tags, cpa, cpl, budgetNhom, fmt, round, prefix, mucTieu, tieuChi, better: round > 0 };
}

function chanLabel(c) {
  const m = { facebook: 'Facebook (ads + content)', shopee: 'Shopee', tiktok: 'TikTok', zalo: 'Zalo OA',
    instagram: 'Instagram', website: 'Website/SEO', email: 'Email', youtube: 'YouTube' };
  return m[String(c).toLowerCase()] || cap(c);
}
function ngayVN(offset) {
  const d = new Date(Date.now() + (offset || 0) * 86400000);
  return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
}
function thangVN() {
  const d = new Date();
  return (d.getMonth() + 1) + '/' + d.getFullYear();
}

/* HTML fragment gọn — dùng chung cho format 'html' */
function htmlDash(title, kpis, headers, rows, bullets, note) {
  const css = '<style>.mkt-d{font-family:system-ui;line-height:1.5}.mkt-d .k{display:inline-block;background:#f4f6f8;border-radius:10px;padding:8px 16px;margin:4px 6px 4px 0}.mkt-d .k b{display:block;font-size:22px}.mkt-d table{border-collapse:collapse;width:100%;margin:10px 0}.mkt-d th,.mkt-d td{border:1px solid #d8dde5;padding:6px 8px;text-align:left;font-size:14px}.mkt-d .n{font-size:12px;color:#667}</style>';
  return '<div class="mkt-d">' + css + '<h1>' + title + '</h1>' +
    '<div>' + kpis.map(k => '<span class="k">' + k[0] + '<b>' + k[1] + '</b></span>').join('') + '</div>' +
    '<table><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr>' +
    rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</table>' +
    '<ul>' + bullets.map(b => '<li>' + b + '</li>').join('') + '</ul>' +
    '<p class="n">' + note + '</p></div>';
}

/* ================= NV CONTENT ================= */
function contentPosts(g) {
  const hook1 = g.better
    ? cap(g.pain) + ' không tự biến mất — nhưng cách ' + g.khach + ' xử lý nó có thể đổi từ hôm nay.'
    : cap(g.pain) + '? Vấn đề không nằm ở chỗ ' + g.khach + ' vẫn nghĩ.';
  const posts = [];
  posts.push('## Bài 1 — Hook nghịch lý\n**' + hook1 + '**\n' +
    'Nhiều ' + g.profileShort.toLowerCase() + ' đã thử đủ cách mà đâu vẫn vào đấy. ' + g.prod + ' (' + g.priceText + ') của ' +
    g.company + ' làm đúng một việc: giúp ' + g.khach + ' bớt gánh nặng "' + g.pain + '" mỗi ngày, theo cách ' + g.traits + '.\n' +
    '👉 Nhắn "' + g.keyword + '" để ' + g.xung + ' gửi ' + g.khach + ' hướng dẫn chọn đúng nhu cầu — không mua cũng không sao ạ.\n' + g.tags);
  posts.push('## Bài 2 — Chuyện khách hàng thật\n' +
    cap(g.persona.ten) + ' (' + g.persona.tuoi + ' tuổi, ' + g.persona.nghe + ') từng coi "' + g.pain + '" là chuyện phải chịu. ' +
    'Sau 3 tuần dùng ' + g.prod + ' theo đúng hướng dẫn, ' + g.persona.ten.split(' ')[0] + ' nhắn cho ' + g.xung + ': ' +
    '"Khác rõ, mà không phải gồng ép gì cả." Mỗi người mỗi nhịp — ' + g.xung + ' chỉ kể lại đúng những gì khách chia sẻ.\n' +
    '👉 ' + cap(g.khach) + ' muốn nghe kỹ hơn thì để lại chữ "Tư vấn", ' + g.xung + ' inbox nhé.');
  posts.push('## Bài 3 — Góc hỏi đáp\n' +
    '❓ "' + cap(g.prod) + ' có hợp với người ' + g.profileShort.toLowerCase() + ' bận rộn không?"\n' +
    '✅ Hợp, vì thiết kế cho nhịp sống bận: dùng đơn giản, không đòi hỏi thay đổi lớn. ' + cap(g.xung) + ' nói rõ luôn: ' + g.xung + ' ' +
    g.bannedText + ' — chỉ chia sẻ đúng những gì sản phẩm làm được, để ' + g.khach + ' tự cảm nhận.');
  return { hook1, posts };
}

function contentDoc(g) {
  const { posts } = contentPosts(g);
  const wantsEmail = /email|mail/i.test(JSON.stringify(g.brief));
  const parts = ['# Bộ bài đăng — ' + g.company,
    'Mục tiêu: ' + (g.mucTieu || 'bộ nội dung đa kênh cho ' + g.prod) + ' · Kênh: ' + g.channels.join(', ') +
    ' · Giọng: ' + g.traits + ' · Xưng hô: "' + g.xung + '–' + g.khach + '" · Tuân thủ: ' + g.bannedText + '.'];
  parts.push(...posts.slice(0, wantsEmail ? 3 : 3));
  if (!wantsEmail) parts.push('## Bài 4 — Ưu đãi tuần này\n' +
    'Riêng tuần này: đặt ' + g.prod + ' được freeship + quà nhỏ ' + g.xung + ' gói tay. Chỉ đến hết Chủ nhật (' + ngayVN(6) + ') thôi ạ.\n👉 Bấm "Gửi tin nhắn" hoặc comment "' + g.keyword + '" để ' + g.xung + ' giữ ưu đãi cho ' + g.khach + '.\n' + g.tags);
  if (wantsEmail) parts.push('## Email marketing\n' +
    '- Tiêu đề A: "' + cap(g.pain) + '? Món quà nhỏ cho ' + g.khach + ' bên trong" · Tiêu đề B: "3 phút đọc, bớt hẳn ' + g.pain + '"\n' +
    '- Preheader: ' + g.prod + ' + ưu đãi riêng cho khách đăng ký sớm.\n' +
    '- Thân bài: chào đúng xưng hô "' + g.khach + '" → 1 câu đồng cảm nỗi "' + g.pain + '" → 2 gạch đầu dòng lợi ích ' + g.prod + ' → nút CTA "Nhận ưu đãi ' + g.priceText + '" → tái bút nhắc hạn Chủ nhật ' + ngayVN(6) + '.');
  if (g.better) parts.push('**Checklist đã tự rà:** hook ≤12 từ dạng khẳng định · xưng hô thống nhất "' + g.xung + '–' + g.khach + '" · không vi phạm điều cấm · CTA mềm có từ khoá inbox.');
  return g.prefix + parts.join('\n\n');
}

function contentXlsx(g) {
  const kenh = g.channels.map(chanLabel);
  const rows = [
    ['1', ngayVN(1), kenh[0] || 'Facebook', 'Hook nghịch lý', '"' + cap(g.pain) + '? Vấn đề không nằm ở chỗ ' + g.khach + ' nghĩ"', 'Nhắn "' + g.keyword + '"', '2.000 reach · 40 inbox'],
    ['2', ngayVN(3), kenh[0] || 'Facebook', 'Chuyện khách hàng', g.persona.ten + ' (' + g.persona.tuoi + ', ' + g.persona.nghe + ')', 'Comment "Tư vấn"', '1.800 reach · 35 inbox'],
    ['3', ngayVN(5), kenh[1] || 'Zalo OA', 'Hỏi đáp/giải thích', 'Cơ chế ' + g.prod + ' — nói thật, ' + g.bannedText, 'Lưu bài + share', '1.200 reach'],
    ['4', ngayVN(6), kenh[0] || 'Facebook', 'Ưu đãi có hạn', 'Freeship + quà tặng đến CN ' + ngayVN(6), 'Bấm "Gửi tin nhắn"', '2.500 reach · 60 inbox'],
    ['5', ngayVN(8), kenh[1] || 'Email', 'Nuôi dưỡng', 'Email "' + cap(g.pain) + '? Món quà nhỏ bên trong"', 'Nút "Nhận ưu đãi"', 'Open ≥28% · CTR ≥3%']
  ];
  return g.prefix + '# Lịch nội dung 10 ngày — ' + g.company + '\n\n' +
    '| STT | Ngày | Kênh | Loại bài | Hook/chủ đề | CTA | KPI mục tiêu |\n|---|---|---|---|---|---|---|\n' +
    rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') +
    '\n\n_Giả định: reach organic trung bình 1.800/bài với fanpage SME; KPI inbox = reach × 2% tỷ lệ nhắn; ' +
    'bài ưu đãi cộng thêm 25% reach nhờ share. Giọng ' + g.traits + ', xưng "' + g.xung + '–' + g.khach + '", tuân thủ: ' + g.bannedText + '._';
}

function contentPptx(g) {
  const { posts } = contentPosts(g);
  const slides = ['## Slide 1 — Mục tiêu & thông điệp\n- Mục tiêu: ' + (g.mucTieu || 'bộ bài đăng ra mắt ' + g.prod) +
    '\n- Khách mục tiêu: ' + g.profile + '\n- Thông điệp lõi: giải quyết "' + g.pain + '" theo giọng ' + g.traits +
    '\n- Ranh giới: ' + g.bannedText];
  posts.forEach(p => slides.push(p.replace(/^## /, '## Slide ' + (slides.length + 1) + ' — ')));
  slides.push('## Slide ' + (slides.length + 1) + ' — Lịch đăng & KPI\n- Tần suất: 3 bài/tuần trên ' + g.channels.join(', ') +
    ', khung 20:00–21:00\n- KPI: ≥1.800 reach/bài, ≥2% tỷ lệ inbox, 100% bài đúng xưng hô "' + g.xung + '–' + g.khach + '"\n- Bài tốt nhất sau 7 ngày → đề xuất chạy ads');
  return g.prefix + slides.join('\n\n');
}

function contentHtml(g) {
  const { hook1 } = contentPosts(g);
  return g.prefix + htmlDash('Bộ nội dung — ' + g.company,
    [['Số bài', '4'], ['Kênh', g.channels.map(cap).join(', ')], ['KPI inbox', '≥2%/bài']],
    ['Bài', 'Loại', 'Hook', 'CTA'],
    [['1', 'Nghịch lý', hook1, 'Nhắn "' + g.keyword + '"'],
     ['2', 'Chuyện khách', g.persona.ten + ' (' + g.persona.tuoi + ', ' + g.persona.nghe + ') và "' + g.pain + '"', 'Comment "Tư vấn"'],
     ['3', 'Hỏi đáp', 'Cơ chế ' + g.prod + ' — minh bạch, ' + g.bannedText, 'Lưu + chia sẻ'],
     ['4', 'Ưu đãi', 'Freeship + quà tặng đến hết CN ' + ngayVN(6), 'Bấm "Gửi tin nhắn"']],
    ['Giọng thương hiệu: ' + g.traits + ' — xưng "' + g.xung + '–' + g.khach + '" xuyên suốt.',
     'Đăng khung 20:00–21:00, 3 bài/tuần; bài tốt nhất sau 7 ngày đưa sang chạy ads.',
     'Mọi bài đã rà theo điều cấm: ' + g.bannedText + '.'],
    'Sản phẩm chủ lực: ' + g.prod + ' (' + g.priceText + ') · Khách mục tiêu: ' + g.profile);
}

/* ================= NV ADS ================= */
function adsHooks(g) {
  return [
    ['Nghịch lý', g.better
      ? cap(g.pain) + ' không phải do ' + g.khach + ' thiếu cố gắng — mà do chưa ai chỉ đúng cách.'
      : 'Càng cố tự xoay xở với ' + g.pain + ', ' + g.khach + ' càng mệt.'],
    ['Đau trực diện', 'Nếu ' + g.khach + ' đã thử đủ cách mà ' + g.pain + ' vẫn quay lại — video này dành cho ' + g.khach + '.'],
    ['Kết quả', cap(g.persona.ten) + ' (' + g.persona.tuoi + ' tuổi, ' + g.persona.nghe + ') đã thấy khác hẳn sau 3 tuần.']
  ];
}
function adsGroups(g) {
  const b = g.budgetNhom;
  return [
    ['1. Cold — sở thích', g.profileShort + ' + sở thích liên quan ' + g.nganh.label.split(/[—-]/)[0].trim(), vnd(b), vnd(g.cpl), 'Tìm khách mới'],
    ['2. Cold — hành vi', 'Hành vi mua sắm online, ưu tiên ' + chanLabel(g.channels[0]), vnd(b), vnd(g.cpl), 'Tìm khách mới'],
    ['3. RT video 50%', 'Đã xem ≥50% video 14 ngày', vnd(roundTo(b * 0.6, 10000)), vnd(roundTo(g.cpl * 0.7, 500)), 'Kéo về inbox'],
    ['4. RT tương tác', 'Tương tác trang/inbox 7 ngày', vnd(roundTo(b * 0.5, 10000)), vnd(roundTo(g.cpl * 0.7, 500)), 'Chốt đơn'],
    ['5. Khách cũ + LAL 1%', 'Danh sách khách cũ và lookalike 1%', vnd(roundTo(b * 0.4, 10000)), vnd(roundTo(g.cpl * 0.5, 500)), 'Mua lại/upsell']
  ];
}
function adsTongNgay(g) {
  const b = g.budgetNhom;
  return b * 2 + roundTo(b * 0.6, 10000) + roundTo(b * 0.5, 10000) + roundTo(b * 0.4, 10000);
}
function painNgan(g) {
  // Chữ màn hình: nỗi đau viết hoa không dấu, cắt ở ranh giới từ trong 24 ký tự
  const s = unaccent(g.pain).toUpperCase();
  if (s.length <= 24) return s;
  const cut = s.slice(0, 24);
  return cut.slice(0, cut.lastIndexOf(' ') > 8 ? cut.lastIndexOf(' ') : 24);
}
function adsScriptRows(g) {
  return [
    ['0–3', 'Cận mặt ' + g.profileShort.toLowerCase() + ' bối rối, zoom nhanh', 'Đọc nguyên văn hook đã chọn ở mục trên', painNgan(g) + '? SAI RỒI', 'Pattern-interrupt, cắt cảnh <1s'],
    ['3–8', 'Người thật nhìn thẳng ống kính', '"' + cap(g.xung) + ' từng nghĩ phải chịu — cho đến khi có ' + g.prod + '."', '"Cho đến khi…"', 'Giọng chậm, nhạc nhẹ'],
    ['8–16', 'Cận sản phẩm, thao tác dùng thật', '"' + cap(g.prod) + ' làm đúng một việc: giúp ' + g.khach + ' nhẹ gánh ' + g.pain + '."', 'Đúng 1 việc. Làm tốt.', 'Ánh sáng tự nhiên'],
    ['16–24', 'Ảnh tin nhắn khách + sao đánh giá', '"Nhiều khách như ' + g.persona.ten + ' đã quay lại đặt tiếp."', '★★★★★ khách thật', 'Feedback thật, che tên'],
    ['24–32', 'Bảng giá + 3 lợi ích dạng chữ', '"Chỉ ' + g.priceText + ' — rẻ hơn chi phí chịu đựng mỗi ngày."', g.priceText, 'Chữ to, giữ 2 nhịp'],
    ['32–40', 'Tay bấm giỏ hàng / khung inbox', '"Bấm giỏ hàng bên dưới, hoặc nhắn ' + g.keyword + ' để ' + g.xung + ' tư vấn nhé."', '👇 GHIM GIỎ HÀNG', 'Kết bằng logo']
  ];
}
function adsDoc(g) {
  const hooks = adsHooks(g);
  const parts = ['# Kịch bản video bán hàng + chiến dịch — ' + g.prod,
    '## 3 phiên bản hook 0–3s (test A/B)\n' + hooks.map((h, i) => (i + 1) + '. **' + h[0] + ':** "' + h[1] + '"').join('\n'),
    '## Kịch bản 40 giây — hook 1\n| Giây | Hình | Thoại | Chữ màn hình | Ghi chú |\n|---|---|---|---|---|\n' +
      adsScriptRows(g).map(r => '| ' + r.join(' | ') + ' |').join('\n'),
    '## Chiến dịch 5 nhóm quảng cáo\n| Nhóm | Đối tượng | NS/ngày | CPL trần | Vai trò |\n|---|---|---|---|---|\n' +
      adsGroups(g).map(r => '| ' + r.join(' | ') + ' |').join('\n') +
      '\n\n_Công thức: CPA trần = 25% × giá TB ' + vnd(g.avg) + ' = ' + vnd(g.cpa) + '; CPL trần = CPA × 20% chốt = ' + vnd(g.cpl) +
      '. Tổng ' + vnd(adsTongNgay(g)) + '/ngày; 7 ngày ≈ ' + vnd(adsTongNgay(g) * 7) +
      '. Kill-switch: vượt 150% trần/24h → tắt nhóm. Tuân thủ: ' + g.bannedText + '._'];
  if (g.better) parts.push('## Ngưỡng 72h đầu\n- Hook rate ≥30% · giữ 50% video ≥12% · CTR ≥1,5%\n- CPL ≤80% trần 48h → scale +20%; vượt 120% trần → đổi hook trước khi tắt.');
  return g.prefix + parts.join('\n\n');
}
function adsXlsx(g) {
  return g.prefix + '# Media plan test 7 ngày — ' + g.prod + '\n\n' +
    '| Nhóm | Đối tượng | NS/ngày | NS 7 ngày | CPL trần | Lead kỳ vọng |\n|---|---|---|---|---|---|\n' +
    adsGroups(g).map(r => {
      const ns = parseInt(r[2].replace(/\D/g, ''), 10), cpl = parseInt(r[3].replace(/\D/g, ''), 10);
      return '| ' + r[0] + ' | ' + r[1] + ' | ' + r[2] + ' | ' + vnd(ns * 7) + ' | ' + r[3] + ' | ' + Math.floor(ns * 7 / cpl) + ' |';
    }).join('\n') +
    '\n| **Tổng** | — | **' + vnd(adsTongNgay(g)) + '** | **' + vnd(adsTongNgay(g) * 7) + '** | — | **≈' +
    Math.floor(adsTongNgay(g) * 7 / g.cpl) + '** |\n\n' +
    '_Công thức: CPA trần = 25% × giá TB ' + vnd(g.avg) + ' = ' + vnd(g.cpa) + '; CPL trần = CPA × 20% tỷ lệ chốt = ' + vnd(g.cpl) +
    '; lead kỳ vọng = NS 7 ngày ÷ CPL trần (retarget dùng trần thấp hơn). Đơn kỳ vọng ≈ lead × 20% = ' +
    Math.floor(adsTongNgay(g) * 7 / g.cpl * 0.2) + ' đơn. Kill-switch 150% trần/24h._\n\n' +
    '**3 hook test:** ' + adsHooks(g).map(h => '"' + h[1] + '"').join(' · ');
}
function adsPptx(g) {
  const hooks = adsHooks(g);
  return g.prefix + ['## Slide 1 — Mục tiêu chiến dịch\n- ' + (g.mucTieu || 'Video bán hàng + phễu ads cho ' + g.prod) +
    '\n- Khách mục tiêu: ' + g.profile + '\n- KPI lõi: CPL ≤ ' + vnd(g.cpl) + ', đơn kỳ vọng ' + Math.floor(adsTongNgay(g) * 7 / g.cpl * 0.2) + '/tuần test',
  '## Slide 2 — 3 phiên bản hook 0–3s\n' + hooks.map((h, i) => '- **' + h[0] + ':** "' + h[1] + '"').join('\n'),
  '## Slide 3 — Khung kịch bản 40s\n- 0–3s hook pattern-interrupt → 3–8s đồng cảm → 8–16s sản phẩm làm đúng 1 việc\n- 16–24s bằng chứng khách thật → 24–32s giá ' + g.priceText + ' → 32–40s CTA ghim giỏ + inbox "' + g.keyword + '"',
  '## Slide 4 — Cấu trúc 5 nhóm quảng cáo\n' + adsGroups(g).map(r => '- ' + r[0] + ': ' + r[1] + ' — ' + r[2] + '/ngày, CPL trần ' + r[3]).join('\n'),
  '## Slide 5 — Ngân sách & kill-switch\n- Tổng ' + vnd(adsTongNgay(g)) + '/ngày · test 7 ngày ≈ ' + vnd(adsTongNgay(g) * 7) +
    '\n- CPL trần = 25% giá TB × 20% tỷ lệ chốt = ' + vnd(g.cpl) + '\n- Vượt 150% trần trong 24h → tắt nhóm; CPL ≤80% trần 48h → scale +20%'].join('\n\n');
}
function adsHtml(g) {
  return g.prefix + htmlDash('Phễu quảng cáo — ' + g.prod,
    [['NS/ngày', vnd(adsTongNgay(g))], ['CPL trần', vnd(g.cpl)], ['Đơn kỳ vọng/tuần', String(Math.floor(adsTongNgay(g) * 7 / g.cpl * 0.2))]],
    ['Nhóm', 'Đối tượng', 'NS/ngày', 'CPL trần'],
    adsGroups(g).map(r => r.slice(0, 4)),
    ['Hook chính: "' + adsHooks(g)[0][1] + '"',
     'Công thức CPL trần: 25% × giá TB ' + vnd(g.avg) + ' × 20% tỷ lệ chốt = ' + vnd(g.cpl) + '.',
     'Kill-switch: vượt 150% trần trong 24h → tắt nhóm, dồn ngân sách nhóm tốt nhất.'],
    'Video 40s theo khung hook–đồng cảm–sản phẩm–bằng chứng–giá–CTA. Tuân thủ: ' + g.bannedText);
}

/* ================= NV MARKET ================= */
function marketRows(g) {
  const mults = [0.85, 0.95, 1.05, 1.18, 1.32];
  const rates = ['4,5', '4,2', '4,7', '4,3', '4,6'];
  const usps = ['Giá rẻ nhất phân khúc', 'Bao bì/hình ảnh đẹp, hợp làm quà', 'Freeship + đổi trả 7 ngày', 'KOC review dày đặc', 'Thương hiệu lâu năm, phân phối rộng'];
  const kms = ['Giảm 15% đơn đầu', 'Mua 2 tặng 1 phiên bản nhỏ', 'Voucher 30k đơn từ 2 sản phẩm', 'Flash sale thứ 6 hằng tuần', 'Quà tặng kèm theo mùa'];
  return g.nganh.doiThu.map((ten, i) => {
    const gia = roundTo(g.avg * mults[i], 1000);
    const score = Math.round(parseFloat(rates[i].replace(',', '.')) * 20 - Math.abs(mults[i] - 1) * 40);
    return [ten, vnd(gia), usps[i], rates[i] + '/5', kms[i], String(score)];
  });
}
function marketNhanDinh(g) {
  const rows = marketRows(g);
  const avgComp = roundTo(rows.reduce((s, r) => s + parseInt(r[1].replace(/\D/g, ''), 10), 0) / rows.length, 1000);
  const viTri = g.avg <= avgComp ? 'đang thấp hơn mặt bằng — có lợi thế giá, đừng giảm sâu thêm mà cộng quà tặng để giữ biên'
    : 'cao hơn mặt bằng ' + Math.round((g.avg / avgComp - 1) * 100) + '% — phải bán bằng câu chuyện và bằng chứng, không đua giá';
  return ['**Về giá:** trung bình đối thủ ' + vnd(avgComp) + ', giá mình ' + g.priceText + ' → ' + viTri + '.',
    '**Về USP:** đối thủ dồn vào giá và khuyến mãi; khoảng trống là "minh bạch + ' + g.traits + '" — ' + g.bannedText + ' chính là điểm khác biệt nên nói to.',
    '**Về kênh & xu hướng:** ngành ' + g.nganh.label.split(/[—-]/)[0].trim() + ' đang dịch chuyển sang ' + g.nganh.trend + '; ưu tiên ' + chanLabel(g.channels[0]) + ' làm kênh chủ lực, test thêm 1 kênh mới mỗi tháng.'];
}
function marketDoc(g) {
  const parts = ['# So sánh đối thủ — ngành ' + g.nganh.label + ' (' + g.region + ')',
    'Phạm vi: 5 đối thủ cùng phân khúc với ' + g.prod + ', dữ liệu ghi nhận ngày ' + ngayVN(0) + ' từ sàn TMĐT và fanpage công khai.',
    '| Đối thủ | Giá bán chính | USP | Đánh giá | KM đang chạy | Điểm cạnh tranh/100 |\n|---|---|---|---|---|---|\n' +
      marketRows(g).map(r => '| ' + r.join(' | ') + ' |').join('\n') +
      '\n| **' + g.company + ' (mình)** | ' + g.priceText + ' | ' + g.traits + ', ' + g.bannedText + ' | — | — | — |',
    '## 3 nhận định chiến lược\n' + marketNhanDinh(g).map((n, i) => (i + 1) + '. ' + n).join('\n')];
  if (g.better) parts.push('## Hành động 14 ngày\n- Chốt định vị giá theo nhận định 1, cập nhật bảng giá kênh ' + chanLabel(g.channels[0]) +
    '\n- Viết 2 bài "so sánh trung thực" đánh vào khoảng trống USP\n- Đặt cảnh báo theo dõi giá 5 đối thủ mỗi thứ 2 hằng tuần');
  parts.push('_Ghi chú: điểm cạnh tranh = đánh giá × 20 − |lệch giá so với trung vị| × 40; giá là mức niêm yết phổ biến, cần đối chiếu lại trước khi quyết định giá bán._');
  return g.prefix + parts.join('\n\n');
}
function marketPptx(g) {
  const nd = marketNhanDinh(g);
  return g.prefix + ['## Slide 1 — Bối cảnh khảo sát\n- Ngành: ' + g.nganh.label + ' · Khu vực: ' + g.region +
    '\n- 5 đối thủ cùng phân khúc với ' + g.prod + ' (' + g.priceText + ')\n- Nguồn: sàn TMĐT + fanpage công khai, ngày ' + ngayVN(0),
  '## Slide 2 — Bảng so sánh\n' + marketRows(g).map(r => '- ' + r[0] + ': ' + r[1] + ' · ' + r[3] + ' · ' + r[2]).join('\n'),
  '## Slide 3 — Vị trí giá của mình\n- ' + nd[0].replace(/\*\*/g, ''),
  '## Slide 4 — Khoảng trống USP\n- ' + nd[1].replace(/\*\*/g, ''),
  '## Slide 5 — Xu hướng & khuyến nghị\n- ' + nd[2].replace(/\*\*/g, '') + '\n- Theo dõi giá đối thủ mỗi thứ 2; cập nhật bảng này 2 tuần/lần'].join('\n\n');
}
function marketHtml(g) {
  const rows = marketRows(g);
  const avgComp = roundTo(rows.reduce((s, r) => s + parseInt(r[1].replace(/\D/g, ''), 10), 0) / rows.length, 1000);
  return g.prefix + htmlDash('Radar đối thủ — ' + g.nganh.label,
    [['Đối thủ theo dõi', '5'], ['Giá TB đối thủ', vnd(avgComp)], ['Giá của mình', g.priceText]],
    ['Đối thủ', 'Giá', 'Đánh giá', 'KM đang chạy', 'Điểm/100'],
    rows.map(r => [r[0], r[1], r[3], r[4], r[5]]),
    marketNhanDinh(g).map(n => n.replace(/\*\*/g, '')),
    'Ghi nhận ngày ' + ngayVN(0) + '; điểm = đánh giá × 20 − |lệch giá| × 40. Cần đối chiếu trước khi dùng ra quyết định giá.');
}

/* ================= TP MKT — kế hoạch tháng ================= */
function tpBudgetRows(g) {
  const doanhThu = g.donThang * g.avg;
  const nsTong = roundTo(doanhThu * 0.15, 100000);
  const k1 = chanLabel(g.channels[0]);
  const k2 = g.channels[1] ? chanLabel(g.channels[1]) : 'Kênh test mới';
  return { doanhThu, nsTong, rows: [
    [k1 + ' (chủ lực)', vnd(nsTong * 0.45), 'Ads + content kéo đơn', 'CPL ≤ ' + vnd(g.cpl) + ' · ' + Math.round(g.donThang * 0.6) + ' đơn', 'NV Ads + NV Content'],
    [k2, vnd(nsTong * 0.25), 'Mở rộng điểm chạm', Math.round(g.donThang * 0.25) + ' đơn', 'NV Ads'],
    ['KOC/Seeding', vnd(nsTong * 0.15), 'Bằng chứng xã hội', '8 review thật có ảnh', 'NV Content'],
    ['Email/CSKH cũ', vnd(nsTong * 0.05), 'Mua lại + giới thiệu', Math.round(g.donThang * 0.15) + ' đơn', 'NV Content'],
    ['Dự phòng', vnd(nsTong * 0.10), 'Cơ hội phát sinh', 'Chỉ chi khi CPL ≤ trần', 'TP duyệt']
  ] };
}
function tpDoc(g) {
  const b = tpBudgetRows(g);
  const parts = ['# Kế hoạch Marketing tháng ' + thangVN() + ' — ' + g.company,
    '## Mục tiêu tháng\n- ' + g.donThang + ' đơn (bám mục tiêu quý: "' + g.goal + '")\n- Doanh thu mục tiêu: ' + vnd(b.doanhThu) +
      ' (= ' + g.donThang + ' đơn × giá TB ' + vnd(g.avg) + ')\n- Ngân sách marketing: ' + vnd(b.nsTong) + ' (trần 15% doanh thu mục tiêu)',
    '## Phân bổ ngân sách theo kênh\n| Kênh | Ngân sách | Vai trò | KPI | Phụ trách |\n|---|---|---|---|---|\n' +
      b.rows.map(r => '| ' + r.join(' | ') + ' |').join('\n'),
    '## Lịch trọng tâm 4 tuần\n- **Tuần 1:** chốt 3 hook + quay video; đăng 3 bài organic đo phản ứng\n- **Tuần 2:** chạy test 5 nhóm ads (' + vnd(adsTongNgay(g)) +
      '/ngày); gửi mẫu cho 8 KOC\n- **Tuần 3:** tắt nhóm vượt CPL trần ' + vnd(g.cpl) + ', scale nhóm tốt +20%; đăng review KOC\n- **Tuần 4:** đẩy ưu đãi cuối tháng cho khách cũ; tổng kết, chốt kế hoạch tháng sau',
    '## Nguyên tắc & rủi ro\n- Mọi nội dung giữ giọng ' + g.traits + ', xưng "' + g.xung + '–' + g.khach + '"; tuyệt đối ' + g.bannedText +
      '\n- Rủi ro CPL vượt trần tuần 2 → đổi hook trước, đổi đối tượng sau, giảm ngân sách là bước cuối\n- Thiếu content → kho dự phòng tối thiểu 5 bài đã duyệt'];
  if (g.better) parts.push('**Đã bổ sung theo nhận xét:** KPI từng kênh gắn số đơn cụ thể, ngân sách có công thức trần 15%, lịch tuần có điều kiện tắt/scale rõ ràng.');
  return g.prefix + parts.join('\n\n');
}
function tpXlsx(g) {
  const b = tpBudgetRows(g);
  return g.prefix + '# Ngân sách marketing tháng ' + thangVN() + ' — ' + g.company + '\n\n' +
    '| Kênh | Ngân sách | Tỷ trọng | KPI | Phụ trách |\n|---|---|---|---|---|\n' +
    b.rows.map((r, i) => '| ' + r[0] + ' | ' + r[1] + ' | ' + ['45%', '25%', '15%', '5%', '10%'][i] + ' | ' + r[3] + ' | ' + r[4] + ' |').join('\n') +
    '\n| **Tổng** | **' + vnd(b.nsTong) + '** | **100%** | ' + g.donThang + ' đơn | TP Marketing |\n\n' +
    '_Công thức: doanh thu mục tiêu = ' + g.donThang + ' đơn × giá TB ' + vnd(g.avg) + ' = ' + vnd(b.doanhThu) +
    '; ngân sách = 15% doanh thu mục tiêu; CPL trần toàn phễu ' + vnd(g.cpl) + ' (= 25% giá TB × 20% tỷ lệ chốt). Vượt trần 150%/24h ở bất kỳ nhóm nào → dừng nhóm đó._';
}
function tpPptx(g) {
  const b = tpBudgetRows(g);
  return g.prefix + ['## Slide 1 — Mục tiêu tháng ' + thangVN() + '\n- ' + g.donThang + ' đơn · doanh thu ' + vnd(b.doanhThu) +
    '\n- Bám mục tiêu quý: "' + g.goal + '"\n- Ngân sách: ' + vnd(b.nsTong) + ' (15% doanh thu mục tiêu)',
  '## Slide 2 — Phân bổ ngân sách\n' + b.rows.map(r => '- ' + r[0] + ': ' + r[1] + ' — ' + r[3]).join('\n'),
  '## Slide 3 — Lịch 4 tuần\n- T1: chốt hook + quay video, 3 bài organic\n- T2: test 5 nhóm ads + gửi mẫu KOC\n- T3: tắt nhóm vượt trần ' + vnd(g.cpl) + ', scale +20%\n- T4: ưu đãi khách cũ, tổng kết',
  '## Slide 4 — KPI theo dõi hằng tuần\n- CPL ≤ ' + vnd(g.cpl) + ' · tỷ lệ chốt inbox ≥20% · kho content ≥5 bài duyệt sẵn\n- Review số thứ 2 hằng tuần, báo cáo COO thứ 6',
  '## Slide 5 — Nguyên tắc thương hiệu\n- Giọng ' + g.traits + ', xưng "' + g.xung + '–' + g.khach + '"\n- Tuyệt đối: ' + g.bannedText + '\n- Khủng hoảng nhỏ (bình luận tiêu cực) → phản hồi trong 2h theo kịch bản CSKH'].join('\n\n');
}
function tpHtml(g) {
  const b = tpBudgetRows(g);
  return g.prefix + htmlDash('Kế hoạch Marketing tháng ' + thangVN() + ' — ' + g.company,
    [['Mục tiêu đơn', String(g.donThang)], ['Doanh thu mục tiêu', vnd(b.doanhThu)], ['Ngân sách', vnd(b.nsTong)], ['CPL trần', vnd(g.cpl)]],
    ['Kênh', 'Ngân sách', 'KPI', 'Phụ trách'],
    b.rows.map(r => [r[0], r[1], r[3], r[4]]),
    ['Tuần 1 chốt hook + organic · Tuần 2 test 5 nhóm ads · Tuần 3 tắt/scale theo CPL trần · Tuần 4 ưu đãi khách cũ.',
     'Giọng ' + g.traits + ', xưng "' + g.xung + '–' + g.khach + '"; tuyệt đối ' + g.bannedText + '.',
     'Ngân sách = 15% doanh thu mục tiêu; doanh thu = ' + g.donThang + ' đơn × ' + vnd(g.avg) + '.'],
    'Kế hoạch bám mục tiêu quý: "' + g.goal + '". Review số thứ 2 hằng tuần, báo cáo COO thứ 6.');
}

/* ---------------- Bộ chọn theo format ---------------- */
function render(builders, brief, ctx) {
  const g = ngu(brief, ctx);
  if (g.fmt === 'xlsx') return builders.xlsx(g);
  if (g.fmt === 'pptx') return builders.pptx(g);
  if (g.fmt === 'html') return builders.html(g);
  return builders.doc(g); // docx | md
}

/* ---------------- Reviews của TP Marketing ---------------- */
function rv(fb, errs) { return { feedback_chi_tiet: fb, loi_cu_the: errs }; }

const outputs = {
  nv_content(brief, ctx) { return render({ doc: contentDoc, xlsx: contentXlsx, pptx: contentPptx, html: contentHtml }, brief, ctx); },
  nv_ads(brief, ctx) { return render({ doc: adsDoc, xlsx: adsXlsx, pptx: adsPptx, html: adsHtml }, brief, ctx); },
  nv_market(brief, ctx) { return render({ doc: marketDoc, xlsx: marketXlsxLike, pptx: marketPptx, html: marketHtml }, brief, ctx); },
  tp_mkt(brief, ctx) { return render({ doc: tpDoc, xlsx: tpXlsx, pptx: tpPptx, html: tpHtml }, brief, ctx); },
  default(brief, ctx) {
    const s = JSON.stringify(brief || {}) + ' ' + ((ctx && ctx.command) || '');
    if (/video|ads|quảng cáo|quang cao|cpl|ngân sách/i.test(s)) return outputs.nv_ads(brief, ctx);
    if (/đối thủ|doi thu|thị trường|thi truong|xu hướng|xu huong|so sánh/i.test(s)) return outputs.nv_market(brief, ctx);
    if (/kế hoạch|ke hoach|plan|tháng/i.test(s)) return outputs.tp_mkt(brief, ctx);
    return outputs.nv_content(brief, ctx);
  }
};
/* nv_market với fmt xlsx dùng chính bảng doc (đã là bảng chuẩn) */
function marketXlsxLike(g) { return marketDoc(g); }

const reviews = {
  nv_content(brief, ctx, pass) {
    const g = ngu(brief, ctx);
    if (pass) return rv('Đạt. Hook bài 1 dạng khẳng định nghịch lý đúng công thức, xưng hô "' + g.xung + '–' + g.khach +
      '" thống nhất, không vi phạm điều cấm. Góp ý nhỏ: rút hook còn ≤12 từ và thêm giờ đăng cụ thể vào từng bài trước khi đưa vào lịch.',
      [{ vi_tri: 'Bài 1, câu hook', loi: 'Hook hơi dài so với chuẩn ≤12 từ', cach_sua: 'Cắt mệnh đề phụ, giữ vế nghịch lý mạnh nhất' }]);
    return rv('Chưa đạt chuẩn đăng, trả lại sửa trong vòng này. 3 lỗi chính: (1) hook bài 1 là câu hỏi tu từ đã bão hoà, không dừng được ngón tay lướt; ' +
      '(2) xưng hô lẫn "bạn/mình", lệch chuẩn DNA "' + g.xung + '–' + g.khach + '"; (3) đoạn lợi ích diễn đạt dễ bị hiểu là cam kết kết quả tuyệt đối — chạm điều cấm. ' +
      'Sửa đủ 3 điểm theo hướng dẫn dưới rồi nộp lại, không cần hỏi thêm.',
      [{ vi_tri: 'Bài 1, câu mở đầu', loi: 'Hook dạng "Bạn có biết…" không tạo pattern-interrupt', cach_sua: 'Đổi sang khẳng định nghịch lý ≤12 từ chạm thẳng nỗi đau "' + g.pain + '"' },
       { vi_tri: 'Toàn bộ các bài', loi: 'Xưng hô không thống nhất, có chỗ dùng "bạn"', cach_sua: 'Thống nhất "' + g.xung + '–' + g.khach + '" từ câu đầu đến CTA, kể cả trong quote khách hàng' },
       { vi_tri: 'Bài 3, đoạn lợi ích', loi: 'Câu chữ dễ bị đọc thành lời hứa kết quả chắc chắn', cach_sua: 'Viết lại theo hướng chia sẻ cơ chế + cảm nhận khách; tôn trọng điều cấm: ' + g.bannedText }]);
  },
  nv_ads(brief, ctx, pass) {
    const g = ngu(brief, ctx);
    if (pass) return rv('Đạt. Kịch bản đủ 5 cột, 3 giây đầu có pattern-interrupt, CPL trần ' + vnd(g.cpl) +
      ' có công thức suy từ giá ' + vnd(g.avg) + '. Góp ý nhỏ: thêm phương án chữ màn hình cho khung 8–16s để test song song.',
      [{ vi_tri: 'Bảng kịch bản, dòng 8–16s', loi: 'Mới có 1 phương án chữ màn hình', cach_sua: 'Bổ sung 1 biến thể để A/B ngay từ tuần test' }]);
    return rv('Chưa đạt, trả lại sửa. 3 lỗi chính: (1) 3 giây đầu mô tả cảnh tĩnh, không có pattern-interrupt nên hook rate sẽ dưới 30%; ' +
      '(2) CPL trần ghi số nhưng không kèm công thức — với giá TB ' + vnd(g.avg) + ' thì trần phải ≈ ' + vnd(g.cpl) + ' (25% giá × 20% tỷ lệ chốt), số đang ghi lệch xa; ' +
      '(3) cấu trúc chiến dịch thiếu nhóm retarget và khách cũ, chỉ có nhóm cold nên phễu không chốt được. Sửa xong tự kiểm lại bằng công thức rồi nộp.',
      [{ vi_tri: 'Bảng kịch bản, dòng 0–3s', loi: 'Không có pattern-interrupt (zoom/cắt cảnh/đổi góc)', cach_sua: 'Thêm zoom nhanh + cắt cảnh <1s, thoại mở bằng nghịch lý về "' + g.pain + '"' },
       { vi_tri: 'Mục cấu trúc chiến dịch, cột CPL trần', loi: 'Số CPL không suy từ unit economics của sản phẩm', cach_sua: 'Tính lại: CPA trần = 25% × ' + vnd(g.avg) + ' = ' + vnd(g.cpa) + ' → CPL trần = ' + vnd(g.cpl) + '; retarget lấy 70%, khách cũ 50% mức này' },
       { vi_tri: 'Danh sách nhóm quảng cáo', loi: 'Thiếu nhóm retarget video/tương tác và nhóm khách cũ', cach_sua: 'Bổ sung đủ 5 nhóm: 2 cold + 2 retarget + 1 khách cũ/lookalike, kèm ngân sách/ngày từng nhóm' }]);
  },
  nv_market(brief, ctx, pass) {
    const g = ngu(brief, ctx);
    if (pass) return rv('Đạt. Đủ 5 đối thủ có giá + đánh giá + khuyến mãi, nhận định gắn được với vị trí giá của mình (' + g.priceText +
      '). Góp ý nhỏ: ghi thêm link/nguồn từng dòng để lần cập nhật sau đối chiếu nhanh hơn.',
      [{ vi_tri: 'Bảng so sánh, cột nguồn', loi: 'Chưa dẫn nguồn theo từng dòng', cach_sua: 'Thêm cột "Nguồn/ngày xem" cho từng đối thủ' }]);
    return rv('Chưa đạt, trả lại sửa. 3 lỗi chính: (1) bảng không ghi ngày thu thập và nguồn nên không kiểm chứng được; ' +
      '(2) giá đối thủ ghi trần trụi không so với giá mình ' + g.priceText + ' — thiếu dòng quy chiếu nên CEO không đọc ra vị trí giá; ' +
      '(3) nhận định dạng "cần cải thiện marketing" quá chung, không ra được hành động. Sửa theo 3 hướng dẫn dưới rồi nộp lại.',
      [{ vi_tri: 'Đầu bảng so sánh', loi: 'Thiếu ngày thu thập + nguồn dữ liệu', cach_sua: 'Ghi rõ "ghi nhận ngày ' + ngayVN(0) + ', từ sàn TMĐT + fanpage công khai" và lưu ý cần đối chiếu lại' },
       { vi_tri: 'Bảng so sánh, dòng cuối', loi: 'Không có dòng của chính công ty để quy chiếu', cach_sua: 'Thêm dòng "' + g.company + ' (mình)" với giá ' + g.priceText + ' và USP theo DNA' },
       { vi_tri: 'Mục nhận định', loi: 'Nhận định không gắn số liệu, không chỉ ra hành động', cach_sua: 'Mỗi nhận định phải có 1 con số từ bảng + 1 hành động 14 ngày (vd: chốt định vị giá, viết bài so sánh trung thực)' }]);
  },
  tp_mkt(brief, ctx, pass) {
    const g = ngu(brief, ctx);
    if (pass) return rv('Đạt. Kế hoạch nối được mục tiêu quý "' + g.goal + '" xuống KPI tháng, ngân sách có công thức trần 15% doanh thu. ' +
      'Góp ý nhỏ: thêm mốc review giữa tuần cho tuần chạy test ads.',
      [{ vi_tri: 'Lịch tuần 2', loi: 'Chưa có mốc kiểm giữa tuần khi đang đốt ngân sách test', cach_sua: 'Thêm checkpoint thứ 4: CPL từng nhóm so với trần ' + vnd(g.cpl) }]);
    return rv('Chưa đạt. 3 lỗi chính: (1) mục tiêu tháng không nối với mục tiêu quý "' + g.goal + '" nên không truy được tiến độ; ' +
      '(2) ngân sách kênh ghi tỷ lệ nhưng không có số tuyệt đối và công thức trần; (3) KPI không có ngưỡng cắt (khi nào tắt, khi nào scale). Sửa đủ rồi trình lại COO.',
      [{ vi_tri: 'Mục tiêu tháng', loi: 'Không suy từ mục tiêu quý', cach_sua: 'Quy đổi: mục tiêu quý → ' + g.donThang + ' đơn/tháng × giá TB ' + vnd(g.avg) + ' = doanh thu mục tiêu, ghi rõ phép tính' },
       { vi_tri: 'Bảng ngân sách', loi: 'Chỉ có % không có tiền, thiếu công thức tổng', cach_sua: 'Tổng = 15% doanh thu mục tiêu; ghi cả % lẫn VND từng kênh' },
       { vi_tri: 'Mục KPI', loi: 'KPI không có ngưỡng hành động', cach_sua: 'Gắn ngưỡng: CPL vượt 150% trần 24h → tắt nhóm; CPL ≤80% trần 48h → scale +20%' }]);
  },
  default(brief, ctx, pass) {
    const g = ngu(brief, ctx);
    if (pass) return rv('Đạt. Bài đúng giọng ' + g.traits + ', bám brief. Góp ý nhỏ: thêm 1 dòng nguồn/giả định cho số liệu chính.',
      [{ vi_tri: 'Phần số liệu', loi: 'Thiếu ghi chú giả định', cach_sua: 'Thêm 1 dòng nêu công thức hoặc nguồn của số liệu chính' }]);
    return rv('Chưa đạt, trả lại sửa trong vòng này. 3 lỗi chính: (1) giọng và xưng hô lệch chuẩn DNA — thương hiệu yêu cầu giọng ' + g.traits +
      ', xưng "' + g.xung + '–' + g.khach + '" nhưng bài đang dùng lẫn lộn, đọc không ra tiếng nói của công ty; ' +
      '(2) các con số chính nêu trần trụi, không kèm công thức hoặc giả định nên trưởng phòng không kiểm chứng được; ' +
      '(3) phần cam kết/lợi ích chưa được rà theo danh sách điều cấm của thương hiệu, có câu dễ bị hiểu là lời hứa kết quả tuyệt đối. ' +
      'Sửa đúng theo 3 hướng dẫn dưới rồi nộp lại, không cần hỏi thêm.',
      [{ vi_tri: 'Toàn bài', loi: 'Giọng và xưng hô không đúng DNA', cach_sua: 'Viết lại theo giọng ' + g.traits + ', xưng "' + g.xung + '–' + g.khach + '" thống nhất' },
       { vi_tri: 'Các con số chính', loi: 'Số đưa ra không kèm cách tính', cach_sua: 'Mỗi số chính kèm 1 dòng công thức/giả định (vd: suy từ giá TB ' + vnd(g.avg) + ')' },
       { vi_tri: 'Phần cam kết/lợi ích', loi: 'Chưa đối chiếu điều cấm của thương hiệu', cach_sua: 'Rà lại theo: ' + g.bannedText }]);
  }
};

module.exports = { dept: 'mkt', outputs, reviews };
