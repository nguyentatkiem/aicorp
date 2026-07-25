---
name: rubric-review-dulieu
description: Rubric chấm sản phẩm phòng Dữ liệu — 5 tiêu chí có trọng số, ngưỡng đạt 90/100
agents: tp_data
---

## Khung điểm 100 (5 tiêu chí × trọng số)

| Tiêu chí | Trọng số | Cách chấm |
|---|---|---|
| 1. Số liệu đúng & khớp nguồn | 35đ | Chọn ngẫu nhiên 3 con số, tính lại bằng công thức đã khai báo. Khớp cả 3 = 35đ; lệch <1% = 28đ; 1 số sai >1% = 15đ; 2 số sai trở lên = 0đ và trả bài ngay |
| 2. Insight/kết luận có dẫn chứng | 25đ | Đếm kết luận có số đi kèm ÷ tổng kết luận: 100% = 25đ; ≥80% = 20đ; ≥60% = 12đ; dưới 60% = 5đ |
| 3. Khuyến nghị nghiệm thu được | 15đ | Mỗi khuyến nghị đủ 4 phần (hành động + KPI + ngưỡng + thời hạn) được 5đ, tối đa 15đ |
| 4. Minh bạch giả định & nguồn | 15đ | Có dòng giả định + công thức + nguồn ngay dưới mỗi bảng = 15đ; có nhưng đặt xa bảng = 10đ; thiếu = 0đ |
| 5. Trình bày chuẩn phòng | 10đ | Số kiểu Việt Nam, bảng thẳng cột, dashboard nền sáng đọc được trên điện thoại: đủ = 10đ, mỗi lỗi trừ 3đ |

## Ngưỡng quyết định

- **≥90đ**: ĐẠT — nhận xét ngắn, tối đa 2 góp ý nhỏ để lần sau tốt hơn.
- **80–89đ**: TRẢ LẠI SỬA — liệt kê từng lỗi theo bộ ba {vị trí, lỗi, cách sửa}, đủ chi tiết để nhân viên sửa không cần hỏi lại.
- **<80đ**: LÀM LẠI — sai từ số liệu gốc hoặc bịa số; nêu rõ nguồn phải dùng và công thức phải theo.
- Tiêu chí 1 dưới 15đ → TRƯỢT thẳng bất kể tổng điểm (số sai thì mọi thứ phía sau vô nghĩa).

## Kiểm tra riêng theo loại sản phẩm

- **Báo cáo phân tích**: điểm gãy >5% so tháng trước phải có lý giải; biến động ≤5% mà viết thành insight → trừ tiêu chí 2.
- **Dashboard**: đủ 4 KPI có delta so tháng trước; 3 cảnh báo đều có ngưỡng định lượng (lệch kế hoạch >10%, CPA > trần 20% AOV); số phải khớp báo cáo phân tích cùng kỳ, lệch >1% → tiêu chí 1 tối đa 15đ.
- **Workflow n8n**: có Trigger rõ lịch, có nhánh xử lý lỗi (Error Workflow/retry), mọi hành động gửi ra ngoài đi qua Hộp phê duyệt; thiếu 1 trong 3 → trừ 10đ tiêu chí 3.

## Nguyên tắc viết nhận xét

1. Chấm xong mới viết, không vừa đọc vừa phán.
2. Trích đúng vị trí lỗi (tên bảng, dòng, mục) — không viết "nhìn chung còn sơ sài".
3. Mỗi lỗi kèm cách sửa cụ thể có con số kỳ vọng.
4. Không khen xã giao khi trả bài; không chê ngoài phạm vi brief.
