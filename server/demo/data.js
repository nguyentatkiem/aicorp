'use strict';
/*
 * Phòng Dữ liệu - Công nghệ (dept_id = 'data') — module DemoEngine offline.
 * Agent: tp_data (trưởng phòng, review), nv_ana (phân tích số liệu), nv_auto (dashboard + n8n).
 * Toàn bộ số liệu được DỰNG DETERMINISTIC từ ctx.dna (tên công ty + sản phẩm + ngành)
 * để bài của nv_ana, dashboard của nv_auto và nhận xét của tp_data luôn KHỚP NHAU.
 * Không phụ thuộc dependency ngoài. Node 18+.
 */

/* ---------------- Helper đọc DNA an toàn ---------------- */
const NGANH = {
  banle: 'bán lẻ', fnb: 'F&B', thoitrang: 'thời trang', mypham: 'mỹ phẩm',
  giaoduc: 'giáo dục', suckhoe: 'sức khỏe', noithat: 'nội thất', bds: 'bất động sản',
  dichvu: 'dịch vụ', sanxuat: 'sản xuất', tmdt: 'thương mại điện tử', khac: 'khác'
};
const KENH = {
  facebook: 'Facebook', shopee: 'Shopee', tiktok: 'TikTok', zalo: 'Zalo',
  instagram: 'Instagram', website: 'Website', lazada: 'Lazada', offline: 'Cửa hàng'
};

function D(ctx) { return (ctx && ctx.dna) || {}; }
function B(brief) { return brief || {}; }
function coName(ctx) { return (D(ctx).company && D(ctx).company.name) || 'doanh nghiệp'; }
function nganhVn(ctx) {
  const id = (D(ctx).company && D(ctx).company.industry) || '';
  return NGANH[id] || (id || 'bán lẻ');
}
function capKenh(k) { return KENH[String(k).toLowerCase()] || (String(k).charAt(0).toUpperCase() + String(k).slice(1)); }
function kenh(ctx) {
  const c = (D(ctx).customers && D(ctx).customers.channels) || [];
  return (c.length ? c : ['facebook', 'website']).map(capKenh);
}
function khach(ctx) { return (D(ctx).customers && D(ctx).customers.profile) || 'khách hàng mục tiêu của công ty'; }
function dieuCam(ctx) { return (D(ctx).voice && Array.isArray(D(ctx).voice.banned) && D(ctx).voice.banned) || []; }
function goal3m(ctx) { return D(ctx).goal_3m || ''; }
function goalDon(ctx) {
  const m = String(goal3m(ctx)).match(/(\d[\d.]{0,6})\s*đơn/i);
  return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
}

/* Đổi "159k" / "1.2tr" / "1,5tỷ" / "250.000" → số đồng */
function parseMoney(raw) {
  const m = String(raw).toLowerCase().replace(/\s|đ|vnd/g, '')
    .match(/^([\d.,]+)(k|nghìn|tr|trieu|triệu|m|tỷ|ty|b)?/);
  if (!m || !m[1]) return null;
  const suf = m[2] || '';
  let v = suf ? parseFloat(m[1].replace(/,/g, '.')) : parseFloat(m[1].replace(/[.,]/g, ''));
  if (!isFinite(v) || v <= 0) return null;
  if (suf === 'k' || suf === 'nghìn') v *= 1e3;
  else if (suf === 'tr' || suf === 'trieu' || suf === 'triệu' || suf === 'm') v *= 1e6;
  else if (suf === 'tỷ' || suf === 'ty' || suf === 'b') v *= 1e9;
  else if (v < 1000) v *= 1e3; // "159-289" hiểu là nghìn đồng
  return v;
}
function sanPham(ctx) {
  const p = ((D(ctx).products || [])[0]) || {};
  const range = p.price_range || '';
  const parts = String(range).split(/[-–—~]/).map(parseMoney).filter(Boolean);
  const aov = parts.length
    ? Math.max(1000, Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) / 1000) * 1000)
    : 250000;
  return { name: p.name || 'sản phẩm chủ lực', range: range || 'chưa khai báo', aov };
}

/* ---------------- Định dạng số kiểu Việt Nam ---------------- */
function vnd(n) { return Math.round(n).toLocaleString('vi-VN'); }
function trieu(n) { return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr'; }
function p1(n) { return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 1 }); }
function pf1(n) { return Number(n).toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function thangLabels() {
  const out = []; const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const t = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push('T' + (t.getMonth() + 1) + '/' + t.getFullYear());
  }
  return out;
}

