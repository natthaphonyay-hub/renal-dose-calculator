// ถ่ายรูปหน้าจอสำหรับคู่มือ manual/img/ จากหน้าเว็บในเครื่อง (จอมือถือ 390 px ความละเอียด 2 เท่า)
// ใช้: node tests/make-manual-shots.mjs   แก้หน้าตาแอปแล้วรันใหม่ แล้วสร้าง PDF ด้วย tests/make-manual-pdf.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'manual', 'img'); mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(root, 'index.html')).href;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'renal-shots-'))}`, '--disable-gpu', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } await sleep(200); }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const wait = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; wait.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || x);
  return r.result.result.value;
};
const W = 390;
await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 2, mobile: true });
const H = String.raw`window.__t = {
  click(s) { document.querySelector(s).click(); },
  type(s, v) { const el = document.querySelector(s); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
  pick(s, v) { const el = document.querySelector(s); el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); },
}; true`;
async function fresh(q = '') {
  await send('Page.navigate', { url: url + q });
  for (let i = 0; i < 50; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(100); }
  await ev('document.fonts.ready.then(() => true)');
  await ev(H);
}
// ถ่ายเฉพาะส่วนของจอ ระหว่างขอบบนของ topSel ถึงขอบล่างของ bottomSel (ไม่ใส่ bottomSel = ทั้งชิ้น)
async function shot(name, topSel, bottomSel, pad = 8) {
  const box = await ev(`(() => {
    const a = document.querySelector(${JSON.stringify(topSel)}), b = document.querySelector(${JSON.stringify(bottomSel || topSel)});
    a.scrollIntoView({ block: 'start' });
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return { y: ra.top + scrollY, h: rb.bottom - ra.top };
  })()`);
  const h = await ev('Math.ceil(document.documentElement.scrollHeight)');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.min(h, 6000), deviceScaleFactor: 2, mobile: true });
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: Math.max(0, box.y - pad), width: W, height: box.h + pad * 2, scale: 1 } });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 2, mobile: true });
  writeFileSync(join(out, name), Buffer.from(r.result.data, 'base64'));
  console.log('ถ่าย', name);
}
const card = n => `[data-card]:nth-of-type(${n})`;

// 1 ถึง 5 ตัวอย่างผู้ป่วยไม่ฟอก (cefazolin กับ acyclovir)
await fresh('?example=1');
await shot('s01-patient.png', 'main > .card:nth-of-type(1)');
await shot('s02-kidney.png', '#kCard');
await shot('s03-drug-input.png', `${card(1)} .band`, `${card(1)} details[data-usual]`);
await shot('s04-drug-result.png', `${card(1)} [data-result] .verdict`, `${card(1)} [data-result] .basis`);
await shot('s05-note.png', '#noteCard');

// 6 ค่าไตตกช่องว่าง ceftazidime CrCl 30.6 (ชาย 65 ปี 44 kg 168 cm SCr 1.5)
await fresh();
await ev(`__t.click('button[data-sex="M"]')`);
await ev(`__t.type('#age', '65')`); await ev(`__t.type('#height', '168')`); await ev(`__t.type('#weight', '44')`); await ev(`__t.type('#scr', '1.5')`);
await ev(`__t.pick('[data-card] [data-f="drug"]', 'ceftazidime')`);
await ev(`__t.type('[data-card] [data-f="od"]', '1000')`);
await shot('s06-boundary.png', '[data-card] [data-result] .verdict', '[data-card] [data-result] .basis');

// 7 ผู้ป่วยฟอกเลือด cefazolin น้ำหนักหลังฟอก 70 kg (IDSA 1,500 mg ต่างจาก Fogel 1,000 mg)
await fresh();
await ev(`__t.click('button[data-sex="M"]')`); await ev(`__t.click('button[data-dial="HD"]')`);
await ev(`__t.type('#age', '60')`); await ev(`__t.type('#height', '165')`); await ev(`__t.type('#weight', '70')`);
await ev(`__t.type('[data-card] [data-f="od"]', '1000')`);
await shot('s07-hd.png', '[data-card] [data-result] .verdict', '[data-card] [data-result] .basis');

// 8 ปุ่มล้างข้อมูลตอนกดครั้งแรก
await fresh('?example=1');
await ev(`__t.click('#clear')`);
await shot('s08-clear.png', '.tools-row');

ws.close(); chrome.kill();
