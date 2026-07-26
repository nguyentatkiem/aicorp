'use strict';
/* ============================================================================
   BỘ NÃO THỨ 2 (Second Brain) — kho tri thức kiểu Obsidian cho công ty AI.
   - Mỗi ghi chú là 1 file .md thật trong workspace/brain/notes/ (mở được bằng Obsidian).
   - Liên kết [[wikilink]] tạo đồ thị tri thức; có backlink, tag, tìm kiếm FTS5.
   - Agent TRUY HỒI theo đồ thị (FTS + mở rộng 1 bước liên kết) để làm việc thông minh hơn,
     và TỰ CHƯNG CẤT tri thức mới thành note liên kết sau mỗi nhiệm vụ → càng chạy càng giỏi.
   Bảo mật: slug chỉ [a-z0-9-] (chống path traversal); render markdown escape-first ở client.
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const { db, DIRS, now, log } = require('./db');

const NOTES_DIR = path.join(DIRS.brain, 'notes');
fs.mkdirSync(NOTES_DIR, { recursive: true });

/* ---------------- Schema ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS notes (
  slug TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT DEFAULT '',
  tags_json TEXT DEFAULT '[]', type TEXT DEFAULT 'concept', source TEXT,
  pinned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS note_links (
  from_slug TEXT, to_slug TEXT, to_title TEXT, resolved INTEGER DEFAULT 1,
  PRIMARY KEY(from_slug, to_slug));
CREATE INDEX IF NOT EXISTS idx_note_links_to ON note_links(to_slug);
`);
/* FTS5 external-content, đồng bộ qua trigger (bền hơn tự xoá/chèn thủ công) */
db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, body, tags, content='notes', content_rowid='rowid');
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid,title,body,tags) VALUES (new.rowid,new.title,new.body,new.tags_json);
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts,rowid,title,body,tags) VALUES('delete',old.rowid,old.title,old.body,old.tags_json);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts,rowid,title,body,tags) VALUES('delete',old.rowid,old.title,old.body,old.tags_json);
  INSERT INTO notes_fts(rowid,title,body,tags) VALUES (new.rowid,new.title,new.body,new.tags_json);
