# 📖 HƯỚNG DẪN SỬ DỤNG AICORP

Chào bạn! Đây là cẩm nang dùng AICORP — viết cho người **không rành máy tính**. Bạn cứ đọc đến đâu làm đến đó, 10 phút là công ty AI của bạn chạy được ngay.

## 🗂 Mục lục

1. 🏢 [AICORP là gì?](#1-🏢-aicorp-là-gì)
2. 💻 [Cài đặt & mở phần mềm](#2-💻-cài-đặt--mở-phần-mềm)
3. 🎊 [Khai trương công ty — 7 bước](#3-🎊-khai-trương-công-ty--7-bước)
4. 📣 [Giao việc đầu tiên](#4-📣-giao-việc-đầu-tiên)
5. 👀 [Xem cả công ty làm việc](#5-👀-xem-cả-công-ty-làm-việc)
6. 🔔 [Hộp phê duyệt — quyền quyết định của bạn](#6-🔔-hộp-phê-duyệt--quyền-quyết-định-của-bạn)
7. 📦 [Xưởng sản phẩm — nhận file thật](#7-📦-xưởng-sản-phẩm--nhận-file-thật)
8. 👥 [Quản trị nhân sự AI](#8-👥-quản-trị-nhân-sự-ai)
9. 🧠 [Company Brain — bộ não công ty](#9-🧠-company-brain--bộ-não-công-ty)
9b. 🕸️ [Bộ não thứ 2 — mạng tri thức kiểu Obsidian](#9b-🕸️-bộ-não-thứ-2--mạng-tri-thức-kiểu-obsidian)
9c. 🏢 [Kết nối doanh nghiệp (MCP) — nối phần mềm thật](#9c-🏢-kết-nối-doanh-nghiệp-mcp--nối-phần-mềm-thật)
10. 🚀 [Tính năng nâng cao](#10-🚀-tính-năng-nâng-cao)
11. ❓ [Câu hỏi thường gặp](#11-❓-câu-hỏi-thường-gặp)

---

## 1. 🏢 AICORP là gì?

AICORP là một "công ty ảo" chạy ngay trên máy tính của bạn: bạn là **CEO — người thật duy nhất**, bên dưới là AI COO (giám đốc vận hành) cùng 7 phòng ban với các trưởng phòng và nhân viên AI. Bạn chỉ cần ra lệnh bằng tiếng Việt bình thường — ví dụ "Viết 5 bài Facebook bán trà" — cả công ty sẽ tự chia việc, làm song song, chấm điểm chéo lẫn nhau rồi trả về **file thật** (Word, Excel, PowerPoint, trang web) kèm báo cáo. Mọi dữ liệu nằm trên máy của bạn, không gửi đi đâu cả.

---

## 2. 💻 Cài đặt & mở phần mềm

**Chuẩn bị một lần duy nhất:** máy cần có Node.js (phần mềm nền miễn phí). Nếu chưa có, vào [nodejs.org](https://nodejs.org) → bấm nút tải bản khuyến nghị (LTS) → cài như phần mềm bình thường (Next → Next → Finish).

**Mở AICORP:** mở ứng dụng Terminal (máy Mac) hoặc Command Prompt (máy Windows), gõ lần lượt từng dòng rồi Enter:

```
cd ~/aicorp
npm install
npm start
```

- `npm install` chỉ cần chạy **lần đầu tiên** (máy tải các thành phần cần thiết, chờ vài phút).
- `npm start` là lệnh mở phần mềm — từ nay mỗi lần dùng chỉ cần lệnh này.
- Mở xong, trình duyệt sẽ tự bật trang **http://localhost:3939**. Nếu không tự bật, bạn tự gõ địa chỉ đó vào trình duyệt.
- Muốn tắt phần mềm: quay lại cửa sổ Terminal, bấm phím `Ctrl` + `C`. Yên tâm — công việc đang chạy dở **không bị mất** (xem Câu hỏi thường gặp).

---

## 3. 🎊 Khai trương công ty — 7 bước

Lần đầu mở, phần mềm dẫn bạn qua khảo sát 7 bước (~5 phút) để "hiểu" doanh nghiệp của bạn. Đây là phần quan trọng nhất — điền càng thật, nhân viên AI làm càng đúng ý.

**Bước 1 — Chọn nguồn sức mạnh (engine).** Có 3 lựa chọn, đổi lại được bất cứ lúc nào trong Cài đặt:

| Chế độ | Dành cho ai | Chi phí |
|---|---|---|
| 🎬 **Chạy thử (Demo)** | Mới làm quen — mọi thứ chạy y như thật nhưng nội dung là mô phỏng | Miễn phí, không cần đăng ký gì |
| 🎫 **Gói Sub Claude (Pro/Max)** | Bạn đã có gói Claude Pro/Max trả tháng — dùng luôn hạn mức đó, khỏi trả thêm | **Không tính tiền theo lượt** — chạy trong hạn mức tài khoản của bạn |
| 🔑 **Claude API** | Dùng thật, trả theo lượng dùng | Trả theo lượng dùng, hiển thị quy đổi ra tiền Việt |

**Cách dùng gói Sub Claude (nếu bạn đã có Pro/Max):** mở **Terminal**, gõ lệnh `claude setup-token` rồi Enter → đăng nhập tài khoản Claude của bạn → chương trình in ra một dãy token bắt đầu bằng `sk-ant-oat01-…` → sao chép dãy đó → quay lại AICORP, dán vào ô **Token gói Sub** ở thẻ 🎫 (màn Kết nối hoặc trong Cài đặt) → bấm **Lưu & dùng**. Xong! Cả công ty AI sẽ chạy bằng hạn mức gói sub của bạn, thanh chi phí đổi thành "🎫 Gói Sub" thay cho tiền Việt. (Cần đã cài sẵn Claude Code hoặc CLI Anthropic trên máy.)

**Cách lấy chìa khóa (API key) cho chế độ Claude API:** vào [console.anthropic.com](https://console.anthropic.com) → đăng ký tài khoản → mục **API Keys** → **Create Key** → sao chép dãy ký tự bắt đầu bằng `sk-ant-…` → dán vào ô trong Bước 1. Bấm nút **🔍 Kiểm tra kết nối** để chắc chắn chìa khóa hoạt động. Chìa khóa chỉ lưu trên máy bạn.

💡 Lời khuyên: lần đầu cứ chọn **Demo** để làm quen. Nếu đã có gói Pro/Max thì **Gói Sub** là rẻ nhất (không tốn thêm tiền). Còn muốn tách bạch chi phí từng việc thì dùng **Claude API**.

**Bước 2 — Danh thiếp doanh nghiệp.** Tên công ty, ngành, quy mô, khu vực. Muốn thử nhanh, bấm nút **✨ Điền dữ liệu mẫu** — phần mềm điền sẵn hồ sơ một công ty trà thảo mộc để bạn khám phá ngay.

**Bước 3 — Sản phẩm & khách hàng.** Mỗi dòng một sản phẩm theo dạng `Tên | khoảng giá` (ví dụ: `Trà đêm An Nhiên | 159k-289k`). Điền thêm chân dung khách mục tiêu, kênh bán và mục tiêu 3 tháng tới.

**Bước 4 — Giọng thương hiệu.** Chọn **đúng 2 tính từ** (gần gũi, sang trọng, hài hước…), cách xưng hô với khách (em — chị, shop — bạn…), và 3 điều **không được nói** (ví dụ: không hứa "chữa bệnh"). Nhân viên AI sẽ tuân thủ tuyệt đối.

**Bước 5 — Chọn phòng ban.** Phần mềm đã bật sẵn các phòng phù hợp với ngành của bạn — bạn bấm để bật/tắt thoải mái. Ban giám đốc (AI COO) luôn có.

**Bước 6 — Nạp tài liệu (bỏ qua được).** Bảng giá, catalogue, quy trình… có thể nạp sau trong mục Company Brain.

**Bước 7 — Lễ khai trương.** Xem lại tóm tắt rồi bấm **🎊 Khai trương công ty!** — sơ đồ công ty hiện ra, AI COO chào bạn và gợi ý sẵn 3 việc hợp với ngành.

---

## 4. 📣 Giao việc đầu tiên

Ở màn hình chính, bên trái là khung trò chuyện với **AI COO**. Gõ yêu cầu vào ô nhập lệnh phía dưới rồi Enter. Phía trên ô nhập có 2 chế độ:

- 🙋 **Hỏi kỹ trước khi làm** — nếu lệnh còn mơ hồ, COO sẽ hỏi lại bạn tối đa 2 câu (ngân sách? thời hạn? ưu tiên kênh nào?) rồi mới triển khai. Bạn trả lời ngay trong khung chat. Hợp với việc quan trọng.
- ⚡ **Cứ làm đi** — COO tự quyết mọi chi tiết và bắt tay làm luôn. Hợp với việc quen thuộc.

**10 câu lệnh mẫu** — bạn gõ y nguyên hoặc sửa theo sản phẩm của mình:

1. ✍️ `Viết 5 bài Facebook bán trà đêm An Nhiên` — ra bộ bài đăng kèm nội dung hoàn chỉnh
2. 🎬 `Viết kịch bản video TikTok 60 giây giới thiệu sản phẩm mới` — ra kịch bản quay chi tiết từng giây
3. 🧾 `Làm bảng báo giá đại lý chiết khấu theo bậc số lượng` — ra bảng giá B2B kèm điều khoản
4. 📊 `Lập dự toán chi phí và điểm hòa vốn cho quý này` — ra file Excel 3 kịch bản tài chính
5. 💵 `Đối soát công nợ khách hàng và lập lịch nhắc nợ` — ra bảng công nợ kèm mẫu tin nhắc lịch sự
6. 🧑‍💼 `Soạn JD và bộ câu hỏi phỏng vấn cho vị trí nhân viên bán hàng` — ra hồ sơ tuyển dụng đầy đủ
7. 🎓 `Làm giáo trình đào tạo hội nhập cho nhân viên mới` — ra lộ trình 5 ngày kèm bài kiểm tra
8. 🤝 `Soạn kịch bản xử lý khiếu nại và bộ 20 câu hỏi đáp FAQ cho khách` — chăm sóc khách hàng bài bản
9. 📋 `Viết SOP quy trình giao hàng và rà soát hợp đồng đại lý` — chuẩn hóa vận hành + cảnh báo rủi ro
10. 📈 `Phân tích số liệu bán hàng và dựng dashboard điều hành cho tôi` — ra trang tổng quan số liệu 1 trang

💡 **Mẹo hay:**
- Thêm đuôi `…rồi đăng lên fanpage` hoặc `…rồi gửi email cho khách` — nhân viên sẽ soạn xong và **dừng lại chờ bạn duyệt** trong Hộp phê duyệt trước khi làm thật.
- Gõ lệnh có chữ "ra mắt", "chiến dịch" hoặc "khai trương" (ví dụ `Lên chiến dịch ra mắt sản phẩm mới`) — COO sẽ huy động **nhiều phòng ban cùng lúc**: nội dung, kế hoạch quảng cáo, khảo sát đối thủ, dự toán, báo giá, FAQ.

---

## 5. 👀 Xem cả công ty làm việc

Giao việc xong, đừng rời mắt — màn hình chính có 3 thẻ xem:

**🗺️ Sơ đồ sống.** Toàn cảnh công ty theo thời gian thực:
- Mỗi nhân viên là một thẻ nhỏ, đổi màu theo **6 trạng thái**: 😴 nghỉ · 🧠 đang suy nghĩ · ⚡ đang làm việc · 🔍 đang review · 🔔 chờ bạn duyệt · ✅ vừa xong.
- Những **chấm sáng chạy trên đường nối** là công việc và tài liệu đang được chuyển giữa các cấp: bạn → COO → trưởng phòng → nhân viên.
- Khi trưởng phòng chấm bài, **điểm số hiện ngay góc thẻ** nhân viên (ví dụ `92/100 ✔` là đạt, `78/100 ✘` là bị trả lại làm lại).
- Màn hình tự chạy theo nơi đang bận rộn nhất; bạn cũng có thể kéo chuột để di chuyển, lăn chuột để phóng to/thu nhỏ.
- **Bấm vào thẻ nhân viên** để xem hồ sơ: số việc đã xong, điểm trung bình, nhật ký suy nghĩ trực tiếp.

**📌 War Room.** Bảng tác chiến 5 cột: Chờ làm → Đang làm → Đang review → Chờ CEO → Hoàn thành. Từng đầu việc là một thẻ tự di chuyển qua các cột. **Bấm vào thẻ** để xem chi tiết: đề bài giao cho nhân viên, tiêu chí chấm điểm, các vòng review kèm nhận xét, và file kết quả.

**📅 Dòng thời gian.** Từng đầu việc là một thanh ngang theo giờ thật — nhìn phát biết việc nào chạy trước, việc nào chờ việc nào, việc nào đang chậm. Bấm vào thanh cũng mở chi tiết.

Ngoài ra, khung bên phải luôn hiển thị nhiệm vụ đang chạy: phần trăm hoàn thành, số vòng review, số lần bị trả lại, chi phí đã dùng. Bấm **📜 Lịch sử** để xem lại mọi nhiệm vụ cũ kèm báo cáo tổng hợp của COO.

---

## 6. 🔔 Hộp phê duyệt — quyền quyết định của bạn

Nguyên tắc vàng của AICORP: **AI không bao giờ tự ý làm việc thật** — đăng bài, gửi email, chi tiền… đều phải dừng lại chờ bạn. Khi có việc chờ, biểu tượng 🔔 ở thanh bên trái hiện số đỏ, đồng thời một cửa sổ nhỏ bật lên cho bạn xem trước nội dung.

Với mỗi việc chờ duyệt, bạn có 3 lựa chọn:

- ✅ **Duyệt** — đồng ý, cho chạy y nguyên.
- ✏️ **Sửa rồi duyệt** — mở nội dung ra, bạn sửa trực tiếp bằng lời của mình, rồi duyệt. Bản bạn sửa chính là bản chạy thật (phần mềm cũng lưu thành phiên bản mới trong Xưởng).
- ❌ **Từ chối** — phần mềm hỏi **lý do từ chối**; hãy ghi thẳng thắn (ví dụ "giọng chưa giống thương hiệu, bớt giật tít"). Lý do này được gửi về cho nhân viên AI **tự sửa lại và nộp bản mới** — giống góp ý cho nhân viên thật.

Bận thì bấm "Để trong Hộp phê duyệt" — bạn quyết sau, các đầu việc khác vẫn chạy bình thường, không ai phải ngồi chờ.

---

## 7. 📦 Xưởng sản phẩm — nhận file thật

Bấm biểu tượng 📦 ở thanh bên trái. Đây là kho chứa mọi thành phẩm của công ty — **file thật, mở được, gửi được**:

- 📝 File Word (.docx) — bài viết, kịch bản, JD, giáo trình, SOP…
- 📊 File Excel (.xlsx) — dự toán, báo giá, công nợ, phân tích số liệu…
- 📽 File trình chiếu (.pptx) — kế hoạch chiến dịch…
- 🌐 Trang web (.html) — dashboard điều hành xem ngay trên trình duyệt…

Mỗi dòng ghi rõ: tên file, phòng ban làm, nhân viên làm, **điểm review**, số phiên bản và ngày tạo. Bấm nút **Xem** để mở hoặc tải về máy. Khi nhân viên vừa hoàn thành, bạn còn thấy hiệu ứng file "bay" từ sơ đồ về Xưởng — vui mắt và biết ngay có hàng mới.

Ngoài các file trên, khi bạn duyệt một hành động thật, công ty còn tạo:
- ✉️ **File thư (.eml)** khi bạn duyệt gửi mail — mở thẳng bằng ứng dụng Mail/Outlook để gửi.
- 📅 **File lịch (.ics)** khi bạn duyệt đăng bài hoặc đặt lịch — mở bằng ứng dụng Lịch để ghim nhắc.

---

## 7b. 🎛️ Buồng lái kinh doanh — bức tranh doanh nghiệp

Bấm biểu tượng 🎛️ ở thanh bên trái. Đây không phải danh sách file, mà là **sức khỏe công ty tích lũy qua thời gian** — càng giao việc, bức tranh càng rõ:

- **6 ô số lớn:** doanh thu dự phóng/tháng, lợi nhuận hoạt động, số chiến dịch đã lên lịch, lead trong pipeline, chi phí AI/tháng (như tiền lương thật của đội AI), điểm chất lượng trung bình.
- **Bảng P&L dự phóng:** doanh thu − giá vốn − chi phí AI = lợi nhuận, để bạn biết công ty đang lãi hay lỗ theo kế hoạch.
- **Nhịp hoạt động 6 tuần** và **tiến độ mục tiêu 3 tháng** bạn khai lúc khai trương.
- **Dòng sự kiện kinh doanh:** mỗi việc quan trọng (lập dự toán, chốt báo giá, đăng chiến dịch…) được ghi sổ tự động.

---

## 7c. 💡 Sáng kiến của COO — trợ lý chủ động

Bấm biểu tượng 💡. COO không chỉ chờ lệnh — nó **tự nhìn tình hình và đề xuất việc nên làm**, ví dụ: "Đối thủ vừa giảm giá, mình nên phản ứng", "Đã lâu chưa chăm khách cũ", "Nhân viên X hay bị trả bài, nên đào tạo lại", hay kế hoạch đầu tuần. Mỗi đề xuất có nút:
- **✔ Đồng ý — giao việc ngay:** biến sáng kiến thành nhiệm vụ, cả công ty bắt tay làm.
- **Bỏ qua:** nếu chưa cần.

Bạn cũng có thể bấm **"Nhờ COO rà soát ngay"** để COO xem xét và đề xuất tức thì. Khi có sáng kiến mới, biểu tượng 💡 hiện số đỏ.

> 💬 **Mẹo — Họp chiến lược:** khi bạn hỏi một câu quyết định như *"Công ty có nên tăng gấp đôi ngân sách quảng cáo không?"*, COO sẽ **triệu tập các trưởng phòng họp**: mỗi phòng nêu góc nhìn riêng (Marketing muốn đẩy mạnh, Tài chính lo hòa vốn…), rồi COO tổng hợp thành 2–3 phương án đưa vào Hộp phê duyệt để bạn chọn. Phương án bạn chốt được ghi vào bộ nhớ để mọi phòng làm theo thống nhất.

---

## 7d. 🧲 Khách hàng & Bán hàng (CRM)

Bấm biểu tượng 🧲. Công ty không chỉ tạo file — nó có **khách hàng thật và một phễu bán hàng sống**:

- **Phễu bán hàng** 5 cột: Mới → Ấm → Nóng → Đã chốt → Đã mất. Lead chảy qua từng giai đoạn.
- Duyệt một **bài đăng Facebook** trong Hộp phê duyệt → lead mới tự đổ về cột "Mới".
- Giao việc **"chấm điểm lead"** cho phòng Kinh doanh → lead được đẩy từ Mới/Ấm lên Nóng.
- Giao việc **"tư vấn chốt đơn"** → lead Nóng được chốt thành **đơn hàng thật**, ra doanh thu (bạn thấy ngay ở Buồng lái).
- **Ticket CSKH** tự phát sinh khi có khách mua; giao việc chăm sóc khách → ticket được xử lý.

Đây là lý do khi bạn giao "chuẩn bị ra mắt sản phẩm", cả công ty vận hành như thật: marketing kéo khách → sales chốt đơn → CSKH chăm sóc → doanh thu vào sổ.

---

## 7e. 📘 Công ty tự học (Playbook)

Trong màn 👥 Nhân sự AI, kéo xuống mục **Playbook**. Mỗi khi một bài đạt điểm rất cao (≥95), công ty **tự đúc kết nó thành "công thức phòng"** và dùng lại cho việc sau — nên càng dùng lâu, chất lượng càng lên. COO cũng tự nhắc bạn nên **nâng vai người làm giỏi** hoặc **đào tạo lại người hay bị trả bài**.

---

## 7f. 🏢 Điều hành nhiều công ty

Bạn quản nhiều doanh nghiệp? Bấm vào **tên công ty ở góc trên bên trái** (có mũi tên ▾) để mở danh sách. Từ đây bạn **chuyển qua công ty khác** hoặc **➕ Thêm công ty mới**. Mỗi công ty có dữ liệu **hoàn toàn riêng biệt** (khách hàng, nhân sự, file, bộ nhớ) — không lẫn lộn. Khi chuyển hoặc tạo công ty, app sẽ tự thoát; bạn chạy lại `npm start` là vào công ty đã chọn. (API key dùng chung cho mọi công ty.)

---

## 8. 👥 Quản trị nhân sự AI

Bấm biểu tượng 👥 để mở danh sách toàn bộ nhân viên: phòng ban, cấp model, số việc đã xong, điểm trung bình, tỷ lệ bị trả lại, trạng thái hiện tại. Bạn quản họ như quản người thật:

**＋ Tuyển nhân viên AI mới.** Bấm nút ở góc trên → chọn phòng ban, đặt tên, chức danh, chọn hình đại diện, rồi **mô tả công việc bằng lời thường** (ví dụ: "Chăm sóc hệ thống đại lý: soạn tin chúc mừng doanh số, nhắc công nợ lịch sự, tổng hợp phản hồi hằng tuần"). Bấm **🎉 Tuyển vào công ty** — nhân viên mới xuất hiện ngay trên Sơ đồ sống và bắt đầu "ngày đầu đi làm". Từ đó, lệnh nào khớp chuyên môn của họ sẽ được COO giao đúng người.

**💬 Nhắn riêng.** Trò chuyện 1-1 với bất kỳ nhân viên nào — hỏi han, dặn dò, kiểm tra hiểu biết. Họ trả lời theo đúng vai trò của mình.

**✏️ Sửa kỹ năng.** Chỉnh chức danh, nâng/hạ cấp model (Haiku nhanh-rẻ cho việc thường, Sonnet cho việc khó), gắn thêm skill, và sửa "bản mô tả vai trò & nguyên tắc" của nhân viên. Có hiệu lực từ lượt làm việc kế tiếp.

**🎓 Đào tạo lại.** Khi một nhân viên có tỷ lệ bị trả lại cao (trên 15%, có dấu ⚠️), nút Đào tạo lại xuất hiện. Bấm vào — phần mềm tự gom các nhận xét chấm trượt gần đây thành mục "KINH NGHIỆM CẦN NHỚ" trong hồ sơ nhân viên. Bạn xem qua, sửa nếu muốn, rồi lưu — nhân viên sẽ "nhớ bài" từ lần làm sau.

**⏸ Tạm dừng.** Nhân viên nào chưa cần dùng thì tạm dừng — họ không nhận việc mới cho đến khi bạn kích hoạt lại. (Riêng AI COO không tạm dừng được — công ty cần giám đốc vận hành.)

---

## 9. 🧠 Company Brain — bộ não công ty

Bấm biểu tượng 🧠. Đây là nơi lưu mọi hiểu biết chung để **tất cả** nhân viên AI cùng tra cứu:

- **DNA doanh nghiệp** — toàn bộ khảo sát 7 bước của bạn. Muốn sửa (đổi mục tiêu, thêm sản phẩm…), bấm **✏️ Sửa (làm lại khảo sát)**.
- **Kho tài liệu** — bấm **＋ Nạp file** để đưa bảng giá, catalogue, quy trình nội bộ… vào (nhận file chữ dạng .txt, .md, .csv). Phần mềm tự chia nhỏ và lập chỉ mục; từ đó khi làm việc, nhân viên sẽ tra đúng số liệu của bạn thay vì đoán mò. Ví dụ: nạp bảng giá xong, bài viết bán hàng sẽ ghi đúng giá từng sản phẩm.
- **Bộ nhớ dài hạn** — tự đầy lên theo thời gian: quyết định của bạn (duyệt gì, từ chối gì và vì sao), bài học sau mỗi nhiệm vụ. Công ty càng chạy lâu càng "hiểu ý sếp".

---

## 9b. 🕸️ Bộ não thứ 2 — mạng tri thức kiểu Obsidian

Bấm biểu tượng 🕸️. Nếu Company Brain (🧠) là "kho hồ sơ", thì đây là **mạng tri thức sống** giúp công ty ngày càng thông minh:

- **Mỗi ý là một ghi chú, nối nhau bằng `[[liên kết]]`.** Ví dụ ghi chú "Trà đêm An Nhiên" nối tới "Khách hàng mục tiêu" và "Giọng thương hiệu". Bên phải hiện **ai đang nhắc tới ghi chú này** (backlink) — bạn thấy được tri thức liên quan mà không phải tìm.
- **Xem đồ thị.** Bấm **🕸️ Đồ thị** để thấy toàn bộ tri thức công ty như một mạng sao: chấm to = được nhắc nhiều, màu theo loại; kéo để sắp, lăn chuột để phóng to, bấm một chấm để mở ghi chú.
- **Công ty tự ghi bài học.** Xong mỗi nhiệm vụ, COO tự tạo một ghi chú "Bài học" và **tự nối** nó với sản phẩm/phòng ban liên quan. Trước khi làm việc mới, nhân viên AI đọc lại đúng những ghi chú liên quan — nên làm càng lâu càng "lành nghề".
- **Tự viết thêm.** Bấm **＋ Ghi chú mới**, gõ nội dung (hỗ trợ markdown), gõ `[[` rồi tên một ghi chú khác để tạo liên kết. Muốn gợi ý nên nối gì với gì, bấm **🔗 Gợi ý nối**.
- **Mở được bằng Obsidian thật.** Mọi ghi chú là file `.md` trong thư mục `AICORP/workspace/brain/notes/`. Bạn có thể mở thư mục đó bằng app Obsidian để xem/sửa; sửa xong quay lại AICORP bấm **🔄 Nạp lại** là đồng bộ.

---

## 9c. 🏢 Kết nối doanh nghiệp (MCP) — nối phần mềm thật

Đây là bước để công ty AI **làm việc thật với phần mềm bạn đang dùng**, không chỉ mô phỏng. Vào **🔌 Kết nối** → khối **"Kết nối doanh nghiệp (MCP)"**.

- **MCP là gì (nói đơn giản):** một "ổ cắm chuẩn" để AI kết nối tới các phần mềm khác — Gmail, Google Drive, Slack, cơ sở dữ liệu, và qua **n8n** thì tới cả Zalo OA, Shopee, TikTok Shop, phần mềm kế toán…
- **Thêm kết nối:** bấm **＋ Thêm kết nối** → chọn trong **danh mục gợi ý** (đã điền sẵn cấu hình) hoặc "Tùy chỉnh" để nhập lệnh. Nếu kết nối cần chìa khoá (token), dán vào ô khoá — **khoá chỉ lưu trên máy bạn** (file quyền 600), không gửi đi đâu.
- **Gán công cụ cho phòng:** mỗi kết nối có nhiều "công cụ". Bấm các chip **phòng** (MKT, KD, CSKH…) để cho phòng đó được dùng bộ công cụ này — như phát "đồ nghề" cho nhân viên.
- **Trạng thái:** 🟢 đã nối · 🔴 lỗi (xem thông báo) · ⚪ chưa nối. Bấm **🔄 Nối lại** nếu cần.
- **An toàn:** mọi hành động ra thế giới thật vẫn phải qua 🔔 Hộp phê duyệt. Nếu bạn phơi app ra internet (Cloudflare Tunnel), hãy đặt mật khẩu — vì cấu hình kết nối MCP là quyền mạnh.

**Hành động thật (Pha B — đã có):** khi một phòng đã được gán công cụ MCP, lúc nhân viên AI hoàn thành việc cần "hành động thật", **Hộp phê duyệt sẽ hiện đúng công cụ và tham số sẽ chạy** (vd: sẽ ghi tệp gì, gửi cho ai). Bạn bấm **Duyệt & chạy thật** → AICORP **gọi công cụ thật** → kết quả (đường dẫn tệp, mã, nội dung trả về) hiện ngay trong khối **📊 Kết quả thật** ở màn Kết nối và được lưu làm bằng chứng vào Bộ não thứ 2. Nếu chưa duyệt thì không có gì chạy — bạn luôn là người quyết định.

> Ví dụ chạy thử ngay: thêm kết nối **Filesystem** (trỏ vào thư mục workspace), gán công cụ **write_file** cho phòng Marketing, rồi giao "viết bài và đăng fanpage". Khi duyệt, AICORP sẽ **ghi một tệp thật** chứa bài viết — đó là "kết quả thật" đầu tiên.

---

## 10. 🚀 Tính năng nâng cao

Khi đã dùng quen, bạn có thêm các công cụ sau:

**🧩 Cài thêm skill (gói kỹ năng).** Vào mục 🔌 Kết nối & Skill → bấm **＋ Cài skill (.zip)** → chọn file gói kỹ năng được chia sẻ (bên trong phải có file SKILL.md). Cài xong, vào Nhân sự AI → ✏️ Sửa kỹ năng để gắn skill đó cho nhân viên phù hợp. Mỗi skill là một "khóa nghiệp vụ" giúp nhân viên làm chuẩn hơn.

**🔗 Kết nối n8n.** Nếu bạn (hoặc người hỗ trợ kỹ thuật) có sẵn hệ thống n8n để tự động hóa, vào Kết nối & Skill → dòng n8n → bấm **⚙ URL** → dán địa chỉ webhook (bắt đầu bằng http:// hoặc https://) → gạt nút bật. Mọi lệnh gửi ra ngoài vẫn phải qua Hộp phê duyệt.

**⏰ Lịch nhiệm vụ định kỳ.** Vào ⚙️ Cài đặt → mục lịch định kỳ → gõ nội dung việc (ví dụ: "Tổng hợp việc cần làm trong ngày"), chọn **hằng ngày** hoặc **hằng tuần**, đặt giờ chạy → bấm **＋ Thêm lịch**. Đến giờ, công ty tự chạy nhiệm vụ đó mà bạn không cần gõ lại. Gạt nút để tạm tắt, bấm 🗑 để xóa.

**💾 Sao lưu & khôi phục.** Vào ⚙️ Cài đặt → mục Sao lưu & khôi phục:
- **⬇ Xuất** — tải về một file `.aicorp` chứa toàn bộ công ty: dữ liệu, tài liệu, file thành phẩm, skill. Nên xuất định kỳ, cất vào USB hoặc thư mục lưu trữ. (File sao lưu **không chứa** chìa khóa API — an toàn khi chia sẻ.)
- **⬆ Nhập** — chọn file `.aicorp` để khôi phục. Lưu ý: thao tác này **ghi đè toàn bộ dữ liệu hiện tại**; nhập xong phần mềm tự thoát, bạn chạy lại `npm start` là hoàn tất.

**🛡 Trần chi phí (khi dùng Claude API).** Trong ⚙️ Cài đặt bạn đặt được **trần mỗi nhiệm vụ** và **trần mỗi ngày** (tính bằng tiền Việt). Thanh chi phí trên đầu màn hình đổi màu vàng khi gần trần, đỏ khi sát trần. Chạm trần → công ty **tự tạm dừng**, không tiêu thêm đồng nào; bạn nâng trần rồi bấm **▶ Chạy tiếp** nếu muốn. Cũng trong Cài đặt, bạn chọn được model cho từng cấp bậc (COO / trưởng phòng / nhân viên), ngưỡng điểm chấm đạt và số vòng review tối đa.

---

## 11. ❓ Câu hỏi thường gặp

**1. Đang chạy nhiệm vụ mà tôi lỡ tắt máy / tắt phần mềm — có mất việc không?**
Không. Phần mềm lưu tiến độ liên tục. Mở lại (`npm start`), công ty tự chạy tiếp **đúng chỗ đang dừng**, không làm lại từ đầu, không tốn thêm tiền cho phần đã làm.

**2. Dữ liệu công ty của tôi nằm ở đâu? Có ai xem được không?**
Tất cả nằm trong thư mục `AICORP` ngay trên máy bạn (thư mục cá nhân → AICORP). Phần mềm chỉ chạy tại địa chỉ nội bộ localhost — máy khác trong cùng mạng wifi cũng **không** truy cập được. Ở chế độ Claude API, nội dung công việc chỉ gửi đến máy chủ Claude để xử lý, không gửi đi đâu khác.

**3. Đang dùng Claude API mà báo hết hạn mức / hết tiền thì sao?**
Vào [console.anthropic.com](https://console.anthropic.com) → mục Billing để nạp thêm. Trong lúc chờ, bạn chuyển về chế độ Demo (mục Kết nối & Skill hoặc Cài đặt) để tiếp tục thao tác không tốn phí.

**4. Tôi muốn đổi model AI mạnh hơn / rẻ hơn?**
Vào ⚙️ Cài đặt → chọn model riêng cho từng cấp bậc: COO, trưởng phòng, nhân viên. Muốn đổi cho một nhân viên cụ thể: Nhân sự AI → ✏️ Sửa kỹ năng.

**5. Chế độ Demo và Claude API khác nhau thế nào?**
Demo chạy toàn bộ quy trình y như thật (giao việc, chấm điểm, ra file, phê duyệt) nhưng **nội dung là mô phỏng** — dùng để học và trình diễn. Claude API mới cho ra nội dung thật, dùng được ngay cho doanh nghiệp.

**6. Muốn chuyển AICORP sang máy tính khác thì làm sao?**
Máy cũ: Cài đặt → Sao lưu → **⬇ Xuất** để lấy file `.aicorp`. Máy mới: cài AICORP như mục 2, mở lên, vào Cài đặt → **⬆ Nhập** → chọn file đó → chạy lại `npm start`. Nhớ nhập lại chìa khóa API (file sao lưu cố tình không chứa chìa khóa để bảo mật).

**7. Vì sao có đầu việc bị "trả lại" mấy lần?**
Đó là tính năng, không phải lỗi: trưởng phòng chấm bài theo tiêu chí, dưới ngưỡng điểm (mặc định 90/100) là trả lại kèm nhận xét để nhân viên tự sửa, tối đa 3 vòng. Nếu vẫn chưa đạt, việc được chuyển lên xin ý kiến bạn. Nhân viên nào bị trả lại nhiều, hãy dùng nút **🎓 Đào tạo lại**.

**8. Tôi lỡ điền sai thông tin công ty lúc khai trương?**
Không sao. Vào 🧠 Company Brain → **✏️ Sửa (làm lại khảo sát)** — dữ liệu cũ được điền sẵn, bạn chỉ sửa chỗ cần rồi khai trương lại.

**9. Tôi có gói Claude trả tháng (Pro/Max) — dùng thay API key được không?**
Được rồi nhé! Chọn engine **🎫 Gói Sub Claude**. Mở Terminal chạy `claude setup-token`, đăng nhập, copy token `sk-ant-oat01-…`, dán vào ô Token gói Sub rồi bấm Lưu & dùng. Cả công ty sẽ chạy bằng hạn mức gói sub của bạn, **không tính tiền theo lượt** — thanh chi phí đổi thành "🎫 Gói Sub". Nếu chạm giới hạn phiên của gói sub, hệ thống tự giãn nhịp và báo lại; chờ ít phút hoặc tạm chuyển về Demo/API. (Cần đã cài Claude Code hoặc CLI Anthropic trên máy.)

**10. AI có tự đăng bài hay gửi email khi tôi không biết không?**
Không bao giờ. Mọi hành động ra thế giới thật đều dừng ở 🔔 Hộp phê duyệt chờ bạn bấm Duyệt. Chưa duyệt thì chưa có gì được gửi đi — bạn luôn là người quyết định cuối cùng.

---

*Chúc bạn điều hành công ty AI thật "mát tay"! Gặp vướng mắc, cứ mở phần mềm và… hỏi thẳng AI COO — trợ lý đắc lực nhất của bạn đấy.* 🌟