/* ---------------- Bộ số liệu 6 tháng (deterministic theo DNA) ---------------- */
function series(ctx) {
  const sp = sanPham(ctx);
  const seed = hashStr(coName(ctx) + '|' + sp.name + '|' + nganhVn(ctx));
  const g = 0.04 + (seed % 5) * 0.01;            // tăng trưởng 4–8%/tháng
  const dip = 1 + (seed % 3);                    // 1 tháng thấp điểm (mùa vụ)
  const spike = 4 + ((seed >> 3) % 2);           // 1 tháng cao điểm cuối kỳ
  const base = Math.max(8, Math.round((9e7 + (seed % 13) * 1e7) / sp.aov)); // doanh thu gốc 90–210tr
  const labels = thangLabels();
  const months = [];
  for (let i = 0; i < 6; i++) {
    let mult = Math.pow(1 + g, i);
    if (i === dip) mult *= 0.90;
    if (i === spike) mult *= 1.12;
    const orders = Math.max(5, Math.round(base * mult));
    const revenue = orders * sp.aov;
    const adRate = 0.165 - i * 0.005 + (i === dip ? 0.02 : 0);
    const adSpend = Math.max(1e6, Math.round(revenue * adRate / 1e4) * 1e4);
    const cpa = Math.round(adSpend / orders / 100) * 100;
    const conv = Math.max(0.8, +(1.9 + (seed % 7) / 10 + i * 0.06 - (i === dip ? 0.25 : 0)).toFixed(1));
    months.push({ label: labels[i], orders, revenue, adSpend, cpa, conv });
  }
  const first = months[0], last = months[5];
  const avgCpa = Math.round(months.reduce((a, m) => a + m.cpa, 0) / 6 / 100) * 100;
  const chs = kenh(ctx);
  const share1 = 55 + (seed % 16); // kênh chính 55–70%
  return {
    sp, months, dip, spike,
    growthPct: (last.revenue / first.revenue - 1) * 100,
    gMonth: (Math.pow(last.revenue / first.revenue, 1 / 5) - 1) * 100, // CAGR thực theo chuỗi số
    dipDropPct: (1 - months[dip].orders / months[dip - 1].orders) * 100,
    cpaDropPct: (1 - last.cpa / first.cpa) * 100,
    avgCpa,
    cap: Math.round(sp.aov * 0.2 / 1000) * 1000, // CPA trần = 20% AOV
    ch1: chs[0], ch2: chs[1] || 'kênh khác', share1, share2: 100 - share1
  };
}

function suaLine(ctx) {
  const r = (ctx && ctx.round) || 0;
  return r > 0 ? `_(Bản sửa vòng ${r} — đã xử lý toàn bộ nhận xét)_\n\n` : '';
}
function fmtOf(brief) { return B(brief).format_dau_ra || 'md'; }

