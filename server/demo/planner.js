'use strict';
/* ------------------------------------------------------------------
   planner.js — Bộ não lập kế hoạch của Demo Engine (AI COO offline)
   Đọc lệnh tiếng Việt bất kỳ của CEO → nhận diện ý định → chia đúng
   đầu việc cho đúng phòng/đúng người theo schema WBS của orchestrator.

   module.exports = {
     plan(command, ctx)          → { tasks: [...] }
     briefQuestions(command,ctx) → string[]   (0-2 câu, [] nếu lệnh rõ)
   }
   ctx = { dna, enabledDepts, roster, answers }
   ------------------------------------------------------------------ */

/* ================= 1. Chuẩn hóa tiếng Việt (bỏ dấu, NFD) ========== */

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* Khớp từ khóa theo biên từ — 'sale' không ăn vào 'salon' */
function hasKw(norm, kw) {
  return new RegExp('(^|[^a-z0-9&])' + escRe(kw) + '($|[^a-z0-9&])').test(norm);
}
function hasAny(norm, kws) { return kws.some(k => hasKw(norm, k)); }

/* ================= 2. Trích thông tin từ DNA ====================== */

const D = {
  prod: dna => (((dna || {}).products || [])[0] || {}).name || 'sản phẩm chủ lực',
  price: dna => (((dna || {}).products || [])[0] || {}).price_range || '',
  company: dna => ((dna || {}).company || {}).name || 'công ty',
  industry: dna => ((dna || {}).company || {}).industry || '',
  region: dna => ((dna || {}).company || {}).region || '',
  cust: dna => ((dna || {}).customers || {}).profile || 'khách hàng mục tiêu',
  channels: dna => ((dna || {}).customers || {}).channels || [],
  goal: dna => (dna || {}).goal_3m || '',
  addr: dna => ((dna || {}).voice || {}).address || 'thân thiện, chuyên nghiệp',
  banned: dna => ((dna || {}).voice || {}).banned || []
};

function short(s, n) { s = String(s || ''); return s.length > (n || 44) ? s.slice(0, (n || 44) - 1) + '…' : s; }
function prodPrice(dna) { const p = D.price(dna); return D.prod(dna) + (p ? ` (${p})` : ''); }
function bannedRule(dna, fallback) {
  const b = D.banned(dna);
  return b.length ? `Tôn trọng điều cấm thương hiệu: ${b[0]}` : fallback;
}

/* ================= 3. Danh mục intent chuẩn ======================= */
/* Mỗi intent: agent chuẩn + từ khóa (đã bỏ dấu) + builder trả task. */

