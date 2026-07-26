'use strict';
/* ------------------------------------------------------------------
   note-content.js — Nội dung "Bộ não thứ 2" cho Demo Engine.
   - seedNotes(dna): bộ note khởi tạo LIÊN KẾT nhau lúc khai trương công ty.
   - captureNote(mission, info, dna): chưng cất 1 note tri thức từ nhiệm vụ xong.
   Deterministic hoàn toàn (không Math.random/Date.now); chịu dna=null; đa ngành.
   ------------------------------------------------------------------ */

const INDUSTRY_LABEL = {
  fnb: 'F&B / đồ ăn thức uống', banle: 'bán lẻ', tmdt: 'thương mại điện tử', giaoduc: 'giáo dục',
  suckhoe: 'sức khoẻ - làm đẹp', congnghe: 'công nghệ - phần mềm', dichvu: 'dịch vụ', thoitrang: 'thời trang',
  noithat: 'nội thất', dulich: 'du lịch', batdongsan: 'bất động sản', khac: 'kinh doanh'
};
const POSITION_HINT = {
  fnb: 'Chất lượng nguyên liệu + câu chuyện thương hiệu quan trọng hơn giá rẻ.',
  suckhoe: 'Niềm tin & bằng chứng (review, chứng nhận) là đòn bẩy chuyển đổi lớn nhất.',
  thoitrang: 'Hình ảnh & xu hướng dẫn dắt; tốc độ ra mẫu quyết định lợi thế.',
  congnghe: 'Giải quyết đúng nỗi đau + onboarding mượt giữ chân khách hơn tính năng.',
  giaoduc: 'Kết quả học viên (case study) thuyết phục hơn mọi lời quảng cáo.',
  default: 'Định vị rõ ràng + nhất quán trải nghiệm là nền tảng cạnh tranh bền.'
};

const S = s => String(s || '').trim();
const firstName = full => S(full).split(/\s+/).slice(-1)[0] || 'công ty';

function products(dna) {
  const ps = (dna && dna.products) || [];
  return ps.filter(p => p && p.name).slice(0, 5).map(p => ({ name: S(p.name).replace(/[<>\[\]]/g, ''), price: S(p.price_range) }));
}