/* ---------------- NV PHÂN TÍCH (nv_ana) ---------------- */
function bangThang(s, extraCol) {
  let h = '| Tháng | Đơn | Doanh thu (đ) | CP quảng cáo (đ) | CPA (đ) | CR (%) |' + (extraCol ? ' Δ MoM |' : '') + '\n';
  h += '|---|---:|---:|---:|---:|---:|' + (extraCol ? '---:|' : '') + '\n';
  s.months.forEach((m, i) => {
    const d = i === 0 ? '—' : p1((m.revenue / s.months[i - 1].revenue - 1) * 100) + '%';
    h += `| ${m.label} | ${m.orders} | ${vnd(m.revenue)} | ${vnd(m.adSpend)} | ${vnd(m.cpa)} | ${pf1(m.conv)} |` + (extraCol ? ` ${d} |` : '') + '\n';
  });
  return h;
}
function insight5(s, ctx) {
  const m = s.months, dip = m[s.dip], prev = m[s.dip - 1];
  const gd = goalDon(ctx);
  return [
    `1. **Tăng trưởng ổn định:** doanh thu ${m[5].label} đạt ${trieu(m[5].revenue)}, tăng ${p1(s.growthPct)}% so với ${m[0].label} (${trieu(m[0].revenue)}), trung bình +${p1(s.gMonth)}%/tháng.`,
    `2. **Điểm gãy ${dip.label}:** đơn giảm còn ${dip.orders} (−${p1(s.dipDropPct)}% so ${prev.label}), CPA vọt lên ${vnd(dip.cpa)}đ — cao nhất kỳ, trùng nhịp thấp điểm ngành ${nganhVn(ctx)}.`,
    `3. **Quảng cáo hiệu quả dần:** CPA giảm từ ${vnd(m[0].cpa)}đ còn ${vnd(m[5].cpa)}đ (−${p1(s.cpaDropPct)}%), CR tăng ${pf1(m[0].conv)}% → ${pf1(m[5].conv)}%.`,
    `4. **Lệch kênh:** ${s.ch1} chiếm ~${s.share1}% doanh thu, ${s.ch2} chỉ ${s.share2}% — kênh phụ chưa được đầu tư nội dung riêng.`,
    `5. **Dư địa giá trị đơn:** AOV ${vnd(s.sp.aov)}đ` +
      (gd ? `; so mục tiêu ${gd} đơn/tháng, ${m[5].label} đạt ${m[5].orders} đơn (${p1(m[5].orders / gd * 100)}%).`
          : ` mới ở giữa khoảng giá ${s.sp.range} — còn cửa combo/upsell nâng giá trị đơn.`)
  ].join('\n');
}
function khuyenNghi3(s, ctx) {
  const target = Math.round(s.sp.aov * 1.15 / 1000) * 1000;
  const floor = Math.round(s.months[5].orders * 0.9);
  return [
    `1. **Dồn lực kênh chính:** tăng 20% ngân sách ${s.ch1} trong 30 ngày, giữ CPA trần ${vnd(s.cap)}đ (=20% AOV); vượt trần 7 ngày liên tiếp → cắt nhóm quảng cáo kém về mức cũ.`,
    `2. **Nâng AOV +15%:** tung combo ${s.sp.name} + quà tặng, mục tiêu AOV ${vnd(target)}đ, đo theo tuần trên ${s.ch1}.`,
    `3. **Chặn điểm gãy mùa vụ:** chuẩn bị khuyến mãi + tồn kho trước nhịp thấp điểm kế tiếp, giữ sàn ≥ ${floor} đơn/tháng.`
  ].join('\n');
}
function anaGhiChu(s, ctx) {
  const cam = dieuCam(ctx);
  return `_Giả định: AOV ${vnd(s.sp.aov)}đ = trung bình khoảng giá ${s.sp.range}; doanh thu = đơn × AOV; CPA = chi phí QC ÷ đơn. Nguồn: số liệu bán hàng nội bộ 6 tháng._` +
    (cam.length ? `\n_Lưu ý tuân thủ: ${cam.join('; ')}._` : '');
}
function anaDoc(brief, ctx) {
  const s = series(ctx); const r = (ctx && ctx.round) || 0;
  return suaLine(ctx) +
    `# Phân tích bán hàng 6 tháng — ${coName(ctx)}\n\n` +
    `**Mục tiêu:** ${B(brief).muc_tieu || 'Tìm insight từ số liệu bán hàng và đề xuất hành động.'}\n` +
    `**Phạm vi:** ${s.months[0].label}–${s.months[5].label} · ${s.sp.name} (${s.sp.range}) · Khách: ${khach(ctx)}\n\n` +
    `## Bảng số liệu 6 tháng\n${bangThang(s, r > 0)}${anaGhiChu(s, ctx)}\n\n` +
    `## 5 insight chính\n${insight5(s, ctx)}\n\n` +
    `## 3 khuyến nghị hành động\n${khuyenNghi3(s, ctx)}`;
}
function anaXlsx(brief, ctx) {
  const s = series(ctx);
  return suaLine(ctx) +
    `# Bảng dữ liệu bán hàng 6 tháng — ${coName(ctx)}\n\n` +
    bangThang(s, true) + '\n' +
    `| Kênh | Tỷ trọng doanh thu | Ghi chú |\n|---|---:|---|\n` +
    `| ${s.ch1} | ${s.share1}% | Kênh chính, ưu tiên ngân sách |\n` +
    `| ${s.ch2} | ${s.share2}% | Chưa có nội dung riêng |\n\n` +
    anaGhiChu(s, ctx) + '\n\n' +
    `**3 điểm cần chú ý:** (1) ${s.months[s.dip].label} đơn giảm ${p1(s.dipDropPct)}%; ` +
    `(2) CPA cả kỳ giảm ${p1(s.cpaDropPct)}% còn ${vnd(s.months[5].cpa)}đ; ` +
    `(3) CPA trần khuyến nghị ${vnd(s.cap)}đ (=20% AOV ${vnd(s.sp.aov)}đ).`;
}
function anaPptx(brief, ctx) {
  const s = series(ctx); const m = s.months;
  return suaLine(ctx) +
    `# Insight bán hàng 6 tháng — ${coName(ctx)}\n\n` +
    `## Bối cảnh & dữ liệu\n- Kỳ: ${m[0].label}–${m[5].label} · ${s.sp.name} (${s.sp.range})\n- Kênh: ${kenh(ctx).join(', ')} · Khách: ${khach(ctx)}\n- Nguồn: dữ liệu bán hàng nội bộ, AOV ${vnd(s.sp.aov)}đ\n\n` +
    `## Bức tranh 6 tháng\n- Doanh thu: ${trieu(m[0].revenue)} → ${trieu(m[5].revenue)} (+${p1(s.growthPct)}%)\n- Đơn: ${m[0].orders} → ${m[5].orders}/tháng · CR ${pf1(m[0].conv)}% → ${pf1(m[5].conv)}%\n- Điểm gãy ${m[s.dip].label}: đơn −${p1(s.dipDropPct)}%, CPA đỉnh ${vnd(m[s.dip].cpa)}đ\n\n` +
    `## Insight hiệu quả chi phí\n- CPA giảm ${p1(s.cpaDropPct)}% còn ${vnd(m[5].cpa)}đ\n- Trần an toàn: ${vnd(s.cap)}đ (=20% AOV)\n- ${s.ch1} gánh ${s.share1}% doanh thu, ${s.ch2} mới ${s.share2}%\n\n` +
    `## 3 khuyến nghị\n- +20% ngân sách ${s.ch1}, giữ CPA ≤ ${vnd(s.cap)}đ\n- Combo nâng AOV +15% (mục tiêu ${vnd(Math.round(s.sp.aov * 1.15 / 1000) * 1000)}đ)\n- Chặn mùa thấp điểm: giữ sàn ${Math.round(m[5].orders * 0.9)} đơn/tháng\n\n` +
    `## Bước tiếp theo\n- Tuần 1: duyệt CPA trần + phân bổ lại ngân sách\n- Tuần 2–3: chạy combo thử trên ${s.ch1}\n- Tuần 4: đo lại AOV, CR — báo cáo CEO`;
}
function anaHtml(brief, ctx) {
  const s = series(ctx); const m = s.months;
  let rows = '';
  m.forEach(x => { rows += `<tr><td>${x.label}</td><td>${x.orders}</td><td>${vnd(x.revenue)}</td><td>${vnd(x.cpa)}</td></tr>`; });
  return suaLine(ctx) +
    `<div style="font-family:system-ui,sans-serif;background:#f7f9fc;color:#1a2433;padding:18px;border-radius:10px">` +
    `<h3 style="margin:0 0 8px">Insight bán hàng 6 tháng — ${coName(ctx)}</h3>` +
    `<table style="border-collapse:collapse;background:#fff;font-size:13px" border="1" cellpadding="6"><tr><th>Tháng</th><th>Đơn</th><th>Doanh thu (đ)</th><th>CPA (đ)</th></tr>${rows}</table>` +
    `<ol style="font-size:14px;line-height:1.5"><li>Doanh thu +${p1(s.growthPct)}% sau 6 tháng (${trieu(m[0].revenue)} → ${trieu(m[5].revenue)}).</li>` +
    `<li>Điểm gãy ${m[s.dip].label}: đơn −${p1(s.dipDropPct)}%, CPA đỉnh ${vnd(m[s.dip].cpa)}đ.</li>` +
    `<li>${s.ch1} chiếm ${s.share1}% doanh thu — đề xuất +20% ngân sách, CPA trần ${vnd(s.cap)}đ.</li></ol>` +
    `<p style="font-size:12px;color:#5b6b7f">Giả định: doanh thu = đơn × AOV ${vnd(s.sp.aov)}đ (trung bình khoảng giá ${s.sp.range}).</p></div>`;
}
function anaOut(brief, ctx) {
  switch (fmtOf(brief)) {
    case 'xlsx': return anaXlsx(brief, ctx);
    case 'pptx': return anaPptx(brief, ctx);
    case 'html': return anaHtml(brief, ctx);
    default: return anaDoc(brief, ctx);
  }
}

