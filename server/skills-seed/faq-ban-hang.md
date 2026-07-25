---
name: faq-ban-hang
description: Khung xây bộ FAQ bán hàng 15–20 câu theo 4 nhóm, công thức trả lời 3 bước và chốt chặn điều cấm
agents: nv_faq, tp_cs
---
## Cơ cấu bộ FAQ chuẩn (15–20 câu, đánh số liên tục C1, C2…)
- Nhóm sản phẩm & cách dùng: 5–6 câu — bắt buộc có câu GIÁ (đặt đầu nhóm) và câu CÁCH DÙNG.
- Nhóm đặt hàng & giao nhận: 3–4 câu — ngành dịch vụ/giáo dục/BĐS thay bằng nhóm đặt lịch & triển khai.
- Nhóm thanh toán & hoá đơn: 3 câu (COD/chuyển khoản, VAT, mua số lượng lớn).
- Nhóm đổi trả & hỗ trợ: 4–5 câu (điều kiện đổi, thời gian hoàn tiền, khung giờ hỗ trợ, ưu đãi khách cũ).

## Công thức 1 câu trả lời (tối đa 3 câu, ~45 từ)
1. KHẲNG ĐỊNH ngay (có / không / mức cụ thể) — không vòng vo.
2. CHI TIẾT then chốt: đúng 1 con số hoặc 1 điều kiện (thời hạn, phí, khu vực).
3. CTA mềm: mời nhắn kênh chính trong DNA để được hỗ trợ riêng.

## Quy tắc số liệu
- Mọi mốc thời gian phải cụ thể: "1–2 ngày nội thành, 2–4 ngày tỉnh" — cấm viết "sớm nhất có thể".
- Giá trả lời theo KHUNG lấy từ dna.products[].price_range; giá chốt để lại cho tư vấn riêng.
- Ngưỡng freeship suy từ giá: khoảng 1,5× giá thấp nhất, làm tròn lên bội số 50.000đ.
- Chính sách đổi trả luôn kèm đủ 3 điều kiện: thời hạn (7 ngày), nguyên trạng, hoá đơn/chứng từ.

## Chốt chặn điều cấm (bắt buộc trước khi nộp)
- Đối chiếu TỪNG câu trả lời với dna.voice.banned — 1 câu vi phạm = cả bộ không đạt (auto-fail).
- Ngành F&B / sức khỏe / mỹ phẩm: không cam kết công dụng chữa bệnh; chỉ dùng mức "hỗ trợ",
  "tuỳ cơ địa"; câu hỏi về bệnh lý, thai kỳ, thuốc đang dùng → hướng khách gặp bác sĩ.
- Ngành BĐS / tài chính: không cam kết lợi nhuận, không cam kết ngân hàng duyệt vay.
- Câu vượt thẩm quyền (y tế, pháp lý, đền bù lớn): ghi rõ hướng chuyển TP trong 30 phút.

## Checklist tự chấm trước khi gửi TP
- [ ] Đủ 15–20 câu, đánh số liên tục, chia đúng 4 nhóm theo cơ cấu trên.
- [ ] 100% câu trả lời ≤3 câu; xưng hô đúng dna.voice.address ở mọi câu.
- [ ] ≥70% câu có ít nhất 1 con số cụ thể; câu giá khớp price_range trong DNA.
- [ ] 0 câu chạm điều cấm; cuối tài liệu có dòng nguyên tắc trả lời + điều cấm.