END;
`);

const NOTE_TYPES = ['concept', 'decision', 'playbook', 'insight', 'competitor', 'sop', 'retro', 'customer'];
const MAX_BODY = 100000;

/* ---------------- Helpers ---------------- */
const foldVi = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

function slugify(title) {
  const base = foldVi(title).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return base || 'note';
}
/* Chống path traversal tuyệt đối: chỉ chấp nhận slug đã chuẩn hoá */
function safeSlug(slug) {
  const s = String(slug || '');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(s) || s.length > 90) return null;
  return s;
}
function notePath(slug) { return path.join(NOTES_DIR, slug + '.md'); }

/* Cấp slug duy nhất (nếu trùng title khác note thì thêm hậu tố -2, -3…) */
function uniqueSlug(title, keepSlug) {
  let base = slugify(title), s = base, i = 2;
  while (true) {
    const row = db.prepare('SELECT slug FROM notes WHERE slug=?').get(s);
    if (!row || row.slug === keepSlug) return s;
    s = base + '-' + (i++);
    if (i > 500) return base + '-' + Date.now();
  }
}

function parseTags(tags) {
  if (Array.isArray(tags)) return [...new Set(tags.map(t => foldVi(t).replace(/[^a-z0-9-]/g, '')).filter(Boolean))].slice(0, 12);
  return [...new Set(String(tags || '').split(/[,\s]+/).map(t => foldVi(t).replace(/[^a-z0-9-]/g, '')).filter(Boolean))].slice(0, 12);
}

/* Bóc [[wikilink]] / [[link|nhãn]] — regex an toàn (không backtracking thảm hoạ) */
function parseWikilinks(body) {
  const out = [];
  const re = /\[\[([^\[\]\n]{1,120}?)\]\]/g;
  let m, guard = 0;
  const text = String(body || '').slice(0, MAX_BODY);
  while ((m = re.exec(text)) && guard++ < 2000) {
    const target = m[1].split('|')[0].trim();
    if (target) out.push(target);
  }
  return [...new Set(out)];
}

/* Giải mã 1 mục tiêu wikilink → {slug, title, resolved}.
   Ưu tiên khớp SLUG chính xác (cho phép trỏ [[title-2]] tường minh), rồi mới khớp title
   với tie-break tất định (ORDER BY slug) khi trùng tiêu đề. */
function resolveTarget(target) {
  const s = slugify(target);
  const bySlug = db.prepare('SELECT slug,title FROM notes WHERE slug=?').get(s);
  if (bySlug) return { slug: bySlug.slug, title: bySlug.title, resolved: 1 };
  const byTitle = db.prepare('SELECT slug,title FROM notes WHERE lower(title)=lower(?) ORDER BY slug LIMIT 1').get(target);
  if (byTitle) return { slug: byTitle.slug, title: byTitle.title, resolved: 1 };
  return { slug: s, title: target, resolved: 0 };   // note ma (chưa tạo)
}

/* Ghi lại cạnh liên kết cho 1 note */
function syncLinks(slug, body) {
  db.prepare('DELETE FROM note_links WHERE from_slug=?').run(slug);
  const targets = parseWikilinks(body);
  const ins = db.prepare('INSERT OR IGNORE INTO note_links(from_slug,to_slug,to_title,resolved) VALUES(?,?,?,?)');
  for (const t of targets) {
    const r = resolveTarget(t);
    if (r.slug === slug) continue;               // bỏ tự liên kết
    ins.run(slug, r.slug, r.title, r.resolved);
  }
}

/* Ghi file .md (Obsidian đọc được) — frontmatter YAML + thân */
function writeMd(note) {
  const fm = [
    '---',
    'title: ' + JSON.stringify(note.title),
    'tags: [' + (JSON.parse(note.tags_json || '[]')).join(', ') + ']',
    'type: ' + note.type,
    'source: ' + (note.source || ''),
    'created: ' + note.created_at,
    'updated: ' + note.updated_at,
    '---', ''
  ].join('\n');
  const p = notePath(note.slug);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, fm + (note.body || ''), 'utf8');
  fs.renameSync(tmp, p);
}

/* ---------------- CRUD ---------------- */
function getNote(slug) {
  const s = safeSlug(slug);
  if (!s) return null;
  return db.prepare('SELECT * FROM notes WHERE slug=?').get(s) || null;
}

function createNote({ title, body, tags, type, source, pinned }) {
  title = String(title || '').trim().replace(/[<>]/g, '').slice(0, 160);
  if (!title) throw new Error('Ghi chú cần có tiêu đề');
  const slug = uniqueSlug(title);
  const t = now();
  type = NOTE_TYPES.includes(type) ? type : 'concept';
  const note = {
    slug, title, body: String(body || '').slice(0, MAX_BODY), tags_json: JSON.stringify(parseTags(tags)),
    type, source: source || 'ceo', pinned: pinned ? 1 : 0, created_at: t, updated_at: t
  };
  db.prepare(`INSERT INTO notes(slug,title,body,tags_json,type,source,pinned,created_at,updated_at)
    VALUES(@slug,@title,@body,@tags_json,@type,@source,@pinned,@created_at,@updated_at)`).run(note);
  syncLinks(slug, note.body);
  // note vừa tạo có thể "hiện thực hoá" các liên kết ma trỏ tới nó
  db.prepare('UPDATE note_links SET resolved=1 WHERE to_slug=? AND resolved=0').run(slug);
  try { writeMd(note); } catch (e) { log('sb writeMd: ' + e.message); }
  return note;
}

function updateNote(slug, { title, body, tags, type, pinned }) {
  const cur = getNote(slug);
  if (!cur) throw new Error('Không tìm thấy ghi chú');
  let newSlug = cur.slug;
  const upd = { ...cur };
  if (title !== undefined) {
    const clean = String(title).trim().replace(/[<>]/g, '').slice(0, 160);
    if (clean && clean !== cur.title) { upd.title = clean; newSlug = uniqueSlug(clean, cur.slug); }
  }
  if (body !== undefined) upd.body = String(body).slice(0, MAX_BODY);
  if (tags !== undefined) upd.tags_json = JSON.stringify(parseTags(tags));
  if (type !== undefined && NOTE_TYPES.includes(type)) upd.type = type;
  if (pinned !== undefined) upd.pinned = pinned ? 1 : 0;
  upd.updated_at = now();

  // Thao tác DB gói trong 1 transaction (nguyên tử — rollback nếu lỗi, tránh note lệch đĩa/zombie).
  // Đổi tên vào một [[wikilink]] ma đang tồn tại sẽ đụng PRIMARY KEY(from,to) → dùng UPDATE OR REPLACE để gộp cạnh.
  const oldPath = notePath(cur.slug);
  const apply = db.transaction(() => {
    if (newSlug !== cur.slug) {
      upd.slug = newSlug;
      db.prepare('UPDATE notes SET slug=? WHERE slug=?').run(newSlug, cur.slug);
      db.prepare('UPDATE OR REPLACE note_links SET from_slug=? WHERE from_slug=?').run(newSlug, cur.slug);
      db.prepare('UPDATE OR REPLACE note_links SET to_slug=?, resolved=1 WHERE to_slug=?').run(newSlug, cur.slug);
    }
    db.prepare(`UPDATE notes SET title=@title,body=@body,tags_json=@tags_json,type=@type,pinned=@pinned,updated_at=@updated_at WHERE slug=@slug`).run(upd);
    syncLinks(newSlug, upd.body);
    db.prepare('UPDATE note_links SET resolved=1 WHERE to_slug=? AND resolved=0').run(newSlug);
  });
  apply();
  // thao tác file ĐẶT SAU khi transaction commit thành công
  if (newSlug !== cur.slug) { try { fs.rmSync(oldPath, { force: true }); } catch {} }
  try { writeMd(upd); } catch (e) { log('sb writeMd: ' + e.message); }
  // Đổi TIÊU ĐỀ → viết lại [[Tiêu đề cũ]] thành [[Tiêu đề mới]] trong mọi note trỏ tới (đúng kiểu Obsidian)
  if (upd.title !== cur.title) rewriteBacklinkTitles(cur.title, upd.title, newSlug);
  return upd;
}

/* Viết lại nhãn wikilink trong các note backlink khi 1 note đổi tiêu đề */
function rewriteBacklinkTitles(oldTitle, newTitle, newSlug) {
  if (!oldTitle || oldTitle === newTitle) return;
  const backs = db.prepare('SELECT DISTINCT from_slug FROM note_links WHERE to_slug=?').all(newSlug).map(r => r.from_slug);
  const reTitle = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\[\\[' + reTitle + '(\\|[^\\[\\]\\n]*)?\\]\\]', 'gi');
  for (const slug of backs) {
    if (slug === newSlug) continue;
    const n = getNote(slug);
    if (!n) continue;
    const nb = String(n.body || '').replace(re, (m, alias) => '[[' + newTitle + (alias || '') + ']]');
    if (nb === n.body) continue;
    db.prepare('UPDATE notes SET body=?, updated_at=? WHERE slug=?').run(nb, now(), slug);
    syncLinks(slug, nb);
    try { writeMd(getNote(slug)); } catch (e) { log('sb rewrite md: ' + e.message); }
  }
}

function deleteNote(slug) {
  const cur = getNote(slug);
  if (!cur) return false;
  db.prepare('DELETE FROM notes WHERE slug=?').run(cur.slug);
  db.prepare('DELETE FROM note_links WHERE from_slug=?').run(cur.slug);
  // backlink tới note vừa xoá → trở lại trạng thái "ma" (chưa tạo)
  db.prepare('UPDATE note_links SET resolved=0 WHERE to_slug=?').run(cur.slug);
  try { fs.rmSync(notePath(cur.slug), { force: true }); } catch {}
  return true;
}

/* ---------------- Đọc / liên kết ---------------- */
function backlinks(slug) {
  return db.prepare(`SELECT n.slug,n.title,n.type FROM note_links l JOIN notes n ON n.slug=l.from_slug
    WHERE l.to_slug=? ORDER BY n.updated_at DESC`).all(slug);
}
function outgoing(slug) {
  return db.prepare('SELECT to_slug,to_title,resolved FROM note_links WHERE from_slug=?').all(slug);
}
function noteView(slug) {
  const note = getNote(slug);
  if (!note) return null;
  return {
    ...note, tags: JSON.parse(note.tags_json || '[]'),
    backlinks: backlinks(note.slug),
    outgoing: outgoing(note.slug)
  };
}

/* ---------------- Tìm kiếm ---------------- */
function ftsQuery(q) {
  const terms = String(q || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1).slice(0, 10);
  if (!terms.length) return null;
  return terms.map(t => '"' + t.replace(/"/g, '') + '"').join(' OR ');
}
function listNotes({ q, tag, type, limit = 200 } = {}) {
  let rows;
  const fq = ftsQuery(q);
  if (fq) {
    try {
      rows = db.prepare(`SELECT n.* FROM notes_fts f JOIN notes n ON n.rowid=f.rowid
        WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?`).all(fq, limit);
    } catch (e) { rows = db.prepare('SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?').all(limit); }
  } else {
    rows = db.prepare('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC LIMIT ?').all(limit);
  }
  if (tag) rows = rows.filter(n => JSON.parse(n.tags_json || '[]').includes(foldVi(tag).replace(/[^a-z0-9-]/g, '')));
  if (type) rows = rows.filter(n => n.type === type);
  return rows.map(n => ({ slug: n.slug, title: n.title, type: n.type, tags: JSON.parse(n.tags_json || '[]'), pinned: n.pinned, updated_at: n.updated_at }));
}

/* ---------------- Đồ thị ---------------- */
function graph() {
  const notes = db.prepare('SELECT slug,title,type,tags_json,pinned FROM notes').all();
  const deg = {};
  const edges = db.prepare('SELECT from_slug,to_slug,to_title,resolved FROM note_links').all();
  const nodes = notes.map(n => { deg[n.slug] = 0; return { slug: n.slug, title: n.title, type: n.type, tags: JSON.parse(n.tags_json || '[]'), pinned: !!n.pinned, phantom: false }; });
  const known = new Set(notes.map(n => n.slug));
  const phantomSeen = new Set();
  const outEdges = [];
  for (const e of edges) {
    if (!known.has(e.from_slug)) continue;
    deg[e.from_slug] = (deg[e.from_slug] || 0) + 1;
    deg[e.to_slug] = (deg[e.to_slug] || 0) + 1;   // đếm mọi cạnh vào (kể cả node ma) → kích thước đúng
    if (!known.has(e.to_slug) && !phantomSeen.has(e.to_slug)) {
      phantomSeen.add(e.to_slug);
      nodes.push({ slug: e.to_slug, title: e.to_title || e.to_slug, type: 'phantom', tags: [], pinned: false, phantom: true });
    }
    outEdges.push({ from: e.from_slug, to: e.to_slug });
  }
  nodes.forEach(n => n.degree = deg[n.slug] || 0);
  return { nodes, edges: outEdges };
}

function stats() {
  const total = db.prepare('SELECT COUNT(*) c FROM notes').get().c;
  const links = db.prepare('SELECT COUNT(*) c FROM note_links WHERE resolved=1').get().c;
  // mồ côi = không có cạnh THẬT (resolved=1) nào vào/ra — đồng bộ với cách đếm links
  const orphanRow = db.prepare(`SELECT COUNT(*) c FROM notes n WHERE NOT EXISTS(SELECT 1 FROM note_links l WHERE l.from_slug=n.slug AND l.resolved=1)
    AND NOT EXISTS(SELECT 1 FROM note_links l2 WHERE l2.to_slug=n.slug AND l2.resolved=1)`).get();
  return { total, links, orphans: orphanRow.c };
}

/* ---------------- Gợi ý "kết nối các điểm" ---------------- */
/* Cặp note chung ≥2 tag nhưng CHƯA có liên kết → đề xuất nối (đồ thị dày hơn) */
function suggestConnections(limit = 8) {
  const notes = db.prepare('SELECT slug,title,tags_json FROM notes').all().map(n => ({ ...n, tags: JSON.parse(n.tags_json || '[]') }));
  const linked = new Set(db.prepare('SELECT from_slug,to_slug FROM note_links').all().map(l => l.from_slug + '|' + l.to_slug));
  const out = [];
  for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) {
    const a = notes[i], b = notes[j];
    if (linked.has(a.slug + '|' + b.slug) || linked.has(b.slug + '|' + a.slug)) continue;
    const shared = a.tags.filter(t => b.tags.includes(t));
    if (shared.length >= 2) out.push({ a: { slug: a.slug, title: a.title }, b: { slug: b.slug, title: b.title }, shared });
  }
  return out.sort((x, y) => y.shared.length - x.shared.length).slice(0, limit);
}

/* ============================================================================
   TÍCH HỢP AI — điều làm "hệ thống chạy hiệu quả hơn"
   ============================================================================ */

/* TRUY HỒI: FTS top-k + mở rộng 1 bước theo liên kết → khối ngữ cảnh súc tích cho agent. */
function retrieve(query, { k = 3, hops = 1 } = {}) {
  const fq = ftsQuery(query);
  let seeds = [];
  if (fq) {
    try { seeds = db.prepare(`SELECT n.slug FROM notes_fts f JOIN notes n ON n.rowid=f.rowid WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?`).all(fq, k).map(r => r.slug); }
    catch { seeds = []; }
  }
  if (!seeds.length) return '';
  const picked = new Set(seeds);
  if (hops > 0) {
    for (const s of seeds) {
      for (const e of db.prepare('SELECT to_slug FROM note_links WHERE from_slug=? AND resolved=1').all(s)) picked.add(e.to_slug);
      for (const e of db.prepare('SELECT from_slug FROM note_links WHERE to_slug=?').all(s)) picked.add(e.from_slug);
    }
  }
  const parts = [];
  for (const slug of [...picked].slice(0, k + 4)) {
    const n = getNote(slug);
    if (!n) continue;
    const links = outgoing(slug).map(o => '[[' + o.to_title + ']]').slice(0, 6).join(' ');
    parts.push(`### ${n.title}${links ? ' (liên kết: ' + links + ')' : ''}\n${String(n.body || '').slice(0, 480)}`);
  }
  return parts.length ? '📓 Bộ não thứ 2 (tri thức tích luỹ):\n' + parts.join('\n\n') : '';
}

