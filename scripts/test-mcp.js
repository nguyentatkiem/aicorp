'use strict';
/* Test MCP Gateway — kết nối doanh nghiệp. Nối một MCP server THẬT (filesystem reference server),
   khám phá tool, gọi tool thật, gán phòng, bảo mật (không lộ khoá), toggle, xoá, lỗi mượt. */
const path = require('path');
const fs = require('fs');
const BASE = 'http://localhost:3939/api';
const H = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3939' };
const get = p => fetch(BASE + p).then(r => r.json());
const getText = p => fetch(BASE + p).then(r => r.text());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }).then(r => r.json());
const del = p => fetch(BASE + p, { method: 'DELETE', headers: H }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, passed = 0;
const check = (n, c, d) => { console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); c ? passed++ : failed++; };
async function waitStatus(id, want, maxSec = 30) {
  for (let i = 0; i < maxSec; i++) {
    const sv = (await get('/mcp')).servers.find(s => s.id === id);
    if (sv && sv.status === want) return sv;
    await sleep(1000);
  }
  return (await get('/mcp')).servers.find(s => s.id === id);
}

(async () => {
  /* 1. Catalog + rỗng ban đầu */
  const ov = await get('/mcp');
  check('Catalog gợi ý có sẵn', Array.isArray(ov.catalog) && ov.catalog.length >= 5, ov.catalog.length + ' preset');
  check('Có preset Filesystem không cần khoá', ov.catalog.some(c => c.key === 'filesystem' && !c.secret));

  /* 2. Thêm MCP server thật (filesystem → /tmp) */
  const add = await post('/mcp/servers', { name: 'Tệp cục bộ TEST', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] });
  check('Thêm server OK (trả id)', add.ok && !!add.id, add.id);
  const id = add.id;

  /* 3. Tự kết nối + khám phá tool */
  const sv = await waitStatus(id, 'connected', 30);
  check('Kết nối được MCP server thật', sv && sv.status === 'connected', sv && sv.status);
  check('Khám phá tool (>0)', sv && sv.tools.length > 0, sv && sv.tools.length + ' tool');
  check('Có tool list_directory', sv && sv.tools.some(t => t.name === 'list_directory'));

  /* 4. Gọi tool THẬT → kết quả thật */
  const call = await post('/mcp/call', { serverId: id, tool: 'list_directory', args: { path: '/tmp' } });
  check('Gọi tool thật trả kết quả', call.ok && call.result && typeof call.result.text === 'string' && call.result.text.length > 0, (call.result && call.result.text || call.error || '').slice(0, 40));

  /* 5. Gán tool ↔ phòng ban */
  await post('/mcp/assign', { serverId: id, tool: 'read_file', deptId: 'vh', on: true });
  const sv2 = (await get('/mcp')).servers.find(s => s.id === id);
  check('Gán tool cho phòng', (sv2.assignments || []).some(a => a.tool_name === 'read_file' && a.dept_id === 'vh'));
  await post('/mcp/assign', { serverId: id, tool: 'read_file', deptId: 'vh', on: false });
  const sv3 = (await get('/mcp')).servers.find(s => s.id === id);
  check('Gỡ gán tool', !(sv3.assignments || []).some(a => a.tool_name === 'read_file' && a.dept_id === 'vh'));

  /* 6. BẢO MẬT: thêm server có token → token KHÔNG lộ, vault quyền 600 */
  const secToken = 'ghp_TESTSECRET_' + Date.now();
  const add2 = await post('/mcp/servers', { name: 'GH TEST', transport: 'stdio', command: 'true', args: [], env: { GITHUB_PERSONAL_ACCESS_TOKEN: secToken } });
  await sleep(500);
  const txt = await getText('/mcp');
  check('Token KHÔNG lộ qua /api/mcp', !txt.includes(secToken));
  const sec = (await get('/mcp')).servers.find(s => s.id === add2.id);
  check('Server báo có khoá (hasSecrets=true)', sec && sec.hasSecrets === true);
  const HOME = process.env.AICORP_HOME || path.join(require('os').homedir(), 'AICORP');
  const vault = path.join(HOME, 'secret', 'mcp', add2.id + '.json');
  let mode600 = false; try { mode600 = (fs.statSync(vault).mode & 0o777) === 0o600; } catch {}
  check('Vault khoá quyền 600', mode600);

  /* 6b. AUDIT (HIGH): path traversal ở :id KHÔNG ghi/xoá file ngoài vault (đè credentials.json) */
  const cred = path.join(HOME, 'secret', 'credentials.json');
  const credBefore = fs.existsSync(cred) ? fs.readFileSync(cred, 'utf8') : '__none__';
  const trav = await fetch(BASE + '/mcp/servers/' + encodeURIComponent('../credentials') + '/secrets',
    { method: 'POST', headers: H, body: JSON.stringify({ env: { anthropic_api_key: 'HACKED_BY_TEST' } }) });
  check('Path traversal /secrets → bị chặn (400)', trav.status === 400, 'HTTP ' + trav.status);
  const credAfter = fs.existsSync(cred) ? fs.readFileSync(cred, 'utf8') : '__none__';
  check('credentials.json KHÔNG bị ghi đè qua traversal', credBefore === credAfter);
  const travDel = await fetch(BASE + '/mcp/servers/' + encodeURIComponent('../credentials'), { method: 'DELETE', headers: H });
  check('Path traversal DELETE → bị chặn (400)', travDel.status === 400, 'HTTP ' + travDel.status);

  /* 6c. AUDIT: ${VAR} giữ bí mật khỏi DB — args lưu placeholder, không lưu giá trị */
  const pg = await post('/mcp/servers', { name: 'PG', transport: 'stdio', command: 'true', args: ['${DB_URL}'], env: { DB_URL: 'postgresql://u:SECRETPASS@h/db' } });
  const pgTxt = await getText('/mcp');
  check('Giá trị ${VAR} KHÔNG lộ qua /api/mcp', !pgTxt.includes('SECRETPASS'));
  const pgSv = (await get('/mcp')).servers.find(s => s.id === pg.id);
  check('args giữ nguyên placeholder ${DB_URL}', pgSv && pgSv.args.includes('${DB_URL}'));
  await del('/mcp/servers/' + pg.id);

  /* 7. Lỗi mượt: lệnh sai → status error, KHÔNG crash server */
  const bad = await post('/mcp/servers', { name: 'BAD', transport: 'stdio', command: 'khong_ton_tai_binary_xyz', args: [] });
  const badSv = await waitStatus(bad.id, 'error', 12);
  check('Lệnh sai → status error (không sập server)', badSv && badSv.status === 'error', badSv && (badSv.error || '').slice(0, 40));
  check('Server vẫn sống sau lỗi', (await get('/mcp')).servers.length >= 3);

  /* 8. Toggle tắt → ngắt kết nối */
  const tg = await post(`/mcp/servers/${id}/toggle`, {});
  check('Toggle tắt', tg.enabled === false);
  const offSv = (await get('/mcp')).servers.find(s => s.id === id);
  check('Tắt → không còn connected', offSv.status !== 'connected', offSv.status);

  /* 9. Gọi tool khi đã tắt vẫn xử lý (tự nối lại) hoặc báo lỗi mượt — không crash */
  const callOff = await post('/mcp/call', { serverId: id, tool: 'list_directory', args: { path: '/tmp' } });
  check('Gọi tool sau khi tắt → có phản hồi (không treo)', typeof callOff.ok === 'boolean');

  /* 10. Xoá sạch (server + vault) */
  await post(`/mcp/servers/${id}/toggle`, {}); // bật lại rồi xoá
  await del('/mcp/servers/' + id);
  await del('/mcp/servers/' + add2.id);
  await del('/mcp/servers/' + bad.id);
  const gone = (await get('/mcp')).servers.filter(s => [id, add2.id, bad.id].includes(s.id)).length;
  check('Xoá server sạch', gone === 0);
  check('Vault khoá bị xoá theo', !fs.existsSync(vault));

  console.log(`\n${failed === 0 ? '🎉 MCP PASSED' : '💥 MCP FAILED'} (${passed} passed${failed ? ', ' + failed + ' failed' : ''})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('💥', e); process.exit(1); });
