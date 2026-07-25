# 🏢 AICORP — Công ty AI chạy trên máy của bạn

Web app chạy **local** mô phỏng một công ty hoàn chỉnh bằng AI agent: bạn là **CEO duy nhất là người thật**, bên dưới là **AI COO** và **7 phòng ban** (Trưởng phòng + Nhân viên AI). Giao nhiệm vụ bằng tiếng Việt tự nhiên → hệ thống tự phân rã, thực thi song song, review chấm điểm, và trả về **file thật** (docx/xlsx/pptx/html) kèm báo cáo.

Xây theo đặc tả `dac-ta-aicorp.md` v1.0 · giao diện bám 1-1 file chuẩn `aicorp-giao-dien.html`.

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
| **Demo** (mặc định) | Chạy thử toàn bộ AI Loop không cần key, không tốn tiền — nội dung mô phỏng |
| **Claude API** | Nhập API key trong Cài đặt → chạy thật. Model theo cấp bậc: COO=Opus, TP=Sonnet, NV=Haiku (đổi được) |

Gói Sub Claude (Pro/Max) qua Agent SDK: lộ trình v1.

## Đã có (MVP theo chương 1.4 đặc tả)

- **Onboarding DNA** 7 bước: engine, danh thiếp, sản phẩm/khách, giọng thương hiệu, chọn phòng ban (preset theo ngành), tài liệu, khai trương
- **Sơ đồ sống realtime**: 6 trạng thái agent (nghỉ/suy nghĩ/làm/review/chờ CEO/xong), gói tin chạy trên đường nối, điểm review bật góc thẻ, camera tự bám, pan/zoom
- **AI Loop trọn vòng**: giao → brief-back (mode Hỏi kỹ) → phân rã WBS → thực thi song song (mặc định 3 phiên) → review chấm điểm ngưỡng 90 → trả lại tối đa 3 vòng → escalate CEO → báo cáo tổng hợp
- **Xưởng sản phẩm**: xuất docx/xlsx/pptx/html/md thật, mở/tải được
- **Hộp phê duyệt**: mọi hành động thật (đăng bài, gửi mail…) dừng chờ CEO; duyệt/từ chối; từ chối kèm lý do → task quay lại nhân viên sửa
- **Company Brain**: DNA + kho tài liệu RAG-lite (nạp .txt/.md/.csv, tự index, agent tra cứu) + bộ nhớ dài hạn (quyết định CEO, bài học)
- **Budget Guard**: trần/nhiệm vụ + trần/ngày, quy đổi VND, chạm trần → tạm dừng chờ CEO nâng trần
- **Checkpoint**: tắt app giữa nhiệm vụ → mở lại chạy tiếp đúng chỗ dừng
- **Skill** (5 skill mẫu, chuẩn SKILL.md, nạp vào system prompt) · **Kết nối MCP/n8n** (toggle, thực thi mô phỏng qua Approval Gate)

## Kiến trúc

```
server/          Node.js thuần (Express + socket.io, port 3939)
  db.js          SQLite (better-sqlite3) — schema chương 3 · dữ liệu tại ~/AICORP/
  seed.js        7 phòng ban · 25 agent · 5 skill mẫu · kết nối mẫu
  engine.js      EngineProvider kép: ClaudeEngine (API thật) / DemoEngine (offline)
  prompts.js     Template chương 12 (brief-back, WBS, thực thi, review, báo cáo)
  orchestrator.js  State machine chương 5 + budget guard + approval gate + resume
  artifacts.js   Xuất docx/xlsx/pptx/html/md
  index.js       REST API + static + WebSocket events (quy ước 2.4)
public/          UI 1 trang bám demo: sơ đồ sống, chat COO, War Room, Xưởng, Phê duyệt, HR, Brain, Kết nối, Cài đặt, Wizard
scripts/smoke.js Smoke test nghiệm thu (npm run smoke — cần server đang chạy)
```

**Ghi chú so với đặc tả:** dùng Express + HTML/JS thuần thay cho Next.js — giữ nguyên 100% hành vi/hình ảnh UI chuẩn nhưng cài đặt nhẹ hơn nhiều cho máy học viên (không cần build step, `npm start` là chạy). API key lưu tại `~/AICORP/secret/credentials.json` (quyền 600), không nằm trong DB. Dữ liệu 100% local tại `~/AICORP/`.

## Kiểm thử

```bash
npm start                # cửa sổ 1
npm run smoke            # cửa sổ 2 — chạy 19 kiểm tra nghiệm thu (~3 phút, chế độ demo)
```
