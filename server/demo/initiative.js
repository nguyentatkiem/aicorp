'use strict';
/* ------------------------------------------------------------------
   initiative.js — BỘ SÁNG KIẾN CHỦ ĐỘNG của AI COO (Demo Engine offline)
   COO tự nhìn trạng thái công ty + DNA rồi đề xuất 1–3 việc NÊN LÀM mà
   CEO chưa giao — như một COO thật chủ động. Mỗi sáng kiến kèm 1 `command`
   tiếng Việt để planner.js hiểu được và biến thành nhiệm vụ nếu CEO "Đồng ý".

   module.exports = { propose(ctx) → [ { title, command, ly_do, phong, loai } ] }
   ctx = { dna, state:{ recentMemories, staleApprovals, missionsDone,
                         daysSinceLastMission, agentPerf }, weekday }

   Nguyên tắc: nội suy từ dna (chịu được null/thiếu trường), KHÔNG hardcode
   ngành, deterministic theo ctx (không Math.random/Date.now).
   ------------------------------------------------------------------ */

/* ================= 1. Chuẩn hóa & trích DNA an toàn =============== */

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Cùng phong cách D.* trong planner.js — mọi trích xuất đều có fallback */
const D = {
  prod: dna => (((dna || {}).products || [])[0] || {}).name || 'sản phẩm chủ lực',
  company: dna => ((dna || {}).company || {}).name || 'công ty mình',
  industry: dna => ((dna || {}).company || {}).industry || '',
  region: dna => ((dna || {}).company || {}).region || '',
  cust: dna => ((dna || {}).customers || {}).profile || 'khách hàng mục tiêu',
  channels: dna => ((dna || {}).customers || {}).channels || [],
  goal: dna => (dna || {}).goal_3m || ''
};

