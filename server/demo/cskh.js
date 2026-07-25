'use strict';
/*
 * Phòng Chăm sóc khách hàng (dept_id 'cskh') — module nội dung cho DemoEngine.
 * outputs/reviews cho: tp_cs (trưởng phòng), nv_script, nv_faq (+ default bắt buộc).
 * Toàn bộ nội dung nội suy từ ctx.dna (12 ngành) — không hardcode ngành cụ thể.
 */

/* ---------------- Đọc DNA an toàn (fallback khi null/thiếu trường) ---------------- */
function dnaOf(ctx) { return (ctx && ctx.dna) || {}; }
function companyName(ctx) { const d = dnaOf(ctx); return (d.company && d.company.name) || 'công ty'; }
function industryOf(ctx) { const d = dnaOf(ctx); return (d.company && d.company.industry) || 'khac'; }
function productOf(ctx) {
  const p = (dnaOf(ctx).products || [])[0] || {};
  return { name: p.name || 'sản phẩm chủ lực', price: p.price_range || 'theo báo giá hiện hành' };
}
function customerOf(ctx) { const d = dnaOf(ctx); return (d.customers && d.customers.profile) || 'khách hàng mục tiêu của công ty'; }
function channelsOf(ctx) {
  const d = dnaOf(ctx); const c = (d.customers && d.customers.channels) || [];
  return c.length ? c.join(' / ') : 'kênh bán chính';
}
function xungHo(ctx) {
  const raw = String((dnaOf(ctx).voice && dnaOf(ctx).voice.address) || '');
  const parts = raw.split(/[-–—]/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { toi: parts[0], khach: parts[1] };
  return { toi: 'em', khach: 'anh/chị' };
}
function bannedLine(ctx) {
  const b = (dnaOf(ctx).voice && dnaOf(ctx).voice.banned) || [];
  return b.length ? b.join('; ') : 'không cam kết vượt quá chính sách đã công bố';
}
function goalOf(ctx) { return dnaOf(ctx).goal_3m || 'mục tiêu kinh doanh quý này'; }
function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtOf(brief) { return (brief && brief.format_dau_ra) || 'docx'; }
function roundOf(ctx) { return (ctx && ctx.round) || 0; }
function fixHeader(ctx) { const r = roundOf(ctx); return r > 0 ? `_(Bản sửa vòng ${r} — đã xử lý toàn bộ nhận xét)_\n\n` : ''; }
function titleOf(ctx, fallback) { return (ctx && ctx.task && ctx.task.title) || fallback; }

/* Ngưỡng freeship suy từ giá thấp nhất trong price_range (1,5× giá, làm tròn 50k). */
function freeshipNguong(ctx) {
  const m = String(productOf(ctx).price).match(/(\d[\d.,]*)\s*(k|nghìn|ngàn|tr|triệu)?/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/[.,]/g, ''));
  const u = (m[2] || '').toLowerCase();
  if (u === 'k' || u === 'nghìn' || u === 'ngàn') n *= 1e3;
  if (u === 'tr' || u === 'triệu') n *= 1e6;
  if (!(n >= 10000) || n >= 5e6) return null; // giá quá nhỏ/quá lớn → không nêu ngưỡng
  return Math.max(Math.ceil((n * 1.5) / 50000) * 50000, 200000).toLocaleString('vi-VN') + 'đ';
}

