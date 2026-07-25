'use strict';
/* Artifact Factory — sinh file thật (docx/xlsx/pptx/html/md) từ output text/markdown của agent */
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const { DIRS } = require('./db');

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
}

function parseMdTables(text) {
  const tables = [];
  const lines = text.split('\n');
  let cur = null;
  for (const ln of lines) {
    if (/^\s*\|.*\|\s*$/.test(ln)) {
      const cells = ln.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/\*\*/g, ''));
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue; // dòng phân cách
      if (!cur) { cur = []; tables.push(cur); }
      cur.push(cells);
    } else cur = null;
  }
  return tables;
}

async function writeDocx(fp, title, content) {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  for (const raw of content.split('\n')) {
    const ln = raw.trimEnd();
    if (!ln.trim()) { children.push(new Paragraph({ text: '' })); continue; }
    if (ln.startsWith('# ')) children.push(new Paragraph({ text: ln.slice(2), heading: HeadingLevel.HEADING_1 }));
    else if (ln.startsWith('## ')) children.push(new Paragraph({ text: ln.slice(3), heading: HeadingLevel.HEADING_2 }));
    else if (ln.startsWith('- ') || ln.startsWith('* ')) children.push(new Paragraph({ text: ln.slice(2), bullet: { level: 0 } }));
    else children.push(new Paragraph({ children: [new TextRun(ln.replace(/\*\*/g, ''))] }));
  }
  const doc = new Document({ sections: [{ children }] });
  fs.writeFileSync(fp, await Packer.toBuffer(doc));
}

async function writeXlsx(fp, title, content) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Dữ liệu');
  const tables = parseMdTables(content);
  if (tables.length) {
    let r = 1;
    for (const tb of tables) {
      for (const row of tb) {
        const xr = ws.getRow(r++);
        row.forEach((c, i) => { const n = Number(String(c).replace(/\./g, '').replace(/,/g, '.')); xr.getCell(i + 1).value = (c !== '' && !isNaN(n) && /^[\d.,]+$/.test(c)) ? n : c; });
        xr.commit && xr.commit();
      }
      r++;
    }
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach(c => { c.width = 24; });
  } else {
    content.split('\n').forEach((ln, i) => { ws.getCell(i + 1, 1).value = ln; });
  }
  await wb.xlsx.writeFile(fp);
}

async function writePptx(fp, title, content) {
  const pptx = new PptxGenJS();
  let s = pptx.addSlide();
  s.addText(title, { x: 0.5, y: 1.5, w: 9, h: 1.5, fontSize: 32, bold: true, color: '1A2236' });
  const sections = content.split(/\n(?=## )/);
  for (const sec of sections) {
    const lines = sec.split('\n').filter(l => l.trim());
    if (!lines.length) continue;
    const head = lines[0].replace(/^#+\s*/, '');
    const body = lines.slice(1).join('\n').slice(0, 600);
    const sl = pptx.addSlide();
    sl.addText(head, { x: 0.4, y: 0.3, w: 9.2, h: 0.8, fontSize: 22, bold: true, color: 'F6A821' });
    sl.addText(body, { x: 0.4, y: 1.2, w: 9.2, h: 4.2, fontSize: 13, color: '333333' });
  }
  await pptx.writeFile({ fileName: fp });
}

/* Lọc HTML fragment do LLM sinh: chỉ giữ thẻ trình bày an toàn, bỏ script/handler/style
   → chống stored XSS khi CEO mở file .html trong Xưởng (cùng origin localhost). */
function sanitizeFragment(html) {
  let s = String(html || '');
  s = s.replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|form|input|svg|math|base|template)\b[^>]*>/gi, '');
  const ALLOW = new Set(['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'b', 'i', 'em', 'strong', 'br', 'hr',
    'table', 'thead', 'tbody', 'tr', 'td', 'th', 'span', 'div', 'small', 'section', 'header', 'blockquote', 'code', 'pre']);
  // thay từng thẻ: giữ tên nếu whitelist (bỏ mọi thuộc tính → diệt on*/style/href js), xóa nếu không
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)\s*>/g, (m, slash, tag, selfClose) => {
    tag = tag.toLowerCase();
    if (!ALLOW.has(tag)) return '';
    return slash ? `</${tag}>` : (['br', 'hr'].includes(tag) ? `<${tag}>` : `<${tag}>`);
  });
  return s.replace(/javascript\s*:/gi, '').replace(/\bon\w+\s*=/gi, '');
}

function writeHtml(fp, title, content) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const looksHtml = /<(h[1-6]|p|ul|ol|li|table|div|section|b|strong|br)\b/i.test(content);
  const body = looksHtml ? sanitizeFragment(content)
    : esc(content).split('\n').map(l =>
        l.startsWith('# ') ? `<h1>${l.slice(2)}</h1>` :
        l.startsWith('## ') ? `<h2>${l.slice(3)}</h2>` :
        l.trim() ? `<p>${l}</p>` : '').join('\n');
  fs.writeFileSync(fp, `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<style>body{font-family:'Be Vietnam Pro',system-ui,sans-serif;max-width:840px;margin:40px auto;padding:0 20px;color:#1a2236;line-height:1.7}
h1{color:#E4711E}h2{color:#26304A;border-bottom:2px solid #F6A821;padding-bottom:4px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 12px}</style>
</head><body><h1>${esc(title)}</h1>\n${body}\n<hr><small>Tạo bởi AICORP · ${new Date().toLocaleString('vi-VN')}</small></body></html>`);
}

const ICONS = { docx: '📄', xlsx: '📊', pptx: '🖥️', html: '📈', md: '📝', pdf: '📕' };

/** Sinh file artifact; trả {fileName, absPath, type} — lỗi thì fallback .md */
async function buildArtifact({ title, content, format, version, taskId }) {
  const type = ['docx', 'xlsx', 'pptx', 'html', 'md'].includes(format) ? format : 'docx';
  // thêm hậu tố ngắn từ taskId để 2 task khác nhau cùng tiêu đề KHÔNG ghi đè nhau
  const suffix = taskId ? '-' + String(taskId).slice(-4) : '';
  const base = slugify(title) + suffix + (version > 1 ? `-v${version}` : '');
  const fileName = `${base}.${type}`;
  const fp = path.join(DIRS.artifacts, fileName);
  try {
    if (type === 'docx') await writeDocx(fp, title, content);
    else if (type === 'xlsx') await writeXlsx(fp, title, content);
    else if (type === 'pptx') await writePptx(fp, title, content);
    else if (type === 'html') writeHtml(fp, title, content);
    else fs.writeFileSync(fp, `# ${title}\n\n${content}`);
    return { fileName, absPath: fp, type };
  } catch (e) {
    const mdName = `${base}.md`;
    const mdPath = path.join(DIRS.artifacts, mdName);
    fs.writeFileSync(mdPath, `# ${title}\n\n${content}\n\n> (Ghi chú: xuất ${type} lỗi — ${e.message} — đã lưu dạng markdown)`);
    return { fileName: mdName, absPath: mdPath, type: 'md' };
  }
}

module.exports = { buildArtifact, ICONS, slugify };