/* CHƯNG CẤT: sinh 1 note tri thức từ nhiệm vụ/nhiệm vụ hoàn thành, tự nối [[wikilink]] tới
   các thực thể đã biết (sản phẩm, phòng ban, note cùng chủ đề). bodyFn cho phép demo/AI sinh thân. */
function autoLink(body, entities) {
  let out = String(body || '');
  for (const ent of entities) {
    if (!ent || ent.length < 3) continue;
    if (out.includes('[[' + ent + ']]')) continue;
    // chỉ nối lần xuất hiện đầu, không nằm trong wikilink sẵn có
    const re = new RegExp('(?<!\\[\\[)' + ent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\]\\])');
    out = out.replace(re, '[[' + ent + ']]');
  }
  return out;
}

function capture({ title, body, tags, type, source, entities }) {
  try {
    if (!title) return null;
    // chống trùng: nếu đã có note cùng nguồn (source) thì bỏ qua
    if (source) {
      const dup = db.prepare('SELECT slug FROM notes WHERE source=?').get(source);
      if (dup) return null;
    }
    const linkedBody = autoLink(body, entities || []);
    const note = createNote({ title, body: linkedBody, tags, type: type || 'insight', source });
    return note.slug;
  } catch (e) { log('sb capture: ' + e.message); return null; }
}

