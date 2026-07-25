# 🏢 AICORP — Công ty AI chạy trên máy của bạn

Web app chạy **local** mô phỏng một công ty hoàn chỉnh bằng AI agent: bạn là **CEO duy nhất là người thật**, bên dưới là **AI COO** và **7 phòng ban** (Trưởng phòng + Nhân viên AI). Giao nhiệm vụ bằng tiếng Việt tự nhiên → hệ thống tự phân rã, thực thi song song, review chấm điểm, và trả về **file thật** (docx/xlsx/pptx/html) kèm báo cáo.

Xây theo đặc tả `dac-ta-aicorp.md` v1.0 · giao diện bám 1-1 file chuẩn `aicorp-giao-dien.html`.
👉 **Người dùng mới đọc [HUONG-DAN.md](HUONG-DAN.md)** (cẩm nang tiếng Việt cho người không rành kỹ thuật).

## Chạy

```bash
cd ~/aicorp
npm install     # lần đầu
npm start       # mở http://localhost:3939
```

Lần đầu mở sẽ vào **khảo sát DNA 7 bước** (~5 phút). Bấm "✨ Điền dữ liệu mẫu" ở bước 2 để thử nhanh.

## Hai chế độ engine

| Chế độ | Mô tả |
|---|---|
| **Demo** (mặc định) | Chạy thử toàn bộ AI Loop không cần key, không tốn tiền — planner hiểu lệnh tiếng Việt + 7 module phòng ban sinh sản phẩm nghề thật |
| **Claude API** | Nhập API key trong Cài đặt → chạy thật. Model theo cấp bậc: COO=Opus, TP=Sonnet, NV=Haiku (đổi được) |

Gói Sub Claude (Pro/Max) qua Agent SDK: lộ trình v2.

## Năng lực (bản làm sâu — v2)

**AI Loop trọn vòng:** giao → brief-back (mode Hỏi kỹ) → phân rã WBS theo ý định lệnh → thực thi song song (3 phiên) → review chấm điểm ngưỡng 90 → trả lại tối đa 3 vòng → escalate CEO (chấp nhận / **làm lại bằng model mạnh hơn** / hủy) → báo cáo tổng hợp.

**Mô phỏng công ty thật (chế độ Demo):**
- `server/demo/planner.js` — hiểu lệnh tiếng Việt (có/không dấu): content, video, ads, đối thủ, báo giá, chốt đơn, lead, dự toán, công nợ/lương, tuyển dụng, đào tạo, khiếu nại, FAQ, SOP, hợp đồng, phân tích, dashboard, chiến dịch ra mắt đa phòng…
- `server/demo/{mkt,kd,tckt,ns,cskh,vh,data}.js` — mỗi phòng sinh sản phẩm nghề thật (kịch bản 5 cột, dự toán khớp công thức + điểm hòa vốn, bảng lương đúng tỷ lệ BHXH, JD chuẩn, SOP có điểm kiểm soát, dashboard HTML…), nội suy từ DNA từng công ty, mọi ngành.
- **19+ skill** chuẩn SKILL.md trong `server/skills-seed/` (công thức content viral, rubric chấm điểm từng phòng, lọc lead, rà hợp đồng…) — tự nạp và gắn agent khi khởi động.

**Quản trị nhân sự AI:** tuyển agent mới (wizard), nhắn riêng 1-1 với từng agent, sửa kỹ năng/model/prompt, **đào tạo lại** (gom nhận xét bị trả lại vào prompt), tạm dừng agent.

**CEO là phanh an toàn:** Hộp phê duyệt cho mọi hành động thật — Duyệt / **Sửa rồi duyệt** (bản CEO sửa thành phiên bản mới trong Xưởng) / Từ chối kèm lý do (task tự quay lại nhân viên sửa).

**Kết nối thật:** n8n webhook nhận payload thật khi CEO duyệt hành động; cài skill từ file .zip; MCP Gmail/Facebook (mô phỏng qua Approval Gate, chờ MCP server thật ở v2).

