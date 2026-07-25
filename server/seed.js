'use strict';
/* Seed 7 phòng ban + 25 agent mặc định (chương 4) + 5 skill mẫu (8.2) + kết nối mẫu (8.3) */
const fs = require('fs');
const path = require('path');
const { db, DIRS, now, getSetting, setSetting } = require('./db');

const DEPTS = [
  { id: 'bgd', name: 'BAN GIÁM ĐỐC', emoji: '🏛️', color: '#F6A821', sort: 0 },
  { id: 'mkt', name: 'P. MARKETING', emoji: '📣', color: '#F6A821', sort: 1 },
  { id: 'kd', name: 'P. KINH DOANH', emoji: '💰', color: '#31C97E', sort: 2 },
  { id: 'tckt', name: 'P. TÀI CHÍNH-KT', emoji: '📊', color: '#41B7F0', sort: 3 },
  { id: 'ns', name: 'P. NHÂN SỰ', emoji: '👥', color: '#8F7CF6', sort: 4 },
  { id: 'cskh', name: 'P. CSKH', emoji: '🤝', color: '#E5484D', sort: 5 },
  { id: 'vh', name: 'P. VẬN HÀNH-HC', emoji: '⚙️', color: '#D0A46B', sort: 6 },
  { id: 'data', name: 'P. DỮ LIỆU-CN', emoji: '💻', color: '#5AD1C8', sort: 7 }
];

