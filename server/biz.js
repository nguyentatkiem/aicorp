'use strict';
/* Buồng lái kinh doanh — trạng thái công ty tích lũy qua thời gian (Phase 3).
   Rút ra KPI + P&L từ: sự kiện kinh doanh (biz_events) + nhiệm vụ + chi phí AI + bộ nhớ.
   Mỗi nhiệm vụ/duyệt hành động đều "ghi sổ" vào biz_events để công ty tiến hóa. */
const { db, now, uid } = require('./db');

/* Ghi một sự kiện kinh doanh (dùng bởi orchestrator khi có kết quả đáng ghi nhận) */
function record(kind, label, amountVnd, meta, missionId) {
  db.prepare('INSERT INTO biz_events(kind,label,amount_vnd,meta_json,source_mission,at) VALUES(?,?,?,?,?,?)')
    .run(kind, String(label || '').slice(0, 160), Math.round(amountVnd || 0),
      meta ? JSON.stringify(meta) : null, missionId || null, now());
}

/* Parse 1 mốc tiền: phân biệt dấu nhóm nghìn với dấu thập phân; hỗ trợ k/tr/triệu/m/tỷ */
function parseMoney(tok) {
  const t = String(tok || '').trim().toLowerCase().replace(/\s|đ|vnd/g, '');
  const m = t.match(/^([\d.,]+)(k|tr|trieu|triệu|m|ty|tỷ|nghin|nghìn|ngan|ngàn)?$/);
  if (!m) return null;
  let num = m[1];
  const suf = m[2] || '';
  if (/^\d{1,3}([.,]\d{3})+$/.test(num)) num = num.replace(/[.,]/g, '');   // 1.234.567 = nhóm nghìn
  else num = num.replace(',', '.');                                        // 1,5 = thập phân
  let v = parseFloat(num);
  if (!isFinite(v) || v <= 0) return null;
  if (suf === 'k' || /^ng/.test(suf)) v *= 1e3;
  else if (suf === 'ty' || suf === 'tỷ') v *= 1e9;
  else if (suf) v *= 1e6;                                                  // tr/triệu/m
  else if (v < 1000) v *= 1e3;                                            // "159-289" hiểu là nghìn
  return Math.round(v);
}

/* Tách khoảng giá, token đầu KẾ THỪA đơn vị token cuối ("1,5-3 triệu" → cả hai triệu) */
const UNIT_END = /(nghìn|nghin|ngàn|ngan|triệu|trieu|tỷ|ty|tr|k|m)$/i; // anchor cuối, không dùng \b (ký tự có dấu)
const HAS_UNIT = /(nghìn|nghin|ngàn|ngan|triệu|trieu|tỷ|ty|tr|k|m)/i;
function splitRange(s) {
  const parts = String(s || '').split(/[-–—~→]|đến/i).map(x => x.trim().replace(/(đ|vnd)$/i, '').trim()).filter(Boolean);
  if (parts.length < 2) return parts;
  const unit = UNIT_END.exec(parts[parts.length - 1]);
  if (unit) return parts.map(p => HAS_UNIT.test(p) ? p : p + unit[1]);
  return parts;
}

/* Ước tính giá bán trung bình từ DNA (để quy đổi lead/đơn → doanh thu dự phóng) */
function avgPrice(dna) {
  try {
    const pr = (((dna || {}).products || [])[0] || {}).price_range || '';
    const nums = splitRange(pr).map(parseMoney).filter(Boolean);
    if (nums.length >= 2) return Math.round((Math.min(...nums) + Math.max(...nums)) / 2);
    if (nums.length === 1) return Math.round(nums[0]);
  } catch {}
  return 200000;
}

function todayStart() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }

