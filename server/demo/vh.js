'use strict';
/*
 * Phòng Vận hành – Hành chính (dept_id = 'vh') — module nội dung demo.
 *   outputs.<agentId>(brief, ctx) => markdown string (500–2500 ký tự, theo brief.format_dau_ra)
 *   reviews.<agentId>(brief, ctx, pass) => { feedback_chi_tiet, loi_cu_the: [{vi_tri, loi, cach_sua}] }
 * brief có thể rỗng {}; ctx.dna / ctx.task có thể null — mọi helper đều có fallback.
 * Không dùng dependency ngoài. Node 18+.
 */

/* ---------------- Bản đồ 12 ngành → ngữ cảnh vận hành ---------------- */
const NGANH = {
  banle:     { label: 'Bán lẻ',                      sop: 'nhập hàng và kiểm kê kho cửa hàng',                 hopdong: 'cung ứng hàng hóa',            doitac: 'nhà cung cấp' },
  fnb:       { label: 'Thực phẩm & Đồ uống (F&B)',   sop: 'tiếp nhận và kiểm soát nguyên liệu đầu vào',        hopdong: 'cung ứng nguyên liệu/gia công', doitac: 'nhà cung cấp nguyên liệu' },
  thoitrang: { label: 'Thời trang',                  sop: 'kiểm hàng và xử lý đổi trả sản phẩm',               hopdong: 'gia công may mặc',             doitac: 'xưởng gia công' },
  mypham:    { label: 'Mỹ phẩm',                     sop: 'kiểm soát lô hàng và hạn sử dụng',                  hopdong: 'phân phối sản phẩm',           doitac: 'nhà phân phối' },
  giaoduc:   { label: 'Giáo dục',                    sop: 'tuyển sinh và nhập học học viên',                   hopdong: 'cung cấp dịch vụ đào tạo',     doitac: 'đối tác/phụ huynh' },
  suckhoe:   { label: 'Sức khỏe',                    sop: 'tiếp đón và bàn giao khách sử dụng dịch vụ',        hopdong: 'cung cấp dịch vụ chăm sóc',    doitac: 'đối tác chuyên môn' },
  noithat:   { label: 'Nội thất',                    sop: 'khảo sát – báo giá – giao lắp đặt',                 hopdong: 'thi công/cung cấp nội thất',   doitac: 'khách hàng dự án' },
  bds:       { label: 'Bất động sản',                sop: 'tiếp nhận và chăm sóc khách xem sản phẩm',          hopdong: 'môi giới/đặt cọc',             doitac: 'khách hàng' },
  dichvu:    { label: 'Dịch vụ',                     sop: 'tiếp nhận yêu cầu và bàn giao dịch vụ',             hopdong: 'cung cấp dịch vụ',             doitac: 'khách hàng' },
  sanxuat:   { label: 'Sản xuất',                    sop: 'phát lệnh sản xuất và kiểm soát chất lượng thành phẩm', hopdong: 'gia công sản xuất',        doitac: 'đối tác đặt hàng' },
  tmdt:      { label: 'Thương mại điện tử',          sop: 'xử lý đơn hàng từ sàn đến giao vận',                hopdong: 'vận chuyển/fulfillment',       doitac: 'đơn vị vận chuyển' },
  khac:      { label: 'Kinh doanh tổng hợp',         sop: 'tiếp nhận và xử lý công việc hành chính',           hopdong: 'mua bán/dịch vụ',              doitac: 'đối tác' }
};