/* [id, dept, avatar, tên, chức danh, is_manager, role_block, level, skills[], tools[]] */
const AGENTS = [
  ['coo', 'bgd', '🤖', 'AI COO', 'Giám đốc điều hành', 1,
    'Bạn nhận lệnh từ CEO, brief-back khi cần hỏi rõ, phân rã nhiệm vụ thành WBS, giao việc cho các Trưởng phòng, theo dõi tiến độ, gom kết quả và viết báo cáo cuối bằng giọng trợ lý tin cậy. Bạn KHÔNG tự sản xuất nội dung.', 'coo', [], []],

  ['tp_mkt', 'mkt', '👑', 'TP Marketing', 'Trưởng phòng · lập KH + review', 1,
    'Bạn chia việc trong phòng Marketing và review sản phẩm của nhân viên theo rubric content: chuẩn DNA thương hiệu, hook, cấu trúc, CTA, chính tả, tính xác thực. Chấm khắt khe như trưởng phòng thật.', 'tp', [], ['brain_search']],
  ['nv_content', 'mkt', '✍️', 'NV Content', 'Bài viết, caption, kịch bản', 0,
    'Bạn viết bài Facebook/Zalo, caption, email marketing đúng giọng thương hiệu, có hook mạnh và CTA rõ.', 'nv', ['viet-content-viral'], ['brain_search']],
  ['nv_ads', 'mkt', '🎥', 'NV Ads', 'Quảng cáo, video bán hàng', 0,
    'Bạn viết kịch bản video bán hàng, cấu trúc chiến dịch quảng cáo, đề xuất ngân sách với CPL trần rõ ràng.', 'nv', ['kich-ban-video-ban-hang', 'toi-uu-quang-cao'], []],
  ['nv_market', 'mkt', '🔍', 'NV Thị trường', 'Nghiên cứu đối thủ, xu hướng', 0,
    'Bạn nghiên cứu đối thủ và xu hướng thị trường, tổng hợp thành bảng số liệu có nguồn rõ ràng.', 'nv', [], ['web_search', 'browser']],

  ['tp_kd', 'kd', '💼', 'TP Kinh doanh', 'Trưởng phòng · lập KH + review', 1,
    'Bạn review sản phẩm phòng Kinh doanh theo rubric sales: đúng chính sách giá, hợp pháp lý, khả thi thực tế.', 'tp', [], ['brain_search']],
  ['nv_sales', 'kd', '🗣️', 'NV Kịch bản Sales', 'Kịch bản tư vấn, chốt đơn', 0,
    'Bạn viết kịch bản tư vấn, chốt đơn, xử lý từ chối bám sát sản phẩm và chân dung khách hàng.', 'nv', [], []],
  ['nv_quote', 'kd', '📋', 'NV Báo giá', 'Báo giá, hợp đồng, đề xuất', 0,
    'Bạn soạn báo giá, đề xuất hợp tác, hợp đồng mẫu dựa trên bảng giá trong Company Brain.', 'nv', [], ['brain_search']],
  ['nv_lead', 'kd', '🎯', 'NV Chăm Lead', 'Chấm điểm & nuôi dưỡng lead', 0,
    'Bạn chấm điểm lead theo khung 4 tiêu chí (mỗi tiêu chí 25 điểm) và soạn tin nhắn nuôi dưỡng.', 'nv', ['loc-lead-ban-hang'], []],

  ['tp_tc', 'tckt', '🏦', 'TP Tài chính', 'Trưởng phòng · lập KH + review', 1,
    'Bạn review số liệu tài chính: đối chiếu nguồn, kiểm tra công thức, tính lại các con số có xác suất sai cao.', 'tp', [], ['brain_search']],
  ['nv_cash', 'tckt', '🧮', 'NV Dòng tiền', 'Dự toán, P&L, giá vốn', 0,
    'Bạn lập dự toán, P&L, tính giá vốn, dựng các kịch bản chi phí dạng bảng tính có công thức rõ ràng.', 'nv', [], ['brain_search']],
  ['nv_debt', 'tckt', '🧾', 'NV Công nợ', 'Đối soát, nhắc nợ, lương', 0,
    'Bạn đối soát công nợ, lập lịch nhắc nợ lịch sự và bảng lương cơ bản.', 'nv', [], []],

  ['tp_ns', 'ns', '🎖️', 'TP Nhân sự', 'Trưởng phòng · lập KH + review', 1,
    'Bạn review sản phẩm phòng Nhân sự: JD rõ ràng, tiêu chí lọc CV công bằng, giáo trình dễ áp dụng.', 'tp', [], []],
  ['nv_hire', 'ns', '📝', 'NV Tuyển dụng', 'JD, lọc CV, phỏng vấn mẫu', 0,
    'Bạn viết JD, tiêu chí lọc CV và bộ câu hỏi phỏng vấn theo vị trí.', 'nv', [], []],
  ['nv_train', 'ns', '📚', 'NV Đào tạo', 'Giáo trình, quy trình hội nhập', 0,
    'Bạn soạn giáo trình hội nhập và tài liệu quy trình phòng ban.', 'nv', [], []],

  ['tp_cs', 'cskh', '🎧', 'TP CSKH', 'Trưởng phòng · lập KH + review', 1,
    'Bạn review kịch bản CSKH: đúng quy trình đổi trả trong Brain, giọng đồng cảm, không hứa quá lời.', 'tp', [], ['brain_search']],
  ['nv_script', 'cskh', '💬', 'NV Kịch bản CS', 'Trả lời khiếu nại, upsell', 0,
    'Bạn viết kịch bản trả lời khiếu nại và upsell đúng quy trình đổi trả của công ty.', 'nv', [], ['brain_search']],
  ['nv_faq', 'cskh', '❓', 'NV FAQ', 'Bộ hỏi đáp, tài liệu khách', 0,
    'Bạn xây bộ hỏi đáp từ catalogue sản phẩm và feedback khách hàng.', 'nv', [], ['brain_search']],

  ['tp_vh', 'vh', '🧰', 'TP Vận hành', 'Trưởng phòng · lập KH + review', 1,
    'Bạn review quy trình, biểu mẫu, văn bản hành chính: đủ bước, rõ trách nhiệm, dễ thực thi.', 'tp', [], []],
  ['nv_sop', 'vh', '📐', 'NV SOP', 'Quy trình, biểu mẫu, công văn', 0,
    'Bạn viết quy trình vận hành (SOP), biểu mẫu và công văn chuẩn.', 'nv', [], []],
  ['nv_legal', 'vh', '📜', 'NV Pháp lý', 'Rà hợp đồng, quy định cơ bản', 0,
    'Bạn rà hợp đồng ở mức cơ bản, LUÔN kèm disclaimer "cần luật sư xác nhận trước khi ký".', 'nv', [], []],

  ['tp_data', 'data', '🖥️', 'TP Dữ liệu', 'Trưởng phòng · lập KH + review', 1,
    'Bạn review sản phẩm dữ liệu: số liệu khớp nguồn, biểu đồ trung thực, dashboard dễ đọc với sếp.', 'tp', [], []],
  ['nv_ana', 'data', '📈', 'NV Phân tích', 'Đọc Excel/CSV, tìm insight', 0,
    'Bạn đọc dữ liệu Excel/CSV và rút ra insight kèm con số dẫn chứng.', 'nv', [], ['brain_search']],
  ['nv_auto', 'data', '🤖', 'NV Tự động hóa', 'Dashboard, script, n8n', 0,
    'Bạn dựng dashboard HTML, script tự động hóa và cấu hình n8n workflow.', 'nv', ['cfo-dashboard-ceo'], []]
];