/* ---------------- NV TỰ ĐỘNG HÓA (nv_auto) ---------------- */
const DB_CSS = '<style>.db{font-family:system-ui,sans-serif;background:#f7f9fc;color:#1a2433;padding:20px;border-radius:12px}' +
  '.db h2{margin:0 0 4px}.db .s{font-size:12px;color:#5b6b7f}.db .k{display:flex;gap:10px;flex-wrap:wrap}' +
  '.db .c{flex:1 1 140px;background:#fff;border:1px solid #e3e9f2;border-radius:10px;padding:12px}.db .c b{display:block;font-size:24px;margin:2px 0}' +
  '.db .u{font-size:12px;color:#188554}.db .d{font-size:12px;color:#c62f2f}' +
  '.db table{width:100%;border-collapse:collapse;background:#fff;font-size:13px;margin:14px 0}.db th,.db td{border:1px solid #e3e9f2;padding:6px 8px;text-align:right}' +
  '.db th:first-child,.db td:first-child{text-align:left}.db th{background:#eef2f8}' +
  '.db .a{background:#fff;border-left:4px solid #c62f2f;border-radius:6px;padding:8px 10px;margin:6px 0;font-size:13px}</style>';

function autoDashboard(brief, ctx) {
  const s = series(ctx); const m = s.months; const L = m[5], P = m[4];
  const d = (a, b) => (a / b - 1) * 100;
  const kpi = (label, val, delta, goodUp) => {
    const up = delta >= 0;
    return `<div class="c"><span class="s">${label}</span><b>${val}</b>` +
      `<span class="${(goodUp ? up : !up) ? 'u' : 'd'}">${up ? '▲' : '▼'} ${p1(Math.abs(delta))}% so tháng trước</span></div>`;
  };
  let rows = '';
  m.forEach(x => { rows += `<tr><td>${x.label}</td><td>${x.orders}</td><td>${trieu(x.revenue)}</td><td>${vnd(x.cpa)}</td><td>${pf1(x.conv)}</td></tr>`; });
  const gd = goalDon(ctx);
  const canhBao3 = gd
    ? `${L.label} đạt ${L.orders}/${gd} đơn mục tiêu (${p1(L.orders / gd * 100)}%) — cần bù ${Math.max(0, gd - L.orders)} đơn/tháng.`
    : `${s.ch2} mới đóng góp ${s.share2}% doanh thu — dưới ngưỡng tối thiểu 35% cho kênh thứ hai.`;
  const alert = t => `<div class="a">⚠ ${t}</div>`;
  return suaLine(ctx) + '<div class="db">' + DB_CSS +
    `<h2>Dashboard điều hành — ${coName(ctx)}</h2>` +
    `<div class="s" style="margin-bottom:14px">Kỳ ${m[0].label}–${L.label} · Kênh: ${kenh(ctx).join(', ')} · Cập nhật ${new Date().toLocaleDateString('vi-VN')}</div>` +
    '<div class="k">' +
    kpi(`Doanh thu ${L.label}`, trieu(L.revenue), d(L.revenue, P.revenue), true) +
    kpi('Đơn hàng', String(L.orders), d(L.orders, P.orders), true) +
    kpi('CPA', vnd(L.cpa) + 'đ', d(L.cpa, P.cpa), false) +
    kpi('Tỷ lệ chuyển đổi', pf1(L.conv) + '%', d(L.conv, P.conv), true) + '</div>' +
    `<table><tr><th>Tháng</th><th>Đơn</th><th>Doanh thu</th><th>CPA (đ)</th><th>CR (%)</th></tr>${rows}</table>` +
    alert(`${m[s.dip].label}: đơn giảm ${p1(s.dipDropPct)}% so ${m[s.dip - 1].label} — lệch xu hướng tăng, rà lại lịch khuyến mãi ${s.ch1}.`) +
    alert(`CPA ${m[s.dip].label} = ${vnd(m[s.dip].cpa)}đ, cao nhất kỳ, bằng ${p1(m[s.dip].cpa / s.cap * 100)}% trần ${vnd(s.cap)}đ (=20% AOV) — chạm 100% thì tắt nhóm quảng cáo kém.`) +
    alert(canhBao3) + '</div>';
}
function autoN8nRows(s, ctx) {
  const alertCh = kenh(ctx).map(x => x.toLowerCase()).includes('zalo') ? 'Zalo OA (qua n8n)' : 'Gmail MCP';
  return [
    ['Cron 07:30 hằng ngày', 'Schedule Trigger', 'everyDay 07:30 · TZ Asia/Ho_Chi_Minh', 'Kích hoạt luồng'],
    ['—', `HTTP Request (${s.ch1})`, 'GET đơn hàng ngày T-1 · timeout 15s · retry 3 lần', 'JSON đơn hàng thô'],
    ['—', 'Code (chuẩn hóa)', `Gộp theo ngày · doanh thu = đơn × AOV ${vnd(s.sp.aov)}đ · tính CPA`, 'Bảng chỉ số ngày'],
    ['—', 'Google Sheets (Append)', 'Sheet "DL_ban_hang" · khóa chống trùng = ngày', 'Lưu lịch sử số liệu'],
    ['—', 'IF (cảnh báo)', `doanh_thu < 80% TB 7 ngày HOẶC CPA > ${vnd(s.cap)}đ`, 'true → nhánh cảnh báo'],
    ['—', alertCh, 'Gửi CEO + TP Dữ liệu · template ≤5 dòng, đính kèm số lệch', 'Tin cảnh báo (qua Hộp phê duyệt)'],
    ['—', 'Error Workflow', 'Bắt lỗi HTTP/timeout → ghi log + báo kênh kỹ thuật', 'Luồng đóng an toàn']
  ];
}
function autoN8nDoc(brief, ctx) {
  const s = series(ctx);
  let tb = '| Trigger | Node | Cấu hình | Đầu ra |\n|---|---|---|---|\n';
  autoN8nRows(s, ctx).forEach(r => { tb += `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |\n`; });
  return suaLine(ctx) +
    `# Thiết kế n8n workflow: Báo cáo bán hàng + cảnh báo — ${coName(ctx)}\n\n` +
    `**Mục tiêu:** ${B(brief).muc_tieu || `Mỗi sáng 07:30 tự tổng hợp số liệu ${s.ch1}, lưu lịch sử và cảnh báo khi lệch nhịp.`}\n\n` +
    `## Sơ đồ luồng (7 node)\n${tb}\n` +
    `## Ngưỡng & quy tắc vận hành\n` +
    `- CPA trần: **${vnd(s.cap)}đ** (=20% AOV ${vnd(s.sp.aov)}đ) — vượt 7 ngày liên tiếp thì đề xuất tắt nhóm quảng cáo.\n` +
    `- Cảnh báo doanh thu: ngày < 80% trung bình 7 ngày gần nhất.\n` +
    `- Mọi tin gửi ra ngoài đi qua Hộp phê duyệt, không gửi thẳng.\n\n` +
    `## Kiểm thử trước khi bật\n` +
    `- Chạy tay 3 ngày dữ liệu cũ, đối chiếu tổng với sổ bán hàng (sai lệch cho phép <1%).\n` +
    `- Giả lập API lỗi (timeout) → xác nhận Error Workflow báo đúng kênh kỹ thuật.\n\n` +
    `_Giả định: nguồn đơn từ ${kenh(ctx).join(' + ')}; AOV lấy trung bình khoảng giá ${s.sp.range}._`;
}
function autoPptx(brief, ctx) {
  const s = series(ctx);
  return suaLine(ctx) +
    `# Tự động hóa dữ liệu bán hàng — ${coName(ctx)}\n\n` +
    `## Bài toán\n- Số liệu ${kenh(ctx).join(', ')} đang tổng hợp tay, trễ 1–2 ngày\n- CEO cần nhìn nhanh 4 chỉ số + cảnh báo lệch nhịp\n\n` +
    `## Giải pháp: 1 dashboard + 1 workflow n8n\n- Dashboard HTML 1 trang: 4 KPI, xu hướng 6 tháng, 3 cảnh báo\n- n8n 7 node: Cron 07:30 → API ${s.ch1} → chuẩn hóa → Sheets → IF → cảnh báo\n\n` +
    `## Ngưỡng cảnh báo\n- CPA > ${vnd(s.cap)}đ (=20% AOV ${vnd(s.sp.aov)}đ)\n- Doanh thu ngày < 80% trung bình 7 ngày\n- Đơn tháng < 90% tháng liền trước\n\n` +
    `## Kế hoạch triển khai\n- Tuần 1: dựng workflow + chạy song song kiểm tra (sai lệch <1%)\n- Tuần 2: bật cảnh báo thật, gửi qua Hộp phê duyệt\n- Tuần 3: bàn giao dashboard, hướng dẫn CEO 15 phút\n\n` +
    `## Kết quả kỳ vọng\n- Tiết kiệm ~5 giờ/tuần tổng hợp tay\n- Phát hiện lệch nhịp trong 24h thay vì cuối tháng`;
}
function autoOut(brief, ctx) {
  switch (fmtOf(brief)) {
    case 'html': return autoDashboard(brief, ctx);
    case 'pptx': return autoPptx(brief, ctx);
    default: return autoN8nDoc(brief, ctx); // md/docx/xlsx: bảng node + ghi chú giả định
  }
}