/* ---------------- Gói nội dung theo ngành (th3 = lời khách "dùng không hợp", qa = 4 Q&A đặc thù) ---------------- */
function indPack(ctx) {
  const x = xungHo(ctx), p = productOf(ctx), com = companyName(ctx), kenh = channelsOf(ctx);
  const T = x.toi, K = x.khach;
  switch (industryOf(ctx)) {
    case 'banle': return { th3: 'Mua về rồi mà thấy chưa ưng như lúc xem', qa: [
      [`${p.name} có sẵn hàng không?`, `Mẫu bán chạy luôn có sẵn; mẫu đặc biệt đặt trước 2–3 ngày, ${T} báo rõ trước khi lên đơn ạ.`],
      ['Hàng có chính hãng, nguồn gốc rõ không?', `Dạ có hoá đơn, nguồn gốc đầy đủ; ${K} được đồng kiểm khi nhận hàng.`],
      ['Xem hàng thật trước khi mua được không?', `${cap(T)} gửi ảnh/video thật từng mẫu, hoặc mời ${K} qua điểm bán xem trực tiếp.`],
      ['Hết hàng thì bao giờ có lại?', `Thường 3–7 ngày; ${T} ghi nhận để nhắn ${K} ngay khi hàng về ạ.`]
    ] };
    case 'fnb': return { th3: 'Dùng mấy hôm rồi mà thấy vị chưa hợp, hơi khó dùng', qa: [
      [`Thành phần của ${p.name} gồm những gì?`, `Nguyên liệu in đầy đủ trên bao bì; ${T} gửi ảnh nhãn chi tiết ngay khi ${K} nhắn ạ.`],
      ['Dùng thế nào cho đúng?', `Theo hướng dẫn in trên bao bì, dùng đều mỗi ngày; ${T} gửi kèm hướng dẫn trong mỗi đơn.`],
      ['Phụ nữ mang thai, người có bệnh nền dùng được không?', `${cap(T)} khuyên ${K} hỏi ý kiến bác sĩ trước khi dùng — ${T} không tư vấn thay y khoa ạ.`],
      ['Hạn sử dụng và cách bảo quản?', 'HSD in trên từng bao bì; bảo quản nơi khô ráo, tránh nắng trực tiếp.']
    ] };
    case 'thoitrang': return { th3: 'Nhận rồi mặc thử thấy chưa vừa dáng', qa: [
      ['Chọn size thế nào cho đúng?', `${cap(K)} gửi chiều cao, cân nặng — ${T} tư vấn theo bảng size thực đo; sai size đổi miễn phí lần đầu.`],
      [`Chất liệu ${p.name} là gì?`, `Chất liệu ghi rõ trên tem từng mẫu; ${T} gửi ảnh cận vải khi ${K} nhắn ạ.`],
      ['Giặt ủi thế nào cho bền?', 'Giặt nhẹ nước lạnh, hạn chế sấy nóng; hướng dẫn chi tiết in trên tem sản phẩm.'],
      ['Mặc không vừa có đổi được không?', 'Đổi size trong 7 ngày, giữ tem và chưa qua sử dụng ạ.']
    ] };
    case 'mypham': return { th3: 'Dùng 2–3 hôm thấy da hơi kích ứng', qa: [
      [`Da nhạy cảm dùng ${p.name} được không?`, `${cap(T)} khuyên thử vùng da nhỏ 24h trước; nếu kích ứng thì ngưng và nhắn ${T} hỗ trợ đổi ạ.`],
      ['Thành phần có nguồn gốc rõ không?', `Bảng thành phần in trên bao bì, giấy công bố đầy đủ; ${T} gửi khi ${K} cần.`],
      ['Dùng sáng hay tối, thứ tự thế nào?', `Theo hướng dẫn từng sản phẩm; ${T} gửi sơ đồ các bước khớp chu trình ${K} đang dùng.`],
      ['Kết hợp với sản phẩm đang dùng được không?', `Đa số kết hợp được; ${K} cho ${T} biết chu trình hiện tại để tư vấn chính xác ạ.`]
    ] };
    case 'giaoduc': return { noShip: true, th3: 'Học mấy buổi rồi mà thấy chưa theo kịp', qa: [
      [`Lộ trình học ${p.name} thế nào?`, 'Lộ trình chia giai đoạn rõ ràng, có kiểm tra đầu vào để xếp đúng trình độ ạ.'],
      ['Có học thử trước không?', `Dạ có 1 buổi học thử; ${K} đăng ký qua ${kenh} để xếp lịch.`],
      ['Bận đột xuất có bảo lưu được không?', 'Bảo lưu theo quy định từng khoá, báo trước 3 ngày là được ạ.'],
      ['Giáo viên và giáo trình ra sao?', `Giáo viên có hồ sơ công khai, giáo trình biên soạn riêng — ${T} gửi ${K} xem trước khi quyết định.`]
    ] };
    case 'suckhoe': return { th3: 'Dùng một thời gian mà chưa thấy chuyển biến rõ', qa: [
      [`${p.name} có thay thế thuốc chữa bệnh không?`, `Dạ không — sản phẩm chỉ hỗ trợ, không thay thế chẩn đoán hay điều trị; có bệnh ${K} nên gặp bác sĩ ạ.`],
      ['Bao lâu thì thấy khác biệt?', `Tuỳ cơ địa; nhiều khách phản hồi tích cực sau 2–4 tuần dùng đều — ${T} không cam kết kết quả giống nhau ạ.`],
      ['Đang dùng thuốc có dùng chung được không?', `${cap(K)} hỏi ý kiến bác sĩ đang điều trị trước khi dùng chung để an toàn nhất ạ.`],
      ['Cách dùng đúng thế nào?', `Đúng liều lượng in trên bao bì, không tự tăng liều; ${T} gửi hướng dẫn kèm mỗi đơn.`]
    ] };
    case 'noithat': return { th3: 'Lắp xong nhìn chưa hợp với không gian nhà', qa: [
      ['Có khảo sát, đo đạc trước không?', `Dạ có, ${T} khảo sát miễn phí nội thành trước khi báo giá chính thức.`],
      [`Bảo hành ${p.name} bao lâu?`, `Bảo hành 12–24 tháng tuỳ dòng; lỗi vật liệu, kết cấu do ${com} chịu trách nhiệm.`],
      ['Từ đặt đến lắp xong mất bao lâu?', 'Hàng sẵn 3–5 ngày; hàng đặt theo yêu cầu 7–15 ngày, có tiến độ báo trước.'],
      ['Vệ sinh, bảo quản thế nào cho bền?', `Lau khô, tránh ẩm và nắng gắt; ${T} gửi hướng dẫn theo từng chất liệu khi bàn giao.`]
    ] };
    case 'bds': return { noShip: true, th3: 'Đi xem thực tế thấy khác với kỳ vọng ban đầu', qa: [
      [`Pháp lý ${p.name} thế nào?`, `Hồ sơ pháp lý cung cấp đầy đủ để ${K} kiểm tra; giao dịch đều qua công chứng theo quy định.`],
      ['Muốn đi xem thực tế thì làm sao?', `${cap(K)} đặt lịch trước 1 ngày qua ${kenh}, ${T} sắp xếp đưa đi tận nơi.`],
      ['Phí và hoa hồng tính thế nào?', 'Công khai từ đầu trong thoả thuận, không phát sinh ngoài văn bản ạ.'],
      ['Có hỗ trợ vay ngân hàng không?', `${cap(T)} kết nối ngân hàng đối tác; kết quả tuỳ thẩm định hồ sơ, ${T} không cam kết duyệt ạ.`]
    ] };
    case 'dichvu': return { noShip: true, th3: 'Kết quả bàn giao chưa đúng như kỳ vọng ban đầu', qa: [
      [`Quy trình làm việc của ${com} thế nào?`, 'Gồm 4 bước: tiếp nhận nhu cầu → báo giá chốt phạm vi → thực hiện → nghiệm thu, mỗi bước có xác nhận ạ.'],
      ['Bao lâu thì hoàn thành?', `Thời hạn chốt bằng văn bản trước khi bắt đầu; trễ hạn do ${com} sẽ có phương án bù ạ.`],
      ['Được chỉnh sửa mấy lần?', `2 lần chỉnh miễn phí trong phạm vi đã chốt; ngoài phạm vi ${T} báo giá riêng trước khi làm.`],
      ['Báo giá có phát sinh thêm không?', `Không phát sinh ngoài báo giá đã chốt; mọi thay đổi phải được ${K} duyệt trước ạ.`]
    ] };
    case 'sanxuat': return { th3: 'Lô hàng nhận về chưa đạt đúng như mẫu đã duyệt', qa: [
      ['Đặt tối thiểu (MOQ) bao nhiêu?', `MOQ theo từng dòng ${p.name}; đơn đầu ${T} hỗ trợ mức linh hoạt để ${K} test thị trường.`],
      ['Có làm mẫu trước khi sản xuất không?', 'Dạ có, mẫu duyệt trong 5–7 ngày; phí mẫu trừ vào đơn chính thức.'],
      ['Tiến độ sản xuất bao lâu?', `Theo sản lượng, thường 10–20 ngày; lịch tiến độ cập nhật hằng tuần cho ${K}.`],
      ['Chất lượng kiểm soát thế nào?', `QC theo mẫu đã duyệt, có biên bản kiểm trước xuất xưởng; lỗi vượt tỷ lệ cam kết ${com} đổi bù.`]
    ] };
    case 'tmdt': return { th3: 'Hàng nhận được thấy khác với mô tả trên sàn', qa: [
      [`Mua ${p.name} ở kênh nào chính hãng?`, `Chỉ mua tại gian hàng chính thức của ${com} trên ${kenh} — hàng ngoài luồng ${T} không hỗ trợ được ạ.`],
      ['Có mã giảm giá không?', `Mã cập nhật trong livestream và trang gian hàng; ${K} lưu shop để nhận thông báo sớm nhất.`],
      ['Đơn mua trên sàn đổi trả thế nào?', `Theo chính sách của sàn; ${T} hỗ trợ song song đến khi ${K} nhận được hàng đạt yêu cầu.`],
      ['Sao giá trên sàn lệch với giá công bố?', `Chênh lệch do khuyến mãi từng đợt; khung giá chuẩn vẫn là ${p.price} ạ.`]
    ] };
    default: return { th3: 'Trải nghiệm sản phẩm chưa đúng như kỳ vọng', qa: [
      [`${p.name} khác gì so với nơi khác?`, `Khác biệt ở nguồn gốc rõ ràng và hỗ trợ 1-1 sau bán; ${T} gửi tài liệu chi tiết khi ${K} nhắn.`],
      ['Không biết chọn loại nào cho hợp?', `${cap(K)} mô tả nhu cầu, ${T} tư vấn đúng loại trong 15 phút — không chào thứ ${K} không cần ạ.`],
      ['Chất lượng có cam kết gì không?', `Lỗi do ${com} → đổi 1-1 trong 7 ngày, ${com} chịu toàn bộ chi phí ạ.`],
      [`Ai đang dùng ${p.name} nhiều nhất?`, `Chủ yếu là ${customerOf(ctx)} — ${T} gửi ${K} phản hồi thật của khách để tham khảo.`]
    ] };
  }
}

