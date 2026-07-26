'use strict';
/* ------------------------------------------------------------------
   meeting.js — Cuộc họp chiến lược của Demo Engine (AI COO offline)
   CEO nêu một quyết định/chủ đề → mỗi trưởng phòng nhìn qua LĂNG KÍNH
   RIÊNG (Marketing lo reach/thương hiệu, Tài chính lo dòng tiền/hòa
   vốn, CSKH lo trải nghiệm…) → các góc nhìn MÂU THUẪN nhau hợp lý →
   COO tổng hợp thành 2–3 phương án cho CEO chọn.

   module.exports = {
     perspective(deptId, topic, ctx) → { stance, goc_nhin, ly_le[],
                                         rui_ro[], de_xuat }
     synthesize(topic, perspectives, ctx) → { tom_tat, options[] }
   }
   perspectives (đầu vào synthesize) = [{ deptId, deptName, ...perspective }]
   ctx = { dna, command, deptName? }

   Deterministic: stance & nội dung suy ra từ (chủ đề × vai trò phòng)
   qua hàm ánh xạ cố định — KHÔNG Math.random/Date.now. Mọi nội dung
   nội suy từ ctx.dna, chịu được dna=null / thiếu trường / ngành bất kỳ.
   ------------------------------------------------------------------ */

/* ================= 1. Chuẩn hóa tiếng Việt (bỏ dấu) ============== */

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function hasKw(norm, kw) {
  return new RegExp('(^|[^a-z0-9&])' + escRe(kw) + '($|[^a-z0-9&])').test(norm);
}