const INTENTS = {
  content: {
    agent: 'nv_content',
    kws: ['content', 'bai viet', 'facebook', 'caption', 'email', 'fanpage', 'bai post'],
    build(dna, norm) {
      const ch = D.channels(dna);
      const emailOnly = hasKw(norm || '', 'email') && !hasAny(norm || '', ['facebook', 'fanpage', 'bai viet', 'caption']);
      if (emailOnly) {
        return {
          title: `Chuỗi 3 email gửi khách về ${short(D.prod(dna), 36)}`,
          brief: {
            muc_tieu: `Viết chuỗi 3 email gửi khách hàng "${D.cust(dna)}" về ${prodPrice(dna)}: email 1 khơi gợi nhu cầu, email 2 minh chứng/ưu đãi, email 3 chốt hạn — tiêu đề mở mail cao, CTA rõ.`,
            dau_vao: ['DNA thương hiệu', 'Danh sách khách & lịch sử mua', 'Ưu đãi hiện hành'],
            format_dau_ra: 'docx',
            tieu_chi_cham: [
              `Đúng giọng thương hiệu, xưng hô "${D.addr(dna)}"`,
              'Tiêu đề ≤10 từ, không giật tít sai sự thật',
              'Mỗi email 1 CTA duy nhất',
              bannedRule(dna, 'Chính tả chuẩn, không spam từ khóa')
            ]
          }
        };
      }
      return {
        title: `Bộ 5 bài Facebook bán ${short(D.prod(dna), 40)}`,
        brief: {
          muc_tieu: `Viết 5 bài Facebook/caption bán ${prodPrice(dna)} nhắm đúng chân dung "${D.cust(dna)}"; mỗi bài một góc tiếp cận (nỗi đau, câu chuyện khách, hỏi đáp chuyên gia, quà tặng, ưu đãi), hook mạnh và CTA rõ.`,
          dau_vao: ['DNA thương hiệu', 'Catalogue & bảng giá sản phẩm', 'Chân dung khách hàng'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            `Đúng giọng thương hiệu, xưng hô "${D.addr(dna)}"`,
            'Hook ≤12 từ, 5 bài không trùng góc tiếp cận',
            `CTA rõ, dẫn về kênh ${ch[0] || 'bán chính'}`,
            bannedRule(dna, 'Chính tả chuẩn, không sáo rỗng')
          ]
        }
      };
    }
  },
  video: {
    agent: 'nv_ads',
    kws: ['video', 'tiktok', 'quay', 'clip'],
    build(dna) {
      return {
        title: `Kịch bản video bán ${short(D.prod(dna), 40)}`,
        brief: {
          muc_tieu: `Kịch bản video 45–60 giây bán ${prodPrice(dna)} cho tệp "${D.cust(dna)}", theo bảng 5 cột: Giây | Hình | Thoại | Chữ trên màn hình | Ghi chú quay.`,
          dau_vao: ['DNA thương hiệu', 'Điểm bán hàng độc nhất của sản phẩm'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            '3 giây đầu có pattern-interrupt',
            'Đủ bảng 5 cột, thoại tự nhiên đúng xưng hô',
            'Kết video có kêu gọi hành động (ghim giỏ/inbox)',
            bannedRule(dna, 'Không cường điệu công dụng')
          ]
        }
      };
    }
  },
  ads: {
    agent: 'nv_ads',
    kws: ['quang cao', 'ads', 'ngan sach'],
    build(dna) {
      return {
        title: `Cấu trúc chiến dịch ads + ngân sách ${short(D.prod(dna), 30)}`,
        brief: {
          muc_tieu: `Lập cấu trúc chiến dịch quảng cáo cho ${prodPrice(dna)}: chia nhóm theo tệp "${D.cust(dna)}", ngân sách 2 giai đoạn test/scale, CPL trần tính từ unit economics.`,
          dau_vao: ['Giá bán & giá vốn ước tính', 'Chân dung khách hàng', 'Kênh: ' + (D.channels(dna).join(', ') || 'đa kênh')],
          format_dau_ra: 'xlsx',
          tieu_chi_cham: [
            'Có CPL trần và công thức tính kèm giả định',
            'Ngân sách chia giai đoạn test → scale hợp lý',
            'Có quy tắc kill-switch khi CPL vượt trần 150%',
            'Nhóm quảng cáo bám đúng chân dung khách'
          ]
        }
      };
    }
  },
  ads_plan: { /* bản pptx dùng trong chiến dịch ra mắt đa phòng */
    agent: 'nv_ads',
    kws: [],
    build(dna) {
      return {
        title: `Kế hoạch chiến dịch ra mắt ${short(D.prod(dna), 34)}`,
        brief: {
          muc_tieu: `Kế hoạch thuyết trình chiến dịch ra mắt ${prodPrice(dna)} tại ${D.region(dna) || 'thị trường mục tiêu'}: thông điệp, timeline 3 giai đoạn (teaser → ra mắt → duy trì), KPI và ngân sách từng giai đoạn.`,
          dau_vao: ['DNA thương hiệu', 'Mục tiêu 3 tháng: ' + (D.goal(dna) || 'theo lệnh CEO'), 'Kênh: ' + (D.channels(dna).join(', ') || 'đa kênh')],
          format_dau_ra: 'pptx',
          tieu_chi_cham: [
            '4–7 slide, mỗi slide một thông điệp chính',
            'Timeline và KPI đo được theo giai đoạn',
            'Ngân sách khớp với dự toán tài chính',
            'Thông điệp đúng giọng thương hiệu'
          ]
        }
      };
    }
  },
  market: {
    agent: 'nv_market',
    kws: ['doi thu', 'thi truong', 'xu huong'],
    build(dna) {
      return {
        title: 'So sánh 5 đối thủ cùng phân khúc',
        brief: {
          muc_tieu: `Bảng so sánh 5 đối thủ trực tiếp của ${D.prod(dna)} (ngành ${D.industry(dna) || 'liên quan'}, khu vực ${D.region(dna) || 'toàn quốc'}): giá bán, khuyến mãi, đánh giá, điểm mạnh/yếu và khoảng trống thị trường.`,
          dau_vao: ['Từ khóa sản phẩm & phân khúc giá ' + (D.price(dna) || 'hiện tại'), 'Kênh khảo sát: ' + (D.channels(dna).join(', ') || 'sàn TMĐT, mạng xã hội')],
          format_dau_ra: 'xlsx',
          tieu_chi_cham: [
            'Đủ 5 đối thủ, có nguồn và ngày thu thập',
            `So sánh trực tiếp với dải giá ${D.price(dna) || 'của công ty'}`,
            'Có nhận định cơ hội/rủi ro cho từng đối thủ',
            'Kết luận 3 khuyến nghị hành động'
          ]
        }
      };
    }
  },
  cash: {
    agent: 'nv_cash',
    kws: ['du toan', 'chi phi', 'gia von', 'loi nhuan', 'p&l', 'pnl', 'hoa von', 'dong tien'],
    build(dna) {
      return {
        title: `Dự toán chi phí & điểm hòa vốn ${short(D.prod(dna), 28)}`,
        brief: {
          muc_tieu: `Dự toán 3 kịch bản chi phí (tiết kiệm/chuẩn/đẩy mạnh) cho ${prodPrice(dna)}, tính giá vốn đơn vị, biên gộp và điểm hòa vốn theo số đơn/tháng.`,
          dau_vao: ['Bảng giá bán ' + (D.price(dna) || 'hiện hành'), 'Chi phí sản xuất/nhập hàng ước tính', 'Mục tiêu: ' + (D.goal(dna) || 'theo quý')],
          format_dau_ra: 'xlsx',
          tieu_chi_cham: [
            'Công thức và giả định ghi rõ từng dòng',
            'Có điểm hòa vốn cho cả 3 kịch bản',
            'Số liệu khớp chéo giữa các bảng',
            'Kèm khuyến nghị chọn kịch bản'
          ]
        }
      };
    }
  },
  debt: {
    agent: 'nv_debt',
    kws: ['cong no', 'doi soat', 'luong', 'nhac no'],
    build(dna) {
      return {
        title: 'Đối soát công nợ & lịch nhắc nợ',
        brief: {
          muc_tieu: `Lập bảng đối soát công nợ khách hàng/đại lý của ${D.company(dna)}, phân tuổi nợ (0–30/31–60/>60 ngày) và lịch nhắc nợ lịch sự theo từng mốc.`,
          dau_vao: ['Sổ công nợ hiện tại', 'Chính sách thanh toán của công ty'],
          format_dau_ra: 'xlsx',
          tieu_chi_cham: [
            'Phân tuổi nợ đúng chuẩn kế toán',
            'Tổng đối soát khớp số dư sổ',
            'Mẫu tin nhắc nợ lịch sự, giữ quan hệ khách',
            'Cảnh báo riêng các khoản quá hạn >60 ngày'
          ]
        }
      };
    }
  },
  quote: {
    agent: 'nv_quote',
    kws: ['bao gia', 'dai ly', 'b2b', 'hop tac'],
    build(dna) {
      return {
        title: `Báo giá đại lý ${short(D.prod(dna), 34)} theo bậc`,
        brief: {
          muc_tieu: `Bảng báo giá B2B cho ${prodPrice(dna)}: chiết khấu 3 bậc theo số lượng, điều khoản công nợ, chính sách đổi trả và hỗ trợ đại lý — bảo toàn biên gộp theo dự toán.`,
          dau_vao: ['Giá bán lẻ ' + (D.price(dna) || 'niêm yết'), 'Giá vốn từ dự toán tài chính', 'Chính sách bán sỉ hiện hành'],
          format_dau_ra: 'xlsx',
          tieu_chi_cham: [
            'Chiết khấu theo bậc không phá biên gộp tối thiểu',
            'Điều khoản công nợ và cam kết rõ ràng',
            'Có cột lợi nhuận đại lý để dễ chào hàng',
            'Số liệu khớp với dự toán giá vốn'
          ]
        }
      };
    }
  },
  sales: {
    agent: 'nv_sales',
    kws: ['tu van', 'chot don', 'sale', 'sales'],
    build(dna) {
      return {
        title: `Kịch bản tư vấn & chốt đơn ${short(D.prod(dna), 30)}`,
        brief: {
          muc_tieu: `Kịch bản tư vấn – chốt đơn ${prodPrice(dna)} cho tệp "${D.cust(dna)}": mở đầu tạo thiện cảm, khai thác nhu cầu, xử lý 5 từ chối phổ biến, chốt đơn và upsell nhẹ.`,
          dau_vao: ['Chân dung khách hàng', 'Điểm bán hàng & bảng giá', 'Câu hỏi khách hay gặp'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            `Đúng xưng hô "${D.addr(dna)}", giọng tự nhiên không như đọc kịch bản`,
            'Đủ 5 tình huống từ chối kèm câu trả lời',
            'Mỗi bước có mục tiêu chuyển tiếp rõ',
            bannedRule(dna, 'Không hứa vượt quá cam kết sản phẩm')
          ]
        }
      };
    }
  },
  lead: {
    agent: 'nv_lead',
    kws: ['lead', 'khach tiem nang'],
    build(dna) {
      return {
        title: 'Chấm điểm & phân loại lead',
        brief: {
          muc_tieu: `Khung chấm lead thang 100 (4 tiêu chí × 25đ: nhu cầu, ngân sách, quyền quyết định, thời điểm) áp cho khách quan tâm ${D.prod(dna)}, kèm kịch bản nuôi dưỡng theo 3 nhóm nóng/ấm/lạnh.`,
          dau_vao: ['Danh sách lead từ ' + (D.channels(dna).join(', ') || 'các kênh'), 'Chân dung khách hàng'],
          format_dau_ra: 'xlsx',
          tieu_chi_cham: [
            'Bảng chấm đủ 4 tiêu chí × 25 điểm',
            'Ngưỡng phân loại nóng/ấm/lạnh rõ ràng',
            'Mỗi nhóm có tin nhắn nuôi dưỡng mẫu',
            'Quy định thời gian phản hồi từng nhóm'
          ]
        }
      };
    }
  },
  hire: {
    agent: 'nv_hire',
    kws: ['tuyen', 'tuyen dung', 'jd', 'phong van'],
    build(dna) {
      return {
        title: 'JD + bộ câu hỏi phỏng vấn vị trí cần tuyển',
        brief: {
          muc_tieu: `Soạn JD chuẩn cho vị trí CEO yêu cầu tại ${D.company(dna)} (quy mô ${((dna || {}).company || {}).size || 'SME'}): mô tả công việc, yêu cầu, quyền lợi, dải lương thị trường ${D.region(dna) || 'khu vực'}; kèm tiêu chí lọc CV và 10 câu phỏng vấn.`,
          dau_vao: ['Yêu cầu vị trí trong lệnh CEO', 'Mặt bằng lương thị trường'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            'JD rõ ràng, không yêu cầu mâu thuẫn',
            'Tiêu chí lọc CV công bằng, đo được',
            'Câu hỏi phỏng vấn có thang chấm điểm',
            'Dải lương có căn cứ thị trường'
          ]
        }
      };
    }
  },
  train: {
    agent: 'nv_train',
    kws: ['dao tao', 'giao trinh', 'hoi nhap', 'onboarding'],
    build(dna) {
      return {
        title: 'Giáo trình hội nhập nhân viên mới',
        brief: {
          muc_tieu: `Giáo trình hội nhập 5 ngày cho nhân viên mới của ${D.company(dna)}: hiểu sản phẩm ${D.prod(dna)}, chân dung khách "${short(D.cust(dna), 40)}", quy trình làm việc và chuẩn giao tiếp thương hiệu.`,
          dau_vao: ['DNA thương hiệu', 'Catalogue sản phẩm', 'Quy trình nội bộ hiện có'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            'Lộ trình 5 ngày, mỗi ngày có mục tiêu đo được',
            'Có bài kiểm tra cuối khóa',
            'Ngôn ngữ dễ hiểu với người mới',
            'Bám đúng thực tế sản phẩm công ty'
          ]
        }
      };
    }
  },
  script: {
    agent: 'nv_script',
    kws: ['khieu nai', 'phan hoi', 'cham soc', 'cskh'],
    build(dna) {
      return {
        title: 'Kịch bản xử lý khiếu nại & giữ khách',
        brief: {
          muc_tieu: `Kịch bản trả lời khiếu nại cho ${D.prod(dna)}: 5 tình huống hay gặp (chất lượng, giao hàng, đổi trả, giá, thái độ), quy trình xin lỗi – xác minh – đền bù – giữ khách, kèm mẫu tin nhắn từng bước.`,
          dau_vao: ['Chính sách đổi trả của công ty', 'Các khiếu nại thực tế gần đây (nếu có)'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            'Giọng đồng cảm, không đổ lỗi cho khách',
            'Đủ 5 tình huống, mỗi tình huống có mẫu trả lời',
            'Mức đền bù trong thẩm quyền, không hứa quá lời',
            bannedRule(dna, 'Đúng quy trình đổi trả hiện hành')
          ]
        }
      };
    }
  },
  faq: {
    agent: 'nv_faq',
    kws: ['faq', 'hoi dap'],
    build(dna) {
      return {
        title: `Bộ 20 câu FAQ về ${short(D.prod(dna), 36)}`,
        brief: {
          muc_tieu: `Xây bộ 20 câu hỏi – đáp cho khách về ${prodPrice(dna)}: thành phần/chất liệu, cách dùng, đối tượng phù hợp, giao hàng, đổi trả, thanh toán — trả lời ngắn gọn đúng giọng "${D.addr(dna)}".`,
          dau_vao: ['Catalogue sản phẩm', 'Nội dung marketing đã duyệt', 'Chính sách bán hàng'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            'Đủ 20 câu, nhóm theo chủ đề',
            'Câu trả lời ≤4 câu, dễ copy gửi khách',
            bannedRule(dna, 'Không cam kết vượt chính sách'),
            'Nhất quán với nội dung marketing'
          ]
        }
      };
    }
  },
  sop: {
    agent: 'nv_sop',
    kws: ['sop', 'quy trinh', 'bieu mau', 'cong van'],
    build(dna) {
      return {
        title: 'SOP quy trình vận hành + biểu mẫu',
        brief: {
          muc_tieu: `Soạn SOP cho quy trình CEO yêu cầu tại ${D.company(dna)}: sơ đồ các bước, người chịu trách nhiệm từng bước (RACI rút gọn), thời gian chuẩn, biểu mẫu đi kèm và checklist kiểm tra.`,
          dau_vao: ['Cách làm hiện tại (mô tả trong lệnh)', 'Cơ cấu nhân sự công ty'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            'Đủ bước, không bước nào thiếu người chịu trách nhiệm',
            'Nhân viên mới đọc là làm được',
            'Có biểu mẫu/checklist đính kèm',
            'Thời gian chuẩn cho từng bước'
          ]
        }
      };
    }
  },
  legal: {
    agent: 'nv_legal',
    kws: ['hop dong', 'phap ly', 'dieu khoan'],
    build(dna) {
      return {
        title: 'Rà soát hợp đồng & điều khoản rủi ro',
        brief: {
          muc_tieu: `Rà soát hợp đồng liên quan ${D.prod(dna)} ở mức cơ bản: liệt kê điều khoản rủi ro (phạt, đơn phương chấm dứt, bảo mật, công nợ), đề xuất hướng sửa và mức độ ưu tiên.`,
          dau_vao: ['Bản hợp đồng cần rà', 'Chính sách công ty liên quan'],
          format_dau_ra: 'docx',
          tieu_chi_cham: [
            'Chỉ rõ vị trí điều khoản rủi ro trong văn bản',
            'Mỗi rủi ro có hướng sửa cụ thể',
            'Phân mức ưu tiên cao/trung/thấp',
            'Kèm disclaimer "cần luật sư xác nhận trước khi ký"'
          ]
        }
      };
    }
  },
  ana: {
    agent: 'nv_ana',
    kws: ['phan tich', 'insight', 'so lieu', 'excel', 'csv'],
    build(dna) {
      return {
        title: 'Phân tích số liệu & rút insight kinh doanh',
        brief: {
          muc_tieu: `Phân tích dữ liệu kinh doanh của ${D.company(dna)} quanh ${D.prod(dna)}: doanh số theo kênh (${D.channels(dna).join(', ') || 'các kênh'}), cơ cấu khách, sản phẩm bán chạy — rút 3 insight kèm con số dẫn chứng và khuyến nghị.`,
          dau_vao: ['File Excel/CSV bán hàng', 'Mục tiêu: ' + (D.goal(dna) || 'tăng trưởng quý')],
          format_dau_ra: 'xlsx',
          tieu_chi_cham: [
            'Số liệu tổng khớp dữ liệu nguồn',
            'Mỗi insight có con số dẫn chứng cụ thể',
            'Khuyến nghị hành động được ngay',
            'Ghi rõ giả định khi thiếu dữ liệu'
          ]
        }
      };
    }
  },
  auto: {
    agent: 'nv_auto',
    kws: ['dashboard', 'tu dong', 'n8n', 'bao cao truc quan'],
    build(dna) {
      return {
        title: 'Dashboard điều hành 1 trang cho CEO',
        brief: {
          muc_tieu: `Dựng dashboard HTML 1 trang cho CEO ${D.company(dna)}: 4 ô KPI to (doanh thu, lợi nhuận gộp, chi phí, tồn quỹ), biểu đồ xu hướng 6 tháng và cảnh báo đỏ khi lệch kế hoạch >10% — bám mục tiêu "${short(D.goal(dna), 50) || 'quý này'}".`,
          dau_vao: ['Số liệu tài chính/bán hàng gần nhất', 'Kế hoạch quý để so lệch'],
          format_dau_ra: 'html',
          tieu_chi_cham: [
            'Đủ 4 ô KPI số to, đọc trong 10 giây',
            'Biểu đồ xu hướng trung thực, không bóp trục',
            'Cảnh báo đỏ đúng ngưỡng lệch >10%',
            'Xem tốt trên cả điện thoại'
          ]
        }
      };
    }
  }
};