const SKILLS = [
  ['viet-content-viral', 'Công thức bài viral: hook nghịch lý ở câu đầu ≤12 từ, 1 nỗi đau cụ thể, 1 insight bất ngờ, kể chuyện ngôi "em—chị", CTA mềm cuối bài. Tự chấm nháp theo 6 tiêu chí trước khi nộp, dưới 95 tự viết lại hook.'],
  ['kich-ban-video-ban-hang', 'Kịch bản video TikTok Shop theo bảng 5 cột: Giây | Hình | Thoại | Chữ trên màn hình | Ghi chú quay. 3 giây đầu phải có pattern-interrupt. Kết video luôn có lời kêu gọi ghim giỏ hàng.'],
  ['loc-lead-ban-hang', 'Chấm lead thang 100 theo 4 tiêu chí × 25đ: Nhu cầu rõ · Ngân sách · Quyền quyết định · Thời điểm mua. ≥75 = nóng (gọi trong 1h), 50–74 = ấm (nuôi 7 ngày), <50 = lạnh (email tháng).'],
  ['cfo-dashboard-ceo', 'Đọc file Excel kế toán → dashboard HTML 1 trang cho CEO: 4 ô KPI to (doanh thu, lợi nhuận gộp, chi phí, tồn quỹ), 1 biểu đồ xu hướng 6 tháng, 3 cảnh báo đỏ nếu lệch kế hoạch >10%.'],
  ['toi-uu-quang-cao', 'Tối ưu Meta Ads theo CPL trần tính từ unit economics. Quy tắc kill-switch: mã vượt trần 150% trong 24h → đề xuất tắt ngay. Không bao giờ đề xuất tăng ngân sách khi CPL đang vượt trần.']
];

const CONNECTIONS = [
  ['mcp_gmail', 'mcp', '📧 Gmail MCP', { note: 'Soạn & gửi mail — mọi lệnh gửi phải qua Hộp phê duyệt' }, 1, 'ready'],
  ['mcp_facebook', 'mcp', '📘 Facebook Pages MCP', { note: 'Đăng bài, đọc comment, trả lời inbox fanpage' }, 1, 'ready'],
  ['n8n_webhook', 'n8n', '🔄 n8n Webhook', { note: 'Bắc cầu sang các workflow tự động có sẵn', url: '' }, 1, 'ready'],
  ['mcp_shopee', 'mcp', '🛒 Shopee OpenAPI MCP', { note: 'Đọc đơn hàng, tồn kho, đánh giá shop (v1)' }, 0, 'off'],
  ['mcp_zalo', 'mcp', '💬 Zalo OA MCP', { note: 'Chăm khách qua Zalo — sắp ra mắt (v1)' }, 0, 'off'],
  ['browser_ext', 'browser', '🖥️ Chrome Extension AICORP', { note: 'Agent thao tác trình duyệt — viền vàng + nút DỪNG khẩn cấp' }, 0, 'offline']
];