/* ---------------- Reindex (đồng bộ lại từ file .md — sau khi sửa ngoài/Obsidian) ---------------- */
function reindexFromDisk() {
  let n = 0;
  for (const f of fs.readdirSync(NOTES_DIR).filter(x => x.endsWith('.md'))) {
    const slug = safeSlug(f.replace(/\.md$/, ''));
    if (!slug) continue;
    try {
      const fp = path.join(NOTES_DIR, f);
      let st; try { st = fs.lstatSync(fp); } catch { continue; }
      if (!st.isFile()) continue;   // bỏ symlink/thư mục — chống đọc file ngoài notes dir
      const raw = fs.readFileSync(fp, 'utf8');
      const mm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
      let title = slug, tags = [], type = 'concept', source = 'obsidian', body = raw;
      if (mm) {
        body = raw.slice(mm[0].length);
        const fm = mm[1];
        const t = fm.match(/title:\s*(.+)/); if (t) title = t[1].trim().replace(/^"|"$/g, '');
        const tg = fm.match(/tags:\s*\[(.*)\]/); if (tg) tags = tg[1].split(',').map(s => s.trim()).filter(Boolean);
        const ty = fm.match(/type:\s*(.+)/); if (ty && NOTE_TYPES.includes(ty[1].trim())) type = ty[1].trim();
        const sc = fm.match(/source:\s*(.+)/); if (sc) source = sc[1].trim();
      }
      const exist = db.prepare('SELECT slug FROM notes WHERE slug=?').get(slug);
      const rec = { slug, title, body: body.slice(0, MAX_BODY), tags_json: JSON.stringify(parseTags(tags)), type, source, pinned: 0, created_at: now(), updated_at: now() };
      if (exist) db.prepare('UPDATE notes SET title=@title,body=@body,tags_json=@tags_json,type=@type,updated_at=@updated_at WHERE slug=@slug').run(rec);
      else db.prepare('INSERT INTO notes(slug,title,body,tags_json,type,source,pinned,created_at,updated_at) VALUES(@slug,@title,@body,@tags_json,@type,@source,@pinned,@created_at,@updated_at)').run(rec);
      syncLinks(slug, rec.body);
      n++;
    } catch (e) { log('sb reindex ' + f + ': ' + e.message); }
  }
  db.prepare('UPDATE note_links SET resolved=1 WHERE to_slug IN (SELECT slug FROM notes)').run();
  return n;
}

module.exports = {
  NOTE_TYPES, slugify, safeSlug, parseWikilinks, resolveTarget,
  createNote, updateNote, deleteNote, getNote, noteView, listNotes,
  backlinks, outgoing, graph, stats, suggestConnections,
  retrieve, capture, autoLink, reindexFromDisk, count: () => stats().total
};
