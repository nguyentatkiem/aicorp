'use strict';
/* ------------------------------------------------------------------
   crm-content.js — Nội dung CRM sống cho Demo Engine (Phase v4)
   Sinh khách hàng mô phỏng, ghi chú lead, ticket CSKH, nguồn lead…
   HOÀN TOÀN DETERMINISTIC: mọi thứ suy ra từ tham số (đặc biệt chỉ số i)
   và từ ctx.dna — KHÔNG dùng Math.random / Date.now. Chịu dna = null.
   Nội suy theo 12 ngành (banle…khac), không hardcode ngành trà.

   module.exports = {
     customer(i, dna)              → { name, phone, segment, source, city, note }
     leadNote(product, stage, dna) → string   (stage: moi|am|nong|chot|mat)
     ticket(kind, product, dna)    → { content, suggestedResolution }
     sources(dna)                  → [string]
     productFor(i, dna)            → string
   }
   ------------------------------------------------------------------ */

/* ================= 1. Băm & chọn deterministic ==================== */
/* FNV-1a 32-bit — cùng kiểu với data.js để số liệu ổn định theo seed. */
function hashStr(s) {
  let h = 2166136261;
  s = String(s);
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* Chọn độc lập theo từng "salt" để các thành phần (họ, tên, thành phố…)
   không dính chùm — cùng i nhưng khác salt cho ra chỉ số khác nhau. */
function mix(i, salt) { return hashStr(salt + '#' + i); }
function pick(arr, i, salt) { return arr[mix(i, salt) % arr.length]; }
function idxOf(i) { return Math.abs(Math.trunc(Number(i) || 0)); }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

/* ================= 2. Trích thông tin từ DNA (an toàn null) ======= */

const NGANH_SET = new Set(['banle', 'fnb', 'thoitrang', 'mypham', 'giaoduc', 'suckhoe',
  'noithat', 'bds', 'dichvu', 'sanxuat', 'tmdt', 'khac']);

function industryId(dna) {
  const id = (((dna || {}).company || {}).industry) || '';
  return NGANH_SET.has(id) ? id : 'khac';
}
function addr(dna) {
  const raw = String(((dna || {}).voice || {}).address || '');
  const parts = raw.split(/[-–—]/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { toi: parts[0], khach: parts[1] };
  return { toi: 'em', khach: 'anh/chị' };
}
function bannedList(dna) {
  const b = ((dna || {}).voice || {}).banned;
  return Array.isArray(b) ? b.filter(Boolean) : [];
}
/* Cam kết tuân thủ điều cấm thương hiệu ở mức META — TUYỆT ĐỐI không trích nguyên
   văn nội dung bị cấm vào lời khách/ghi chú/hướng xử lý. Lý do: mỗi entry banned
   thường tự chứa đúng cụm hành vi bị cấm (vd "không hứa <hành-vi-cấm>" mang theo cụm
   "<hành-vi-cấm>"); nếu chép thẳng vào output thì chính cụm cấm lại tái xuất hiện và bị
   kiểm tra chuỗi cấm bắt lỗi. Vì vậy chỉ diễn đạt "tuân thủ nguyên tắc truyền thông
   thương hiệu" — an toàn cho MỌI ngành, kể cả khi banned chứa từ nhạy cảm y tế/quảng cáo. */
function complyPhrase(dna) {
  return bannedList(dna).length
    ? 'tư vấn trung thực, bám đúng chính sách và tuân thủ nguyên tắc truyền thông của thương hiệu'
    : 'tư vấn trung thực, đúng chính sách, không cam kết vượt mức thông tin đã công bố';
}
/* Chân dung khách → thiên hướng giới tính (hợp customers.profile). */
function genderBias(dna) {
  const p = String(((dna || {}).customers || {}).profile || '');
  const isNu = /nữ|phụ nữ|chị em|các mẹ|mẹ bỉm|bỉm sữa/i.test(p);
  const isNam = (/(^|[\s,])nam([\s,]|$)|đàn ông|quý ông|các anh|phái mạnh/i.test(p)) && !/nữ/i.test(p);
  if (isNu && !isNam) return 'nu';
  if (isNam && !isNu) return 'nam';
  return 'mix';
}

/* ================= 3. Sản phẩm & nguồn lead ====================== */

function prodName(product, dna) {
  if (product && typeof product === 'object' && product.name) return product.name;
  if (typeof product === 'string' && product.trim()) return product.trim();
  return productFor(0, dna);
}
function productFor(i, dna) {
  const ps = (((dna || {}).products) || []).map(p => p && p.name).filter(Boolean);
  if (!ps.length) return 'sản phẩm chủ lực';
  return ps[idxOf(i) % ps.length];
}

const KENH_LABEL = {
  facebook: 'Facebook', fanpage: 'Facebook', shopee: 'Shopee', tiktok: 'TikTok',
  tiktokshop: 'TikTok Shop', zalo: 'Zalo', instagram: 'Instagram', ig: 'Instagram',
  website: 'Website', web: 'Website', lazada: 'Lazada', youtube: 'YouTube',
  offline: 'Cửa hàng', hotline: 'Hotline', google: 'Google'
};
function kenhLabel(c) {
  const key = String(c).toLowerCase().trim();
  return KENH_LABEL[key] || cap(String(c).trim());
}
/* Danh sách nguồn lead từ kênh trong DNA + "Giới thiệu" (fallback chung). */
function sources(dna) {
  const chans = (((dna || {}).customers || {}).channels) || [];
  const out = [];
  const seen = new Set();
  const add = v => { if (v && !seen.has(v)) { seen.add(v); out.push(v); } };
  chans.forEach(c => add(kenhLabel(c)));
  if (!out.length) { ['Facebook', 'Zalo', 'Website'].forEach(add); }
  add('Giới thiệu'); // kênh truyền miệng luôn có mặt
  return out;
}

/* ================= 4. Kho tên tiếng Việt (thật & đa dạng) ========= */

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng',
  'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Trương', 'Mai', 'Cao', 'Đoàn', 'Tô',
  'Vương', 'Trịnh', 'Lâm', 'Hà', 'Chu', 'Tạ', 'Lương', 'Phùng'];

const DEM_NU = ['Thị', 'Thu', 'Thanh', 'Ngọc', 'Kim', 'Hồng', 'Bích', 'Diệu', 'Phương',
  'Quỳnh', 'Hải', 'Khánh', 'Yến', 'Minh', 'Thúy', 'Xuân', 'Tuyết', 'Lan', 'Mỹ', 'Bảo'];
const TEN_NU = ['Hương', 'Lan', 'Trang', 'Linh', 'Hà', 'Mai', 'Ngọc', 'Thảo', 'Anh',
  'Nhung', 'Yến', 'Hằng', 'Vân', 'Trinh', 'Loan', 'Oanh', 'Dung', 'Thúy', 'Nga', 'Quỳnh',
  'Phượng', 'Uyên', 'Ngân', 'Chi', 'Hạnh', 'Nhi', 'Diệp', 'Tâm', 'Giang', 'Như', 'Vy', 'Thư'];

const DEM_NAM = ['Văn', 'Đức', 'Minh', 'Quốc', 'Hữu', 'Thành', 'Ngọc', 'Tuấn', 'Hải', 'Bá',
  'Xuân', 'Công', 'Đình', 'Trọng', 'Anh', 'Hoàng', 'Việt', 'Gia', 'Đăng', 'Duy', 'Mạnh', 'Bảo'];
const TEN_NAM = ['Tuấn', 'Hùng', 'Dũng', 'Nam', 'Sơn', 'Long', 'Hải', 'Khánh', 'Trung',
  'Phong', 'Đạt', 'Bình', 'Kiên', 'Quân', 'Hoàng', 'Thắng', 'Vinh', 'Huy', 'Cường', 'Tài',
  'Phú', 'Lâm', 'Thịnh', 'Bảo', 'Nghĩa', 'Hiếu', 'Toàn', 'Đức', 'Quang', 'Vũ', 'Khoa', 'Lộc'];

function fullName(i, dna) {
  const bias = genderBias(dna);
  let g = bias;
  if (bias === 'mix') g = (mix(i, 'gender') % 2 === 0) ? 'nu' : 'nam';
  else if (mix(i, 'gender') % 4 === 0) g = (bias === 'nu') ? 'nam' : 'nu'; // ~25% đa dạng
  const ho = pick(HO, i, 'ho');
  const dem = pick(g === 'nu' ? DEM_NU : DEM_NAM, i, 'dem');
  const ten = pick(g === 'nu' ? TEN_NU : TEN_NAM, i, 'ten');
  // ~1/3 dùng tên 2 chữ (bỏ đệm) cho đa dạng: "Lê Hương" vs "Trần Thị Hương"
  if (mix(i, 'style') % 3 === 0) return ho + ' ' + ten;
  return ho + ' ' + dem + ' ' + ten;
}

/* ================= 5. Số điện thoại (hợp lệ & KHÔNG trùng) ======== */
/* Đầu số di động VN hợp lệ (sau quy hoạch 2018): 03/05/07/08/09. */
const PREFIXES = ['032', '033', '034', '035', '036', '037', '038', '039',
  '052', '056', '058', '059', '070', '076', '077', '078', '079',
  '081', '082', '083', '084', '085', '086', '088', '089',
  '090', '091', '092', '093', '094', '096', '097', '098', '099'];
/* 7 số thuê bao = (i·P + Q) mod 10^7, P nguyên tố cùng nhau với 10^7
   ⇒ song ánh theo i ⇒ 7 số cuối KHÁC nhau với mọi i ⇒ SĐT không trùng. */
function phone(i) {
  const sub = ((idxOf(i) * 3986533 + 6853071) % 10000000).toString().padStart(7, '0');
  const full = pick(PREFIXES, i, 'prefix') + sub; // 3 + 7 = 10 số, bắt đầu bằng 0
  return full.slice(0, 4) + ' ' + full.slice(4, 7) + ' ' + full.slice(7); // 09xx xxx xxx
}

/* ================= 6. Phân khúc, thành phố, ghi chú ============== */
/* Phân bổ segment theo i: đa số "mới"/"tiềm năng", ít "VIP"/"đại lý". */
const SEG_CYCLE = ['tiềm năng', 'mới', 'thân thiết', 'mới', 'VIP', 'tiềm năng',
  'mới', 'thân thiết', 'đại lý', 'mới', 'tiềm năng', 'VIP', 'mới', 'thân thiết', 'tiềm năng'];

/* Thành phố theo vùng miền — trải Bắc/Trung/Nam, có thể lọc theo region. */
const CITY = {
  bac: ['Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Bắc Ninh', 'Hải Dương', 'Nam Định',
    'Thái Nguyên', 'Vĩnh Phúc', 'Hưng Yên', 'Bắc Giang', 'Lào Cai'],
  trung: ['Đà Nẵng', 'Huế', 'Vinh', 'Quy Nhơn', 'Nha Trang', 'Buôn Ma Thuột',
    'Pleiku', 'Hà Tĩnh', 'Đồng Hới', 'Tam Kỳ'],
  nam: ['TP.HCM', 'Cần Thơ', 'Biên Hòa', 'Bình Dương', 'Vũng Tàu', 'Long Xuyên',
    'Mỹ Tho', 'Rạch Giá', 'Đà Lạt', 'Tây Ninh', 'Bến Tre', 'Cà Mau']
};
const CITY_ALL = CITY.bac.concat(CITY.trung, CITY.nam);

function unaccent(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
function cityFor(i, dna) {
  const region = unaccent(((dna || {}).company || {}).region || '');
  let pool = CITY_ALL;
  if (region) {
    if (/\bbac\b|mien bac|phia bac|ha noi|hai phong/.test(region)) pool = CITY.bac;
    else if (/mien trung|\btrung\b|da nang|hue|tay nguyen/.test(region)) pool = CITY.trung;
    else if (/mien nam|\bnam\b|ho chi minh|\bhcm\b|sai gon|tphcm|mien tay|dong nai/.test(region)) pool = CITY.nam;
    else {
      // region là 1 tỉnh/thành cụ thể → ưu tiên đúng nơi đó nếu có trong kho
      const hit = CITY_ALL.find(c => unaccent(c) === region || region.indexOf(unaccent(c)) !== -1);
      if (hit) pool = [hit].concat(CITY_ALL);
    }
  }
  return pick(pool, i, 'city');
}

/* Mối quan tâm đặc thù ngành — dùng cho ghi chú CRM & câu hỏi ticket. */
const CONCERN = {
  banle: 'mẫu mã và tồn kho', fnb: 'công dụng và hạn sử dụng',
  thoitrang: 'size và chất vải', mypham: 'thành phần và hợp da không',
  giaoduc: 'lộ trình và học phí', suckhoe: 'cách dùng và đối tượng phù hợp',
  noithat: 'kích thước và chất liệu', bds: 'pháp lý và dòng tiền',
  dichvu: 'quy trình và báo giá', sanxuat: 'số lượng tối thiểu và thời gian giao',
  tmdt: 'phí ship và đổi trả', khac: 'thông tin và giá sản phẩm'
};
function noteFor(i, dna, segment, product) {
  const concern = CONCERN[industryId(dna)] || CONCERN.khac;
  const variants = {
    'mới': [
      'mới inbox hỏi ' + concern + ', chưa chốt',
      'khách mới nhắn hỏi ' + concern,
      'vừa để lại SĐT, quan tâm ' + product + ', cần gọi tư vấn'
    ],
    'tiềm năng': [
      'đang cân nhắc ' + concern + ', hẹn follow lại sau 2-3 ngày',
      'đã xem ' + product + ' nhưng phân vân giá, gửi thêm ưu đãi',
      'quan tâm ' + product + ', chưa quyết, cần chăm thêm'
    ],
    'thân thiết': [
      'đã mua vài lần, hài lòng, hỏi thêm về ' + product,
      'khách quen, thường hỏi ' + concern + ' trước khi mua',
      'mua lại lần 2-3, nhắc chương trình tích điểm'
    ],
    'VIP': [
      'khách VIP, mua định kỳ, ưu tiên chăm sóc và quà tặng',
      'giá trị đơn cao, giữ liên hệ thường xuyên, tặng ưu đãi riêng',
      'đặt đều hàng tháng, chủ động báo khi có ' + product + ' mới'
    ],
    'đại lý': [
      'hỏi chính sách sỉ và chiết khấu ' + product,
      'đại lý tiềm năng, cần gửi bảng giá sỉ + điều khoản công nợ',
      'lấy sỉ định kỳ, theo dõi công nợ đúng hạn'
    ]
  };
  const arr = variants[segment] || variants['mới'];
  return arr[mix(i, 'note') % arr.length];
}

/* ================= 7. customer(i, dna) =========================== */

function customer(i, dna) {
  const idx = idxOf(i);
  const segment = SEG_CYCLE[idx % SEG_CYCLE.length];
  const src = sources(dna);
  const product = productFor(idx, dna);
  return {
    name: fullName(idx, dna),
    phone: phone(idx),
    segment: segment,
    source: src[mix(idx, 'source') % src.length],
    city: cityFor(idx, dna),
    note: noteFor(idx, dna, segment, product)
  };
}

/* ================= 8. leadNote(product, stage, dna) ============== */

function leadNote(product, stage, dna) {
  const p = prodName(product, dna);
  const a = addr(dna);
  const T = a.toi, K = a.khach;
  const camNong = bannedList(dna).length
    ? ' Giữ tư vấn trung thực, tuân thủ đúng nguyên tắc truyền thông của thương hiệu.'
    : '';
  const M = {
    moi: 'Khách vừa để lại thông tin, quan tâm ' + p + '. ' + cap(T) +
      ' gửi lời chào, hỏi rõ nhu cầu của ' + K + ', chưa vội chào giá.',
    am: cap(K) + ' đã tương tác vài lần về ' + p + ', đang so sánh giá và ưu đãi. ' +
      cap(T) + ' gửi thêm bằng chứng khách cũ và tư vấn đúng nhu cầu để hâm nóng.',
    nong: cap(K) + ' hỏi kỹ và có ý định mua ' + p + '. ' + cap(T) +
      ' chốt phương án phù hợp, nhắc ưu đãi có hạn và đề xuất lên đơn ngay.' + camNong,
    chot: 'Đã chốt đơn ' + p + '. ' + cap(T) +
      ' xác nhận thông tin giao hàng, dặn ' + K + ' cách dùng và hẹn chăm sóc sau bán.',
    mat: cap(K) + ' ngừng phản hồi hoặc đã chọn nơi khác. ' + cap(T) +
      ' ghi nhận lý do, gửi một tin giữ liên hệ nhẹ nhàng, không nài ép và hẹn ưu đãi dịp sau.'
  };
  return M[stage] || M.moi;
}

/* ================= 9. ticket(kind, product, dna) ================= */
/* Chi tiết vấn đề theo ngành → lời khách nghe thật, không hardcode trà. */
const ISSUE = {
  banle: { complaint: 'sản phẩm không giống mô tả, bao bì hơi móp', question: 'còn hàng và giao trong bao lâu', ret: 'đổi sang mẫu khác cho hợp nhu cầu' },
  fnb: { complaint: 'lô hàng gần hạn sử dụng, bao bì bị móp', question: 'công dụng và hạn sử dụng thế nào', ret: 'đổi vì khẩu vị chưa hợp' },
  thoitrang: { complaint: 'đường may bị lỗi, size hơi chật so với bảng', question: 'còn size và màu nào, chất vải ra sao', ret: 'đổi size lớn hơn' },
  mypham: { complaint: 'dùng thấy hơi châm nhẹ, chưa hợp da', question: 'thành phần và da nhạy cảm dùng được không', ret: 'đổi sản phẩm phù hợp loại da hơn' },
  giaoduc: { complaint: 'lộ trình học chưa rõ, tiến độ chậm hơn kỳ vọng', question: 'lộ trình, học phí và đầu ra thế nào', ret: 'bảo lưu hoặc đổi khóa phù hợp hơn' },
  suckhoe: { complaint: 'dùng mấy hôm chưa thấy thay đổi rõ', question: 'cách dùng và đối tượng nào phù hợp', ret: 'đổi sản phẩm hợp thể trạng hơn' },
  noithat: { complaint: 'hàng giao bị trầy nhẹ ở cạnh', question: 'kích thước và chất liệu cụ thể ra sao', ret: 'đổi kích thước cho vừa không gian' },
  bds: { complaint: 'thông tin căn chưa khớp lúc tư vấn', question: 'pháp lý, giá và dòng tiền cho thuê thế nào', ret: 'xem căn khác phù hợp ngân sách hơn' },
  dichvu: { complaint: 'nhân viên tới trễ hẹn, kết quả chưa như ý', question: 'quy trình, thời gian và báo giá ra sao', ret: 'đổi lịch hoặc đổi gói dịch vụ khác' },
  sanxuat: { complaint: 'lô hàng có vài sản phẩm lỗi kỹ thuật', question: 'số lượng tối thiểu (MOQ) và thời gian giao', ret: 'đổi lô đạt chuẩn kỹ thuật' },
  tmdt: { complaint: 'đơn giao chậm, đóng gói chưa kỹ', question: 'phí ship và chính sách đổi trả thế nào', ret: 'trả hàng vì không đúng mô tả' },
  khac: { complaint: 'sản phẩm chưa đúng như tư vấn ban đầu', question: 'thông tin chi tiết và giá của sản phẩm', ret: 'đổi sang sản phẩm khác phù hợp hơn' }
};
function ticket(kind, product, dna) {
  const p = prodName(product, dna);
  const a = addr(dna);
  const T = a.toi, K = a.khach;
  const iss = ISSUE[industryId(dna)] || ISSUE.khac;
  const comply = complyPhrase(dna); // tuân thủ điều cấm — diễn đạt META, KHÔNG chép nguyên văn banned

  const M = {
    khieu_nai: {
      content: cap(T) + ' ơi, ' + K + ' nhận ' + p + ' rồi mà ' + iss.complaint +
        ', ' + T + ' xem lại giúp ' + K + ' với.',
      suggestedResolution: 'Xin lỗi ' + K + ' vì trải nghiệm chưa trọn vẹn; ' + T +
        ' xác minh lại đơn và tình trạng ' + p + ', hướng dẫn lại cách dùng đúng và xử lý đổi/bù theo ' +
        'chính sách trong thẩm quyền, đặt kỳ vọng thực tế, ' + comply +
        '; cập nhật tiến độ cho ' + K + '.'
    },
    hoi_dap: {
      content: cap(T) + ' cho ' + K + ' hỏi ' + p + ' ' + iss.question + ' với ạ?',
      suggestedResolution: cap(T) + ' trả lời đúng thông tin đã công bố về ' + p + ' (' + iss.question +
        '), tư vấn theo nhu cầu của ' + K + ', ' + comply + '.'
    },
    doi_tra: {
      content: cap(T) + ' ơi, ' + K + ' muốn ' + iss.ret + ' ' + p + ' được không ạ?',
      suggestedResolution: cap(T) + ' kiểm tra điều kiện đổi trả (còn hạn, còn nguyên tình trạng), ' +
        'xác nhận rồi hỗ trợ ' + K + ' đổi/hoàn theo chính sách; giữ thái độ nhẹ nhàng để giữ khách, ' +
        comply + '.'
    }
  };
  return M[kind] || M.hoi_dap;
}

/* ================= 10. Export =================================== */

module.exports = { customer, leadNote, ticket, sources, productFor };
