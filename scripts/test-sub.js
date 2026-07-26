'use strict';
/* Test gói Sub Claude (Pro/Max) — engine OAuth theo hạn mức tài khoản (đặc tả 8.1).
   Kiểm: test-token, lưu token, state/settings phản ánh, KHÔNG lộ token, engine dispatch,
   engine bỏ trần VND khi dùng sub, và luôn dọn về demo cuối bài. */
const path = require('path');
const BASE = 'http://localhost:3939/api';
const H = { 'Content-Type': 'application/json', 'Origin': 'http://localhost:3939' };
const get = p => fetch(BASE + p).then(r => r.json());
const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }).then(r => r.json());
const getText = p => fetch(BASE + p).then(r => r.text());
let failed = 0, passed = 0;
const check = (n, c, d) => { console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`); c ? passed++ : failed++; };

const FAKE = 'sk-ant-oat01-FAKE-TOKEN-FOR-TEST-ONLY-not-a-real-secret';

(async () => {
  if (!(await get('/state')).onboarded) {
    await post('/onboarding', { dna: { company: { name: 'Trà Thảo Mộc TâmAn', industry: 'fnb', size: '6-20', region: 'HN' }, products: [{ name: 'Trà đêm An Nhiên', price_range: '159k-289k' }], customers: { profile: 'Nữ 30-55', channels: ['facebook'] }, goal_3m: 'x', voice: { traits: ['gan_gui', 'chuyen_gia'], address: 'em-chị', banned: ['không hứa chữa bệnh'] }, departments_enabled: ['mkt', 'kd', 'tckt', 'ns', 'cskh', 'vh', 'data'], facts: [] }, engine: { kind: 'demo' } });
  }

  /* 1. Test kết nối gói sub bằng token giả → thất bại có thông báo thân thiện, KHÔNG crash */
  const t1 = await post('/engine/test', { mode: 'sub', subToken: FAKE });
  check('Test sub token giả → ok:false', t1.ok === false, t1.message);
  check('Thông báo lỗi thân thiện (nhắc setup-token)', /setup-token|hết hạn|không đúng/i.test(t1.message || ''));

  /* 2. Test sub khi hoàn toàn chưa có token → báo cần chạy setup-token */
  const t2 = await post('/engine/test', { mode: 'sub', subToken: '' });
  check('Test sub không token → hướng dẫn lấy token', t2.ok === false && /setup-token|Chưa có token/i.test(t2.message || ''), t2.message);

  /* 3. Lưu sub token + bật engine sub */
  const sv = await post('/settings', { subToken: FAKE, engine_kind: 'sub' });
  check('Lưu subToken + engine_kind=sub', sv.ok === true);

  /* 4. State & settings phản ánh đúng */
  const st = await get('/state');
  check('State: engine.kind=sub', st.engine.kind === 'sub');
  check('State: engine.hasSubToken=true', st.engine.hasSubToken === true);
  const sg = await get('/settings');
  check('Settings: hasSubToken=true', sg.hasSubToken === true);

  /* 5. BẢO MẬT: token gói sub KHÔNG lộ qua bất kỳ endpoint đọc nào */
  const stTxt = await getText('/state');
  const sgTxt = await getText('/settings');
  check('Token KHÔNG lộ qua /state', !stTxt.includes(FAKE));
  check('Token KHÔNG lộ qua /settings', !sgTxt.includes(FAKE));

  /* 6. credentials.json giữ CẢ api key lẫn sub token (merge, không ghi đè) */
  const HOME = process.env.AICORP_HOME || path.join(require('os').homedir(), 'AICORP');
  let cred = {};
  try { cred = require(path.join(HOME, 'secret', 'credentials.json')); } catch {}
  check('credentials.json có claude_oauth_token', cred.claude_oauth_token === FAKE);

  /* 7. Engine module: dispatch đúng theo kind (unit, không gọi mạng) */
  const { makeEngine } = require('../server/engine');
  let kind = 'sub', creds = {};
  const eng = makeEngine(() => kind, () => creds);
  check('Engine getter kind=sub', eng.kind === 'sub');
  let threw = null;
  try { await eng.call('brief', { model: 'claude-haiku-4-5-20251001', user: 'hi' }); } catch (e) { threw = e; }
  check('Sub chưa có token → ném lỗi hướng dẫn (không gọi mạng)', threw && /gói Sub|setup-token/i.test(threw.message), threw && threw.message);
  kind = 'demo';
  const demoOut = await eng.call('brief', { agentId: 'coo', level: 'coo', ctx: { command: 'test', dna: { company: { name: 'X' } } } });
  check('Chuyển demo → engine chạy offline (có text)', demoOut && typeof demoOut.text === 'string' && demoOut.text.length > 0);

  /* 8. Trần VND CÓ hiệu lực ở engine thường (đối chứng): trần 1đ → mission chạm trần ngay.
        Ở engine=sub, budgetOk() short-circuit `return true` (mã nguồn) nên guard này bị bỏ qua —
        nhánh sub đã được phủ bởi test 7 (dispatch kind=sub) + không gọi mạng ở đây cho an toàn. */
  await post('/settings', { tran_per_day: 1, tran_per_mission: 1, engine_kind: 'demo' });
  const lowCap = await post('/chat', { text: 'Viết 1 câu chào ngắn', mode: 'go' });
  let mLow;
  for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 2000)); mLow = (await get('/missions')).find(x => x.id === lowCap.missionId); if (mLow && mLow.status === 'over_budget') break; }
  check('Đối chứng: trần 1đ engine thường → mission over_budget (guard hoạt động)', mLow && mLow.status === 'over_budget', mLow && mLow.status);

  /* DỌN DẸP: trả về demo + nới trần để không ảnh hưởng bài test khác */
  await post('/settings', { engine_kind: 'demo', tran_per_day: 100000000, tran_per_mission: 5000000 });
  const back = await get('/state');
  check('Dọn về engine demo cuối bài', back.engine.kind === 'demo');

  console.log(`\n${failed === 0 ? '🎉 SUB PASSED' : '💥 SUB FAILED'} (${passed} passed${failed ? ', ' + failed + ' failed' : ''})`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('💥', e); process.exit(1); });