function seed() {
  if (db.prepare('SELECT COUNT(*) c FROM departments').get().c > 0) return;
  const insDept = db.prepare('INSERT INTO departments(id,name,emoji,color,enabled,sort) VALUES(?,?,?,?,1,?)');
  DEPTS.forEach(d => insDept.run(d.id, d.name, d.emoji, d.color, d.sort));

  const insAgent = db.prepare(`INSERT INTO agents(id,dept_id,name,role_title,avatar,is_manager,system_prompt,model,skills_json,tools_json,enabled)
    VALUES(?,?,?,?,?,?,?,?,?,?,1)`);
  const insStat = db.prepare('INSERT INTO agent_stats(agent_id,tasks_done,avg_score,rejected_rate,tokens_used,rejected_count) VALUES(?,0,NULL,0,0,0)');
  AGENTS.forEach(([id, dept, ava, name, role, mgr, block, level, skills, tools]) => {
    insAgent.run(id, dept, name, role, ava, mgr, block, level, JSON.stringify(skills), JSON.stringify(tools));
    insStat.run(id);
  });

  const insSkill = db.prepare('INSERT INTO skills(id,name,path,description,assigned_agents_json,enabled) VALUES(?,?,?,?,?,1)');
  SKILLS.forEach(([slug, body]) => {
    const dir = path.join(DIRS.skills, slug);
    fs.mkdirSync(dir, { recursive: true });
    const md = `---\nname: ${slug}\ndescription: ${body.slice(0, 80)}…\n---\n\n${body}\n`;
    fs.writeFileSync(path.join(dir, 'SKILL.md'), md);
    const assigned = AGENTS.filter(a => a[8].includes(slug)).map(a => a[0]);
    insSkill.run(slug, slug, dir, body.slice(0, 120), JSON.stringify(assigned));
  });

  const insConn = db.prepare('INSERT INTO connections(id,kind,name,config_json,enabled,status) VALUES(?,?,?,?,?,?)');
  CONNECTIONS.forEach(([id, kind, name, cfg, en, st]) => insConn.run(id, kind, name, JSON.stringify(cfg), en, st));
}

/* Nạp/cập nhật skill từ server/skills-seed/*.md (chạy mỗi lần boot — thêm skill mới không cần reset DB) */
function syncSkillsFromSeedDir() {
  const seedDir = path.join(__dirname, 'skills-seed');
  if (!fs.existsSync(seedDir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(seedDir).filter(x => x.endsWith('.md'))) {
    try {
      const raw = fs.readFileSync(path.join(seedDir, f), 'utf8');
      const fm = parseFrontmatter(raw);
      if (!fm.name) continue;
      const slug = fm.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const dir = path.join(DIRS.skills, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), raw);
      const agents = (fm.agents || '').split(',').map(s => s.trim()).filter(Boolean);
      db.prepare(`INSERT INTO skills(id,name,path,description,assigned_agents_json,enabled) VALUES(?,?,?,?,?,1)
        ON CONFLICT(id) DO UPDATE SET path=excluded.path, description=excluded.description, assigned_agents_json=excluded.assigned_agents_json`)
        .run(slug, slug, dir, (fm.description || '').slice(0, 200), JSON.stringify(agents));
      for (const aid of agents) {
        const row = db.prepare('SELECT skills_json FROM agents WHERE id=?').get(aid);
        if (!row) continue;
        const cur = JSON.parse(row.skills_json || '[]');
        if (!cur.includes(slug)) {
          cur.push(slug);
          db.prepare('UPDATE agents SET skills_json=? WHERE id=?').run(JSON.stringify(cur), aid);
        }
      }
      n++;
    } catch (e) { /* bỏ qua file lỗi */ }
  }
  return n;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function seedSettings() {
  const defaults = {
    engine_kind: 'demo',                       // demo | api | sub
    nguong_diem: 90,                           // ngưỡng điểm đạt review
    max_review_rounds: 3,
    max_concurrent: 3,
    tran_per_mission: 30000,                   // VND
    tran_per_day: 100000,                      // VND
    usd_vnd: 26500,
    models: { coo: 'claude-opus-4-8', tp: 'claude-sonnet-5', nv: 'claude-haiku-4-5-20251001' },
    pricing: {                                 // USD / 1M token (sửa được trong Cài đặt)
      'claude-opus-4-8': { in: 5, out: 25 },
      'claude-sonnet-5': { in: 3, out: 15 },
      'claude-haiku-4-5-20251001': { in: 1, out: 5 }
    }
  };
  Object.entries(defaults).forEach(([k, v]) => {
    if (getSetting(k) === undefined) setSetting(k, v);
  });
}

module.exports = { seed, seedSettings, syncSkillsFromSeedDir };
