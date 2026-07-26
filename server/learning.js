'use strict';
/* Công ty tự học (v4) — chưng cất bài làm điểm cao thành "playbook phòng",
   nạp lại cho việc sau để chất lượng tăng dần; COO đánh giá & thăng chức nhân sự. */
const { db, uid, now } = require('./db');

/* Chưng cất playbook từ 1 task đạt điểm cao (>=95). Lấy KHUNG (các tiêu đề ##/#, câu mở)
   làm công thức tái sử dụng — không lưu nguyên văn, chỉ lưu cấu trúc + vài mẫu câu tốt. */
function distill(task, output, score) {
  if (!output || score < 95) return null;
  if (!task.dept_id) return null;   // task khung/không rõ phòng → không đúc kết (tránh playbook rác)
  const heads = [];
  for (const raw of String(output).split('\n')) {
    const l = raw.trim();
    if (/^#{1,3}\s+/.test(l)) heads.push(l.replace(/^#+\s+/, '').replace(/\s*\(.*\)\s*$/, '').slice(0, 70));
    else if (/^\|.*\|/.test(l) && !heads.includes('[bảng số liệu]')) heads.push('[bảng số liệu]');
  }
  if (heads.length < 2) return null;
  const brief = safe(task.brief);
  const title = (brief.muc_tieu || task.title || '').slice(0, 70);
  const pattern = `Khung đạt ${score}đ: ${heads.slice(0, 8).join(' → ')}`;
  // chỉ giữ 1 playbook tốt nhất cho mỗi (dept, format) — cập nhật nếu điểm cao hơn
  const fmt = brief.format_dau_ra || 'docx';
  const key = task.dept_id + '|' + fmt;
  const ex = db.prepare("SELECT id, score FROM playbooks WHERE dept_id=? AND title LIKE ? ORDER BY score DESC LIMIT 1")
    .get(task.dept_id, '%[' + fmt + ']%');
  const fullTitle = `[${fmt}] ${title}`;
  if (ex) {
    if (score > ex.score) db.prepare('UPDATE playbooks SET title=?, pattern=?, score=?, source_task=?, created_at=? WHERE id=?')
      .run(fullTitle, pattern, score, task.id, now(), ex.id);
    return ex.id;
  }
  const id = uid('pb');
  db.prepare('INSERT INTO playbooks(id,dept_id,agent_id,title,pattern,score,source_task,uses,created_at) VALUES(?,?,?,?,?,?,?,0,?)')
    .run(id, task.dept_id, task.assignee_id, fullTitle, pattern, score, task.id, now());
  return id;
}

/* Lấy playbook phù hợp để nạp vào brief việc mới — CHỈ cùng phòng VÀ cùng format
   (không nạp nhầm công thức xlsx vào bài docx). Không tăng uses ở đây — để nơi gọi
   quyết định (tránh đếm trùng khi task retry nhiều vòng). */
function playbookFor(deptId, format) {
  if (!deptId) return null;
  const pb = db.prepare("SELECT * FROM playbooks WHERE dept_id=? AND title LIKE ? ORDER BY score DESC LIMIT 1")
    .get(deptId, '%[' + (format || 'docx') + ']%');
  return pb ? { id: pb.id, pattern: pb.pattern } : null;
}
function markPlaybookUsed(id) { if (id) db.prepare('UPDATE playbooks SET uses=uses+1 WHERE id=?').run(id); }

/* COO đánh giá hiệu suất → đề xuất thăng chức / nghẽn cổ chai (dùng cho initiative + báo cáo) */
function performanceReview() {
  const rows = db.prepare(`SELECT a.id, a.name, a.dept_id, a.is_manager, s.tasks_done, s.avg_score, s.rejected_rate
    FROM agents a JOIN agent_stats s ON s.agent_id=a.id JOIN departments d ON d.id=a.dept_id
    WHERE a.enabled=1 AND d.enabled=1 AND a.id!='coo' AND s.tasks_done >= 3`).all();
  const promote = rows.filter(r => !r.is_manager && r.avg_score >= 95 && (r.rejected_rate || 0) < 0.1)
    .sort((a, b) => b.avg_score - a.avg_score).slice(0, 2);
  const retrain = rows.filter(r => (r.rejected_rate || 0) >= 0.25 || (r.avg_score && r.avg_score < 85))
    .sort((a, b) => (b.rejected_rate || 0) - (a.rejected_rate || 0)).slice(0, 2);
  return { promote, retrain };
}

function stats() {
  return {
    count: db.prepare('SELECT COUNT(*) c FROM playbooks').get().c,
    totalUses: db.prepare('SELECT COALESCE(SUM(uses),0) s FROM playbooks').get().s,
    list: db.prepare(`SELECT p.*, d.name dept_name FROM playbooks p LEFT JOIN departments d ON d.id=p.dept_id
      ORDER BY p.uses DESC, p.score DESC LIMIT 30`).all()
  };
}

function safe(s) { try { return typeof s === 'string' ? JSON.parse(s) : (s || {}); } catch { return {}; } }

module.exports = { distill, playbookFor, markPlaybookUsed, performanceReview, stats };