**Vận hành:** lịch nhiệm vụ định kỳ (hằng ngày/tuần), Budget Guard 2 tầng (trần/nhiệm vụ + trần/ngày, quy đổi VND), checkpoint tự khôi phục khi tắt app giữa chừng, sao lưu/khôi phục `.aicorp` (không kèm API key), Company Brain (DNA + RAG-lite + bộ nhớ dài hạn).

## Bảo mật

Đã qua **audit đối kháng** (5 lát cắt × phản biện chéo, 30 phát hiện được xác nhận và vá triệt để):

- Server chỉ bind `127.0.0.1` — không lộ ra mạng LAN.
- API key lưu `~/AICORP/secret/credentials.json` quyền 600, không nằm trong DB, không trả về qua API, không vào bản sao lưu.
- **Chống XSS nhiều tầng:** file HTML trong Xưởng lọc thẻ + phục vụ kèm CSP `sandbox`; HTML báo cáo/DM của LLM lọc qua `sanitizeHtml` (chặn cả biến thể `<img/onerror>` không khoảng trắng); toast/chat/tên task đều escape phía client.
- **Approval Gate không fail-open:** quyết định lạ bị từ chối, tuyệt đối không tự duyệt hành động thật.
- Chống path traversal (tên file upload làm sạch, file artifact kiểm tra nằm đúng thư mục), chống zip-slip khi cài skill và khôi phục backup (chỉ nhận `data/` + `workspace/`, không đụng `secret/`).
- Budget guard chống race (TOCTOU) khi nhiều task song song; state machine không để task/mission kẹt (over_budget/paused/briefing đều có lối khôi phục).
- 100% dữ liệu nằm local tại `~/AICORP/`; chỉ prompt/response đi qua Claude API khi bật engine thật.

## Kiến trúc

```
server/
  db.js            SQLite (better-sqlite3) — schema chương 3 · dữ liệu tại ~/AICORP/
  seed.js          7 phòng ban · 25 agent · nạp skill từ skills-seed/
  engine.js        EngineProvider kép: ClaudeEngine (API) / DemoEngine (offline, module hóa)
  demo/            planner + 7 module năng lực phòng ban + gợi ý nhiệm vụ 12 ngành
  skills-seed/     19+ skill chuẩn SKILL.md
  prompts.js       Template chương 12
  orchestrator.js  State machine ch5 + budget guard + approval gate + n8n + cron + DM + resume
  artifacts.js     Xuất docx/xlsx/pptx/html/md
  index.js         REST API + static + WebSocket (quy ước 2.4)
public/            UI 1 trang bám demo chuẩn (sơ đồ sống, chat, War Room, Xưởng, Phê duyệt, HR, Brain, Kết nối, Cài đặt, Wizard)
scripts/
  smoke.js         Smoke test nghiệm thu nhanh
  test-full.js     40+ test tích hợp toàn tính năng
  ui-smoke.js      UI test bằng Chrome headless (cần Google Chrome)
```

**Ghi chú:** dùng Express + HTML/JS thuần thay Next.js (giữ nguyên hành vi/hình ảnh UI chuẩn, cài nhẹ hơn cho học viên). Trên macOS (filesystem không phân biệt hoa thường) `~/aicorp` và `~/AICORP` là một thư mục — dữ liệu runtime đã nằm trong `.gitignore`, tránh chạy `git clean -fd`.

## Kiểm thử

```bash
# cửa sổ 1 — server (AICORP_HOME riêng để test không đụng dữ liệu thật)
AICORP_NO_OPEN=1 AICORP_HOME=/tmp/aicorp-test npm start

# cửa sổ 2 — các bộ test
npm run smoke        # nghiệm thu nhanh (~3 phút)
npm test             # 40 test tích hợp toàn tính năng (~10 phút)
npm run test:audit   # 9 test hồi quy các lỗi audit đã vá
npm run test:ui      # UI test Chrome headless (cần Google Chrome)
```

Kết quả mới nhất: **smoke ✓ · full 40/40 ✓ · audit-fix 9/9 ✓ · UI smoke ✓**.