/* ---------------- Helper đọc DNA an toàn ---------------- */
function D(ctx) { return (ctx && ctx.dna) || {}; }
function B(brief) { return brief || {}; }
function congTy(ctx) { return (D(ctx).company && D(ctx).company.name) || 'Công ty'; }
function nganh(ctx) { const k = (D(ctx).company && D(ctx).company.industry) || 'khac'; return NGANH[k] || NGANH.khac; }
function vungMien(ctx) { return (D(ctx).company && D(ctx).company.region) || 'Hà Nội'; }
function sanPham(ctx) {
  const p = (Array.isArray(D(ctx).products) && D(ctx).products[0]) || {};
  return { ten: p.name || 'sản phẩm chủ lực', gia: p.price_range || 'theo bảng giá hiện hành' };
}
function khachHang(ctx) { return (D(ctx).customers && D(ctx).customers.profile) || 'khách hàng mục tiêu của công ty'; }
function dieuCam(ctx) {
  const b = D(ctx).voice && D(ctx).voice.banned;
  return (Array.isArray(b) && b.length) ? b : ['không cam kết vượt quá công bố/công năng sản phẩm'];
}
function mucTieu3T(ctx) { return D(ctx).goal_3m || 'mục tiêu kinh doanh quý hiện tại'; }
function vietTat(ctx) {
  const s = congTy(ctx).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/gi, 'd').replace(/\u0110/g, 'D')
    .split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 5);
  return s || 'CTY';
}
function homNay() {
  const d = new Date();
  return { d: d.getDate(), m: d.getMonth() + 1, y: d.getFullYear(),
    ddmmyyyy: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
    yyyymm: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}` };
}
function fmt(brief) { return B(brief).format_dau_ra || 'docx'; }
/* Bỏ động từ đầu câu lệnh ("Soạn quy trình…" → "Quy trình…") để làm tiêu đề tài liệu */
function tenTaiLieu(s) {
  const t = String(s || '').replace(/^(soạn|viết|tạo|lập|làm|xây dựng)\s+/i, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
function round(ctx) { return (ctx && ctx.round) || 0; }
function mdTable(headers, rows) {
  return ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|']
    .concat(rows.map(r => '| ' + r.join(' | ') + ' |')).join('\n');
}

/* ---------------- Markdown → HTML fragment (cho format 'html') ---------------- */
function mdToHtml(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^_(.+)_$/, '<i>$1</i>');
  const out = []; let tbl = []; let ul = false;
  const flushTbl = () => {
    if (!tbl.length) { return; }
    const rows = tbl.filter(l => !/^\|\s*:?-{2,}/.test(l)).map(l => l.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim())));
    const head = rows.shift() || [];
    out.push('<table><thead><tr>' + head.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>'
      + rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody></table>');
    tbl = [];
  };
  const flushUl = () => { if (ul) { out.push('</ul>'); ul = false; } };
  md.split('\n').forEach(line => {
    const t = line.trim();
    if (t.startsWith('|')) { flushUl(); tbl.push(t); return; }
    flushTbl();
    if (!t) { flushUl(); return; }
    if (t.startsWith('## ')) { flushUl(); out.push(`<h2>${inline(t.slice(3))}</h2>`); return; }
    if (t.startsWith('# ')) { flushUl(); out.push(`<h1>${inline(t.slice(2))}</h1>`); return; }
    if (t.startsWith('- ')) { if (!ul) { out.push('<ul>'); ul = true; } out.push(`<li>${inline(t.slice(2))}</li>`); return; }
    flushUl(); out.push(`<p>${inline(t)}</p>`);
  });
  flushTbl(); flushUl();
  return out.join('\n');
}

/* Hoàn thiện: gắn dòng bản sửa + chuyển format đầu ra */
function finish(md, brief, ctx) {
  let body = (round(ctx) > 0 ? `_(Bản sửa vòng ${round(ctx)} — đã xử lý toàn bộ nhận xét)_\n\n` : '') + md;
  const f = fmt(brief);
  if (f === 'xlsx' && !/\n\|/.test(body)) {
    body += '\n\n## Bảng theo dõi phát hành\n' + mdTable(
      ['Ngày', 'Mã văn bản', 'Nơi nhận', 'Trạng thái'],
      [[homNay().ddmmyyyy, `${homNay().m}/CV-${vietTat(ctx)}`, 'Toàn công ty', 'Chờ ký']]
    ) + '\n\nGhi chú giả định: số văn bản đánh theo tháng ban hành.';
  }
  if (f === 'html') return mdToHtml(body);
  return body;
}

/* ================= NV SOP — quy trình chuẩn / công văn thể thức VN ================= */
function laCongVan(brief) { return /công văn|cong van|thông báo|tờ trình|quyết định/i.test(B(brief).muc_tieu || ''); }

function congVanMd(brief, ctx) {
  const cty = congTy(ctx), t = homNay(), vt = vietTat(ctx);
  const chuDe = (B(brief).muc_tieu || 'Thông báo áp dụng bộ quy trình vận hành chuẩn')
    .replace(/^(soạn|viết|tạo|làm)\s+(công văn|thông báo|tờ trình|quyết định)\s*(v\/v|về việc|về)?\s*/i, '') || 'áp dụng bộ quy trình vận hành chuẩn';
  const guiDoiTac = /đối tác|nhà cung cấp|khách hàng/i.test(B(brief).muc_tieu || '');
  const kinhGui = guiDoiTac ? `Quý ${nganh(ctx).doitac}` : `Toàn thể cán bộ, nhân viên ${cty}`;
  return `# Công văn — V/v ${chuDe}

**${cty.toUpperCase()}** · Số: ${String(t.m).padStart(2, '0')}/CV-${vt}

**CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM**
**Độc lập – Tự do – Hạnh phúc**

_${vungMien(ctx)}, ngày ${t.d} tháng ${t.m} năm ${t.y}_

**Kính gửi:** ${kinhGui}

Căn cứ kế hoạch quý và mục tiêu "${mucTieu3T(ctx)}", Phòng Vận hành – Hành chính trân trọng thông báo:

- Nội dung: ${chuDe}, áp dụng thống nhất từ ngày ${t.ddmmyyyy}.
- Trách nhiệm: các bộ phận liên quan phổ biến đến từng cá nhân trong 03 ngày làm việc; vướng mắc phản hồi về P. Vận hành – Hành chính trước khi thực hiện khác đi.
- Lưu ý tuân thủ: mọi tài liệu đối ngoại phát sinh kèm theo phải tôn trọng điều cấm thương hiệu ("${dieuCam(ctx)[0]}").

Đề nghị các đơn vị, cá nhân liên quan nghiêm túc triển khai. Trân trọng./.

**Nơi nhận:**
- Như kính gửi;
- Ban Giám đốc (để b/c);
- Lưu: VT, P.VH-HC.

**TM. ${cty.toUpperCase()}**
**GIÁM ĐỐC**
_(Ký, ghi rõ họ tên, đóng dấu)_`;
}

function sopMd(brief, ctx) {
  const cty = congTy(ctx), ng = nganh(ctx), sp = sanPham(ctx), t = homNay(), vt = vietTat(ctx);
  const better = round(ctx) > 0;
  const chuDe = (B(brief).muc_tieu && B(brief).muc_tieu.length > 12) ? tenTaiLieu(B(brief).muc_tieu) : `Quy trình ${ng.sop}`;
  const nguongLoi = better ? '1%' : '2%';
  const steps = [
    ['B01', 'Tiếp nhận yêu cầu/hàng hóa, ghi sổ', 'NV Hành chính', '15 phút', '100% lượt có phiếu BM-01 đánh số'],
    ['B02', 'Đối chiếu chứng từ với thực tế', 'NV Vận hành', '30 phút', `Lệch >${nguongLoi} phải lập biên bản ngay`],
    ['B03', 'Cập nhật dữ liệu vào phần mềm', 'NV Vận hành', '20 phút', 'Nhập xong trước 17h00 cùng ngày'],
    ['B04', `Nghiệp vụ chính: ${ng.sop}`, 'NV Vận hành phụ trách khu vực', '75 phút', 'Checklist thao tác ký nháy từng mục'],
    ['B05', 'Kiểm tra chéo chất lượng', 'Trưởng ca', '20 phút', 'Kiểm ngẫu nhiên ≥10% mẫu'],
    ['B06', 'Phê duyệt kết quả', 'TP Vận hành', '15 phút', 'Chỉ duyệt khi đủ chữ ký B02–B05'],
    ['B07', 'Bàn giao và lưu hồ sơ', 'NV Hành chính', '15 phút', 'Hồ sơ đủ 3 phần: phiếu, biên bản, chứng từ'],
    ['B08', 'Đánh giá tuần và cải tiến', 'TP Vận hành', '30 phút/tuần', 'Lỗi lặp ≥2 lần/tuần → sửa SOP trong 3 ngày']
  ];
  const tongSla = steps.slice(0, 7).reduce((s, r) => s + parseInt(r[3], 10), 0);
  let md = `# SOP-VH-01 · ${chuDe}

**Công ty:** ${cty} (ngành ${ng.label}) · **Hiệu lực:** ${t.ddmmyyyy} · **Soạn:** NV SOP · **Duyệt:** TP Vận hành

## 1. Mục đích – Phạm vi
- **Mục đích:** chuẩn hóa "${chuDe.toLowerCase()}", giữ lỗi thao tác dưới ${nguongLoi}/tháng.
- **Phạm vi:** bộ phận Vận hành – Hành chính và các vai trò liên quan; phục vụ mục tiêu "${mucTieu3T(ctx)}".

## 2. Định nghĩa
- **SOP:** quy trình thao tác chuẩn — bước, người chịu trách nhiệm, chuẩn hoàn thành.
- **Điểm kiểm soát:** ngưỡng đo được, quyết định bước sau có được chạy hay không.
- **SLA bước:** thời gian chuẩn tối đa một bước, tính bằng phút.

## 3. Các bước thực hiện
${mdTable(['Mã', 'Bước', 'Người phụ trách', 'SLA', 'Điểm kiểm soát'], steps)}

Tổng SLA một lượt ≈ ${tongSla} phút (chưa tính B08 định kỳ).

## 4. Biểu mẫu kèm theo — BM-01 Phiếu theo dõi
${mdTable(['Ngày', 'Mã phiếu', 'Nội dung', 'SL', 'Người thực hiện', 'Kiểm soát', 'Ghi chú'],
    [[t.ddmmyyyy, `${vt}-${t.yyyymm}-001`, `Lô ${sp.ten}`, '50', 'NV Vận hành', 'Đạt', '—']])}

Giả định: mã phiếu = viết tắt công ty + năm tháng + số thứ tự; lưu bản giấy và scan 24 tháng.

## 5. Kiểm soát – KPI
- ≥98% lượt đạt toàn bộ điểm kiểm soát; 100% hồ sơ đủ chữ ký; SLA vượt 2 lần liên tiếp báo TP trong ngày.
- Tài liệu đối ngoại phát sinh từ quy trình phải tôn trọng điều cấm: "${dieuCam(ctx)[0]}".`;
  if (better) {
    md += `

## 6. Nhật ký sửa đổi (vòng ${round(ctx)})
- Gán đích danh 1 vai trò chịu trách nhiệm chính mỗi bước; điểm kiểm soát chuyển hết sang ngưỡng số.
- Biểu mẫu BM-01 thêm cột Kiểm soát và mã phiếu truy vết.`;
  }
  return md;
}

function outNvSop(brief, ctx) {
  // Công văn không có cấu trúc slide — nếu brief đòi pptx thì trả bản quy trình dạng slide
  const dungCongVan = laCongVan(brief) && fmt(brief) !== 'pptx';
  return finish(dungCongVan ? congVanMd(brief, ctx) : sopMd(brief, ctx), brief, ctx);
}

/* ================= NV LEGAL — rà hợp đồng cơ bản ================= */
function legalMd(brief, ctx) {
  const cty = congTy(ctx), ng = nganh(ctx), sp = sanPham(ctx), t = homNay();
  const better = round(ctx) > 0;
  let loaiHd = (B(brief).muc_tieu && B(brief).muc_tieu.length > 12) ? tenTaiLieu(B(brief).muc_tieu) : `Hợp đồng ${ng.hopdong}`;
  loaiHd = loaiHd.replace(/^rà soát\s+/i, '');
  loaiHd = loaiHd.charAt(0).toUpperCase() + loaiHd.slice(1);
  const nguon = (Array.isArray(B(brief).dau_vao) && B(brief).dau_vao.length) ? B(brief).dau_vao.join(', ') : 'bản nháp từ đối tác';
  const rows = [
    ['Thanh toán', '**Cao**', 'Trả 100% sau, không hạn chót, không lãi chậm trả', 'Tạm ứng 30% khi ký; 70% trong 07 ngày sau nghiệm thu; lãi chậm trả 0,05%/ngày'],
    ['Phạt vi phạm', '**Cao**', 'Bỏ trống mức phạt hoặc ghi vượt trần luật', 'Phạt 8% giá trị phần nghĩa vụ bị vi phạm (trần Điều 301, Luật Thương mại 2005)'],
    ['Chấm dứt hợp đồng', '**Trung**', 'Cho đơn phương chấm dứt không cần báo trước', 'Báo trước 30 ngày bằng văn bản; nghĩa vụ đã phát sinh vẫn hoàn tất'],
    ['Bảo mật', '**Trung**', 'Không giới hạn phạm vi và thời hạn bảo mật', 'Bảo mật giá, dữ liệu khách, công thức 24 tháng sau khi chấm dứt'],
    ['Sở hữu trí tuệ', '**Cao**', 'Không nói rõ ai sở hữu thiết kế/nội dung/công thức', `Sản phẩm trí tuệ tạo ra theo hợp đồng thuộc ${cty} sau khi thanh toán đủ 100%`],
    ['Bất khả kháng', '**Thấp**', 'Liệt kê chung chung, không nghĩa vụ thông báo', 'Thông báo văn bản trong 07 ngày kèm xác nhận cơ quan thẩm quyền'],
    ['Giải quyết tranh chấp', '**Trung**', 'Chỉ ghi "hai bên tự thương lượng"', `Thương lượng 30 ngày; không xong đưa ra Tòa án có thẩm quyền tại ${vungMien(ctx)}`],
    ['Cam kết về sản phẩm', '**Cao**', 'Phụ lục truyền thông hứa vượt công bố', `Không đưa nội dung bị cấm ("${dieuCam(ctx)[0]}") vào hợp đồng và phụ lục`]
  ];
  let md = `# Rà soát ${loaiHd}

**Bên rà:** P. Vận hành – HC, ${cty} · **Đối tác:** ${ng.doitac} · **Ngày:** ${t.ddmmyyyy} · **Nguồn:** ${nguon}

## 1. Phạm vi rà soát
Rà 8 nhóm điều khoản trọng yếu ở mức cơ bản, tham chiếu ${sp.ten} (giá ${sp.gia}) và tập khách "${khachHang(ctx)}". Chưa thẩm định thuế và điều kiện kinh doanh chuyên ngành.

## 2. Bảng điều khoản – rủi ro – đề xuất
${mdTable(['Điều khoản', 'Mức rủi ro', 'Vấn đề thường gặp', 'Đề xuất câu chữ'], rows)}

Căn cứ xếp mức: Cao = mất tiền trực tiếp hoặc mất tài sản trí tuệ; Trung = tranh chấp kéo dài; Thấp = ít xảy ra, dễ khắc phục.

## 3. Ba điểm phải đàm phán trước khi ký
1. Chốt lịch thanh toán 30/70 kèm lãi chậm trả 0,05%/ngày — tránh bị chiếm dụng vốn.
2. Ghi rõ mức phạt 8% phần nghĩa vụ vi phạm — không ghi thì không đòi được.
3. SHTT chuyển giao sau khi thanh toán đủ — bảo vệ công thức/thiết kế của ${cty}.`;
  if (better) {
    md += `

## 4. Căn cứ tham chiếu (bổ sung theo nhận xét)
- BLDS 2015; Luật Thương mại 2005 (Đ.300–307); NĐ 13/2023/NĐ-CP nếu có trao đổi dữ liệu cá nhân khách.`;
  }
  md += `

## ${better ? 5 : 4}. Lưu ý pháp lý
**⚠️ Bản rà soát này chỉ mang tính tham khảo nội bộ ở mức cơ bản — cần luật sư xác nhận trước khi ký.**`;
  return md;
}

function outNvLegal(brief, ctx) { return finish(legalMd(brief, ctx), brief, ctx); }

/* ================= TP VẬN HÀNH — kế hoạch chuẩn hóa + khung nghiệm thu ================= */
function tpMd(brief, ctx) {
  const cty = congTy(ctx), ng = nganh(ctx), t = homNay();
  const mt = (B(brief).muc_tieu && B(brief).muc_tieu.length > 12) ? tenTaiLieu(B(brief).muc_tieu) : 'Kế hoạch chuẩn hóa vận hành – hành chính quý';
  const rows = [
    ['SOP-VH-01', `Quy trình ${ng.sop}`, 'NV SOP', 'TP Vận hành', 'Tuần 2', 'Cao'],
    ['HD-PL-01', `Checklist rà hợp đồng ${ng.hopdong}`, 'NV Pháp lý', 'TP Vận hành', 'Tuần 3', 'Cao'],
    ['SOP-VH-02', 'Quy trình xử lý sự cố/khiếu nại nội bộ', 'NV SOP', 'TP Vận hành', 'Tuần 4', 'Trung'],
    ['BM-HC-01', 'Bộ biểu mẫu hành chính (phiếu đề xuất, bàn giao, biên bản)', 'NV SOP', 'TP Vận hành', 'Tuần 5', 'Trung'],
    ['CV-HC-01', 'Mẫu công văn/thông báo chuẩn thể thức', 'NV SOP', 'TP Vận hành', 'Tuần 6', 'Thấp']
  ];
  return finish(`# ${mt}

**Công ty:** ${cty} (ngành ${ng.label}) · **Lập:** TP Vận hành · **Ngày:** ${t.ddmmyyyy} · **Gắn mục tiêu:** "${mucTieu3T(ctx)}"

## 1. Mục tiêu quản trị
- 100% quy trình lõi có SOP ban hành trong 8 tuần; lỗi vận hành lặp giảm 50% so với quý trước.
- Mỗi tài liệu ban hành đều có người chịu trách nhiệm, biểu mẫu kèm theo và ngày hiệu lực.

## 2. Danh mục tài liệu ưu tiên
${mdTable(['Mã', 'Tài liệu', 'Soạn', 'Duyệt', 'Hạn', 'Ưu tiên'], rows)}

Giả định: mỗi tài liệu tối đa 2 vòng sửa; quá hạn 1 tuần phải báo cáo COO kèm lý do.

## 3. Chuẩn nghiệm thu (rubric rút gọn)
- Cấu trúc đủ mục 20% · Trách nhiệm rõ 25% · Kiểm soát đo được 20% · Khả thi 15% · Thể thức, chính tả 10% · Biểu mẫu kèm theo 10%.
- Ngưỡng đạt ≥90/100; 80–89 trả lại sửa 1 vòng; dưới 80 làm lại từ đầu.

## 4. Nhịp vận hành
- Họp rà tiến độ 30 phút sáng thứ Hai; báo cáo tuần gửi COO trước 17h00 thứ Sáu.
- Hồ sơ lưu kho chung 24 tháng; tài liệu hết hiệu lực đóng dấu "Ngừng áp dụng" trong 24 giờ.`, brief, ctx);
}

/* ================= DEFAULT — checklist hành chính – vận hành ================= */
function defaultMd(brief, ctx) {
  const cty = congTy(ctx), ng = nganh(ctx), t = homNay();
  const mt = (B(brief).muc_tieu && B(brief).muc_tieu.length > 12) ? tenTaiLieu(B(brief).muc_tieu) : 'Checklist hành chính – vận hành định kỳ';
  const rows = [
    ['Mở/đóng ca, bàn giao sổ trực', 'Hằng ngày', 'NV Vận hành', 'Ký bàn giao trước 8h30 và sau 17h30'],
    ['Đối chiếu quỹ – chứng từ chi tiêu', 'Hằng ngày', 'NV Hành chính', 'Lệch quỹ = 0đ, có phiếu cho 100% khoản chi'],
    [`Theo dõi nghiệp vụ lõi: ${ng.sop}`, 'Hằng ngày', 'NV Vận hành', 'Chạy đúng SOP-VH-01, lỗi ghi vào sổ sự cố'],
    ['Kiểm kho văn phòng phẩm/vật tư', 'Thứ Tư hằng tuần', 'NV Hành chính', 'Tồn tối thiểu đạt 100% danh mục thiết yếu'],
    ['Rà hợp đồng sắp đến hạn (≤30 ngày)', 'Thứ Năm hằng tuần', 'NV Pháp lý', 'Danh sách gửi TP trước 15h00'],
    ['Bảo trì thiết bị, an toàn PCCC', 'Ngày 05 hằng tháng', 'NV Vận hành', 'Biên bản kiểm tra có chữ ký 2 người'],
    ['Lưu trữ hồ sơ, scan tài liệu mới', 'Thứ Sáu hằng tuần', 'NV Hành chính', '100% hồ sơ tuần được scan, đặt tên chuẩn'],
    ['Tổng hợp báo cáo tuần gửi TP', 'Thứ Sáu 16h00', 'NV Vận hành', 'Đủ số liệu 4 mục: sự cố, quỹ, kho, hợp đồng']
  ];
  return finish(`# ${mt}

**Công ty:** ${cty} (ngành ${ng.label}) · **Ban hành:** P. Vận hành – Hành chính · **Ngày:** ${t.ddmmyyyy}

## 1. Mục đích
Bảo đảm việc hành chính – vận hành lặp lại hằng ngày/tuần/tháng không phụ thuộc trí nhớ cá nhân, phục vụ mục tiêu "${mucTieu3T(ctx)}".

## 2. Bảng checklist
${mdTable(['Hạng mục', 'Tần suất', 'Phụ trách', 'Chuẩn hoàn thành'], rows)}

Giả định: khung giờ theo lịch làm việc hành chính; ngày nghỉ lễ dồn sang ngày làm việc kế tiếp.

## 3. Quy tắc thực hiện
- Mục không hoàn thành phải ghi lý do trong ngày; bỏ trống 2 lần/tuần → TP nhắc nhở bằng văn bản.

## 4. Kiểm duyệt tài liệu ra ngoài
- Tài liệu gửi ra ngoài công ty phải qua TP duyệt và tôn trọng điều cấm: "${dieuCam(ctx)[0]}".`, brief, ctx);
}

/* ================= REVIEWS — nhận xét của TP Vận hành ================= */
function danhGia(brief, pass, datText, truotText, loi) {
  const tc = (Array.isArray(B(brief).tieu_chi_cham) && B(brief).tieu_chi_cham.length)
    ? ` Đối chiếu tiêu chí chấm trong brief: ${B(brief).tieu_chi_cham.join(' · ')}.` : '';
  if (pass) return { feedback_chi_tiet: datText + tc, loi_cu_the: [] };
  return {
    feedback_chi_tiet: truotText + tc + ' Sửa đúng từng mục dưới đây rồi nộp lại trong vòng này, không cần hỏi thêm.',
    loi_cu_the: loi
  };
}

function reviewNvSop(brief, ctx, pass) {
  return danhGia(brief, pass,
    'Đạt chuẩn ban hành: đủ 5 phần, các bước có mã, người phụ trách và SLA, điểm kiểm soát đo được, biểu mẫu truy vết tốt. Góp ý nhỏ: sau 2 tuần chạy thử cân nhắc rút SLA bước xử lý chính xuống 60 phút, và bổ sung link bản mềm biểu mẫu vào mục 4.',
    'Chưa đạt chuẩn ban hành theo rubric vận hành (trách nhiệm chưa rõ, kiểm soát chưa đo được, biểu mẫu chưa truy vết).',
    [
      { vi_tri: 'Mục 3 – Các bước thực hiện', loi: 'Bước xử lý chính ghi chung "bộ phận liên quan", không có 1 vai trò chịu trách nhiệm đích danh', cach_sua: 'Mỗi bước gán đúng 1 vai trò chịu trách nhiệm chính (VD: B04 — NV Vận hành phụ trách khu vực); người phối hợp ghi riêng, không nhét vào cột phụ trách' },
      { vi_tri: 'Cột Điểm kiểm soát (B02, B05)', loi: 'Viết định tính kiểu "kiểm tra kỹ", không đo được nên không thể nghiệm thu', cach_sua: 'Chuyển sang ngưỡng số: lệch >2% lập biên bản ngay; kiểm ngẫu nhiên ≥10% mẫu; dữ liệu nhập xong trước 17h00' },
      { vi_tri: 'Mục 4 – Biểu mẫu kèm theo', loi: 'Biểu mẫu thiếu cột Kiểm soát và mã phiếu nên không truy vết được lượt lỗi', cach_sua: 'Thêm cột "Kiểm soát (Đạt/Không)" và đánh mã phiếu theo cấu trúc viết-tắt-công-ty + năm tháng + số thứ tự' },
      { vi_tri: 'Thể thức văn bản đi kèm', loi: 'Công văn thiếu phần "Nơi nhận" và dòng tiêu ngữ nên sai thể thức Nghị định 30/2020/NĐ-CP', cach_sua: 'Bổ sung Quốc hiệu – tiêu ngữ, số/ký hiệu, địa danh – ngày tháng, "Nơi nhận" và khối chữ ký đúng mẫu' }
    ]);
}

function reviewNvLegal(brief, ctx, pass) {
  return danhGia(brief, pass,
    'Đạt: đủ 8 nhóm điều khoản, mức rủi ro có căn cứ, đề xuất là câu chữ dán được vào hợp đồng, có disclaimer bắt buộc. Góp ý nhỏ: bổ sung cột số điều khoản gốc trong bản nháp để đối chiếu nhanh khi đàm phán.',
    'Chưa đạt chuẩn bàn giao: bảng rà soát thiếu điều khoản trọng yếu và đề xuất chưa dùng được ngay.',
    [
      { vi_tri: 'Mục 2 – Bảng điều khoản', loi: 'Thiếu 2 điều khoản trọng yếu: phạt vi phạm và sở hữu trí tuệ', cach_sua: 'Bổ sung dòng Phạt vi phạm (nêu trần 8% giá trị phần nghĩa vụ vi phạm theo Điều 301 Luật Thương mại 2005) và dòng SHTT (chuyển giao quyền sau khi thanh toán đủ 100%)' },
      { vi_tri: 'Cột Mức rủi ro', loi: 'Xếp Cao/Thấp cảm tính, không kèm căn cứ nên CEO không biết tin mức nào', cach_sua: 'Thêm 1 dòng dưới bảng nêu tiêu chí xếp mức: Cao = mất tiền trực tiếp/mất tài sản trí tuệ; Trung = tranh chấp kéo dài; Thấp = ít xảy ra, dễ khắc phục' },
      { vi_tri: 'Cột Đề xuất', loi: 'Góp ý chung chung kiểu "nên thương lượng lại", không có câu chữ thay thế', cach_sua: 'Viết sẵn câu điều khoản hoàn chỉnh để dán vào hợp đồng (VD: "chậm trả chịu lãi 0,05%/ngày, tối đa 30 ngày")' },
      { vi_tri: 'Cuối tài liệu', loi: 'Thiếu disclaimer bắt buộc của nghề', cach_sua: 'Kết bằng dòng in đậm: "cần luật sư xác nhận trước khi ký" — không có dòng này thì không được bàn giao' }
    ]);
}

function reviewTpVh(brief, ctx, pass) {
  return danhGia(brief, pass,
    'Kế hoạch đạt: danh mục ưu tiên có hạn và người phụ trách, rubric nghiệm thu rõ ngưỡng. Góp ý nhỏ: thêm cột trạng thái cập nhật hằng tuần để COO nhìn nhanh tiến độ.',
    'Kế hoạch chưa đạt: chưa quản trị được tiến độ và chất lượng tài liệu.',
    [
      { vi_tri: 'Mục 2 – Danh mục ưu tiên', loi: 'Tài liệu không có hạn hoàn thành và người duyệt', cach_sua: 'Mỗi dòng phải đủ: người soạn, người duyệt, hạn theo tuần, mức ưu tiên' },
      { vi_tri: 'Mục 3 – Chuẩn nghiệm thu', loi: 'Không nêu trọng số và ngưỡng điểm nên nghiệm thu cảm tính', cach_sua: 'Ghi rõ 6 tiêu chí kèm trọng số (tổng 100%) và ngưỡng: ≥90 đạt, 80–89 sửa 1 vòng, <80 làm lại' }
    ]);
}

function reviewDefault(brief, ctx, pass) {
  return danhGia(brief, pass,
    'Đạt yêu cầu bàn giao: hạng mục có tần suất, người phụ trách và chuẩn hoàn thành đo được. Góp ý nhỏ: in khổ A4 dán tại khu vực làm việc để tiện tick tay.',
    'Chưa đạt: tài liệu vận hành – hành chính phải thực thi được ngay, bản này còn chung chung.',
    [
      { vi_tri: 'Bảng nội dung chính', loi: 'Hạng mục không có người phụ trách theo vai trò và chuẩn hoàn thành', cach_sua: 'Mỗi dòng bổ sung cột Phụ trách (theo vai trò, không ghi tên riêng) và Chuẩn hoàn thành đo được (con số, giờ chốt, số chữ ký)' },
      { vi_tri: 'Toàn tài liệu', loi: 'Thiếu ngày ban hành và đơn vị chịu trách nhiệm', cach_sua: 'Thêm dòng meta đầu tài liệu: công ty, đơn vị ban hành, ngày hiệu lực' }
    ]);
}

module.exports = {
  dept: 'vh',
  outputs: {
    tp_vh: (brief, ctx) => tpMd(brief, ctx),
    nv_sop: (brief, ctx) => outNvSop(brief, ctx),
    nv_legal: (brief, ctx) => outNvLegal(brief, ctx),
    default: (brief, ctx) => defaultMd(brief, ctx)
  },
  reviews: {
    tp_vh: (brief, ctx, pass) => reviewTpVh(brief, ctx, pass),
    nv_sop: (brief, ctx, pass) => reviewNvSop(brief, ctx, pass),
    nv_legal: (brief, ctx, pass) => reviewNvLegal(brief, ctx, pass),
    default: (brief, ctx, pass) => reviewDefault(brief, ctx, pass)
  }
};
