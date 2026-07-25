---
name: cfo-dashboard-ceo
description: Dựng dashboard tài chính 1 trang cho CEO từ số liệu kế toán — 4 KPI, ngưỡng đèn giao thông, biểu đồ 6 tháng, checklist trước khi gửi
agents: nv_auto, nv_cash, tp_tc
---

## 1. Bốn ô KPI bắt buộc (có công thức, không được đổi thứ tự)
1. **Doanh thu tháng** = tổng hóa đơn đã xuất trong kỳ; hiển thị kèm % so kế hoạch tháng.
2. **Lãi gộp** = doanh thu − giá vốn hàng bán; hiển thị cả số tiền và biên % (biên = lãi gộp ÷ doanh thu).
3. **Chi phí vận hành** = tổng chi cố định + chi biến đổi ngoài giá vốn; kèm tỷ lệ trên doanh thu.
4. **Tồn quỹ & runway** = tiền mặt + tiền gửi khả dụng; runway (tháng) = tồn quỹ ÷ mức chi ròng trung bình 3 tháng gần nhất.

## 2. Ngưỡng cảnh báo đèn giao thông (áp cho từng KPI)
- Lệch kế hoạch < 5% → XANH; 5–10% → VÀNG; > 10% → ĐỎ (bắt buộc 1 dòng giải thích nguyên nhân).
- Runway < 3 tháng → ĐỎ; 3–6 tháng → VÀNG; > 6 tháng → XANH.
- Biên lãi gộp giảm > 3 điểm % so tháng trước → VÀNG dù vẫn đạt kế hoạch.
- Công nợ quá hạn > 20% tổng phải thu → ĐỎ, hiện số tiền quá hạn ngay trên dashboard.
- Tối đa 3 cảnh báo hiển thị cùng lúc — chọn 3 cảnh báo tác động tiền lớn nhất, phần còn lại đưa vào phụ lục.

## 3. Biểu đồ xu hướng (chỉ MỘT biểu đồ)
- Đường kép 6 tháng: doanh thu và lãi gộp trên cùng trục; kế hoạch vẽ nét đứt.
- Không dùng biểu đồ tròn cho xu hướng; không quá 2 màu + 1 màu cảnh báo.
- Nhãn số ghi tại điểm đầu, điểm cuối và điểm bất thường (lệch > 10%), không ghi mọi điểm.

## 4. Quy tắc trình bày cho CEO
- Đúng 1 trang màn hình; số to ≥ 24px, đơn vị viết gọn (triệu = tr, tỷ).
- Mọi số tiền làm tròn nghìn đồng; % lấy 1 chữ số thập phân.
- Mỗi cảnh báo ĐỎ phải kèm 1 đề xuất hành động cụ thể (cắt gì, thu gì, bao nhiêu đ).
- Ghi rõ "Số liệu đến ngày …/…" ở góc dashboard — thiếu dòng này coi như chưa đạt.

## 5. Checklist trước khi gửi (trượt 1 mục = làm lại)
- [ ] 4 KPI cộng ngược về sổ gốc khớp 100% (tự dò lại 3 số bất kỳ).
- [ ] Doanh thu − giá vốn = lãi gộp hiển thị; không lệch dù 1.000đ.
- [ ] Runway tính bằng chi ròng TB 3 tháng, không lấy 1 tháng cá biệt.
- [ ] Cảnh báo đúng ngưỡng mục 2, có đề xuất hành động.
- [ ] File mở được trên điện thoại, không cần kéo ngang.