/* Tổng hợp buồng lái: KPI + P&L + xu hướng 6 kỳ + dòng sự kiện */
function cockpit(dna) {
  // KPI tích lũy toàn thời gian
  const evAll = db.prepare('SELECT kind, COALESCE(SUM(amount_vnd),0) sum, COUNT(*) n FROM biz_events GROUP BY kind').all();
  const byKind = Object.fromEntries(evAll.map(e => [e.kind, e]));
  const g = k => byKind[k] || { sum: 0, n: 0 };
  // Số liệu 30 NGÀY (cho P&L tháng — khớp cùng cửa sổ với chi phí AI tháng, tránh trộn tích lũy vs tháng)
  const evM = db.prepare('SELECT kind, COALESCE(SUM(amount_vnd),0) sum, COUNT(*) n FROM biz_events WHERE at>=? GROUP BY kind').all(daysAgo(30));
  const byKindM = Object.fromEntries(evM.map(e => [e.kind, e]));
  const gM = k => byKindM[k] || { sum: 0, n: 0 };

  const price = avgPrice(dna);
  const leads = g('lead').n;                       // số lần chấm lead
  const leadCount = g('lead').sum || leads * 20;   // ước số lead
  const campaigns = g('campaign').n;               // chiến dịch/bài đã duyệt đăng
  const contentPieces = g('content').n;
  const projectedRevenue = g('revenue').sum;       // doanh thu dự phóng do Tài chính lập
  const dealValue = g('deal').sum;                 // giá trị báo giá/hợp đồng đề xuất

  // Chi phí vận hành AI = tổng chi phí token
  const aiCost = db.prepare('SELECT COALESCE(SUM(vnd),0) s FROM cost_logs').get().s;
  const aiCostMonth = db.prepare('SELECT COALESCE(SUM(vnd),0) s FROM cost_logs WHERE at>=?').get(daysAgo(30)).s;

  const missionsDone = db.prepare("SELECT COUNT(*) c FROM missions WHERE status='done'").get().c;
  const artifacts = db.prepare('SELECT COUNT(*) c FROM artifacts').get().c;
  const avgQ = db.prepare('SELECT AVG(score) a FROM tasks WHERE score IS NOT NULL').get().a;

  // P&L dự phóng (THÁNG): ưu tiên DOANH THU THẬT từ đơn hàng CRM (v4); nếu chưa có đơn, ước từ lead
  let realRevenue = 0;
  try { realRevenue = require('./crm').revenueMonth(); } catch {}
  const leadMonth = gM('lead').sum || gM('lead').n * 20;
  const rev = realRevenue || Math.round(leadMonth * price * 0.05);
  const revIsReal = realRevenue > 0;
  const cogs = Math.round(rev * 0.45);
  const grossProfit = rev - cogs;
  const opProfit = grossProfit - aiCostMonth;

  // Xu hướng 6 kỳ gần nhất (theo tuần) — số nhiệm vụ hoàn thành + chi phí
  const trend = [];
  for (let w = 5; w >= 0; w--) {
    const from = daysAgo((w + 1) * 7), to = daysAgo(w * 7);
    const done = db.prepare("SELECT COUNT(*) c FROM missions WHERE status='done' AND done_at>=? AND done_at<?").get(from, to).c;
    const cost = db.prepare('SELECT COALESCE(SUM(vnd),0) s FROM cost_logs WHERE at>=? AND at<?').get(from, to).s;
    const arts = db.prepare('SELECT COUNT(*) c FROM artifacts WHERE created_at>=? AND created_at<?').get(from, to).c;
    trend.push({ label: w === 0 ? 'Tuần này' : w + ' tuần trước', missions: done, cost, artifacts: arts });
  }

  const events = db.prepare('SELECT * FROM biz_events ORDER BY id DESC LIMIT 25').all()
    .map(e => ({ ...e, meta: e.meta_json ? JSON.parse(e.meta_json) : null }));

  // Tiến độ mục tiêu 3 tháng (thô): ước từ số việc hoàn thành phục vụ mục tiêu
  const goalProgress = Math.min(100, Math.round(missionsDone * 8 + campaigns * 6 + leads * 4));

  let crmSnap = null; try { crmSnap = require('./crm').pipelineSnapshot(); } catch {}
  return {
    kpi: {
      projectedRevenue: rev, revIsReal, grossProfit, opProfit, aiCostMonth, aiCostTotal: aiCost,
      leadCount: crmSnap ? (crmSnap.byStage.moi + crmSnap.byStage.am + crmSnap.byStage.nong) : leadCount,
      campaigns, contentPieces, dealValue, missionsDone, artifacts, orders: crmSnap ? crmSnap.ordersN : 0,
      customers: crmSnap ? crmSnap.customersN : 0, openTickets: crmSnap ? crmSnap.openTickets : 0,
      avgQuality: avgQ ? Math.round(avgQ * 10) / 10 : null, price, goalProgress
    },
    pnl: [
      { row: revIsReal ? 'Doanh thu THẬT từ đơn (tháng)' : 'Doanh thu dự phóng (tháng)', value: rev, kind: 'pos' },
      { row: 'Giá vốn hàng bán (~45%)', value: -cogs, kind: 'neg' },
      { row: 'Lãi gộp', value: grossProfit, kind: 'sub' },
      { row: 'Chi phí vận hành AI (tháng)', value: -aiCostMonth, kind: 'neg' },
      { row: 'Lợi nhuận hoạt động' + (revIsReal ? '' : ' dự phóng'), value: opProfit, kind: opProfit >= 0 ? 'sub' : 'negsub' }
    ],
    trend, events,
    goal: (dna || {}).goal_3m || ''
  };
}

/* Trạng thái công ty rút gọn cho initiative engine */
function stateForInitiative() {
  const recentMemories = db.prepare('SELECT kind,text FROM memories ORDER BY id DESC LIMIT 8')
    .all().map(m => `(${m.kind}) ${m.text}`);
  const staleApprovals = db.prepare("SELECT COUNT(*) c FROM approvals WHERE status='pending' AND created_at < ?")
    .get(daysAgo(1)).c;
  const missionsDone = db.prepare("SELECT COUNT(*) c FROM missions WHERE status='done'").get().c;
  const last = db.prepare('SELECT created_at FROM missions ORDER BY created_at DESC LIMIT 1').get();
  // null khi CHƯA có nhiệm vụ nào (để initiative không nói "đã 999 ngày chưa có nhiệm vụ")
  const daysSinceLastMission = last ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) : null;
  const agentPerf = db.prepare(`SELECT a.id, a.name, s.avg_score avgScore, s.rejected_rate rejRate
    FROM agents a JOIN agent_stats s ON s.agent_id=a.id JOIN departments d ON d.id=a.dept_id
    WHERE a.enabled=1 AND d.enabled=1 AND a.id!='coo' AND s.tasks_done > 0
    ORDER BY s.rejected_rate DESC LIMIT 8`).all()
    .map(a => ({ id: a.id, name: a.name, avgScore: a.avgScore, rejRate: a.rejRate || 0 }));
  return { recentMemories, staleApprovals, missionsDone, daysSinceLastMission, agentPerf };
}

module.exports = { record, cockpit, stateForInitiative, avgPrice };
