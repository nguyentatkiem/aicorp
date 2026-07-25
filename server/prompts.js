'use strict';
/* Prompt template chuẩn — chương 12 đặc tả */

function dnaSummary(dna) {
  if (!dna) return '(chưa khai báo DNA)';
  const p = (dna.products || []).map(x => `${x.name} (${x.price_range || ''})`).join('; ');
  return [
    `Công ty: ${dna.company?.name || ''} · Ngành: ${dna.company?.industry || ''} · Quy mô: ${dna.company?.size || ''} · Khu vực: ${dna.company?.region || ''}`,
    `Sản phẩm: ${p}`,
    `Khách mục tiêu: ${dna.customers?.profile || ''} · Kênh: ${(dna.customers?.channels || []).join(', ')}`,
    `Mục tiêu 3 tháng: ${dna.goal_3m || ''}`,
    `Giọng thương hiệu: ${(dna.voice?.traits || []).join(' + ')} · Xưng hô: ${dna.voice?.address || ''}`,
    `ĐIỀU CẤM: ${(dna.voice?.banned || []).join('; ')}`,
    (dna.facts || []).length ? `Ghi nhớ: ${(dna.facts || []).join('; ')}` : ''
  ].filter(Boolean).join('\n');
}

function agentSystem(agent, dna, skillTexts, memoryText) {
  return `Bạn là ${agent.name} — ${agent.role_title} tại công ty ${dna?.company?.name || 'của khách hàng'}.
[DNA DOANH NGHIỆP]
${dnaSummary(dna)}
[VAI TRÒ]
${agent.system_prompt}
[NGUYÊN TẮC]
1) Luôn viết tiếng Việt, đúng giọng thương hiệu. 2) Chỉ làm đúng brief được giao, thiếu dữ liệu thì trả về câu hỏi thay vì bịa.
3) Kết quả trả theo FORMAT yêu cầu trong brief. 4) Không bao giờ tự thực hiện hành động thật — chỉ đề xuất qua Hộp phê duyệt.
${skillTexts ? `[SKILL ĐƯỢC GẮN]\n${skillTexts}` : ''}
${memoryText ? `[BỘ NHỚ LIÊN QUAN]\n${memoryText}` : ''}`;
}

function briefBack(command, dna, memories) {
  return `Nhiệm vụ CEO vừa giao: "${command}"
DNA: ${dnaSummary(dna)}
Bộ nhớ liên quan: ${memories || '(trống)'}
Hãy: (1) tóm tắt cách hiểu ≤3 câu; (2) liệt kê tối đa 2 câu hỏi CHỈ KHI câu trả lời làm thay đổi kế hoạch; (3) nếu không cần hỏi trả về ready=true.
CHỈ TRẢ VỀ JSON: {"hieu_nhiem_vu": "...", "cau_hoi": ["..."], "ready": true|false}`;
}

function planWBS(command, answers, dna, roster) {
  return `Nhiệm vụ CEO: "${command}"
${answers ? `CEO trả lời bổ sung: "${answers}"` : ''}
DNA: ${dnaSummary(dna)}
Danh sách nhân sự AI đang bật (id · phòng · vai trò):
${roster}
Hãy phân rã thành kế hoạch WBS. CHỈ TRẢ VỀ JSON:
{"tasks":[{"title":"...", "dept_id":"...", "assignee_id":"...", "reviewer_id":"...",
  "brief":{"muc_tieu":"...", "dau_vao":["..."], "format_dau_ra":"docx|xlsx|pptx|html|md", "tieu_chi_cham":["..."]},
  "deps":[], "real_action": null }]}
Quy tắc: task đủ nhỏ để 1 agent xong trong 1 lượt; tối đa 8 task; chỉ dùng agent trong danh sách trên; reviewer là trưởng phòng cùng phòng;
ghi rõ format file đầu ra; nếu task kết thúc bằng hành động thật (đăng bài, gửi mail, nhắn khách, chi tiền) thì đặt
"real_action": {"channel":"mcp:facebook|mcp:gmail|n8n", "op":"create_post|send_mail|...", "note":"mô tả hành động"}.`;
}

function execute(brief, feedback, round) {
  return `TASK: ${JSON.stringify(brief, null, 1)}
${feedback ? `ĐÂY LÀ VÒNG SỬA THỨ ${round}. Nhận xét từ trưởng phòng vòng trước (bắt buộc sửa hết):\n${feedback}` : ''}
Nếu thiếu dữ liệu đầu vào thì trả về JSON {"can_bo_sung":["..."]}.
Kết quả cuối đặt trong khối \`\`\`output ... \`\`\` đúng format yêu cầu (nội dung văn bản/markdown; nếu là bảng tính hãy dùng bảng markdown).`;
}

function review(tpAgent, brief, output, dna, nguong) {
  return `Bạn là ${tpAgent.name} — ${tpAgent.role_title}. Chấm bài nộp dưới đây theo tiêu chí trong brief + chuẩn DNA thương hiệu.
DNA: ${dnaSummary(dna)}
BRIEF: ${JSON.stringify(brief)}
BÀI NỘP:
${output}
Chấm khắt khe như trưởng phòng thật; feedback đủ để nhân viên sửa mà không hỏi lại. Ngưỡng đạt: ${nguong}/100.
CHỈ TRẢ VỀ JSON: {"score": 0-100, "feedback_chi_tiet": "...", "loi_cu_the":[{"vi_tri":"...", "loi":"...", "cach_sua":"..."}]}`;
}

function report(mission, taskLines, artifactLines, costVnd) {
  return `Tổng hợp kết quả nhiệm vụ "${mission.title}" cho CEO.
Các nhánh: ${taskLines}
File đã tạo: ${artifactLines}
Tổng chi phí: ${costVnd} VND.
Viết báo cáo ≤10 dòng bằng HTML đơn giản (dùng <ul><li><b>): kết quả từng nhánh kèm điểm, phát hiện đáng chú ý, đề xuất bước tiếp theo. Giọng trợ lý tin cậy xưng "em" với "sếp", không kể lể quá trình. CHỈ TRẢ VỀ HTML, không markdown.`;
}

module.exports = { dnaSummary, agentSystem, briefBack, planWBS, execute, review, report };