/* ============ SEED: bộ note khởi tạo liên kết nhau ============ */
function seedNotes(dna) {
  const co = (dna && dna.company) || {};
  const name = S(co.name) || 'Công ty';
  const ind = INDUSTRY_LABEL[co.industry] || INDUSTRY_LABEL.khac;
  const prods = products(dna);
  const cust = (dna && dna.customers) || {};
  const voice = (dna && dna.voice) || {};
  const goal = S(dna && dna.goal_3m);
  const notes = [];

  const NAME_KHACH = 'Khách hàng mục tiêu';
  const NAME_VOICE = 'Giọng thương hiệu';
  const NAME_GOAL = 'Mục tiêu 3 tháng';
  const NAME_DINHVI = 'Đối thủ & định vị';
  const NAME_CONTENT = 'Cẩm nang nội dung';

  // 1) Hub công ty
  notes.push({
    title: name, type: 'concept', tags: ['cong-ty', 'tong-quan'], source: 'seed:hub',
    body: `**${name}** — doanh nghiệp ${ind}${S(co.region) ? ', khu vực ' + S(co.region) : ''}.\n\n`
      + `## Sản phẩm chính\n${prods.length ? prods.map(p => `- [[${p.name}]]${p.price ? ' — ' + p.price : ''}`).join('\n') : '- (chưa khai báo)'}\n\n`
      + `## Nền tảng\n- Đối tượng: [[${NAME_KHACH}]]\n- Cách nói chuyện: [[${NAME_VOICE}]]\n- Đích đến: [[${NAME_GOAL}]]\n- Cạnh tranh: [[${NAME_DINHVI}]]\n\n`
      + `> Đây là note gốc của bộ não công ty. Mọi tri thức mới nên liên kết về đây hoặc về các note nền tảng.`
  });

  // 2) Mỗi sản phẩm 1 note
  for (const p of prods) {
    notes.push({
      title: p.name, type: 'concept', tags: ['san-pham'], source: 'seed:prod:' + p.name,
      body: `Sản phẩm của [[${name}]].\n\n- **Giá:** ${p.price || 'chưa đặt'}\n- **Dành cho:** [[${NAME_KHACH}]]\n`
        + `- **Thông điệp:** bám [[${NAME_VOICE}]], làm nổi lợi ích thật sự cho khách.\n\n`
        + `_Ghi chú mở rộng: thêm USP, phản hồi khách, mẫu nội dung bán chạy vào đây theo thời gian._`
    });
  }

  // 3) Khách hàng mục tiêu
  notes.push({
    title: NAME_KHACH, type: 'insight', tags: ['khach-hang', 'nen-tang'], source: 'seed:khach',
    body: `**Chân dung:** ${S(cust.profile) || '(chưa mô tả)'}\n\n`
      + `**Kênh tiếp cận:** ${(cust.channels || []).join(', ') || '(chưa chọn)'}\n\n`
      + `Hiểu đúng khách là gốc của mọi quyết định ở [[${name}]]. Cập nhật insight mới (câu hỏi hay gặp, lý do mua, lý do từ chối) vào đây.`
  });

  // 4) Giọng thương hiệu
  notes.push({
    title: NAME_VOICE, type: 'sop', tags: ['thuong-hieu', 'nen-tang', 'noi-dung'], source: 'seed:voice',
    body: `**Tính cách:** ${(voice.traits || []).join(', ') || '(chưa chọn)'}\n`
      + `**Xưng hô:** ${S(voice.address) || 'em — anh/chị'}\n\n`
      + `**KHÔNG được nói:**\n${(voice.banned || []).map(b => '- ' + S(b)).join('\n') || '- (chưa đặt)'}\n\n`
      + `Áp dụng cho mọi nội dung của [[${name}]]. Xem thêm [[${NAME_CONTENT}]].`
  });

  // 5) Mục tiêu 3 tháng
  notes.push({
    title: NAME_GOAL, type: 'decision', tags: ['muc-tieu', 'chien-luoc'], source: 'seed:goal',
    body: `Mục tiêu 3 tháng của [[${name}]]:\n\n> ${goal || '(chưa đặt mục tiêu)'}\n\nMọi nhiệm vụ nên hướng về đây. Sau mỗi nhiệm vụ, công ty tự ghi lại bài học thành note liên kết về đây.`
  });

  // 6) Đối thủ & định vị
  notes.push({
    title: NAME_DINHVI, type: 'competitor', tags: ['canh-tranh', 'chien-luoc'], source: 'seed:dinhvi',
    body: `Nguyên tắc định vị ngành ${ind}:\n\n> ${POSITION_HINT[co.industry] || POSITION_HINT.default}\n\n`
      + `Ghi lại từng đối thủ (giá, điểm mạnh/yếu, nước đi) thành note riêng và liên kết về đây, để [[${name}]] phản ứng nhanh.`
  });

  // 7) Cẩm nang nội dung (playbook khởi đầu)
  notes.push({
    title: NAME_CONTENT, type: 'playbook', tags: ['noi-dung', 'marketing'], source: 'seed:content',
    body: `Khung viết nội dung cho [[${name}]]:\n\n1. Mở bằng nỗi đau/insight của [[${NAME_KHACH}]].\n2. Nêu lợi ích sản phẩm (vd [[${prods[0] ? prods[0].name : NAME_GOAL}]]) — cụ thể, có bằng chứng.\n3. Giữ đúng [[${NAME_VOICE}]], tránh từ cấm.\n4. Kết bằng 1 lời kêu gọi hành động rõ ràng.\n\n_Bổ sung mẫu bài chạy tốt vào đây để tái sử dụng._`
  });

  return notes;
}

/* ============ CAPTURE: chưng cất note từ 1 nhiệm vụ hoàn thành ============ */
/* info: { command, title, depts:[tên phòng], products:[tên sp], score } */
function captureNote(mission, info, dna) {
  const co = (dna && dna.company) || {};
  const name = S(co.name) || 'Công ty';
  const cmd = S(info && info.command) || S(mission && mission.ceo_command) || S(mission && mission.title);
  const depts = (info && info.depts) || [];
  const prods = (info && info.products) || [];
  const title = ('Bài học: ' + (S(mission && mission.title) || cmd)).slice(0, 120);

  // chỉ nối [[thực thể]] có note thật (công ty + sản phẩm) — KHÔNG nối tên phòng ban (tránh node ma rác)
  const ents = [name, ...prods].filter(Boolean);
  const body =
    `Đúc kết từ nhiệm vụ **${S(mission && mission.title) || cmd}** của [[${name}]].\n\n`
    + `## Đã làm\n${cmd}\n\n`
    + (depts.length ? `## Phòng tham gia\n${depts.map(d => '- ' + d).join('\n')}\n\n` : '')
    + (prods.length ? `## Liên quan sản phẩm\n${prods.map(p => `- [[${p}]]`).join('\n')}\n\n` : '')
    + `## Bài học rút ra\n- Quy trình chạy trơn khi brief rõ ràng và bám [[Giọng thương hiệu]].\n`
    + `- Lần sau tái dùng cách làm này cho nhiệm vụ tương tự để tiết kiệm vòng lặp.\n\n`
    + `_Liên kết note này với các note liên quan để bộ não công ty ngày càng dày._`;

  return { title, body, tags: ['bai-hoc', 'retro', ...depts.map(d => d.toLowerCase().replace(/[^a-z0-9]+/g, '-')).filter(Boolean)].slice(0, 8), type: 'retro', entities: ents };
}

module.exports = { seedNotes, captureNote };
