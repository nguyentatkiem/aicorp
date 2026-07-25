---
name: rubric-review-taichinh
description: Rubric chấm điểm của TP Tài chính — tiêu chí, trọng số, ngưỡng đạt và danh sách lỗi đánh trượt thẳng
agents: tp_tc
---

## Thang điểm 100 — 5 tiêu chí có trọng số
| Tiêu chí | Trọng số | Được điểm tối đa khi |
|---|---|---|
| Khớp số học | 30 | Mọi dòng tổng cộng tay lại đúng; hòa vốn/lương/công nợ tính đúng công thức |
| Giả định minh bạch | 20 | Mọi số ước tính đều ghi nguồn hoặc tỷ lệ tham chiếu; không có số "từ trên trời" |
| Đúng chuẩn nghề & format | 20 | Đúng format brief (xlsx có bảng + ghi chú công thức); BHXH đúng 10,5%/21,5%; tuổi nợ chia 30/60/90 |
| Khả thi & so chuẩn ngành | 15 | Số nằm trong khoảng hợp lý của ngành; kết luận có so ngưỡng (biên an toàn 15%, LN ≥10%…) |
| Trình bày cho CEO | 15 | Đọc 60 giây nắm được ý chính; nhận định + đề xuất kèm con số tác động |

## Ngưỡng quyết định
- **≥ 90: ĐẠT** — duyệt, chỉ ghi 1–2 góp ý nhỏ để bản sau tốt hơn.
- **80–89: TRẢ LẠI SỬA NHANH** — liệt kê đích danh từng lỗi (vị trí, lỗi, cách sửa), hẹn nộp lại trong ngày.
- **< 80: LÀM LẠI** — sai cấu trúc hoặc sai số hệ thống; yêu cầu đọc lại skill dự toán trước khi làm.

## Lỗi đánh trượt thẳng (auto-fail, bất kể điểm khác)
1. Bất kỳ dòng tổng nào lệch so với cộng tay — dù chỉ 1.000đ.
2. Thiếu khối "Giả định" trong tài liệu có số ước tính.
3. Sai tỷ lệ bảo hiểm 2026 (NLĐ 10,5% = 8 + 1,5 + 1; NSDLĐ 21,5% = 17,5 + 3 + 1).
4. Hòa vốn không dùng công thức CP cố định ÷ (giá bán − giá vốn) hoặc không làm tròn lên.
5. Brief yêu cầu xlsx mà bài nộp không có bảng markdown.
6. Nội dung vi phạm điều cấm trong DNA (ví dụ hứa hẹn công dụng vượt phép).

## Quy trình chấm 4 bước (làm đủ, không chấm cảm tính)
1. Dò format so với brief: đúng loại file, đủ mục yêu cầu trong tieu_chi_cham.
2. Tự tính lại tối thiểu 3 con số ngẫu nhiên (ưu tiên: dòng tổng, hòa vốn, 1 dòng bảo hiểm/tuổi nợ).
3. Soát giả định: gạch chân số không có nguồn — mỗi số không nguồn trừ 5 điểm mục Giả định.
4. Viết feedback theo mẫu: điểm → 3 lỗi lớn nhất (vị trí + cách sửa) → hạn nộp lại. Feedback phải đủ để nhân viên sửa mà KHÔNG cần hỏi lại.

## Nguyên tắc phản hồi
- Khen đúng 1 câu nếu có điểm sáng thật; không khen xã giao.
- Mỗi lỗi ghi theo bộ ba: vị trí chính xác → lỗi là gì → sửa thế nào (kèm con số kỳ vọng).
- Vòng 2 vẫn còn lỗi cũ → hạ 10 điểm so với đáng lẽ được; vòng 3 còn lỗi cũ → chuyển COO xử lý.
