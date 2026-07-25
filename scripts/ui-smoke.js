'use strict';
/* UI smoke test bằng Chrome headless: onboarding wizard → sơ đồ sống → giao việc → xem các màn.
   Chạy khi server đang chạy trên AICORP_HOME SẠCH (chưa onboard) hoặc đã onboard đều được. */
const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR = process.env.SHOT_DIR || '/tmp';
let failed = 0;
const check = (name, cond, detail) => { console.log(`${cond ? '✅' : '❌'} UI: ${name}${detail ? ' — ' + detail : ''}`); if (!cond) failed++; };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1500,950'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });

  await page.goto('http://localhost:3939', { waitUntil: 'networkidle2', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500));

  const wizardShown = await page.$eval('#wizardwrap', el => el.classList.contains('show')).catch(() => false);
  if (wizardShown) {
    console.log('→ Chưa onboard: chạy wizard 7 bước bằng dữ liệu mẫu');
    await page.click('#wnext'); // B1 demo mặc định
    await new Promise(r => setTimeout(r, 400));
    await page.click('#samplebtn'); // B2 điền mẫu
    await new Promise(r => setTimeout(r, 400));
    for (let i = 0; i < 6; i++) { // B2→B7
      await page.click('#wnext');
      await new Promise(r => setTimeout(r, 500));
    }
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
  }

  /* Sơ đồ sống */
  const nodeCount = await page.$$eval('.node', ns => ns.length);
  check('Sơ đồ sống dựng node agent', nodeCount >= 10, nodeCount + ' node');
  const deptCount = await page.$$eval('.dept', ds => ds.length);
  check('Khung phòng ban', deptCount >= 3, deptCount + ' phòng');
  await page.screenshot({ path: path.join(SHOT_DIR, 'ui-01-so-do-song.png') });

  /* Giao việc qua chat */
  await page.type('#ceoinput', 'Viết 3 bài Facebook giới thiệu sản phẩm chủ lực');
  await page.click('#modeGo');
  await page.click('#sendbtn');
  await new Promise(r => setTimeout(r, 12000));
  const msgs = await page.$$eval('#msgs .msg', ms => ms.length);
  check('Chat CEO↔COO có hội thoại', msgs >= 2, msgs + ' tin');
  const working = await page.$$eval('.node.st-work,.node.st-think,.node.st-review', ns => ns.length).catch(() => 0);
  const missionBar = await page.$eval('#missionbar', el => el.style.display !== 'none').catch(() => false);
  check('Công ty đang chạy nhiệm vụ (node sáng hoặc mission bar)', working >= 1 || missionBar, `${working} node hoạt động`);
  await page.screenshot({ path: path.join(SHOT_DIR, 'ui-02-dang-chay.png') });

  /* Các màn hình khác */
  for (const [screen, sel, minEl] of [
    ['factory', '#factorytbl', 1], ['approvals', '#approvallist', 1], ['hr', '#hrtbl table', 1],
    ['brain', '#dnabody .stat-row', 3], ['connect', '#connlist .setrow', 3], ['settings', '#set_engine', 1]
  ]) {
    await page.click(`[data-screen="${screen}"]`);
    await new Promise(r => setTimeout(r, 1200));
    const n = await page.$$eval(sel, els => els.length).catch(() => 0);
    check(`Màn "${screen}" render`, n >= minEl, `${n} phần tử`);
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'ui-03-man-cuoi.png') });

  /* War Room + timeline */
  await page.click('[data-screen="home"]');
  await new Promise(r => setTimeout(r, 800));
  await page.click('[data-tab="kanban"]');
  await new Promise(r => setTimeout(r, 800));
  const kcols = await page.$$eval('.kcol', ks => ks.length);
  check('War Room 5 cột', kcols === 5, kcols + ' cột');

  check('Không có lỗi JS trên trang', errors.length === 0, errors.slice(0, 3).join(' | ').slice(0, 200));
  await browser.close();
  console.log(failed ? `💥 UI smoke: ${failed} FAILED` : '🎉 UI smoke PASSED');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('💥 UI smoke crash:', e.message); process.exit(1); });
