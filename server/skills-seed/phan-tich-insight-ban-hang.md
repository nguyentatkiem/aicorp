---
name: phan-tich-insight-ban-hang
description: Quy trình 5 bước biến bảng số bán hàng thành insight có dẫn chứng và khuyến nghị nghiệm thu được
agents: nv_ana
---

## Quy trình 5 bước (làm đúng thứ tự, không bỏ bước)

1. **Chuẩn hóa số** — quy mọi thứ về 3 cột gốc: đơn, doanh thu, chi phí quảng cáo theo tháng.
   Suy ra: AOV = doanh thu ÷ đơn; CPA = chi phí QC ÷ đơn; CR = đơn ÷ lượt tiếp cận.
   Ghi rõ giả định ngay dưới bảng (nguồn số, công thức, khoảng giá dùng tính AOV).
2. **Tìm điểm gãy** — chỉ gọi là "điểm gãy" khi chỉ số lệch **>5%** so với tháng liền trước
   và lệch **ngược chiều xu hướng 3 tháng**. Biến động ≤5% là nhiễu, không viết thành insight.
3. **Truy nguyên nhân** — mỗi điểm gãy phải gắn ít nhất 1 giả thuyết kiểm chứng được:
   mùa vụ ngành / đổi ngân sách kênh / hết khuyến mãi / đứt hàng. Ghi kèm số đối chứng (CPA, CR cùng tháng).
4. **Viết insight** — đúng khung 1 câu: [Hiện tượng có số] + [so sánh mốc] + [ý nghĩa kinh doanh].
   Ví dụ đạt: "CPA giảm từ 37.000đ còn 31.400đ (−15%) trong khi CR tăng — quảng cáo đang tối ưu dần."
   Ví dụ trượt: "Quảng cáo hiệu quả hơn" (không có số → viết lại).
5. **Chốt khuyến nghị** — mỗi khuyến nghị đủ 4 phần: hành động + KPI đo + ngưỡng + thời hạn.
   Mẫu: "Tăng 20% ngân sách kênh chính trong 30 ngày, giữ CPA ≤ 20% AOV; vượt trần 7 ngày liên tiếp thì cắt."

## Ngưỡng nghề (dùng khi dna không nói khác)

- CPA trần an toàn = **20% AOV**; vùng vàng 20–25%; >25% là báo động đỏ.
- Kênh phụ đóng góp **<35%** doanh thu sau 1 quý = lệch kênh, phải có khuyến nghị riêng.
- Mục tiêu nâng AOV mỗi quý: **+10–15%** bằng combo/upsell, không tăng giá lẻ đột ngột.
- Sàn giữ đơn khi vào mùa thấp điểm = **90%** tháng liền trước.

## Checklist trước khi nộp (thiếu 1 dòng = tự sửa trước khi nộp)

- [ ] Bảng ≥6 kỳ, có đủ đơn / doanh thu / CPA / CR, số định dạng kiểu Việt Nam (1.234.567đ).
- [ ] Đúng 5 insight, mỗi insight ≥1 con số dẫn chứng lấy từ chính bảng của mình.
- [ ] Điểm gãy (nếu có) đã được lý giải nguyên nhân, không để lửng.
- [ ] Đúng 3 khuyến nghị, mỗi cái đủ hành động + KPI + ngưỡng + thời hạn.
- [ ] Có dòng giả định + nguồn số liệu; đối chiếu chéo doanh thu = đơn × AOV ở 3 tháng bất kỳ.
- [ ] Không vi phạm điều cấm trong DNA (kiểm tra mục voice.banned trước khi nộp).
