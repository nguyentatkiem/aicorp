'use strict';
/* Bảng gợi ý 3 nhiệm vụ đầu tiên theo 12 ngành (đặc tả 6.2 bước B7) */
const SUGGESTIONS = {
  banle: [
    'Viết 5 bài Facebook giới thiệu sản phẩm bán chạy nhất kèm chương trình tuần này',
    'Dự toán chi phí nhập hàng tháng tới và tính điểm hòa vốn từng nhóm hàng',
    'Soạn kịch bản tư vấn chốt đơn và xử lý 5 từ chối hay gặp tại quầy'
  ],
  fnb: [
    'Lên kế hoạch content 2 tuần cho món/sản phẩm chủ lực, kèm 3 kịch bản video ngắn',
    'Dự toán chi phí ra mắt món mới + định giá bán theo food cost 30%',
    'Soạn bộ FAQ và kịch bản trả lời khiếu nại giao hàng chậm cho fanpage'
  ],
  thoitrang: [
    'Viết 5 bài Facebook lookbook bộ sưu tập mới, giọng đúng thương hiệu',
    'Quét giá và khuyến mãi 5 shop đối thủ cùng phân khúc trên Shopee',
    'Soạn báo giá sỉ cho đại lý kèm chính sách chiết khấu theo bậc số lượng'
  ],
  mypham: [
    'Viết chuỗi 5 bài chăm da theo hành trình khách hàng, không quảng cáo lố',
    'Soạn bộ FAQ 20 câu về thành phần và cách dùng, tuân thủ điều cấm quảng cáo',
    'Dự toán ngân sách ads test 5 nhóm quảng cáo cho sản phẩm chủ lực'
  ],
  giaoduc: [
    'Viết 5 bài Facebook chia sẻ kiến thức thu hút phụ huynh/học viên tiềm năng',
    'Soạn kịch bản tư vấn khóa học và xử lý từ chối "để suy nghĩ thêm"',
    'Xây giáo trình hội nhập 5 ngày cho nhân viên tư vấn mới'
  ],
  suckhoe: [
    'Viết 5 bài Facebook giáo dục sức khỏe đúng quy định, không hứa chữa bệnh',
    'Soạn bộ FAQ về thành phần, cách dùng và chống chỉ định của sản phẩm',
    'Quét giá 5 đối thủ cùng phân khúc và đề xuất chiến lược giá'
  ],
  noithat: [
    'Viết 5 bài Facebook kể chuyện công trình thật kèm ảnh trước–sau',
    'Soạn báo giá mẫu theo hạng mục kèm điều khoản thanh toán theo tiến độ',
    'Rà soát hợp đồng thi công mẫu và liệt kê điều khoản rủi ro cần sửa'
  ],
  bds: [
    'Viết 5 bài giới thiệu dự án/sản phẩm theo phong cách tư vấn tin cậy',
    'Soạn kịch bản telesale hẹn khách xem nhà và xử lý 5 từ chối phổ biến',
    'Xây khung chấm điểm lead 4 tiêu chí để lọc khách nét mỗi ngày'
  ],
  dichvu: [
    'Viết 5 bài Facebook kể chuyện khách hàng thật để xây uy tín dịch vụ',
    'Soạn SOP quy trình tiếp nhận – thực hiện – nghiệm thu dịch vụ',
    'Dự toán chi phí vận hành tháng và tính giá dịch vụ có lãi 25%'
  ],
  sanxuat: [
    'Soạn báo giá B2B kèm chính sách chiết khấu số lượng và công nợ 30 ngày',
    'Viết SOP kiểm soát chất lượng 1 công đoạn quan trọng nhất',
    'Dự toán giá thành sản phẩm và điểm hòa vốn theo 3 kịch bản sản lượng'
  ],
  tmdt: [
    'Phân tích số liệu bán hàng tháng qua và rút 5 insight hành động',
    'Viết 3 kịch bản video TikTok Shop cho sản phẩm bán chạy nhất',
    'Làm dashboard doanh thu – chi phí – lợi nhuận cho CEO xem mỗi sáng'
  ],
  khac: [
    'Viết 5 bài Facebook giới thiệu sản phẩm/dịch vụ chủ lực của công ty',
    'Dự toán chi phí hoạt động tháng tới theo 3 kịch bản',
    'Soạn bộ FAQ khách hàng hay hỏi nhất kèm kịch bản trả lời'
  ]
};

function forIndustry(industry) {
  return SUGGESTIONS[industry] || SUGGESTIONS.khac;
}

module.exports = { SUGGESTIONS, forIndustry };