function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function lowerFirst(s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); }
function short(s, n) { s = String(s || ''); n = n || 80; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* ================= 2. Trích DNA an toàn ========================== */

const TRAIT_VI = { gan_gui: 'gần gũi', chuyen_gia: 'chuyên gia', tre_trung: 'trẻ trung',
  sang_trong: 'sang trọng', hai_huoc: 'hài hước', chan_thanh: 'chân thành' };

const CHAN_LABEL = { facebook: 'Facebook', shopee: 'Shopee', tiktok: 'TikTok', zalo: 'Zalo OA',
  instagram: 'Instagram', website: 'Website', email: 'Email', youtube: 'YouTube', lazada: 'Lazada' };
function chan(c) { return CHAN_LABEL[String(c || '').toLowerCase()] || cap(String(c || 'kênh chính')); }

const DEPT_NAME = { mkt: 'Marketing', kd: 'Kinh doanh', tckt: 'Tài chính – Kế toán',
  ns: 'Nhân sự', cskh: 'Chăm sóc khách hàng', vh: 'Vận hành', data: 'Dữ liệu' };

/* Gom ngữ cảnh an toàn từ ctx.dna (chịu được dna/ctx null) */
function ctxG(ctx) {
  ctx = ctx || {};
  const dna = ctx.dna || {};
  const co = dna.company || {};
  const company = co.name || 'công ty mình';

  const p0 = (dna.products || [])[0] || {};
  const prod = p0.name || 'sản phẩm chủ lực';
  const priceText = p0.price_range || 'theo bảng giá hiện tại';

  const cu = dna.customers || {};
  const profileShort = (cu.profile || 'khách hàng mục tiêu').split(',')[0].trim() || 'khách mục tiêu';
  const chArr = (cu.channels && cu.channels.length) ? cu.channels : ['facebook'];
  const channel0 = chan(chArr[0]);

  const goalRaw = dna.goal_3m || '';
  const goal = goalRaw ? short(goalRaw, 60) : '';
  const gm = String(goalRaw).match(/([\d.,]+)\s*đơn/);
  const donThang = gm ? (parseInt(gm[1].replace(/[.,]/g, ''), 10) || 300) : 300;

  const vo = dna.voice || {};
  const traits = (vo.traits || []).map(t => TRAIT_VI[t] || String(t).replace(/_/g, ' ')).join(' + ')
    || 'chân thành + rõ ràng';

  return { company, prod, priceText, profileShort, channel0, goal, donThang, traits };
}

function goalRef(g) { return g.goal || (g.donThang + ' đơn/tháng'); }

/* ================= 3. Phân loại chủ đề (archetype) =============== */
/* Chủ đề CEO → 1 trong 8 kịch bản quyết định + 'default'.          */

const ARCH_KWS = {
  cat_giam:   ['cat giam', 'that chat', 'that lung', 'giam chi phi', 'tiet kiem', 'cat bo',
               'toi uu chi phi', 'sa thai', 'cat luong', 'giam nhan su', 'tinh gian', 'giam ngan sach'],
  tang_gia:   ['tang gia', 'nang gia', 'tang gia ban', 'dieu chinh tang gia'],
  giam_gia:   ['giam gia', 'khuyen mai', 'flash sale', 'xa hang', 'ha gia', 'giam sau',
               'uu dai lon', 'san sale'],
  ra_mat:     ['ra mat', 'san pham moi', 'sku moi', 'dong san pham', 'mat hang moi',
               'tung san pham', 'launch', 'ra sku'],
  tuyen_dung: ['tuyen dung', 'tuyen them', 'tuyen nguoi', 'them nhan vien', 'mo rong doi ngu',
               'bo sung nhan su', 'tuyen'],
  dau_tu_cn:  ['cong nghe', 'phan mem', 'tu dong hoa', 'chuyen doi so', 'he thong', 'crm', 'erp',
               'lam app', 'lam website', 'dau tu cong nghe', 'ung dung ai', 'chatbot'],
  kenh_moi:   ['kenh moi', 'tiktok', 'shopee', 'lazada', 'san tmdt', 'xuat khau', 'thi truong moi',
               'mo dai ly', 'ban si', 'phan phoi', 'mo kenh', 'livestream'],
  mo_rong:    ['mo rong', 'mo chi nhanh', 'mo them chi nhanh', 'scale', 'nhan rong', 'mo co so',
               'khai truong', 'mo cua hang', 'mo them cua hang', 'phu song', 'tang quy mo']
};
/* Thứ tự ưu tiên khi nhiều nhóm cùng điểm — nhóm cụ thể đứng trước */
const ARCH_PRIORITY = ['cat_giam', 'tang_gia', 'giam_gia', 'ra_mat', 'tuyen_dung',
  'dau_tu_cn', 'kenh_moi', 'mo_rong'];

function classify(topic) {
  const norm = normalize(topic);
  if (!norm) return 'default';
  let best = 'default', bestScore = 0;
  ARCH_PRIORITY.forEach(a => {
    const score = ARCH_KWS[a].reduce((s, k) => s + (hasKw(norm, k) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = a; } // '>' → giữ nhóm ưu tiên cao khi hòa điểm
  });
  return best;
}

function topicLabel(topic, g) {
  const t = String(topic || '').trim().replace(/\s+/g, ' ');
  if (t) return lowerFirst(short(t, 90));
  if (g.goal) return `hướng đi để đạt mục tiêu "${g.goal}"`;
  return `hướng phát triển sắp tới cho ${g.prod}`;
}

/* ================= 4. Ma trận stance (chủ đề × phòng) ============ */
/* Mỗi phòng phản ứng khác nhau để cuộc họp có tranh luận thật.     */

const STANCE = {
  mo_rong:    { mkt: 'ung_ho',     kd: 'ung_ho',     tckt: 'phan_doi',   ns: 'than_trong', cskh: 'than_trong', vh: 'than_trong', data: 'than_trong' },
  ra_mat:     { mkt: 'ung_ho',     kd: 'ung_ho',     tckt: 'than_trong', ns: 'than_trong', cskh: 'than_trong', vh: 'than_trong', data: 'ung_ho'     },
  tang_gia:   { mkt: 'than_trong', kd: 'phan_doi',   tckt: 'ung_ho',     ns: 'than_trong', cskh: 'phan_doi',   vh: 'than_trong', data: 'than_trong' },
  giam_gia:   { mkt: 'ung_ho',     kd: 'ung_ho',     tckt: 'phan_doi',   ns: 'than_trong', cskh: 'than_trong', vh: 'than_trong', data: 'than_trong' },
  cat_giam:   { mkt: 'phan_doi',   kd: 'phan_doi',   tckt: 'ung_ho',     ns: 'than_trong', cskh: 'than_trong', vh: 'ung_ho',     data: 'ung_ho'     },
  tuyen_dung: { mkt: 'than_trong', kd: 'ung_ho',     tckt: 'phan_doi',   ns: 'ung_ho',     cskh: 'ung_ho',     vh: 'than_trong', data: 'than_trong' },
  dau_tu_cn:  { mkt: 'ung_ho',     kd: 'than_trong', tckt: 'than_trong', ns: 'than_trong', cskh: 'ung_ho',     vh: 'ung_ho',     data: 'ung_ho'     },
  kenh_moi:   { mkt: 'ung_ho',     kd: 'ung_ho',     tckt: 'than_trong', ns: 'than_trong', cskh: 'than_trong', vh: 'than_trong', data: 'ung_ho'     },
  default:    { mkt: 'ung_ho',     kd: 'ung_ho',     tckt: 'than_trong', ns: 'than_trong', cskh: 'than_trong', vh: 'than_trong', data: 'than_trong' }
};
function stanceOf(arch, deptId) {
  const row = STANCE[arch] || STANCE.default;
  return row[deptId] || 'than_trong'; // phòng lạ → góc nhìn liên phòng thận trọng
}

/* ================= 5. Góc nhìn từng phòng (theo lăng kính) ======= */
/* Mỗi builder trả { goc_nhin, ly_le[], rui_ro[], de_xuat } theo     */
/* stance; topicL đã lowercase-đầu để ghép mượt vào "về việc …".     */

const BUILD = {
  /* ---- Marketing: reach, thương hiệu, kênh, tệp khách ---- */
  mkt(g, stance, topicL) {
    return {
      ung_ho: {
        goc_nhin: `Về việc ${topicL}, Marketing ủng hộ ạ. Đây là cơ hội mở rộng độ phủ cho ${g.prod} tới tệp "${g.profileShort}" trên ${g.channel0}. Câu chuyện thương hiệu ${g.company} đang có đà, làm bài bản thì nhận diện sẽ bật lên rõ trong 1–2 tháng.`,
        ly_le: [
          `Tệp "${g.profileShort}" trên ${g.channel0} vẫn còn dư địa, chi phí tiếp cận rẻ hơn khi đối thủ chưa dồn ngân sách vào ${topicL}.`,
          `${cap(topicL)} cho mình chất liệu content mới, tận dụng lượng tương tác sẵn có để kéo reach mà không tốn thêm nhiều.`,
          `Định vị "${g.traits}" là điểm khác biệt để nói to, giúp thông điệp không bị nhầm với đối thủ.`
        ],
        rui_ro: [`Nếu đẩy reach nhanh mà khâu chốt đơn theo không kịp thì chi phí quảng cáo trên mỗi đơn sẽ đội lên.`],
        de_xuat: `Em đề xuất chạy 2 tuần content + ads thử nghiệm quanh ${topicL}, đo reach và tỷ lệ nhắn tin trước khi tăng ngân sách.`
      },
      than_trong: {
        goc_nhin: `Về việc ${topicL}, Marketing ủng hộ về mặt thương hiệu nhưng xin thận trọng ạ. Độ phủ hiện tại của ${g.company} chưa đủ dày để ${topicL} tạo hiệu ứng ngay, em lo ngân sách truyền thông bị dàn mỏng trên quá nhiều đầu việc.`,
        ly_le: [
          `Đẩy ${topicL} cần một khoản ngân sách reach ổn định trong ít nhất 3–4 tuần mới ra tín hiệu, làm nửa vời sẽ phí tiền.`,
          `Thông điệp về ${g.prod} dễ bị loãng nếu chạy song song quá nhiều chiến dịch cùng lúc.`
        ],
        rui_ro: [
          `Reach tăng nhưng tệp "${g.profileShort}" chưa đủ tin để mua ngay, dễ tốn tiền quảng cáo mà đơn về chậm.`,
          `Đối thủ có thể phản ứng bằng khuyến mãi, kéo chi phí tiếp cận lên cao.`
        ],
        de_xuat: `Em đề xuất khoanh vùng 1 kênh chủ lực (${g.channel0}) và 1 tệp khách rõ nhất cho ${topicL}, thay vì trải đều mọi kênh.`
      },
      phan_doi: {
        goc_nhin: `Về việc ${topicL}, thú thật Marketing thấy chưa nên vội ạ. ${cap(topicL)} dễ làm loãng thông điệp thương hiệu ${g.company} và bào mòn ngân sách reach, trong khi đơn về chưa chắc bù lại được chi phí.`,
        ly_le: [
          `Ngân sách marketing đang là nguồn đơn ở đầu phễu; dồn cho ${topicL} sẽ hụt reach cho ${g.prod} đang bán tốt.`,
          `Tệp "${g.profileShort}" cần thời gian được "hâm nóng", ép nhanh sẽ đội chi phí trên mỗi đơn.`
        ],
        rui_ro: [`Mất nhịp truyền thông cho dòng sản phẩm chủ lực, ảnh hưởng doanh số đang ổn định.`],
        de_xuat: `Em đề xuất giữ nguyên trọng tâm hiện tại, chỉ dành một phần nhỏ ngân sách để thăm dò ${topicL}.`
      }
    }[stance];
  },

  /* ---- Kinh doanh: doanh số, chốt đơn, đại lý, đội sale ---- */
  kd(g, stance, topicL) {
    return {
      ung_ho: {
        goc_nhin: `Về việc ${topicL}, Kinh doanh ủng hộ mạnh ạ. Nó mở thêm cửa để đội sale chốt đơn và để em đàm phán với đại lý. Với mục tiêu ${goalRef(g)}, mình cần đúng những cú hích bán hàng như thế này.`,
        ly_le: [
          `Thêm lý do để đội sale gọi lại khách cũ và tiếp cận khách mới quanh ${g.prod}.`,
          `Đại lý/khách sỉ luôn thích cái mới để chào hàng, ${topicL} là cớ tốt để mở rộng điểm bán.`,
          `Nhu cầu của "${g.profileShort}" đang có sẵn, mình chậm thì đối thủ giành mất.`
        ],
        rui_ro: [`Nếu chính sách giá/chiết khấu chưa rõ, đội sale sẽ hứa lung tung với khách và khó thu về sau.`],
        de_xuat: `Em đề xuất chốt ngay khung giá và kịch bản chốt đơn cho ${topicL} để đội sale chạy được trong tuần này.`
      },
      than_trong: {
        goc_nhin: `Về việc ${topicL}, Kinh doanh thấy có cơ hội nhưng xin thận trọng ạ. Đội sale đang tải khá đầy với ${g.prod}; nhận thêm ${topicL} mà thiếu công cụ hỗ trợ thì tỷ lệ chốt sẽ tụt.`,
        ly_le: [
          `Khách "${g.profileShort}" cần được tư vấn kỹ, thêm việc mà thiếu người thì chất lượng chốt đơn giảm.`,
          `Đại lý sẽ hỏi về chính sách bảo hành/đổi trả cho ${topicL}, chưa rõ thì khó cam kết.`
        ],
        rui_ro: [
          `Ôm quá nhiều đầu việc, đội sale bỏ rơi tệp khách đang mang lại doanh số chính.`,
          `Chốt vội mà giao không kịp sẽ sinh khiếu nại, mất uy tín với khách.`
        ],
        de_xuat: `Em đề xuất thử ${topicL} với một nhóm khách thân thiết trước, đủ tin hãy mở rộng ra đại lý.`
      },
      phan_doi: {
        goc_nhin: `Về việc ${topicL}, Kinh doanh thấy chưa nên lúc này ạ. Nó dễ khiến khách so đo, đại lý phản ứng và làm khó khâu chốt đơn cho ${g.prod} đang chạy tốt.`,
        ly_le: [
          `Khách "${g.profileShort}" nhạy cảm với thay đổi, dễ chần chừ khiến chu kỳ chốt đơn kéo dài.`,
          `Đại lý có thể lấy ${topicL} làm cớ để ép lại chính sách, ảnh hưởng biên bán sỉ.`
        ],
        rui_ro: [`Doanh số ngắn hạn của dòng chủ lực bị ảnh hưởng khi khách phân vân.`],
        de_xuat: `Em đề xuất giữ nguyên chính sách bán hiện tại, tập trung nguồn lực chốt cho tệp khách sẵn có.`
      }
    }[stance];
  },

  /* ---- Tài chính – Kế toán: dòng tiền, hòa vốn, biên gộp, ROI ---- */
  tckt(g, stance, topicL) {
    return {
      ung_ho: {
        goc_nhin: `Về việc ${topicL}, Tài chính ủng hộ ạ. Xét trên dòng tiền và biên gộp thì ${topicL} giúp cải thiện sức khỏe tài chính của ${g.company} — đây là hướng bền vững hơn là chạy theo doanh số bằng mọi giá.`,
        ly_le: [
          `${cap(topicL)} tác động thẳng vào biên gộp/dòng tiền, thứ quyết định mình trụ được bao lâu, quan trọng hơn doanh thu ảo.`,
          `Với ${g.donThang} đơn/tháng, chỉ cần cải thiện vài phần trăm biên là quỹ tiền mặt dày lên đáng kể.`
        ],
        rui_ro: [`Nếu làm mạnh tay quá, khách và đội sale có thể phản ứng, cần lộ trình để không gây sốc.`],
        de_xuat: `Em đề xuất áp dụng ${topicL} theo lộ trình, kèm bảng theo dõi dòng tiền hằng tuần để điều chỉnh kịp.`
      },
      than_trong: {
        goc_nhin: `Về việc ${topicL}, Tài chính chưa phản đối nhưng phải nói thẳng bằng con số ạ. Mình cần biết ${topicL} tốn bao nhiêu và bao giờ hòa vốn; hiện chưa có dự toán rõ nên em xin thận trọng.`,
        ly_le: [
          `Mọi khoản chi cho ${topicL} phải quy ra "cần thêm bao nhiêu đơn để hòa vốn" — với giá ${g.priceText} thì con số này không nhỏ.`,
          `Quỹ tiền mặt cần đủ đệm cho 2–3 tháng vận hành; ${topicL} không được ăn vào phần đệm đó.`
        ],
        rui_ro: [
          `Chi trước – thu sau kéo dài làm âm dòng tiền dù trên sổ vẫn có lãi.`,
          `Chi phí phát sinh ngoài dự toán (vận chuyển, đổi trả, hoa hồng) dễ bị bỏ sót.`
        ],
        de_xuat: `Em đề xuất lập dự toán 3 kịch bản (tiết kiệm/chuẩn/đẩy mạnh) và điểm hòa vốn cho ${topicL} trước khi duyệt chi.`
      },
      phan_doi: {
        goc_nhin: `Về việc ${topicL}, Tài chính xin phản đối ở thời điểm này ạ. Dòng tiền hiện chưa đủ khỏe để gánh chi phí của ${topicL}; đẩy mạnh bây giờ rủi ro âm quỹ trước khi kịp hòa vốn.`,
        ly_le: [
          `${cap(topicL)} là khoản chi lớn, trong khi ${g.prod} chưa tạo đủ dòng tiền đều để tái đầu tư an toàn.`,
          `Điểm hòa vốn ước tính cần thêm nhiều đơn hơn năng lực bán hiện tại (${g.donThang} đơn/tháng) mới bù được.`
        ],
        rui_ro: [`Âm dòng tiền buộc phải vay nóng hoặc cắt giảm gấp, tổn hại cả bộ máy.`],
        de_xuat: `Em đề xuất hoãn hoặc thu nhỏ quy mô ${topicL} cho tới khi quỹ tiền mặt có đệm an toàn 2–3 tháng.`
      }
    }[stance];
  },

  /* ---- Nhân sự: nguồn lực, đội ngũ, tải công việc, đào tạo ---- */
  ns(g, stance, topicL) {
    return {
      ung_ho: {
        goc_nhin: `Về việc ${topicL}, Nhân sự ủng hộ ạ. Đội ngũ đang quá tải ở vài khâu, ${topicL} đúng lúc sẽ giúp giải phóng áp lực và giữ chân người giỏi cho ${g.company}.`,
        ly_le: [
          `${cap(topicL)} giúp phân bổ lại công việc hợp lý hơn, giảm nguy cơ nhân sự nghỉ vì kiệt sức.`,
          `Có thêm nguồn lực/công cụ thì mới đỡ được đà tăng trưởng theo mục tiêu ${goalRef(g)}.`
        ],
        rui_ro: [`Tuyển và đào tạo cần thời gian, người mới chưa thể quen việc ngay.`],
        de_xuat: `Em đề xuất chuẩn hóa mô tả công việc và lộ trình đào tạo 5 ngày trước khi ${topicL}, để người mới vào là chạy được.`
      },
      than_trong: {
        goc_nhin: `Về việc ${topicL}, Nhân sự thấy cần cân nhắc nguồn lực ạ. Với quy mô đội hiện tại của ${g.company}, ${topicL} sẽ dồn thêm việc lên vài đầu mối vốn đã kín lịch.`,
        ly_le: [
          `${cap(topicL)} phát sinh đầu việc mới nhưng chưa rõ ai gánh, dễ chồng chéo trách nhiệm.`,
          `Đào tạo và onboarding cho phần việc mới cần thời gian, không thể có kết quả ngay.`
        ],
        rui_ro: [`Quá tải kéo dài làm giảm chất lượng và tăng nguy cơ nghỉ việc ở khâu xương sống.`],
        de_xuat: `Em đề xuất rà lại tải công việc từng vị trí và phân vai rõ cho ${topicL} trước khi bấm nút.`
      },
      phan_doi: {
        goc_nhin: `Về việc ${topicL}, Nhân sự thấy chưa nên lúc này ạ. Đội ngũ đang mỏng và căng, thêm ${topicL} mà không bổ sung người thì rủi ro vỡ trận vận hành rất cao.`,
        ly_le: [
          `Không đủ người cho ${topicL} sẽ buộc nhân sự chủ lực ôm việc, ảnh hưởng cả phần đang chạy tốt.`,
          `Tuyển gấp thường ra chất lượng thấp, tốn chi phí đào tạo mà chưa chắc trụ lại.`
        ],
        rui_ro: [`Mất người giỏi vì quá tải — thiệt hại lớn hơn nhiều lợi ích ngắn hạn của ${topicL}.`],
        de_xuat: `Em đề xuất củng cố và ổn định đội hình hiện tại trước, lùi ${topicL} tới khi đủ người.`
      }
    }[stance];
  },

  /* ---- CSKH: trải nghiệm, khiếu nại, giữ khách, hài lòng ---- */
  cskh(g, stance, topicL) {
    return {
      ung_ho: {
        goc_nhin: `Về việc ${topicL}, CSKH ủng hộ ạ. Nếu làm đúng, ${topicL} sẽ nâng trải nghiệm của khách "${g.profileShort}" và cho tụi em thêm công cụ để giữ chân khách cũ của ${g.company}.`,
        ly_le: [
          `${cap(topicL)} tạo thêm điểm chạm chăm sóc, giúp khách cảm thấy được quan tâm hơn.`,
          `Khách hài lòng sẽ mua lại và giới thiệu, giảm chi phí tìm khách mới cho ${g.prod}.`
        ],
        rui_ro: [`Lượng hỏi/đơn tăng đột ngột có thể làm chậm thời gian phản hồi nếu chưa chuẩn bị kịch bản.`],
        de_xuat: `Em đề xuất soạn sẵn bộ FAQ và kịch bản trả lời cho ${topicL} trước khi triển khai, để khách hỏi là có câu trả lời ngay.`
      },
      than_trong: {
        goc_nhin: `Về việc ${topicL}, CSKH ủng hộ tinh thần nhưng lo phần trải nghiệm ạ. Mỗi thay đổi đều kéo theo một loạt câu hỏi và thắc mắc từ khách "${g.profileShort}", tụi em cần được chuẩn bị trước.`,
        ly_le: [
          `Khách sẽ hỏi dồn về ${topicL}; thiếu kịch bản thống nhất thì mỗi bạn trả lời một kiểu, dễ sai thông tin.`,
          `Nếu ${topicL} làm thay đổi cam kết với khách, phải rà lại chính sách đổi trả/bảo hành cho khớp.`
        ],
        rui_ro: [
          `Phản hồi chậm hoặc thiếu nhất quán làm khách khó chịu, sinh đánh giá xấu công khai.`,
          `Khách cũ cảm thấy bị ảnh hưởng quyền lợi sẽ quay lưng.`
        ],
        de_xuat: `Em đề xuất CSKH được tham gia sớm để chuẩn bị kịch bản và cảnh báo trước các tình huống khiếu nại của ${topicL}.`
      },
      phan_doi: {
        goc_nhin: `Về việc ${topicL}, CSKH thật lòng thấy chưa nên ạ. Thay đổi này dễ khiến khách "${g.profileShort}" cảm thấy thiệt và làm tăng khiếu nại, ảnh hưởng lòng tin đã gây dựng của ${g.company}.`,
        ly_le: [
          `${cap(topicL)} chạm vào kỳ vọng của khách cũ; họ nhạy cảm và dễ phản ứng tiêu cực.`,
          `Chi phí giữ một khách cũ rẻ hơn nhiều so với tìm khách mới, đừng đánh đổi vì cái lợi trước mắt.`
        ],
        rui_ro: [`Làn sóng đánh giá 1 sao/bình luận tiêu cực lan trên ${g.channel0}, kéo tụt cả nỗ lực marketing.`],
        de_xuat: `Em đề xuất giữ nguyên cam kết với khách hiện tại; nếu vẫn làm ${topicL} thì phải có chính sách bù đắp rõ ràng.`
      }
    }[stance];
  },

  /* ---- Vận hành: quy trình, pháp lý, tồn kho, giao nhận ---- */
  vh(g, stance, topicL) {
    return {
      ung_ho: {
        goc_nhin: `Về việc ${topicL}, Vận hành ủng hộ ạ. Đây là dịp để chuẩn hóa lại quy trình của ${g.company}, giảm thao tác thủ công và bớt sai sót ở khâu giao – nhận.`,
        ly_le: [
          `${cap(topicL)} giúp gom đầu mối, dựng SOP rõ ràng để nhân viên mới đọc là làm được.`,
          `Quy trình gọn thì chi phí ẩn (sai sót, làm lại, chậm giao) giảm theo, lợi cho cả ${g.prod}.`
        ],
        rui_ro: [`Giai đoạn chuyển đổi quy trình có thể gây xáo trộn ngắn hạn, cần chạy song song để không đứt gãy.`],
        de_xuat: `Em đề xuất viết SOP và checklist cho ${topicL}, chạy thử 1 tuần song song với cách cũ trước khi thay hẳn.`
      },
      than_trong: {
        goc_nhin: `Về việc ${topicL}, Vận hành thấy cần chuẩn bị kỹ về quy trình và pháp lý ạ. Khâu vận hành cho ${g.prod} còn nhiều chỗ làm thủ công, thêm ${topicL} mà chưa có quy trình sẽ dễ nghẽn.`,
        ly_le: [
          `${cap(topicL)} cần rõ ai làm bước nào, tồn kho/giao hàng chuẩn bị ra sao — thiếu là tắc ngay.`,
          `Nếu liên quan hợp đồng, điều khoản hay sàn TMĐT, phải rà pháp lý trước để tránh rủi ro về sau.`
        ],
        rui_ro: [
          `Đơn tăng mà kho/giao không theo kịp sẽ giao chậm, sinh khiếu nại dây chuyền.`,
          `Bỏ sót điều khoản pháp lý/thuế của ${topicL} có thể bị phạt hoặc tranh chấp.`
        ],
        de_xuat: `Em đề xuất dựng quy trình và checklist pháp lý cho ${topicL}, xác định rõ người chịu trách nhiệm từng bước trước khi chạy.`
      },
      phan_doi: {
        goc_nhin: `Về việc ${topicL}, Vận hành thấy chưa nên vội ạ. Nền quy trình hiện tại chưa đủ vững để gánh ${topicL}; ép chạy bây giờ rủi ro đứt gãy ở khâu giao – nhận và pháp lý.`,
        ly_le: [
          `${cap(topicL)} thêm nhiều biến số vận hành trong khi cái nền còn thủ công, dễ vỡ khi có sự cố.`,
          `Rủi ro pháp lý/tuân thủ chưa được rà kỹ, làm liều dễ thành gánh nặng về sau.`
        ],
        rui_ro: [`Sự cố vận hành làm hỏng trải nghiệm khách và kéo lùi cả các phòng khác.`],
        de_xuat: `Em đề xuất chuẩn hóa và ổn định quy trình lõi trước, chỉ mở ${topicL} khi nền vận hành đủ chắc.`
      }
    }[stance];
  },

  /* ---- Dữ liệu: đo lường, KPI, test, ra quyết định bằng số ---- */
  data(g, stance, topicL) {
    return {
      ung_ho: {
        goc_nhin: `Về việc ${topicL}, phòng Dữ liệu ủng hộ ạ, với điều kiện gắn đo lường từ đầu. ${cap(topicL)} là cơ hội tốt để chạy thử có kiểm soát và để số liệu tự nói mình nên đi tiếp hay dừng.`,
        ly_le: [
          `${cap(topicL)} có thể thiết kế thành phép thử A/B rõ ràng, đo được chi phí trên mỗi đơn của ${g.prod}.`,
          `Có dữ liệu sạch thì các phòng bớt tranh luận cảm tính, quyết định nhanh và đúng hơn.`
        ],
        rui_ro: [`Nếu không cài tracking trước khi chạy, sau này không tách được đâu là hiệu quả thật của ${topicL}.`],
        de_xuat: `Em đề xuất định nghĩa trước 3 chỉ số thành/bại và cài tracking cho ${topicL} trước khi bấm nút chạy.`
      },
      than_trong: {
        goc_nhin: `Về việc ${topicL}, phòng Dữ liệu xin thận trọng ạ. Hiện mình chưa có đủ số liệu nền để khẳng định ${topicL} sẽ hiệu quả; em không muốn quyết định lớn dựa trên cảm tính.`,
        ly_le: [
          `Chưa có baseline (chi phí/đơn, tỷ lệ chốt hiện tại) thì không biết ${topicL} là tiến hay lùi.`,
          `Dữ liệu về "${g.profileShort}" còn mỏng, dự báo nhu cầu cho ${topicL} dễ sai lệch.`
        ],
        rui_ro: [`Ra quyết định lớn khi thiếu dữ liệu dễ đổ tiền vào hướng sai mà không kịp nhận ra.`],
        de_xuat: `Em đề xuất chạy một phép thử nhỏ có đo lường 2–3 tuần lấy dữ liệu, rồi mới quyết chuyện ${topicL}.`
      },
      phan_doi: {
        goc_nhin: `Về việc ${topicL}, phòng Dữ liệu thấy chưa đủ căn cứ để làm lúc này ạ. Các con số hiện có không ủng hộ ${topicL}; làm khi tín hiệu còn yếu là rủi ro không cần thiết.`,
        ly_le: [
          `Số liệu về nhu cầu và tỷ lệ chuyển đổi chưa cho thấy ${topicL} sẽ có lời.`,
          `Nguồn lực phân tích nên dồn tối ưu cái đang chạy tốt, thay vì mở thêm biến số khó đo.`
        ],
        rui_ro: [`Quyết định ngược tín hiệu dữ liệu, nếu sai sẽ khó rút lui và tốn chi phí chìm.`],
        de_xuat: `Em đề xuất khoan ${topicL}, tập trung phân tích tối ưu phễu hiện tại để lấy thêm hiệu quả chắc chắn.`
      }
    }[stance];
  },

  /* ---- Mặc định: phòng lạ → góc nhìn liên phòng ---- */
  default(g, stance, topicL) {
    return {
      ung_ho: {
        goc_nhin: `Về việc ${topicL}, phòng em ủng hộ ạ. Xét trong phạm vi phụ trách, ${topicL} phù hợp với hướng đi của ${g.company} và mục tiêu ${goalRef(g)} sắp tới.`,
        ly_le: [
          `${cap(topicL)} tạo thêm giá trị rõ ràng cho ${g.prod} và tệp khách "${g.profileShort}".`,
          `Đây là thời điểm hợp lý để tận dụng đà hiện có của ${g.company}.`
        ],
        rui_ro: [`Cần phối hợp chặt giữa các phòng, tránh mỗi nơi làm một kiểu.`],
        de_xuat: `Em đề xuất triển khai ${topicL} có phân vai và mốc kiểm tra rõ ràng.`
      },
      than_trong: {
        goc_nhin: `Về việc ${topicL}, phòng em xin nêu góc nhìn thận trọng ạ. ${cap(topicL)} có cơ hội nhưng cũng nhiều biến số, nên làm từng bước và có kiểm chứng.`,
        ly_le: [
          `Cần làm rõ nguồn lực và trách nhiệm cho ${topicL} trước khi chạy diện rộng.`,
          `Nên thử ở quy mô nhỏ với ${g.prod} để rút kinh nghiệm trước.`
        ],
        rui_ro: [`Triển khai vội khi chưa rõ đầu việc dễ chồng chéo và phát sinh chi phí.`],
        de_xuat: `Em đề xuất thử nghiệm ${topicL} ở quy mô nhỏ, đo kết quả rồi mới nhân rộng.`
      },
      phan_doi: {
        goc_nhin: `Về việc ${topicL}, phòng em thấy chưa nên lúc này ạ. Trong phạm vi phụ trách, ${topicL} mang lại nhiều rủi ro hơn lợi ích ở thời điểm hiện tại của ${g.company}.`,
        ly_le: [
          `Nguồn lực và điều kiện hiện chưa sẵn sàng cho ${topicL}.`,
          `Nên củng cố phần đang chạy tốt của ${g.prod} trước.`
        ],
        rui_ro: [`Làm khi chưa sẵn sàng dễ ảnh hưởng tới hoạt động đang ổn định.`],
        de_xuat: `Em đề xuất tạm hoãn ${topicL}, ưu tiên ổn định trước.`
      }
    }[stance];
  }
};

/* ================= 6. perspective(deptId, topic, ctx) =========== */

function perspective(deptId, topic, ctx) {
  const g = ctxG(ctx);
  const arch = classify(topic);
  const topicL = topicLabel(topic, g);
  const stance = stanceOf(arch, deptId);
  const build = BUILD[deptId] || BUILD.default;
  const body = build(g, stance, topicL, arch);
  return {
    stance,
    goc_nhin: body.goc_nhin,
    ly_le: body.ly_le,
    rui_ro: body.rui_ro,
    de_xuat: body.de_xuat
  };
}

/* ================= 7. synthesize(topic, perspectives, ctx) ====== */

function synthesize(topic, perspectives, ctx) {
  const g = ctxG(ctx);
  const topicL = topicLabel(topic, g);
  const ps = Array.isArray(perspectives) ? perspectives.filter(Boolean) : [];

  const nameOf = p => p.deptName || DEPT_NAME[p.deptId] || 'một phòng';
  const idOf = p => p.deptId;

  const ung = ps.filter(p => p.stance === 'ung_ho');
  const than = ps.filter(p => p.stance === 'than_trong');
  const phan = ps.filter(p => p.stance === 'phan_doi');
  const ungIds = ung.map(idOf), thanIds = than.map(idOf), phanIds = phan.map(idOf);
  const hasDept = id => ps.some(p => p.deptId === id);

  /* Điểm nóng nhất = mối lo của phòng KHÔNG ủng hộ, theo thứ tự ưu tiên */
  const worried = id => ps.some(p => p.deptId === id && p.stance !== 'ung_ho');
  let diemNong;
  if (worried('tckt')) diemNong = 'cân đối dòng tiền và điểm hòa vốn';
  else if (worried('vh') || worried('ns')) diemNong = 'năng lực vận hành và nhân sự';
  else if (worried('cskh')) diemNong = 'giữ trải nghiệm và lòng tin của khách';
  else if (worried('data')) diemNong = 'thiếu dữ liệu để chắc tay';
  else diemNong = 'tốc độ và cách triển khai';

  const listNames = arr => arr.map(nameOf).join(', ');
  const soPhuong = ps.length <= 2 ? 2 : 3;

  /* ---- tom_tat ---- */
  const parts = [`Em đã họp nhanh với ${ps.length} trưởng phòng về việc "${topicL}".`];
  const cnt = [];
  if (ung.length) cnt.push(`${ung.length} phòng ủng hộ (${listNames(ung)})`);
  if (than.length) cnt.push(`${than.length} phòng thận trọng (${listNames(than)})`);
  if (phan.length) cnt.push(`${phan.length} phòng chưa đồng tình (${listNames(phan)})`);
  if (cnt.length) parts.push('Kết quả: ' + cnt.join('; ') + '.');
  parts.push(`Điểm cần cân nhắc nhất là ${diemNong}. Em xin trình sếp ${soPhuong} phương án để sếp quyết ạ.`);
  const tom_tat = parts.join(' ');

  /* ---- options: A đẩy nhanh · B theo giai đoạn · C tập trung ngách ---- */
  const optA = {
    key: 'A',
    label: 'Đẩy mạnh toàn lực',
    mo_ta: `Dồn nguồn lực làm ${topicL} nhanh và dứt khoát: mở rộng ngân sách, chạy đồng loạt trên ${g.channel0} và các kênh chính để chiếm cơ hội trước đối thủ.`,
    uu_diem: `Bắt sóng thị trường sớm, tạo đà mạnh cho ${g.prod} và tiến nhanh tới mục tiêu ${goalRef(g)}.`,
    nhuoc_diem: `Áp lực lớn lên dòng tiền, vận hành và chăm sóc khách; nếu sai thì chi phí chìm cao và khó rút lui.`,
    phong_ung_ho: ungIds.length ? ungIds : thanIds.slice(0, 1)
  };
  const optB = {
    key: 'B',
    label: 'Thử nghiệm theo giai đoạn',
    mo_ta: `Làm ${topicL} theo lộ trình: chạy thử quy mô nhỏ có đo lường 2–3 tuần trên một tệp/kênh rõ nhất, đạt KPI thì mới mở rộng dần.`,
    uu_diem: `Kiểm soát được rủi ro và chi phí, có dữ liệu thật để quyết định, các phòng kịp chuẩn bị quy trình và kịch bản.`,
    nhuoc_diem: `Tốc độ chậm hơn phương án A, có thể mất một phần cơ hội sớm nếu đối thủ nhanh chân.`,
    phong_ung_ho: thanIds.length ? thanIds : (hasDept('data') ? ['data'] : ungIds.slice(0, 1))
  };
  const optC = {
    key: 'C',
    label: phan.length ? 'Tập trung ngách, giữ nguồn lực' : 'Tập trung ngách',
    mo_ta: `Chưa vội với ${topicL}; thay vào đó khai thác sâu tệp khách "${g.profileShort}" và ${g.prod} đang chạy tốt, củng cố dòng tiền và đội ngũ trước.`,
    uu_diem: `An toàn nhất về dòng tiền và chất lượng dịch vụ, giữ vững phần doanh số đang ổn định của ${g.company}.`,
    nhuoc_diem: `Tăng trưởng chậm, dễ bỏ lỡ cơ hội và bị đối thủ vượt lên ở ${topicL}.`,
    phong_ung_ho: phanIds.length ? phanIds : (hasDept('tckt') ? ['tckt'] : [])
  };

  const options = soPhuong === 2 ? [optA, optB] : [optA, optB, optC];
  return { tom_tat, options };
}

module.exports = { perspective, synthesize };
