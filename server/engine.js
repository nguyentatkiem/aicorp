'use strict';
/* Engine kép (8.1): EngineProvider.call(kind, params) → {text, inputTokens, outputTokens}
   - ClaudeEngine: gọi Claude API thật qua @anthropic-ai/sdk
   - DemoEngine: chạy offline, mô phỏng đầy đủ AI Loop để dùng thử không cần key */
const Anthropic = require('@anthropic-ai/sdk');

function parseJson(text) {
  if (!text) throw new Error('empty');
  let t = text.trim().replace(/^```(json)?/m, '').replace(/```\s*$/m, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  const c = t.indexOf('['), d = t.lastIndexOf(']');
  let cand = null;
  if (a !== -1 && b > a) cand = t.slice(a, b + 1);
  if (cand === null && c !== -1 && d > c) cand = t.slice(c, d + 1);
  return JSON.parse(cand || t);
}

class ClaudeEngine {
  constructor(getKey) { this.getKey = getKey; this.kind = 'api'; }
  async call(kind, p) {
    const key = this.getKey();
    if (!key) throw new Error('Chưa có API key. Vào Cài đặt → nhập key Claude API.');
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: p.model,
      max_tokens: p.maxTokens || 4000,
      system: p.system || undefined,
      messages: [{ role: 'user', content: p.user }]
    });
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
  }
}

