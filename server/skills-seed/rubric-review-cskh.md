---
name: rubric-review-cskh
description: Rubric chấm điểm sản phẩm phòng CSKH — 5 tiêu chí có trọng số, ngưỡng quyết định và điều kiện auto-fail
agents: tp_cs
---
## Thang 100 điểm — 5 tiêu chí có trọng số
| Tiêu chí | Trọng số | Đạt tối đa khi |
| --- | --- | --- |
| Đúng quy trình LAST / cấu trúc chuẩn | 25 | đủ 4 bước mỗi tình huống, đúng thứ tự, có xác minh TRƯỚC khi chốt phương án |
| Tuân thủ điều cấm & chính sách | 25 | 0 câu chạm dna.voice.banned; không hứa vượt chính sách đổi trả công bố |
| Giọng thương hiệu & xưng hô | 20 | 100% đúng dna.voice.address; câu đồng cảm cá nhân hoá theo từng tình huống |
| Tính khả thi & con số | 20 | mọi cam kết có mốc đo được (phút/giờ/ngày), nằm trong thẩm quyền đền bù theo bậc |
| Follow-up & đo lường | 10 | mỗi ca có bước theo dõi ≤24h; có chỉ số CSAT ≥4,5/5 và báo cáo tuần |

Điểm cuối = tổng (điểm tiêu chí × trọng số) / 100, làm tròn số nguyên.

## Ngưỡng quyết định
- **≥90: ĐẠT** — duyệt, chỉ ghi vài góp ý nhỏ (tối đa 2), lưu bản chuẩn vào Company Brain.
- **75–89: TRẢ LẠI SỬA** — liệt kê từng lỗi theo mẫu Vị trí → Lỗi → Cách sửa, hẹn nộp lại trong ngày.
- **<75: LÀM LẠI** — brief lại từ đầu kèm 1 ví dụ mẫu đạt chuẩn để nhân viên bám theo.

## Auto-fail (trả lại ngay bất kể tổng điểm)
- Bất kỳ câu nào vi phạm dna.voice.banned (VD hứa chữa bệnh, cam kết lợi nhuận, cam kết duyệt vay).
- Hứa đền bù vượt bậc thẩm quyền trong skill xu-ly-khieu-nai-last (VD "hoàn ngay lập tức", "đền gấp đôi").
- Sai xưng hô so với DNA từ 3 lần trở lên, hoặc giọng đối đầu/đổ lỗi cho khách.
- Còn placeholder, lorem, "TODO", hoặc số liệu bịa không suy được từ DNA/brief.

## Cách viết nhận xét trả lại (để nhân viên sửa không cần hỏi lại)
- Mỗi lỗi đủ 3 phần: VỊ TRÍ (tình huống/câu số) → LỖI (1 câu, gọi đích danh) → CÁCH SỬA (1 câu, có ví dụ).
- Tối đa 5 lỗi trọng tâm mỗi lần trả — không rải lỗi vụn làm loãng trọng điểm.
- Luôn chốt: hạn nộp lại + sẽ chấm lại theo đúng rubric này, ngưỡng 90/100.

## Kiểm tra nhanh 5 phút trước khi duyệt
- [ ] Đọc to 2 câu thoại bất kỳ — nghe có giống người thật nói với khách không?
- [ ] Lấy 1 con số bất kỳ — truy được nguồn (DNA, chính sách, skill) hay giả định ghi rõ không?
- [ ] Giả làm khách khó: kịch bản có đường thoát cho tình huống leo thang (chuyển TP 30 phút) không?