/* Từ khóa kích hoạt chiến dịch đa phòng */
const LAUNCH_KWS = ['ra mat', 'launch', 'khai truong', 'chien dich'];
/* Các intent trong gói ra mắt (lọc theo phòng đang bật khi lập kế hoạch) */
const LAUNCH_SET = ['content', 'ads_plan', 'market', 'cash', 'quote', 'faq'];

/* Thứ tự chuẩn để task đứng trước dependency của task sau */
const ORDER = ['content', 'video', 'ads_plan', 'ads', 'market', 'cash', 'debt', 'ana',
  'quote', 'sales', 'lead', 'hire', 'train', 'script', 'faq', 'sop', 'legal', 'auto'];

/* Pool bổ sung/fallback — ưu tiên các việc phục vụ tăng trưởng theo goal_3m */
const FALLBACK_POOL = ['content', 'market', 'cash', 'quote', 'faq', 'ana', 'sales', 'sop', 'train', 'ads', 'auto', 'script', 'hire', 'debt', 'lead', 'video', 'legal'];

/* Việc bổ trợ tự nhiên theo intent chính — dùng khi kế hoạch < 3 task */
const RELATED = {
  content: ['market', 'faq', 'video'],
  video: ['content', 'ads', 'market'],
  ads: ['content', 'market', 'cash'],
  ads_plan: ['content', 'market', 'cash'],
  market: ['content', 'cash', 'ads'],
  cash: ['ana', 'market', 'quote'],
  debt: ['cash', 'ana', 'sop'],
  quote: ['cash', 'market', 'sales'],
  sales: ['lead', 'faq', 'content'],
  lead: ['sales', 'content', 'ads'],
  hire: ['train', 'sop', 'content'],
  train: ['hire', 'sop', 'faq'],
  script: ['faq', 'sop', 'train'],
  faq: ['content', 'script', 'sop'],
  sop: ['train', 'legal', 'faq'],
  legal: ['sop', 'quote', 'cash'],
  ana: ['auto', 'cash', 'market'],
  auto: ['ana', 'cash', 'content']
};