/* ---------------- DEMO ENGINE ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function demoProduct(ctx) {
  const p = ctx?.dna?.products?.[0]?.name;
  return p || 'sản phẩm mới';
}

function demoExecute(ctx) {
  const t = ctx.task, brief = t ? JSON.parse(t.brief) : {};
  const fmt = brief.format_dau_ra || 'docx';
  const prod = demoProduct(ctx);
  const better = ctx.round > 0; // vòng sửa → nội dung "đã sửa theo nhận xét"
  if (fmt === 'xlsx') {
    return '```output\n# ' + (t?.title || 'Bảng số liệu') + '\n\n' +
      '| Hạng mục | Kịch bản tiết kiệm | Kịch bản chuẩn | Kịch bản đẩy mạnh |\n|---|---|---|---|\n' +
      '| Sản xuất & bao bì | 4.200.000 | 6.500.000 | 8.800.000 |\n' +
      '| Quảng cáo test | 3.000.000 | 5.000.000 | 8.000.000 |\n' +
      '| KOC/Seeding | 1.500.000 | 2.500.000 | 4.000.000 |\n' +
      '| Dự phòng 10% | 870.000 | 1.400.000 | 2.080.000 |\n' +
      '| **Tổng** | **9.570.000** | **15.400.000** | **22.880.000** |\n' +
      '\nGhi chú: giá vốn ước tính 41.200đ/hộp, điểm hòa vốn kịch bản chuẩn ≈ 374 đơn.\n```';
  }
  if (fmt === 'html') {
    return '```output\n<h1>Dashboard ' + prod + '</h1><p>Doanh thu dự kiến, chi phí, và 3 cảnh báo chính…</p>\n```';
  }
  const hook = better
    ? 'MẤT NGỦ KHÔNG PHẢI TẠI TUỔI — MÀ TẠI CÁI ĐẦU KHÔNG CHỊU TẮT ĐIỆN.'
    : 'Bạn có biết vì sao càng lớn tuổi càng khó ngủ không?';
  return '```output\n# ' + (t?.title || 'Nội dung') + (better ? ' (bản sửa theo nhận xét TP)' : '') + '\n\n' +
    '## Bài 1 — ' + hook + '\n' +
    'Chị em mình cứ đổ lỗi "già rồi nên khó ngủ". Nhưng thật ra, cơ thể chưa bao giờ quên cách ngủ — chỉ là tâm trí không chịu buông. ' +
    prod + ' — từ lạc tiên, tâm sen, hoa cúc — giúp chị "tắt điện cái đầu" mỗi tối. Inbox em để được tư vấn khung giờ dùng phù hợp nhé ạ.\n\n' +
    '## Bài 2 — 21 ngày thử thách ngủ ngon\n Câu chuyện chị Hằng (42 tuổi, kế toán) mất ngủ 3 năm… tuần đầu dùng ' + prod + ' đã ngủ thẳng giấc 6 tiếng.\n\n' +
    '## Bài 3 — Hỏi đáp chuyên gia\n "Uống trà thảo mộc có bị phụ thuộc không?" — Không, vì cơ chế là thư giãn thần kinh nhẹ nhàng, không phải thuốc ngủ.\n\n' +
    '## Bài 4 — Món quà cho mẹ\n Đêm nào mẹ cũng thức. Một hộp ' + prod + ' là lời chúc ngủ ngon con gửi mẹ.\n\n' +
    '## Bài 5 — Ưu đãi ra mắt\n Combo 2 hộp tặng ly gốm sứ + freeship toàn quốc, chỉ trong tuần ra mắt.\n```';
}

function demoReview(ctx) {
  // Vòng 1 của NV Content trượt (87) để demo vòng trả lại; các trường hợp khác 90–97
  const isContentR1 = ctx.task && ctx.task.assignee_id === 'nv_content' && ctx.round === 0;
  const score = isContentR1 ? 87 : rnd(90, 97);
  const fb = isContentR1
    ? 'Bài #1 hook yếu ("Bạn có biết…" quá cũ), lệch giọng thương hiệu (thiếu xưng "em—chị"). Yêu cầu: đổi hook sang dạng nghịch lý/đối lập, thêm 1 chi tiết đời thường của khách 35+, CTA mềm hơn.'
    : 'Đạt chuẩn DNA, số liệu khớp brief. Vài lỗi nhỏ đã ghi chú trực tiếp.';
  return JSON.stringify({
    score,
    feedback_chi_tiet: fb,
    loi_cu_the: isContentR1 ? [{ vi_tri: 'Bài 1, câu đầu', loi: 'Hook dạng câu hỏi tu từ, không dừng được ngón tay lướt', cach_sua: 'Dùng khẳng định nghịch lý: "Mất ngủ không phải tại tuổi…"' }] : []
  });
}

function demoPlan(ctx) {
  const enabled = new Set(ctx.enabledDepts || []);
  const tasks = [];
  const add = t => tasks.push(t);
  if (enabled.has('mkt')) {
    add({
      title: 'Viết 5 bài Facebook ra mắt', dept_id: 'mkt', assignee_id: 'nv_content', reviewer_id: 'tp_mkt',
      brief: { muc_tieu: 'Bộ 5 bài Facebook cho chiến dịch ra mắt ' + demoProduct(ctx), dau_vao: ['DNA', 'catalogue'], format_dau_ra: 'docx', tieu_chi_cham: ['Chuẩn DNA', 'Hook mạnh', 'CTA rõ', 'Chính tả'] },
      deps: [], real_action: { channel: 'mcp:facebook', op: 'create_post', note: 'Đăng bài #1 lên Fanpage lúc 20:00 (khung giờ vàng)' }
    });
    add({
      title: 'Quét giá 5 đối thủ trên Shopee', dept_id: 'mkt', assignee_id: 'nv_market', reviewer_id: 'tp_mkt',
      brief: { muc_tieu: 'Bảng so sánh giá & đánh giá 5 đối thủ cùng phân khúc', dau_vao: ['web'], format_dau_ra: 'xlsx', tieu_chi_cham: ['Đủ 5 đối thủ', 'Có nguồn', 'Có nhận định'] },
      deps: [], real_action: null
    });
  }
  if (enabled.has('tckt')) add({
    title: 'Dự toán chi phí ra mắt + giá vốn', dept_id: 'tckt', assignee_id: 'nv_cash', reviewer_id: 'tp_tc',
    brief: { muc_tieu: 'Dự toán 3 kịch bản chi phí và giá vốn SKU mới', dau_vao: ['bảng giá'], format_dau_ra: 'xlsx', tieu_chi_cham: ['Công thức đúng', 'Có điểm hòa vốn'] },
    deps: [], real_action: null
  });
  if (enabled.has('kd')) add({
    title: 'Báo giá đại lý + chính sách chiết khấu', dept_id: 'kd', assignee_id: 'nv_quote', reviewer_id: 'tp_kd',
    brief: { muc_tieu: 'Báo giá đại lý kèm chính sách chiết khấu theo bậc', dau_vao: ['bảng giá sỉ'], format_dau_ra: 'docx', tieu_chi_cham: ['Đúng chính sách giá', 'Rõ điều khoản công nợ'] },
    deps: [], real_action: null
  });
  if (enabled.has('cskh')) add({
    title: 'FAQ 20 câu về thành phần & cách dùng', dept_id: 'cskh', assignee_id: 'nv_faq', reviewer_id: 'tp_cs',
    brief: { muc_tieu: 'Bộ 20 câu hỏi đáp cho khách về SKU mới', dau_vao: ['catalogue'], format_dau_ra: 'docx', tieu_chi_cham: ['Không hứa chữa bệnh', 'Dễ hiểu'] },
    deps: [], real_action: null
  });
  return JSON.stringify({ tasks: tasks.slice(0, 6) });
}

class DemoEngine {
  constructor() { this.kind = 'demo'; }
  async call(kind, p) {
    const ctx = p.ctx || {};
    await sleep(kind === 'execute' ? rnd(2500, 4500) : rnd(1000, 2200)); // nhịp cho UI sống động
    let text;
    switch (kind) {
      case 'brief':
        text = ctx.answers
          ? JSON.stringify({ hieu_nhiem_vu: 'Đã rõ, triển khai theo hướng sếp chốt.', cau_hoi: [], ready: true })
          : JSON.stringify({
              hieu_nhiem_vu: 'Chuẩn bị trọn bộ ra mắt: content, số liệu chi phí, báo giá đại lý và FAQ.',
              cau_hoi: ['Ưu tiên ra mắt trên Facebook hay TikTok Shop trước ạ?'], ready: false
            });
        break;
      case 'plan': text = demoPlan(ctx); break;
      case 'execute': text = demoExecute(ctx); break;
      case 'review': text = demoReview(ctx); break;
      case 'report':
        text = `<ul><li>✅ ${ctx.doneCount || 0} nhánh hoàn thành, điểm trung bình ${ctx.avgScore || '—'}/100</li>` +
          `<li>📌 Phát hiện: đối thủ cùng phân khúc đang giảm giá 20% tuần này — em đề xuất đẩy lịch ra mắt sớm 3 ngày</li>` +
          `<li>⏭️ Bước tiếp theo: duyệt bài đăng trong Hộp phê duyệt, sau đó chạy ads test</li>` +
          `<li>💰 Chi phí nhiệm vụ: ${(ctx.costVnd || 0).toLocaleString('vi-VN')}đ</li></ul>`;
        break;
      default: text = '```output\n(demo)\n```';
    }
    return { text, inputTokens: rnd(2500, 7000), outputTokens: rnd(1200, 3500) };
  }
}

function makeEngine(kindGetter, keyGetter) {
  return {
    get kind() { return kindGetter(); },
    async call(kind, p) {
      const k = kindGetter();
      const impl = (k === 'api' || k === 'sub') ? new ClaudeEngine(keyGetter) : new DemoEngine();
      return impl.call(kind, p);
    }
  };
}

module.exports = { makeEngine, ClaudeEngine, DemoEngine, parseJson };
