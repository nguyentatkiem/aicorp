---
name: kich-ban-video-ban-hang
description: Khung kịch bản video bán hàng 40 giây — bảng 5 cột, nhịp thời gian, ngưỡng đo lường
agents: nv_ads
---

## Định dạng bắt buộc: bảng 5 cột
| Giây | Hình | Thoại | Chữ màn hình | Ghi chú quay |
- Mỗi dòng ≤1 hành động hình. Thoại mỗi câu ≤14 từ (đọc vừa 1 hơi). Chữ màn hình ≤6 từ, lặp lại ý thoại chứ không thêm ý mới.

## Nhịp chuẩn 40 giây (co giãn ±20% theo kênh)
- **0–3s — Hook:** bắt buộc có pattern-interrupt VẬT LÝ: zoom nhanh, cắt cảnh <1 giây, đổi góc máy,
  hoặc hành động bất thường. Thoại mở bằng nghịch lý về nỗi đau trong DNA. Không logo, không chào hỏi.
- **3–8s — Đồng cảm:** người thật nhìn thẳng ống kính, thừa nhận từng chịu đúng nỗi đau đó. Nhạc nhẹ, giọng chậm lại.
- **8–16s — Sản phẩm:** cận cảnh + thao tác dùng THẬT (tay cầm, ánh sáng tự nhiên). Thông điệp "làm đúng một việc".
- **16–24s — Bằng chứng:** ảnh chụp tin nhắn khách + sao đánh giá. Chỉ dùng feedback thật, che tên riêng.
- **24–32s — Giá:** nêu giá thẳng, khung so sánh "rẻ hơn chi phí chịu đựng mỗi ngày". Chữ giá to, giữ 2 nhịp.
- **32–40s — CTA:** tay bấm giỏ hàng hoặc khung inbox + từ khoá. Video sàn TMĐT LUÔN kết bằng "ghim giỏ hàng bên dưới".

## Quy tắc 3 hook
- Mỗi kịch bản nộp kèm 3 phiên bản hook: nghịch lý / đau trực diện / kết quả khách thật.
- Chạy cả 3 trong tuần test với ngân sách bằng nhau; sau 72h giữ hook có hook rate cao nhất, tắt 2 cái còn lại.

## Ngưỡng đo lường (72h đầu)
| Chỉ số | Ngưỡng đạt | Hành động nếu trượt |
|---|---|---|
| Hook rate (xem ≥3s) | ≥30% | Quay lại 3 giây đầu, đổi pattern-interrupt |
| Giữ chân 50% video | ≥12% | Cắt đoạn 8–16s ngắn lại, đưa bằng chứng lên sớm |
| CTR | ≥1,5% | Sửa CTA + chữ màn hình cuối |
| Tỷ lệ inbox/click | ≥10% | Từ khoá inbox chưa đủ dễ, rút còn 1 từ |

## Cấm kỵ
- Không nhạc bản quyền; không đọc nguyên văn bài đăng thành thoại; không hứa vượt voice.banned của DNA.
- Không dùng ảnh khách chưa xin phép — thay bằng dựng lại cảnh + ghi chú "tình huống minh hoạ".