/* Agent chuẩn theo seed.js — id ngoài danh sách này là agent tùy biến */
const KNOWN_IDS = new Set(['coo',
  'tp_mkt', 'nv_content', 'nv_ads', 'nv_market',
  'tp_kd', 'nv_sales', 'nv_quote', 'nv_lead',
  'tp_tc', 'nv_cash', 'nv_debt',
  'tp_ns', 'nv_hire', 'nv_train',
  'tp_cs', 'nv_script', 'nv_faq',
  'tp_vh', 'nv_sop', 'nv_legal',
  'tp_data', 'nv_ana', 'nv_auto']);

const STOP_TOKENS = new Set(['nhan', 'vien', 'truong', 'phong', 'chuyen', 'cong', 'viec',
  'lam', 'cho', 'va', 'cua', 'cac', 'quan', 'ban', 'toi', 'nay', 'moi', 'theo', 'trong']);

/* ================= 4. Nhận diện intent từ lệnh ==================== */

function matchIntentKeys(norm) {
  const keys = new Set();
  Object.keys(INTENTS).forEach(k => {
    if (INTENTS[k].kws.length && hasAny(norm, INTENTS[k].kws)) keys.add(k);
  });
  const launch = hasAny(norm, LAUNCH_KWS);
  if (launch) {
    LAUNCH_SET.forEach(k => keys.add(k));
    keys.delete('ads'); // kế hoạch chiến dịch (pptx) đã bao ngân sách ads
  }
  return { keys, launch };
}