/* ---------------- Render theo format_dau_ra ---------------- */
function mkTable(head, rows) {
  const line = c => `| ${c.join(' | ')} |`;
  return [line(head), line(head.map(() => '---'))].concat(rows.map(line)).join('\n');
}
function mdToHtml(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/_\(([^)]+)\)_/g, '<i>($1)</i>');
  const out = []; let ul = false, inTable = false;
  const closeUl = () => { if (ul) { out.push('</ul>'); ul = false; } };
  const closeTable = () => { if (inTable) { out.push('</table>'); inTable = false; } };
  md.split('\n').forEach(raw => {
    const line = raw.trim();
    if (line.startsWith('|')) {
      closeUl();
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (/^:?---/.test(cells[0])) return; // hàng ngăn cách của bảng markdown
      const tag = inTable ? 'td' : 'th';
      if (!inTable) { out.push('<table border="1" cellpadding="6" style="border-collapse:collapse">'); inTable = true; }
      out.push('<tr>' + cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join('') + '</tr>');
      return;
    }
    closeTable();
    if (line.startsWith('## ')) { closeUl(); out.push(`<h2>${inline(line.slice(3))}</h2>`); }
    else if (line.startsWith('# ')) { closeUl(); out.push(`<h1>${inline(line.slice(2))}</h1>`); }
    else if (line.startsWith('- ')) { if (!ul) { out.push('<ul>'); ul = true; } out.push(`<li>${inline(line.slice(2))}</li>`); }
    else if (line) { closeUl(); out.push(`<p>${inline(line)}</p>`); }
  });
  closeUl(); closeTable();
  return out.join('\n');
}
/* spec = {title, intro?, tableIntro?, sections[], table?{head,rows,note}, footer?}
   tableIntro chỉ dùng cho nhánh xlsx (tránh trùng nội dung với sections ở nhánh văn bản). */
function render(brief, ctx, spec) {
  const fmt = fmtOf(brief);
  let md;
  if (fmt === 'xlsx' && spec.table) {
    const intro = spec.tableIntro || spec.intro;
    md = fixHeader(ctx) + `# ${spec.title}\n\n` + (intro ? intro + '\n\n' : '') +
      mkTable(spec.table.head, spec.table.rows) +
      `\n\n_Ghi chú công thức/giả định: ${spec.table.note}_`;
  } else {
    md = fixHeader(ctx) + `# ${spec.title}\n\n` + (spec.intro ? spec.intro + '\n\n' : '') +
      spec.sections.map(s => `## ${s.h}\n${s.b}`).join('\n\n');
    if (spec.footer) md += `\n\n${spec.footer}`;
  }
  return fmt === 'html' ? mdToHtml(md) : md;
}