/* ---------------- TRƯỞNG PHÒNG (tp_data) ---------------- */
function tpXlsx(brief, ctx) {
  const s = series(ctx);
  return suaLine(ctx) +
    `# Từ điển KPI phòng Dữ liệu — ${coName(ctx)}\n\n` +
    `| KPI | Định nghĩa | Công thức | Ngưỡng cảnh báo | Nguồn |\n|---|---|---|---|---|\n` +
    `| Doanh thu tháng | Tổng tiền hàng đã chốt | Σ(đơn × giá bán) | < 90% tháng trước | Sổ bán ${s.ch1} |\n` +
    `| AOV | Giá trị đơn trung bình | Doanh thu ÷ số đơn | < ${vnd(Math.round(s.sp.aov * 0.9 / 1000) * 1000)}đ | Sổ bán hàng |\n` +
    `| CPA | Chi phí ra 1 đơn | CP quảng cáo ÷ đơn | > ${vnd(s.cap)}đ (20% AOV) | Trình QC + sổ chi |\n` +
    `| CR | Tỷ lệ chuyển đổi | Đơn ÷ lượt tiếp cận | < 1,5% | ${s.ch1} Analytics |\n` +
    `| Tỷ trọng kênh phụ | Doanh thu ${s.ch2} | DT kênh ÷ tổng DT | < 35% sau quý | Sổ bán theo kênh |\n\n` +
    `_Giả định: AOV chuẩn ${vnd(s.sp.aov)}đ theo khoảng giá ${s.sp.range}; ngưỡng đặt theo thực tế 6 tháng gần nhất._\n\n` +
    `Cập nhật: hằng tháng, chốt trước ngày 05. Ai lệch định nghĩa KPI phải báo lại TP Dữ liệu trước khi dùng số.`;
}
function tpPlanDoc(brief, ctx) {
  const s = series(ctx);
  return suaLine(ctx) +
    `# Kế hoạch dữ liệu & chuẩn nghiệm thu — ${coName(ctx)}\n\n` +
    `## Mục tiêu\n- ${B(brief).muc_tieu || 'Chuẩn hóa số liệu bán hàng, dựng báo cáo insight và dashboard điều hành.'}\n` +
    (goal3m(ctx) ? `- Bám mục tiêu 3 tháng của công ty: ${goal3m(ctx)}\n` : '') + '\n' +
    `## Nguồn dữ liệu & tần suất\n` +
    kenh(ctx).map(k => `- ${k}: đơn hàng + chi phí quảng cáo, chốt số hằng ngày trước 09:00\n`).join('') +
    `- Sổ thu chi nội bộ: đối soát tuần, sai lệch cho phép <1%\n\n` +
    `## Phân công trong phòng\n` +
    `| Hạng mục | Phụ trách | Hạn | Tiêu chí bàn giao |\n|---|---|---|---|\n` +
    `| Báo cáo insight 6 tháng | NV Phân tích | T+2 ngày | 5 insight có số dẫn chứng + 3 khuyến nghị |\n` +
    `| Dashboard CEO + n8n | NV Tự động hóa | T+3 ngày | 4 KPI, xu hướng 6 tháng, 3 cảnh báo, số khớp báo cáo |\n` +
    `| Review & nghiệm thu | TP Dữ liệu | T+4 ngày | Rubric review dữ liệu, đạt ≥90/100 |\n\n` +
    `## Chuẩn nghiệm thu\n` +
    `- Số liệu khớp nguồn 100%, chênh lệch cho phép <1%; ghi rõ giả định và công thức.\n` +
    `- Mỗi insight ≥1 con số dẫn chứng; khuyến nghị có ngưỡng đo (vd CPA trần ${vnd(s.cap)}đ).\n` +
    `- Dashboard nền sáng, đọc được trên điện thoại, cảnh báo khi lệch kế hoạch >10%.\n\n` +
    `## Nhịp báo cáo\n- Hằng ngày: số tự động qua n8n · Thứ Hai: tổng hợp tuần · Ngày 05: chốt báo cáo tháng gửi CEO.`;
}
function tpOut(brief, ctx) {
  switch (fmtOf(brief)) {
    case 'xlsx': return tpXlsx(brief, ctx);
    case 'html': return anaHtml(brief, ctx);
    default: return tpPlanDoc(brief, ctx); // md/docx/pptx: 5 mục '##' = 5 slide
  }
}