/* Hành động thật — CHỈ khi lệnh kết thúc bằng đăng/gửi */
function detectRealActions(norm) {
  // 'post' đứng một mình quá dễ dương tính giả → chỉ bắt cụm rõ nghĩa "đăng…"
  const fb = hasAny(norm, ['dang bai', 'dang len', 'len fanpage', 'dang fanpage', 'dang facebook', 'dang ngay', 'dang luon', 'dang post', 'post bai', 'post len']);
  const gm = hasAny(norm, ['gui mail', 'gui email', 'email cho khach', 'mail cho khach', 'gui thu cho khach']);
  const fx = hasAny(norm, ['xuat ra tep', 'xuat ra file', 'luu ra tep', 'luu ra file', 'ghi ra tep', 'ghi ra file', 'xuat file', 'xuat tep', 'luu file', 'luu thanh tep', 'xuat bao cao', 'ket xuat', 'export ra']);
  return { fb, gm, fx };
}

/* ================= 5. plan(command, ctx) ========================== */

function plan(command, ctx) {
  ctx = ctx || {};
  const dna = ctx.dna || {};
  const roster = Array.isArray(ctx.roster) ? ctx.roster : [];
  const byId = new Map(roster.map(r => [r.id, r]));
  const enabled = new Set(
    (ctx.enabledDepts && ctx.enabledDepts.length) ? ctx.enabledDepts : roster.map(r => r.dept_id)
  );
  const managers = {};
  roster.forEach(r => { if (r.is_manager && !managers[r.dept_id]) managers[r.dept_id] = r.id; });

  const norm = (normalize(command) + ' ' + normalize(ctx.answers || '')).trim();

  /* Intent khả dụng = agent có trong roster + phòng đang bật */
  const usable = key => {
    const a = byId.get(INTENTS[key].agent);
    return !!(a && enabled.has(a.dept_id) && !a.is_manager);
  };
  const makeTask = (key, forGoal) => {
    const agent = byId.get(INTENTS[key].agent);
    const t = INTENTS[key].build(dna, norm);
    if (forGoal && D.goal(dna)) t.brief.muc_tieu += ` Phục vụ mục tiêu 3 tháng: "${D.goal(dna)}".`;
    return {
      _key: key,
      title: t.title,
      dept_id: agent.dept_id,
      assignee_id: agent.id,
      reviewer_id: managers[agent.dept_id] || agent.id,
      brief: t.brief,
      deps: [],
      real_action: null
    };
  };

  const { keys } = matchIntentKeys(norm);
  let picked = ORDER.filter(k => keys.has(k) && usable(k));
  let tasks = picked.map(k => makeTask(k, false));

  /* Agent tùy biến: role/tên khớp từ khóa lệnh → giao 1 task phù hợp */
  const usedAgents = new Set(tasks.map(t => t.assignee_id));
  const cmdTokens = new Set(norm.split(' ').filter(w => w.length >= 3));
  roster.forEach(a => {
    if (tasks.length >= 8) return;
    if (KNOWN_IDS.has(a.id) || a.is_manager || a.id === 'coo') return;
    if (!enabled.has(a.dept_id) || usedAgents.has(a.id)) return;
    const roleTokens = normalize(a.name + ' ' + a.role_title).split(' ')
      .filter(w => w.length >= 3 && !STOP_TOKENS.has(w));
    if (!roleTokens.some(w => cmdTokens.has(w))) return;
    tasks.push({
      _key: 'custom:' + a.id,
      title: short(a.role_title || a.name, 60),
      dept_id: a.dept_id,
      assignee_id: a.id,
      reviewer_id: managers[a.dept_id] || a.id,
      brief: {
        muc_tieu: `${a.role_title || a.name} theo đúng lệnh CEO, gắn với ${prodPrice(dna)} của ${D.company(dna)}${D.goal(dna) ? ` và mục tiêu 3 tháng: "${D.goal(dna)}"` : ''}.`,
        dau_vao: ['Lệnh gốc của CEO', 'DNA thương hiệu'],
        format_dau_ra: 'docx',
        tieu_chi_cham: [
          'Bám sát yêu cầu trong lệnh CEO',
          'Đề xuất/số liệu có căn cứ, không chung chung',
          'Trình bày chuẩn tài liệu nghiệp vụ',
          `Đúng giọng thương hiệu, xưng hô "${D.addr(dna)}"`
        ]
      },
      deps: [],
      real_action: null
    });
    usedAgents.add(a.id);
  });

  /* Fallback: không intent nào trúng phòng đang bật → 3-5 task theo goal_3m */
  const padFrom = (pool, target) => {
    for (const k of pool) {
      if (tasks.length >= target) break;
      if (!usable(k)) continue;
      const agent = INTENTS[k].agent;
      if (tasks.some(t => t._key === k) || usedAgents.has(agent)) continue;
      tasks.push(makeTask(k, true));
      usedAgents.add(agent);
    }
  };
  if (!tasks.length) padFrom(FALLBACK_POOL, Math.min(5, roster.length));
  /* Đảm bảo tối thiểu 3 task: bổ sung việc bổ trợ CÙNG chủ đề trước, pool chung sau */
  if (tasks.length && tasks.length < 3) {
    const related = picked.reduce((acc, k) => acc.concat(RELATED[k] || []), []);
    padFrom(related.concat(FALLBACK_POOL), 3);
  }

  /* Giới hạn 8 + sắp lại theo thứ tự chuẩn để deps đứng trước */
  tasks = tasks.slice(0, 8);
  tasks.sort((x, y) => {
    const ix = ORDER.indexOf(x._key), iy = ORDER.indexOf(y._key);
    return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
  });

  /* Deps tự nhiên: báo giá ← dự toán; ads/kế hoạch chiến dịch ← content; faq ← content */
  const idx = key => tasks.findIndex(t => t._key === key);
  const wire = (fromKey, toKey) => {
    const a = idx(fromKey), b = idx(toKey);
    if (a !== -1 && b !== -1 && a !== b && !tasks[a].deps.includes(b)) tasks[a].deps.push(b);
  };
  wire('quote', 'cash');
  wire('ads', 'content');
  wire('ads_plan', 'content');
  wire('faq', 'content');

  /* real_action cho task kết thúc bằng đăng/gửi */
  const act = detectRealActions(norm);
  if (act.fb) {
    let i = idx('content');
    if (i === -1) i = tasks.findIndex(t => t.dept_id === 'mkt');
    if (i !== -1) tasks[i].real_action = {
      channel: 'mcp:facebook', op: 'create_post',
      note: `Đăng bài #1 về ${D.prod(dna)} lên Fanpage sau khi CEO duyệt trong Hộp phê duyệt (khung giờ vàng 20:00)`
    };
  }
  if (act.gm) {
    // chỉ gắn gửi mail cho task email/content thật — KHÔNG ép vào task cuối bất kỳ (tránh gửi nhầm nội dung)
    let i = tasks.findIndex(t => t._key === 'email' || t._key === 'content');
    if (i === -1) i = tasks.findIndex(t => t.dept_id === 'mkt');
    if (i >= 0) tasks[i].real_action = {
      channel: 'mcp:gmail', op: 'send_mail',
      note: `Gửi email cho khách hàng về ${D.prod(dna)} sau khi CEO duyệt trong Hộp phê duyệt`
    };
  }
  if (act.fx) {
    // "xuất/lưu ra tệp" → hành động ghi tệp thật (kênh mcp:file). Nếu phòng có công cụ write_file
    // (MCP) sẽ ghi tệp THẬT khi duyệt; nếu không, giữ như hành động thật thông thường.
    let i = tasks.findIndex(t => t._key === 'content' || t._key === 'report');
    if (i === -1) i = tasks.length - 1;
    if (i >= 0 && !tasks[i].real_action) tasks[i].real_action = { channel: 'mcp:file', op: 'write_file', note: `Xuất kết quả "${tasks[i].title}" ra tệp` };
  }

  return { tasks: tasks.map(({ _key, ...t }) => t) };
}