/* ---------------- OUTPUTS ---------------- */
const outputs = {
  /* NV Kịch bản CS — 5 tình huống khiếu nại theo LAST + upsell/winback */
  nv_script(brief, ctx) {
    brief = brief || {}; ctx = ctx || {};
    const x = xungHo(ctx), p = productOf(ctx), com = companyName(ctx), ind = indPack(ctx);
    const T = x.toi, K = x.khach, up = roundOf(ctx) > 0;
    const th = (kh, dc, xm, pa, fu) =>
      `**KH:** ${kh}\n**Đồng cảm:** ${dc}\n**Xác minh:** ${xm}\n**Phương án:** ${pa}\n**Follow-up:** ${fu}`;
    const sections = [
      { h: '1) Giao hàng chậm', b: th(
        `“Đặt 5 ngày chưa thấy hàng, ${K} đang cần gấp.”`,
        `“${cap(T)} xin lỗi ${K}, chờ lâu sốt ruột là đúng — ${T} kiểm tra ngay ạ.”`,
        'xin mã đơn, tra vận đơn ngay trong ≤3 phút.',
        `kẹt kho → hoả tốc + voucher 10%${up ? ', trễ >3 ngày hoàn phí ship' : ''}; thất lạc → gửi mới trong 24h, ${com} chịu phí.`,
        'báo mã vận đơn trong ngày; hỏi thăm sau giao 24h.') },
      { h: '2) Sản phẩm lỗi', b: th(
        `“Mở ${p.name} ra thấy lỗi, thất vọng quá.”`,
        `“${cap(T)} rất tiếc ạ, nhận hàng lỗi ai cũng bực. Cảm ơn ${K} đã báo.”`,
        'xin ảnh/video khui hàng + số lô để xác định nguồn lỗi.',
        `đổi 1-1 trong 24–48h, ${com} chịu phí 2 chiều, kèm quà xin lỗi.`,
        'xác nhận khi hàng đổi đến; chuyển số lô cho QC trong ngày.') },
      { h: '3) Dùng không hợp', b: th(
        `“${ind.th3}.”`,
        `“Cảm ơn ${K} chia sẻ thật lòng, chưa hợp không phải ${K} chọn sai ạ.”`,
        `hỏi cách ${K} đang dùng (tần suất, thời điểm).`,
        'hướng dẫn điều chỉnh; sau 7 ngày chưa hợp → đổi lựa chọn khác cùng khung giá.',
        'chủ động hỏi lại sau 3 ngày điều chỉnh.') },
      { h: '4) Đòi hoàn tiền', b: th(
        `“Không hợp nữa, cho ${K} trả hàng hoàn tiền.”`,
        `“Dạ, quyền lợi ${K} là trên hết, ${T} hỗ trợ ngay ạ.”`,
        'soát điều kiện: 7 ngày, nguyên trạng/hoá đơn; hỏi nhanh lý do.',
        'gợi ý đổi 1-1/voucher +10% trước, không ép; vẫn muốn hoàn → 3–5 ngày làm việc.',
        'báo khi tiền về; ghi lý do vào báo cáo tuần.') },
      { h: '5) So sánh với đối thủ', b: th(
        `“Bên khác bán rẻ hơn ${com} mà.”`,
        `“Cảm ơn ${K} đã tham khảo kỹ — khách tinh ý ${T} rất quý ạ.”`,
        `hỏi ${K} so mẫu nào, giá nào để cùng hệ quy chiếu.`,
        `nêu 2 khác biệt: nguồn gốc minh bạch, hỗ trợ 1-1 sau bán (khung ${p.price}); không chê đối thủ.`,
        'gửi bảng so sánh, hẹn phản hồi 1 ngày.') },
      { h: 'Upsell & Winback', b:
        `**Upsell (khách vừa hài lòng):** “Nhiều khách như ${K} lấy thêm combo ${p.name}, lợi 10–15% so với mua lẻ. ${cap(T)} gửi ${K} xem nhé?” — chào 1 lần, không ép.\n` +
        `**Winback (60–90 ngày im lặng):** “${com} gửi ${K} ưu đãi 10% khách thân thiết, hiệu lực 7 ngày ạ.”` }
    ];
    if (up) sections.push({ h: 'Cam kết đo lường mới', b:
      '- Phản hồi ≤15 phút; CSAT sau xử lý ≥4,5/5.\n- 100% ca follow-up 24h, báo cáo tuần cho TP.' });
    return render(brief, ctx, {
      title: titleOf(ctx, `Kịch bản CSKH — 5 tình huống LAST (${p.name})`),
      sections,
      table: { head: ['#', 'Tình huống', 'Phương án chính', 'Follow-up'], rows: [
        ['1', 'Giao hàng chậm', 'Hoả tốc + voucher 10%; thất lạc → gửi mới trong 24h', 'Vận đơn trong ngày'],
        ['2', 'Sản phẩm lỗi', 'Đổi 1-1 trong 24–48h, phí hai chiều', 'Xác nhận + báo QC'],
        ['3', 'Dùng không hợp', 'Chỉnh cách dùng; sau 7 ngày → đổi lựa chọn khác', 'Hỏi lại sau 3 ngày'],
        ['4', 'Đòi hoàn tiền', 'Gợi ý đổi/voucher trước; hoàn 3–5 ngày làm việc', 'Báo tiền về + lưu lý do'],
        ['5', 'So sánh đối thủ', 'Nêu 2 khác biệt + gửi bảng so sánh', 'Hẹn phản hồi 1 ngày']
      ], note: 'mức đền bù theo chính sách đổi trả 7 ngày; voucher 10% áp cho đơn kế tiếp trong 30 ngày.' },
      footer: `_Luôn xưng "${T}–${K}"; tuyệt đối tuân thủ: ${bannedLine(ctx)}._`
    });
  },

  /* NV FAQ — 15–20 câu hỏi đáp theo sản phẩm trong DNA, tôn trọng điều cấm */
  nv_faq(brief, ctx) {
    brief = brief || {}; ctx = ctx || {};
    const x = xungHo(ctx), p = productOf(ctx), com = companyName(ctx), ind = indPack(ctx), kenh = channelsOf(ctx);
    const T = x.toi, K = x.khach, fs = freeshipNguong(ctx);
    const groups = [
      { h: `${cap(p.name)} & cách dùng`, items: [
        [`Giá ${p.name} bao nhiêu?`, `Khung giá ${p.price} tuỳ phiên bản/combo; ${T} gửi báo giá chi tiết ngay khi ${K} nhắn ạ.`]
      ].concat(ind.qa) },
      ind.noShip
        ? { h: 'Đặt lịch & triển khai', items: [
            ['Đăng ký/đặt lịch thế nào?', `Nhắn ${kenh} hoặc để lại SĐT, ${T} xác nhận trong 15 phút giờ hành chính.`],
            ['Bao lâu thì bắt đầu?', 'Lịch xếp trong 1–3 ngày; mốc hoàn thành chốt rõ trước khi bắt đầu.'],
            ['Muốn dời hoặc huỷ lịch?', 'Báo trước 24h được dời miễn phí; huỷ sát giờ lần đầu vẫn được hỗ trợ ạ.']
          ] }
        : { h: 'Đặt hàng & giao nhận', items: [
            ['Đặt hàng qua kênh nào?', `Qua ${kenh}; ${T} xác nhận đơn trong 15 phút giờ hành chính.`],
            ['Bao lâu nhận được hàng?', 'Nội thành 1–2 ngày, tỉnh khác 2–4 ngày; luôn có mã vận đơn để theo dõi.'],
            ['Phí vận chuyển thế nào?', fs ? `20–35k tuỳ khu vực; miễn phí cho đơn từ ${fs}.` : 'Báo theo khu vực ngay khi lên đơn — không thu thêm khi giao.'],
            ['Được kiểm hàng khi nhận không?', `Dạ có, ${K} đồng kiểm với shipper; quay video khui hàng để được hỗ trợ nhanh nhất.`]
          ] },
      { h: 'Thanh toán & hoá đơn', items: [
        ['Thanh toán bằng cách nào?', ind.noShip
          ? 'Chuyển khoản hoặc tiền mặt theo hợp đồng/biên nhận, xác nhận từng đợt rõ ràng.'
          : 'COD hoặc chuyển khoản; chuyển khoản được xác nhận trong giờ hành chính.'],
        ['Có xuất hoá đơn VAT không?', `Dạ có — ${K} gửi thông tin xuất hoá đơn trong 3 ngày sau khi mua ạ.`],
        ['Mua số lượng lớn có ưu đãi không?', `Có chính sách theo bậc; ${K} cho ${T} biết số lượng để nhận báo giá riêng ạ.`]
      ] },
      { h: 'Đổi trả & hỗ trợ', items: [
        ind.noShip
          ? ['Chưa hài lòng kết quả thì sao?', `Phản ánh trong 7 ngày, ${T} khắc phục trong phạm vi đã chốt; lỗi do ${com} thì hoàn toàn miễn phí.`]
          : ['Chính sách đổi trả thế nào?', `Lỗi do ${com}: đổi 1-1 trong 7 ngày, ${com} chịu phí; đổi do nhu cầu: giữ nguyên trạng, ${K} hỗ trợ phí ship ạ.`],
        ['Hoàn tiền mất bao lâu?', 'Sau khi xác nhận đủ điều kiện: 3–5 ngày làm việc là tiền về tài khoản.'],
        ['Liên hệ hỗ trợ lúc nào?', `8h30–21h hằng ngày qua ${kenh}; ngoài giờ để lại tin nhắn, sáng hôm sau ${T} phản hồi ngay ạ.`],
        ['Khách cũ có ưu đãi riêng không?', 'Dạ có — ưu đãi tích luỹ gửi qua tin nhắn hằng tháng, chỉ dành cho khách đã mua.']
      ] }
    ];
    let i = 0;
    const sections = groups.map(g => ({ h: g.h,
      b: g.items.map(([q, a]) => { i += 1; return `**C${i}. ${q}**\n${a}`; }).join('\n') }));
    if (roundOf(ctx) > 0) sections.push({ h: 'Câu khó — quy tắc chuyển tiếp (bổ sung)', b:
      '- Câu vượt thẩm quyền (y tế/pháp lý/đền bù lớn): chuyển TP CSKH trong 30 phút, không tự trả lời.\n' +
      '- Khách bức xúc công khai: xin lỗi ngắn + mời inbox, xử lý theo LAST.' });
    let j = 0; const rows = [];
    groups.forEach(g => g.items.forEach(([q, a]) => { j += 1; rows.push([`C${j}`, q, a]); }));
    return render(brief, ctx, {
      title: titleOf(ctx, `Bộ FAQ ${p.name} — ${com}`),
      intro: `Bộ ${i > 0 ? j : 0} câu khách hay hỏi nhất, dùng thống nhất trên ${kenh}.`,
      sections,
      table: { head: ['#', 'Câu hỏi', 'Trả lời chuẩn'], rows,
        note: `trả lời ≤3 câu; khung giá theo DNA (${p.price}); tuyệt đối tuân thủ: ${bannedLine(ctx)}.` },
      footer: `_Nguyên tắc: khẳng định → chi tiết → mời nhắn kênh; xưng "${T}–${K}"; TUYỆT ĐỐI tuân thủ: ${bannedLine(ctx)}._`
    });
  },

  /* TP CSKH — kế hoạch phòng + phân công + SLA */
  tp_cs(brief, ctx) {
    brief = brief || {}; ctx = ctx || {};
    const p = productOf(ctx), com = companyName(ctx), kenh = channelsOf(ctx);
    const mt = brief.muc_tieu || `Chuẩn hoá bộ tài liệu CSKH cho ${p.name}, phục vụ mục tiêu "${goalOf(ctx)}"`;
    const sections = [
      { h: 'Mục tiêu & phạm vi', b: `- ${mt}.\n- Phạm vi: kịch bản khiếu nại, bộ FAQ, kịch bản upsell/winback trên ${kenh}.\n- Khách phục vụ: ${customerOf(ctx)}.` },
      { h: 'SLA cam kết với khách', b: '- Phản hồi đầu tiên ≤15 phút trong khung 8h30–21h.\n- Giải quyết ngay lần tiếp xúc đầu ≥80% số ca.\n- Đổi 1-1 trong 24–48h; hoàn tiền 3–5 ngày làm việc.\n- CSAT sau xử lý ≥4,5/5.' },
      { h: 'Phân công & hạn nộp', b: `- **NV Kịch bản CS:** 5 tình huống khiếu nại theo LAST + upsell/winback — nộp trong 1 ngày.\n- **NV FAQ:** 15–20 câu hỏi đáp theo ${p.name} — nộp trong 1 ngày.\n- **TP CSKH:** review theo rubric (ngưỡng 90/100), tổng hợp bàn giao CEO.` },
      { h: 'Điều cấm & rủi ro', b: `- Tuân thủ tuyệt đối: ${bannedLine(ctx)}.\n- Ca nhạy cảm (y tế, pháp lý, đền bù lớn) → chuyển TP trong 30 phút, không tự hứa.\n- Không cam kết vượt chính sách đổi trả đã công bố của ${com}.` },
      { h: 'Đo lường & báo cáo', b: '- Báo cáo tuần: số ca, % đúng SLA, top 3 lý do khiếu nại, CSAT trung bình.\n- Chỉ số lệch ngưỡng 2 tuần liên tiếp → họp cải tiến kịch bản trong tuần kế tiếp.' }
    ];
    if (roundOf(ctx) > 0) sections.push({ h: 'Điều chỉnh sau góp ý', b:
      '- Gắn thẩm quyền đền bù theo bậc (NV tự quyết / báo TP / TP duyệt) cho từng SLA.\n- Chốt mốc nghiệm thu: 100% tài liệu lưu Company Brain trước 17h ngày bàn giao.' });
    return render(brief, ctx, {
      title: titleOf(ctx, `Kế hoạch CSKH — ${com}`),
      tableIntro: `**Mục tiêu:** ${mt}. Phạm vi: khiếu nại, FAQ, upsell/winback trên ${kenh}; phục vụ ${customerOf(ctx)}. Điều cấm: ${bannedLine(ctx)}.`,
      sections,
      table: { head: ['Chỉ số', 'Ngưỡng', 'Tần suất đo'], rows: [
        ['Thời gian phản hồi đầu', '≤15 phút (8h30–21h)', 'Từng ca'],
        ['Giải quyết lần tiếp xúc đầu', '≥80%', 'Tuần'],
        ['CSAT sau xử lý', '≥4,5/5', 'Từng ca'],
        ['Thời gian đổi 1-1', '24–48h', 'Từng ca'],
        ['Hoàn tiền', '3–5 ngày làm việc', 'Từng ca']
      ], note: 'ngưỡng theo chuẩn CSKH SME bán lẻ; hiệu chỉnh sau 4 tuần dữ liệu thực tế.' }
    });
  },

  /* default — chịu được brief rỗng, dùng cho agent/task ngoài dự kiến */
  default(brief, ctx) {
    brief = brief || {}; ctx = ctx || {};
    const p = productOf(ctx), com = companyName(ctx), x = xungHo(ctx);
    const mt = brief.muc_tieu || `Tài liệu CSKH phục vụ ${p.name} của ${com}`;
    const dv = (brief.dau_vao && brief.dau_vao.length) ? brief.dau_vao.join(', ') : 'DNA doanh nghiệp, chính sách đổi trả hiện hành';
    const tc = (brief.tieu_chi_cham && brief.tieu_chi_cham.length)
      ? brief.tieu_chi_cham.map(t => `- ${t}`).join('\n')
      : '- Đúng giọng thương hiệu và xưng hô trong DNA.\n- Câu trả lời ngắn, có con số cụ thể.\n- Không vi phạm điều cấm trong DNA.';
    const sections = [
      { h: 'Mục tiêu', b: `- ${mt}.\n- Dữ liệu đầu vào: ${dv}.` },
      { h: 'Khung nội dung', b: `- Xử lý mọi tiếp xúc theo LAST: Lắng nghe → Xin lỗi → Giải quyết → Cảm ơn.\n- Xưng hô thống nhất "${x.toi}–${x.khach}" trên mọi kênh.\n- Mỗi phương án kèm mốc thời gian: phản hồi ≤15 phút, đổi 1-1 trong 48h, hoàn tiền 3–5 ngày.` },
      { h: 'Tiêu chuẩn nghiệm thu', b: tc },
      { h: 'Bàn giao & cập nhật', b: `- Lưu bản chuẩn vào Company Brain, thông báo toàn phòng khi thay đổi.\n- Rà soát lại mỗi khi chính sách giá/đổi trả của ${com} thay đổi.\n- Tuân thủ: ${bannedLine(ctx)}.` }
    ];
    if (roundOf(ctx) > 0) sections.push({ h: 'Điều chỉnh sau góp ý', b:
      '- Thay toàn bộ cam kết định tính bằng mốc đo được (phút/giờ/ngày).\n- Bổ sung follow-up 100% ca trong 24h và chỉ số CSAT ≥4,5/5.' });
    return render(brief, ctx, {
      title: titleOf(ctx, `Tài liệu CSKH — ${com}`),
      tableIntro: `**Mục tiêu:** ${mt}. Dữ liệu đầu vào: ${dv}. Khung xử lý: LAST (Lắng nghe → Xin lỗi → Giải quyết → Cảm ơn), xưng hô "${x.toi}–${x.khach}".`,
      sections,
      table: { head: ['Hạng mục', 'Nội dung chính', 'Hạn xử lý'], rows: [
        ['Phản hồi khách', 'Mọi kênh, khung 8h30–21h', '≤15 phút'],
        ['Đổi 1-1 lỗi do shop', 'Kèm phí hai chiều', '24–48h'],
        ['Hoàn tiền', 'Sau xác nhận đủ điều kiện', '3–5 ngày làm việc'],
        ['Cập nhật tài liệu', 'Khi thay đổi chính sách', 'Trong 2 ngày']
      ], note: 'mốc thời gian là cam kết nội bộ, đồng bộ với SLA phòng CSKH.' },
      footer: `_Tuân thủ tuyệt đối: ${bannedLine(ctx)}._`
    });
  }
};