/* ---------------- REVIEW CỦA TRƯỞNG PHÒNG ---------------- */
function tieuChi(brief) {
  const t = B(brief).tieu_chi_cham;
  return Array.isArray(t) && t.length ? t.join(', ') : 'số liệu khớp nguồn, insight có dẫn chứng, trình bày dễ đọc';
}
function rvAna(brief, ctx, pass) {
  const s = series(ctx); const m = s.months;
  if (pass) {
    return {
      feedback_chi_tiet: `Đạt. Bảng 6 tháng nhất quán (doanh thu = đơn × AOV ${vnd(s.sp.aov)}đ, kiểm tra xác suất 3 tháng đều khớp), insight bám đúng số, khuyến nghị có ngưỡng đo. Bám sát tiêu chí: ${tieuChi(brief)}. Hai góp ý nhỏ để lần sau tốt hơn: thêm cột Δ MoM cho người đọc nhanh, và chú thích nguồn ngay dưới bảng thay vì cuối trang.`,
      loi_cu_the: [{ vi_tri: 'Bảng số liệu', loi: 'Thiếu cột biến động % so tháng trước (không chặn nghiệm thu)', cach_sua: 'Bổ sung cột Δ MoM ở lần cập nhật sau' }]
    };
  }
  return {
    feedback_chi_tiet: `Chưa đạt — trả lại sửa. Anh đối chiếu với chuẩn phòng (${tieuChi(brief)}) thì bài còn 4 lỗi phải xử lý hết trong vòng sau: (1) tháng gãy ${m[s.dip].label} giảm ${p1(s.dipDropPct)}% nhưng phần insight không lý giải nguyên nhân — người đọc không biết do mùa vụ hay do kênh; (2) nhận định về kênh không có con số tỷ trọng; (3) khuyến nghị chưa có ngưỡng đo lường và thời hạn nên không nghiệm thu được; (4) thiếu dòng giả định nguồn + công thức nên CEO không kiểm chứng được số. Sửa đúng 4 điểm dưới đây là đạt, không cần hỏi lại.`,
    loi_cu_the: [
      { vi_tri: `Mục insight, tháng ${m[s.dip].label}`, loi: `Đơn giảm còn ${m[s.dip].orders} (−${p1(s.dipDropPct)}%) nhưng không có insight lý giải`, cach_sua: `Thêm 1 insight: so sánh với ${m[s.dip - 1].label}, chỉ rõ nguyên nhân (nhịp thấp điểm ngành ${nganhVn(ctx)} / giảm chi ${s.ch1}) kèm CPA ${vnd(m[s.dip].cpa)}đ` },
      { vi_tri: 'Insight về kênh bán', loi: 'Viết "kênh chính hiệu quả" nhưng không có số', cach_sua: `Ghi rõ ${s.ch1} chiếm ~${s.share1}% doanh thu, ${s.ch2} ${s.share2}%, kèm nhận định kênh phụ dưới ngưỡng 35%` },
      { vi_tri: 'Phần khuyến nghị', loi: 'Không có ngưỡng đo và thời hạn — không nghiệm thu được', cach_sua: `Mỗi khuyến nghị thêm KPI + hạn: vd CPA trần ${vnd(s.cap)}đ trong 30 ngày, AOV mục tiêu +15%` },
      { vi_tri: 'Ngay dưới bảng số liệu', loi: 'Thiếu ghi chú giả định và công thức', cach_sua: `Thêm dòng: "AOV ${vnd(s.sp.aov)}đ = trung bình khoảng giá ${s.sp.range}; doanh thu = đơn × AOV; CPA = chi phí QC ÷ đơn"` }
    ]
  };
}
function rvAuto(brief, ctx, pass) {
  const s = series(ctx); const m = s.months;
  if (pass) {
    return {
      feedback_chi_tiet: `Đạt. Dashboard đủ 4 KPI có so sánh tháng trước, bảng 6 tháng khớp số báo cáo phân tích (đối chiếu ${m[5].label}: ${vnd(m[5].revenue)}đ — khớp), 3 cảnh báo đều có ngưỡng rõ. Workflow n8n có Error Workflow là điểm cộng. Góp ý nhỏ: nên thêm chú thích thời điểm cập nhật dữ liệu ngay cạnh từng KPI.`,
      loi_cu_the: [{ vi_tri: 'Khối KPI', loi: 'Chưa ghi mốc thời gian dữ liệu cạnh từng ô (không chặn nghiệm thu)', cach_sua: 'Thêm dòng nhỏ "số đến hết ' + m[5].label + '" dưới mỗi KPI' }]
    };
  }
  return {
    feedback_chi_tiet: `Chưa đạt — trả lại sửa. So với chuẩn (${tieuChi(brief)}): (1) KPI đang hiển thị số trần, thiếu so sánh tháng trước nên CEO không biết đang tốt hay xấu; (2) số liệu bảng xu hướng lệch báo cáo của NV Phân tích — ${m[5].label} phải là ${vnd(m[5].revenue)}đ (${m[5].orders} đơn × AOV ${vnd(s.sp.aov)}đ); (3) cảnh báo viết chung chung "doanh thu giảm" mà không có ngưỡng %; (4) workflow n8n thiếu nhánh xử lý khi API lỗi — chạy thật sẽ đứng luồng im lặng. Sửa đủ 4 điểm là đạt.`,
    loi_cu_the: [
      { vi_tri: '4 ô KPI đầu trang', loi: 'Thiếu delta so tháng trước', cach_sua: `Thêm mũi tên ▲/▼ + % so ${m[4].label} ngay dưới số to, đỏ/xanh theo chiều tốt-xấu` },
      { vi_tri: `Bảng xu hướng, dòng ${m[5].label}`, loi: 'Doanh thu không khớp báo cáo phân tích cùng kỳ', cach_sua: `Sửa lại thành ${vnd(m[5].revenue)}đ và đối chiếu chéo cả 6 dòng trước khi nộp` },
      { vi_tri: 'Khối 3 cảnh báo', loi: 'Không có ngưỡng định lượng', cach_sua: `Gắn ngưỡng cụ thể: lệch kế hoạch >10%, CPA > ${vnd(s.cap)}đ, đơn < 90% tháng trước` },
      { vi_tri: 'Workflow n8n, sau node HTTP Request', loi: 'Thiếu xử lý lỗi API (timeout/401)', cach_sua: 'Thêm Error Workflow: bắt lỗi → ghi log → báo kênh kỹ thuật; retry 3 lần trước khi báo lỗi' }
    ]
  };
}
function rvChung(brief, ctx, pass) {
  const s = series(ctx);
  if (pass) {
    return {
      feedback_chi_tiet: `Đạt. Tài liệu đúng cấu trúc phòng Dữ liệu, số liệu có nguồn và giả định rõ, bám tiêu chí: ${tieuChi(brief)}. Góp ý nhỏ: thống nhất định dạng số kiểu Việt Nam (chấm ngăn nghìn) trong toàn bộ tài liệu.`,
      loi_cu_the: [{ vi_tri: 'Toàn tài liệu', loi: 'Định dạng số chưa đồng nhất ở vài chỗ', cach_sua: 'Dùng chuẩn 1.234.567đ, phần trăm 1 chữ số thập phân' }]
    };
  }
  return {
    feedback_chi_tiet: `Chưa đạt — trả lại sửa. Ba lỗi chính theo chuẩn phòng (${tieuChi(brief)}): (1) có con số không dẫn nguồn/giả định nên không kiểm chứng được; (2) kết luận chưa gắn ngưỡng hành động; (3) chưa đối chiếu chéo với số liệu kỳ trước. Sửa theo hướng dẫn bên dưới rồi nộp lại.`,
    loi_cu_the: [
      { vi_tri: 'Các con số trong bài', loi: 'Thiếu nguồn và giả định tính toán', cach_sua: `Thêm ghi chú dưới mỗi bảng: nguồn dữ liệu + công thức (vd doanh thu = đơn × AOV ${vnd(s.sp.aov)}đ)` },
      { vi_tri: 'Phần kết luận', loi: 'Không có ngưỡng để ra quyết định', cach_sua: `Gắn ngưỡng định lượng: CPA trần ${vnd(s.cap)}đ, cảnh báo lệch kế hoạch >10%` },
      { vi_tri: 'So sánh kỳ', loi: 'Không đối chiếu với tháng/quý trước', cach_sua: 'Thêm cột hoặc câu so sánh % biến động so kỳ liền trước cho mọi chỉ số chính' }
    ]
  };
}

/* ---------------- EXPORT ---------------- */
module.exports = {
  dept: 'data',
  outputs: {
    tp_data(brief, ctx) { return tpOut(brief, ctx); },
    nv_ana(brief, ctx) { return anaOut(brief, ctx); },
    nv_auto(brief, ctx) { return autoOut(brief, ctx); },
    default(brief, ctx) { return anaOut(brief, ctx); }
  },
  reviews: {
    tp_data(brief, ctx, pass) { return rvChung(brief, ctx, pass); },
    nv_ana(brief, ctx, pass) { return rvAna(brief, ctx, pass); },
    nv_auto(brief, ctx, pass) { return rvAuto(brief, ctx, pass); },
    default(brief, ctx, pass) { return rvChung(brief, ctx, pass); }
  }
};