function short(s, n) {
  s = String(s || ''); n = n || 44;
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
/* Vế nhân khẩu đầu tiên của chân dung khách — dùng cho câu lệnh gọn */
function custShort(dna) {
  return short((D.cust(dna).split(',')[0] || '').trim() || 'khách hàng mục tiêu', 38);
}
/* Số nguyên không âm an toàn từ state */
function num(v) { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0; }
/* Điểm về thang /10 (chịu được thang 0–100) */
function score10(v) { let x = Number(v); if (!Number.isFinite(x) || x < 0) return 0; return x > 10 ? x / 10 : x; }
/* Tỷ lệ về [0,1] (chịu được ghi theo %) */
function rate01(v) { let x = Number(v); if (!Number.isFinite(x) || x < 0) return 0; if (x > 1) x = x / 100; return x > 1 ? 1 : x; }
/* Có memory nào chứa 1 trong các từ khóa (đã bỏ dấu) không → trả memory gốc */
function memHit(mems, kws) {
  for (const m of mems) {
    const n = normalize(m);
    if (kws.some(k => n.indexOf(k) !== -1)) return String(m);
  }
  return null;
}

/* ================= 2. Bảng sáng kiến ĐỊNH KỲ theo thứ ============= */
/* weekday: 0=CN..6=T7. Luôn có đúng 1 mục → đảm bảo state rỗng vẫn ≥1 SK. */
function periodicFor(wd, dna) {
  const prod = D.prod(dna);
  const table = {
    0: { title: 'Chuẩn bị kế hoạch cho tuần tới',
         command: `Lập kế hoạch content marketing tuần tới cho ${prod}`,
         phong: 'mkt',
         ly_do: 'Chủ nhật là lúc dựng khung cho tuần mới — em đề xuất chốt trước tuyến nội dung tuần tới để thứ Hai cả đội chạy được ngay, không mất buổi đầu tuần.' },
    1: { title: 'Chốt kế hoạch nội dung tuần này',
         command: `Lập kế hoạch content marketing tuần này cho ${prod}`,
         phong: 'mkt',
         ly_do: 'Đầu tuần nên chốt kế hoạch nội dung để cả tuần bám mục tiêu, tránh làm kiểu nước đến chân mới nhảy.' },
    2: { title: 'Rà soát và chấm lại lead',
         command: 'Chấm điểm và phân loại lead khách tiềm năng tuần này',
         phong: 'kd',
         ly_do: 'Giữa đầu tuần là lúc lọc lại lead để đội kinh doanh dồn sức vào khách đang nóng, không bỏ sót cơ hội đang có.' },
    3: { title: 'Cập nhật bộ FAQ cho khách',
         command: `Cập nhật bộ FAQ hỏi đáp sản phẩm ${prod}`,
         phong: 'cskh',
         ly_do: 'Giữa tuần rảnh tay hơn để chuẩn hoá tài liệu — bộ FAQ cập nhật giúp CSKH trả lời nhanh và nhất quán hơn.' },
    4: { title: 'Soi số liệu giữa tuần',
         command: 'Phân tích số liệu bán hàng giữa tuần và rút insight',
         phong: 'data',
         ly_do: 'Xem số giữa tuần để kịp điều chỉnh trước cuối tuần, tránh để lệch mục tiêu rồi cuối tuần mới biết.' },
    5: { title: 'Tổng kết tuần cho sếp',
         command: 'Làm dashboard tổng kết tuần cho sếp',
         phong: 'data',
         ly_do: 'Cuối tuần nên có một trang tổng kết để sếp nắm nhanh kết quả và ra quyết định cho tuần sau.' },
    6: { title: 'Chăm khách cũ dịp cuối tuần',
         command: `Soạn kịch bản chăm sóc khách hàng cũ cuối tuần về ${prod}`,
         phong: 'cskh',
         ly_do: 'Cuối tuần khách rảnh đọc tin hơn — em đề xuất một tuyến chăm sóc khách cũ để tăng tỉ lệ mua lại.' }
  };
  const p = table[wd] || table[1];
  return { title: p.title, command: p.command, ly_do: p.ly_do, phong: p.phong,
    loai: 'dinh_ky', tag: 'periodic', score: 6 };
}

/* ================= 3. propose(ctx) =============================== */

function propose(ctx) {
  ctx = ctx || {};
  const dna = ctx.dna || {};
  const st = ctx.state || {};
  const mems = Array.isArray(st.recentMemories) ? st.recentMemories.filter(Boolean) : [];
  const stale = num(st.staleApprovals);
  const idle = num(st.daysSinceLastMission);
  const perf = Array.isArray(st.agentPerf) ? st.agentPerf : [];
  const wd = Number.isInteger(ctx.weekday) ? ((ctx.weekday % 7) + 7) % 7 : 1;

  const prod = D.prod(dna);
  const cust = custShort(dna);
  const channels = D.channels(dna);
  const channelsText = channels.length ? channels.join(', ') : 'kênh hiện có';
  const goal = D.goal(dna);

  const cand = [];

  /* --- ĐỊNH KỲ (luôn có, tag riêng nên không bao giờ bị dedupe nuốt) --- */
  cand.push(periodicFor(wd, dna));

  /* --- CƠ HỘI/RỦI RO từ recentMemories --- */
  const memCompetitor = memHit(mems, ['doi thu', 'canh tranh', 'giam gia', 'pha gia', 'khuyen mai', 'gia re', 'ban re', 'sale off', 'flash sale']);
  if (memCompetitor) {
    cand.push({
      title: 'Phản ứng với động thái đối thủ',
      command: `Quét giá và khuyến mãi 5 đối thủ cùng phân khúc rồi đề xuất phản ứng cho ${prod}`,
      ly_do: `Bộ nhớ gần đây ghi nhận: "${short(memCompetitor, 64)}". Em đề xuất rà lại giá và khuyến mãi đối thủ ngay để mình phản ứng kịp, tránh mất khách vào tay họ.`,
      phong: 'mkt', loai: 'co_hoi', tag: 'market-mkt', score: 9
    });
  }
  const memTrend = memHit(mems, ['xu huong', 'trend', 'viral', 'hot', 'nhu cau tang', 'mua cao diem', 'cao diem', 'le', 'tet']);
  if (memTrend) {
    cand.push({
      title: 'Bắt sóng xu hướng đang lên',
      command: `Viết bộ 5 bài facebook bắt xu hướng cho ${prod} nhắm khách ${cust}`,
      ly_do: `Có tín hiệu xu hướng trong bộ nhớ: "${short(memTrend, 64)}". Nên ra nội dung bắt sóng khi còn nóng để tận dụng lượt quan tâm tự nhiên, đỡ tiền quảng cáo.`,
      phong: 'mkt', loai: 'co_hoi', tag: 'content-mkt', score: 7
    });
  }
  const memLesson = memHit(mems, ['phan nan', 'khieu nai', 'giao cham', 'giao tre', 'tra hang', 'hoan tien', 'loi san pham', 'sai sot', 'bai hoc', 'that bai', 'that vong']);
  if (memLesson) {
    cand.push({
      title: 'Bịt lỗ hổng từ sự cố gần đây',
      command: `Soạn kịch bản xử lý khiếu nại và chăm sóc khách hàng cho ${prod}`,
      ly_do: `Bộ nhớ nhắc một bài học/sự cố: "${short(memLesson, 64)}". Em đề xuất chuẩn hoá kịch bản xử lý và chăm sóc để không lặp lại và giữ được khách.`,
      phong: 'cskh', loai: 'rui_ro', tag: 'script-cskh', score: 8
    });
  }

  /* --- CƠ HỘI từ mục tiêu 3 tháng (goal_3m) --- */
  if (goal) {
    const gn = normalize(goal);
    const isLaunch = ['ra mat', 'khai truong', 'launch', 'sku', 'san pham moi', 'mo rong', 'ra sku'].some(k => gn.indexOf(k) !== -1);
    if (isLaunch) {
      cand.push({
        title: 'Đẩy chiến dịch phục vụ mục tiêu quý',
        command: `Lên kế hoạch chiến dịch ra mắt ${prod} theo mục tiêu 3 tháng`,
        ly_do: `Mục tiêu 3 tháng là "${short(goal, 60)}". Em đề xuất chủ động lên chiến dịch ra mắt bài bản ngay bây giờ để kịp về đích, thay vì chờ sát hạn.`,
        phong: 'mkt', loai: 'co_hoi', tag: 'content-mkt', score: 8
      });
    } else {
      cand.push({
        title: 'Việc bám thẳng mục tiêu quý',
        command: `Viết bộ 5 bài facebook bán ${prod} nhắm khách ${cust} để tăng đơn`,
        ly_do: `Mục tiêu 3 tháng là "${short(goal, 60)}". Em đề xuất một tuyến nội dung bán hàng bám thẳng mục tiêu để mỗi tuần đều có việc kéo mình gần đích hơn.`,
        phong: 'mkt', loai: 'co_hoi', tag: 'content-mkt', score: 8
      });
    }
  }

  /* --- CƠ HỘI: kênh bán chưa khai thác (video ngắn) --- */
  const hasShortVideo = channels.some(c => /tiktok|reels|short|youtube/.test(normalize(c)));
  if (!hasShortVideo) {
    cand.push({
      title: 'Mở kênh video ngắn còn bỏ trống',
      command: `Viết 3 kịch bản video tiktok ngắn cho ${prod}`,
      ly_do: `Khách của mình đang ở ${channelsText} nhưng chưa khai thác video ngắn (TikTok/Reels) — định dạng đang lên đơn mạnh nhất cho SME. Em đề xuất thử 3 kịch bản để bắt sóng.`,
      phong: 'mkt', loai: 'co_hoi', tag: 'video-mkt', score: 7
    });
  }

  /* --- RỦI RO: việc chờ duyệt tồn đọng --- */
  if (stale >= 2) {
    cand.push({
      title: `${stale} việc đang chờ sếp duyệt`,
      command: 'Soạn SOP quy trình duyệt nội dung trong ngày để không tồn đọng',
      ly_do: `Đang có ${stale} việc chờ sếp duyệt khá lâu, nghẽn ở khâu phê duyệt làm chậm cả dây chuyền. Em đề xuất chuẩn hoá quy trình duyệt gọn trong ngày để giải phóng tồn đọng.`,
      phong: 'vh', loai: 'rui_ro', tag: 'sop-vh', score: 6 + Math.min(stale, 6)
    });
  }

  /* --- RỦI RO: lâu chưa có nhiệm vụ mới → giữ nhịp, chăm khách --- */
  if (idle >= 3) {
    cand.push({
      title: `${idle} ngày chưa có nhiệm vụ mới`,
      command: `Soạn kịch bản chăm sóc và nhắn tin lại khách hàng cũ về ${prod}`,
      ly_do: `Đã ${idle} ngày công ty chưa chạy nhiệm vụ mới. Để giữ nhịp và không để nguội tương tác với khách, em đề xuất chủ động chăm sóc lại khách cũ ngay tuần này.`,
      phong: 'cskh', loai: 'rui_ro', tag: 'script-cskh', score: 5 + Math.min(idle, 7)
    });
  }

  /* --- NHÂN SỰ: đào tạo lại người rejRate cao / nâng vai trò người giỏi --- */
  let worst = null, star = null;
  perf.forEach(a => {
    const rej = rate01(a && a.rejRate), sc = score10(a && a.avgScore);
    const name = (a && (a.name || a.id)) || 'một bạn';
    if (!worst || rej > worst._rej) worst = { name, _rej: rej, _sc: sc };
    if (!star || sc > star._sc) star = { name, _rej: rej, _sc: sc };
  });
  if (worst && worst._rej >= 0.3) {
    cand.push({
      title: `Đào tạo lại ${short(worst.name, 24)}`,
      command: 'Xây giáo trình đào tạo lại kỹ năng cho nhân viên còn yếu',
      ly_do: `${worst.name} đang bị trả lại khoảng ${Math.round(worst._rej * 100)}% số việc — em đề xuất đào tạo lại để nâng chất lượng đầu ra trước khi giao thêm việc mới.`,
      phong: 'ns', loai: 'nhan_su', tag: 'train-ns', score: 6 + Math.min(worst._rej, 1) * 4
    });
  }
  if (star && star._sc >= 8.5 && star._rej < 0.2) {
    cand.push({
      title: `Nâng vai trò cho ${short(star.name, 24)}`,
      command: 'Soạn JD tuyển trợ lý và lộ trình thăng tiến cho nhân sự xuất sắc',
      ly_do: `${star.name} đạt điểm trung bình ${star._sc.toFixed(1)}/10 và rất ổn định — em đề xuất giao việc khó hơn hoặc nâng vai trò để khai thác hết năng lực, đồng thời chuẩn bị người kế cận.`,
      phong: 'ns', loai: 'nhan_su', tag: 'hire-ns', score: 6 + Math.min((star._sc - 8.5) * 2, 3)
    });
  }

  /* --- Nền tăng trưởng luôn có sẵn (điểm thấp, chỉ nổi khi thiếu SK mạnh) --- */
  cand.push({
    title: 'Kịch bản chốt đơn cho đội sales',
    command: `Soạn kịch bản tư vấn và chốt đơn cho ${prod}, xử lý 5 từ chối hay gặp`,
    ly_do: 'Kịch bản chốt đơn chuẩn giúp đội kinh doanh biến inbox thành đơn tốt hơn — một đòn bẩy tăng trưởng ít tốn kém mà lúc nào cũng nên có sẵn.',
    phong: 'kd', loai: 'co_hoi', tag: 'sales-kd', score: 5
  });
  cand.push({
    title: 'Duy trì tuyến nội dung bán hàng',
    command: `Viết bộ 5 bài facebook bán ${prod} nhắm khách ${cust}`,
    ly_do: 'Duy trì đều nội dung bán hàng là việc nền của tăng trưởng. Em đề xuất một bộ bài mới để luôn có tuyến nội dung chạy, không để trống lịch.',
    phong: 'mkt', loai: 'co_hoi', tag: 'content-mkt', score: 4
  });

  /* ---- Dedupe theo tag (giữ điểm cao nhất) ---- */
  const best = new Map();
  cand.forEach(c => { const p = best.get(c.tag); if (!p || c.score > p.score) best.set(c.tag, c); });
  const list = [...best.values()].sort((a, b) => (b.score - a.score) || a.tag.localeCompare(b.tag));

  /* ---- Chọn 1–3, cap 2 mục/loại để không "chỉ 1 kiểu" ---- */
  const out = [], loaiN = {};
  for (const c of list) {
    if (out.length >= 3) break;
    if ((loaiN[c.loai] || 0) >= 2) continue;
    loaiN[c.loai] = (loaiN[c.loai] || 0) + 1;
    out.push(c);
  }

  return out.map(c => ({ title: c.title, command: c.command, ly_do: c.ly_do, phong: c.phong, loai: c.loai }));
}

module.exports = { propose };