/* ---------------- REVIEWS (nhận xét của TP CSKH; riêng tp_cs là góc nhìn cấp trên duyệt kế hoạch phòng) ---------------- */
const reviews = {
  tp_cs(brief, ctx, pass) {
    const com = companyName(ctx || {}), b = bannedLine(ctx || {}), p = productOf(ctx || {});
    if (pass) return {
      feedback_chi_tiet: `Kế hoạch phòng CSKH ĐẠT: mục tiêu bám DNA của ${com}, SLA có con số đo được (phản hồi ≤15 phút, CSAT ≥4,5/5), phân công rõ người – rõ hạn, đã nêu điều cấm và cơ chế chuyển ca nhạy cảm. Góp ý nhỏ: ghi thêm ngày hiệu lực của SLA và tần suất rà soát rubric (khuyến nghị mỗi quý) để tiện đối chiếu về sau. Duyệt triển khai.`,
      loi_cu_the: []
    };
    return {
      feedback_chi_tiet: `Kế hoạch phòng CSKH CHƯA ĐẠT, trả lại hoàn thiện trong hôm nay. Lỗi chính: (1) SLA nêu định tính ("phản hồi nhanh", "xử lý sớm") — không có ngưỡng số nên không nghiệm thu được; (2) phân công thiếu hạn nộp và thiếu tiêu chí nghiệm thu cho từng đầu việc của nv_script/nv_faq; (3) chưa gắn thẩm quyền đền bù theo bậc, nhân viên không biết mức nào được tự quyết, mức nào phải xin duyệt; (4) mục rủi ro chưa đối chiếu điều cấm của ${com} ("${b}") với kịch bản ${p.name}. Sửa đúng 4 vị trí dưới đây rồi trình lại — sẽ duyệt theo rubric ngưỡng 90/100.`,
      loi_cu_the: [
        { vi_tri: 'Mục SLA cam kết với khách', loi: 'Toàn bộ cam kết viết định tính, không có ngưỡng số và khung giờ áp dụng', cach_sua: 'Chốt bộ số tối thiểu: phản hồi đầu ≤15 phút (8h30–21h), giải quyết lần đầu ≥80%, đổi 1-1 trong 24–48h, hoàn tiền 3–5 ngày làm việc, CSAT ≥4,5/5' },
        { vi_tri: 'Mục phân công & hạn nộp', loi: 'Chỉ liệt kê đầu việc, không có hạn nộp và tiêu chí nghiệm thu cho nv_script, nv_faq', cach_sua: 'Mỗi đầu việc ghi: người phụ trách + hạn nộp (1 ngày) + tiêu chí đạt (đủ 5 tình huống LAST / đủ 15–20 câu FAQ, 0 vi phạm điều cấm)' },
        { vi_tri: 'Mục điều cấm & rủi ro', loi: `Chưa nêu thẩm quyền đền bù theo bậc và chưa đối chiếu điều cấm ("${b}") với nội dung kịch bản`, cach_sua: 'Thêm bảng bậc thẩm quyền (NV tự quyết ≤ giá 1 sản phẩm; vượt mức → TP duyệt trong 30 phút) và checklist đối chiếu điều cấm trước khi duyệt tài liệu' },
        { vi_tri: 'Mục đo lường & báo cáo', loi: 'Chưa có cơ chế cảnh báo khi chỉ số lệch ngưỡng, báo cáo tuần không nêu ai nhận', cach_sua: 'Bổ sung: chỉ số lệch ngưỡng 2 tuần liên tiếp → họp cải tiến trong tuần kế tiếp; báo cáo tuần gửi COO trước 17h thứ Sáu' }
      ]
    };
  },

  nv_script(brief, ctx, pass) {
    const x = xungHo(ctx || {}), b = bannedLine(ctx || {});
    if (pass) return {
      feedback_chi_tiet: `Kịch bản ĐẠT: đủ 5 tình huống đúng trình tự LAST, có bước xác minh trước khi chốt phương án, xưng hô "${x.toi}–${x.khach}" nhất quán, mức đền bù nằm trong thẩm quyền theo bậc. Góp ý nhỏ để hoàn thiện: rút câu đồng cảm tình huống 5 còn một câu, thêm mốc giờ cụ thể cho follow-up tình huống 2 (VD: trước 17h hôm sau). Duyệt lưu vào Company Brain.`,
      loi_cu_the: []
    };
    return {
      feedback_chi_tiet: `Kịch bản CHƯA ĐẠT, trả lại sửa trong hôm nay. Lỗi chính: (1) tình huống hoàn tiền chốt hoàn ngay khi khách vừa yêu cầu — bỏ qua bước xác minh điều kiện; (2) câu đồng cảm ba tình huống đầu lặp nguyên văn một câu, nghe máy móc; (3) có cam kết vượt chính sách, chạm điều cấm ("${b}"); (4) thiếu kịch bản winback mà brief yêu cầu. Sửa đúng từng vị trí dưới đây rồi nộp lại — sẽ chấm lại theo rubric ngưỡng 90/100.`,
      loi_cu_the: [
        { vi_tri: 'Tình huống 4 — đòi hoàn tiền', loi: 'Chốt hoàn tiền ngay khi khách yêu cầu, không kiểm tra điều kiện 7 ngày/nguyên trạng/hoá đơn', cach_sua: 'Thêm bước xác minh điều kiện; gợi ý đổi 1-1 hoặc voucher trước, chỉ hoàn khi khách vẫn muốn (3–5 ngày làm việc)' },
        { vi_tri: 'Câu đồng cảm tình huống 1–3', loi: 'Dùng lại nguyên một câu "xin lỗi vì trải nghiệm không tốt" cho cả ba tình huống', cach_sua: 'Mỗi tình huống nhắc lại đúng vấn đề khách vừa nói (chậm mấy ngày, lỗi gì) trước khi xin lỗi' },
        { vi_tri: 'Tình huống 2 — phương án', loi: `Hứa "đổi mới trong 12h" và đền gấp đôi — vượt chính sách, nguy cơ chạm điều cấm ("${b}")`, cach_sua: 'Đưa về mức 24–48h theo khu vực, đền bù theo bậc trong skill xu-ly-khieu-nai-last, kèm mã vận đơn cho khách theo dõi' },
        { vi_tri: 'Cuối tài liệu', loi: 'Thiếu kịch bản winback cho khách im lặng 60–90 ngày (brief yêu cầu)', cach_sua: 'Bổ sung 1 tin nhắn winback cá nhân hoá + ưu đãi 10% hiệu lực 7 ngày, tối đa 2 lần/quý' }
      ]
    };
  },

  nv_faq(brief, ctx, pass) {
    const x = xungHo(ctx || {}), b = bannedLine(ctx || {}), p = productOf(ctx || {});
    if (pass) return {
      feedback_chi_tiet: `Bộ FAQ ĐẠT: đủ số câu theo brief, chia nhóm hợp lý, câu trả lời ngắn có con số cụ thể, không câu nào chạm điều cấm ("${b}"). Góp ý nhỏ: giữ câu hỏi về giá ở đầu nhóm sản phẩm vì khách hỏi nhiều nhất; nếu còn dư slot thì thêm 1 câu về quà tặng/gói combo. Duyệt dùng thống nhất trên các kênh.`,
      loi_cu_the: []
    };
    return {
      feedback_chi_tiet: `Bộ FAQ CHƯA ĐẠT — lỗi nặng nhất là vi phạm điều cấm thương hiệu, đây là lỗi auto-fail theo rubric. Ngoài ra thiếu nhóm câu về giao nhận/phí và nhiều câu trả lời dài quá 3 câu. Sửa đúng 4 vị trí dưới đây, tự đối chiếu lại TỪNG câu với điều cấm ("${b}") trước khi nộp lại.`,
      loi_cu_the: [
        { vi_tri: 'Nhóm sản phẩm — câu về hiệu quả', loi: `Trả lời cam kết kết quả tuyệt đối cho ${p.name}, vi phạm điều cấm ("${b}")`, cach_sua: 'Đổi sang mức "hỗ trợ, tuỳ cơ địa/nhu cầu từng người", kèm hướng dẫn dùng đúng và mời khách nhắn để được tư vấn riêng' },
        { vi_tri: 'Toàn bộ nhóm giao nhận', loi: 'Thiếu hẳn câu về thời gian giao và phí vận chuyển — nhóm khách hỏi nhiều nhất', cach_sua: 'Thêm 3 câu: thời gian giao theo khu vực (1–2 và 2–4 ngày), mức phí cụ thể, quyền đồng kiểm khi nhận' },
        { vi_tri: 'Các câu C2, C7, C9', loi: 'Trả lời 4–5 câu, khách lướt điện thoại sẽ bỏ qua', cach_sua: 'Rút còn ≤3 câu theo khung: khẳng định → 1 chi tiết then chốt → mời nhắn kênh' },
        { vi_tri: 'Số lượng câu và xưng hô', loi: `Mới có 11 câu (brief yêu cầu 15–20), 3 chỗ xưng hô lệch chuẩn "${x.toi}–${x.khach}"`, cach_sua: 'Bổ sung nhóm thanh toán (COD/CK, hoá đơn VAT, mua sỉ) và rà lại toàn bộ đại từ xưng hô' }
      ]
    };
  },

  default(brief, ctx, pass) {
    const b = bannedLine(ctx || {});
    if (pass) return {
      feedback_chi_tiet: `Tài liệu ĐẠT: cấu trúc rõ, có mốc thời gian cụ thể cho từng cam kết, đúng giọng thương hiệu, không chạm điều cấm ("${b}"). Góp ý nhỏ: bổ sung dòng ghi ngày hiệu lực và người chịu trách nhiệm cập nhật để tiện tra soát về sau.`,
      loi_cu_the: []
    };
    return {
      feedback_chi_tiet: 'Tài liệu CHƯA ĐẠT: cam kết còn chung chung, thiếu con số kiểm chứng được và chưa có bước theo dõi sau xử lý. Sửa theo 3 điểm dưới đây rồi nộp lại để chấm theo rubric ngưỡng 90/100.',
      loi_cu_the: [
        { vi_tri: 'Các mục cam kết dịch vụ', loi: 'Viết "phản hồi sớm nhất có thể", "xử lý nhanh chóng" — không đo được', cach_sua: 'Thay bằng mốc cụ thể: phản hồi ≤15 phút (8h30–21h), đổi 1-1 trong 24–48h, hoàn tiền 3–5 ngày làm việc' },
        { vi_tri: 'Phần phương án xử lý', loi: `Có câu hứa vượt chính sách công bố, nguy cơ chạm điều cấm ("${b}")`, cach_sua: 'Đối chiếu từng cam kết với chính sách đổi trả hiện hành; điều chưa chắc thì ghi "sẽ xác nhận trong 24h" thay vì hứa' },
        { vi_tri: 'Cuối tài liệu', loi: 'Thiếu bước follow-up và chỉ số đo sau xử lý', cach_sua: 'Thêm mục: follow-up 100% ca trong 24h, đo CSAT ≥4,5/5, tổng hợp báo cáo tuần' }
      ]
    };
  }
};

module.exports = { dept: 'cskh', outputs, reviews };