/* ================= 6. briefQuestions(command, ctx) ================ */

function briefQuestions(command, ctx) {
  ctx = ctx || {};
  if (ctx.answers) return []; // CEO đã trả lời — không hỏi lại
  const dna = ctx.dna || {};
  const norm = normalize(command);
  const { keys, launch } = matchIntentKeys(norm);
  const qs = [];

  const depts = new Set();
  keys.forEach(k => {
    const a = (ctx.roster || []).find(r => r.id === INTENTS[k].agent);
    if (a) depts.add(a.dept_id);
  });

  const hasNumber = /\d/.test(command || '');
  const hasDeadline = hasAny(norm, ['deadline', 'thoi han', 'tuan nay', 'tuan sau', 'thang nay',
    'hom nay', 'ngay mai', 'truoc ngay', 'cuoi tuan', 'cuoi thang']);

  if (!keys.size) {
    /* Lệnh mơ hồ hoàn toàn → hỏi hướng ưu tiên + thời hạn/con số */
    qs.push('Sếp muốn em ưu tiên mảng nào trước ạ: marketing bán hàng, tài chính – chi phí, hay chăm sóc khách hàng?');
    if (!hasDeadline) qs.push(`Có mốc thời hạn hoặc con số cụ thể nào em cần bám không ạ${D.goal(dna) ? ` (ví dụ theo mục tiêu "${D.goal(dna)}")` : ''}?`);
    return qs.slice(0, 2);
  }

  if (launch || depts.size >= 3) {
    const ch = D.channels(dna);
    qs.push(`Chiến dịch chạm nhiều phòng ban — sếp muốn ưu tiên kênh nào trước ạ: ${ch.length ? ch.join(', ') : 'Facebook, sàn TMĐT hay tại điểm bán'}?`);
  }
  if ((keys.has('ads') || launch) && !hasNumber) {
    qs.push('Ngân sách quảng cáo dự kiến khoảng bao nhiêu để em đặt CPL trần cho đúng ạ (ví dụ 5–20 triệu/tháng)?');
  }
  if ((launch || depts.size >= 3) && !hasDeadline && qs.length < 2) {
    qs.push('Mốc thời gian mong muốn của sếp là khi nào ạ (để em xếp timeline các phòng)?');
  }
  return qs.slice(0, 2);
}

module.exports = { plan, briefQuestions };
