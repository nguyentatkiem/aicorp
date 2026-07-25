---
name: dashboard-html-ceo
description: Khung dựng dashboard HTML 1 trang cho CEO — 4 KPI, xu hướng 6 tháng, 3 cảnh báo có ngưỡng
agents: nv_auto
---

## Bố cục bắt buộc (1 trang, đọc trong 30 giây)

1. **Tiêu đề + dòng ngữ cảnh**: tên công ty, kỳ dữ liệu, kênh nguồn, ngày cập nhật.
2. **Hàng 4 ô KPI to** (font số ≥24px): Doanh thu tháng · Đơn hàng · CPA · Tỷ lệ chuyển đổi.
   Mỗi ô bắt buộc có delta so tháng trước: ▲/▼ + %, tô màu theo CHIỀU TỐT-XẤU
   (CPA giảm = xanh, CPA tăng = đỏ — không tô máy móc theo chiều tăng-giảm).
3. **Bảng xu hướng 6 tháng**: Tháng | Đơn | Doanh thu | CPA | CR. Số căn phải, tháng căn trái.
4. **Khối 3 cảnh báo đỏ** (border trái đỏ): mỗi cảnh báo phải có con số + ngưỡng + hành động gợi ý.

## Quy tắc kỹ thuật

- HTML fragment tự chứa: CSS nằm trong fragment, không gọi CDN/font ngoài, không JavaScript.
- Nền sáng (#f7f9fc), chữ tối (#1a2433), thẻ trắng viền nhạt — CEO in ra giấy vẫn đọc được.
- Số kiểu Việt Nam: 1.234.567đ; doanh thu lớn viết gọn "149,9 tr"; phần trăm 1 chữ số thập phân.
- Flexbox cho hàng KPI (flex-wrap) để xem được trên điện thoại; bảng width 100%.

## Ngưỡng cảnh báo chuẩn (khi kế hoạch không nói khác)

- Lệch kế hoạch tháng **>10%** → cảnh báo đỏ, ghi rõ cần bù bao nhiêu đơn/doanh thu.
- CPA chạm **100% trần** (trần = 20% AOV) → đề xuất tắt nhóm quảng cáo kém ngay.
- Đơn tháng **<90%** tháng liền trước → cảnh báo lệch nhịp, chỉ đích danh kênh nghi ngờ.
- Kênh phụ **<35%** doanh thu sau 1 quý → cảnh báo lệch kênh.

## Đối soát số liệu (bước hay bị bỏ qua nhất)

- Mọi con số trên dashboard phải khớp báo cáo phân tích cùng kỳ của NV Phân tích, sai lệch cho phép <1%.
- Đối chiếu chéo tối thiểu 3 dòng: doanh thu = đơn × AOV; CPA = chi phí QC ÷ đơn.
- Ghi chú giả định ở cuối trang: nguồn dữ liệu, công thức, AOV dùng để quy đổi.

## Checklist bàn giao

- [ ] Đủ 4 KPI + delta màu đúng chiều tốt-xấu.
- [ ] Bảng đủ 6 tháng, không thiếu cột, số căn phải.
- [ ] Đúng 3 cảnh báo, cái nào cũng có số + ngưỡng + hành động.
- [ ] Mở file trên màn hình 375px không vỡ bố cục.
