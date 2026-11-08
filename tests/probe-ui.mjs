// ตรวจการใช้งานบนหน้าจริง (ทีมตรวจ ค): ปุ่มเล็กกว่า 40 px, ตัวหนังสือไทยเล็กกว่า 13 px, ช่องกรอกไม่มีป้าย, ลำดับหัวข้อ, ความต่างสีตัวหนังสือ
// ใช้: node tests/probe-ui.mjs   ตรวจ 2 หน้า (ตัวอย่างไม่ฟอก และ HD ที่มีตัวเลือก) ที่จอ 320 390 1280 px
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.E2E_URL || pathToFileURL(join(here, '..', 'index.html')).href;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'renal-probe-'))}`, '--disable-gpu', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = l.find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* starting */ } await sleep(200); }
const ws = new WebSocket(wsUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };

const PROBE = String.raw`(() => {
  const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const bg = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !c.startsWith('rgba(0, 0, 0, 0)') && c !== 'transparent') return c; } return 'rgb(255,255,255)'; };
  const out = { small: [], thaiTiny: [], unlabeled: [], contrast: [], headings: [] };
  const vis = el => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden'; };
  for (const el of document.querySelectorAll('button, input, select, summary, label.opt, a')) {
    if (!vis(el)) continue;
    if (el.matches('input[type=checkbox], input[type=radio]')) { const lab = el.closest('label'); if (lab && lab.getBoundingClientRect().height >= 40) continue; }
    const b = el.getBoundingClientRect();
    if (b.height < 40 || (el.matches('button') && b.width < 40)) out.small.push((el.id || el.dataset.std || el.className || el.tagName) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height));
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim(); if (!t || !n.parentElement || !vis(n.parentElement)) continue;
    const s = getComputedStyle(n.parentElement), fs = parseFloat(s.fontSize);
    if (/[฀-๿]/.test(t) && fs < 13) out.thaiTiny.push(fs + 'px ' + t.slice(0, 30));
    const L1 = lum(s.color), L2 = lum(bg(n.parentElement)), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (cr < 4.5) out.contrast.push(cr.toFixed(2) + ' ' + t.slice(0, 30));
  }
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select')) {
    if (!vis(el)) continue;
    const ok = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector('label[for="' + el.id + '"]')) || el.closest('label');
    if (!ok) out.unlabeled.push(el.id || el.dataset.f);
  }
  let last = 0; for (const h of document.querySelectorAll('h1, h2, h3')) { const lv = Number(h.tagName[1]); if (lv > last + 1) out.headings.push('ข้าม ' + h.tagName + ' ' + h.textContent.slice(0, 20)); last = lv; }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
})()`;

let total = 0;
for (const width of [320, 390, 1280]) {
  for (const hd of [false, true]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 });
    await send('Page.navigate', { url: url + '?example=1' });
    for (let i = 0; i < 50; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(100); }
    await ev('document.fonts.ready.then(() => true)');
    if (hd) await ev(`(() => { document.querySelector('button[data-dial="HD"]').click(); const w = document.querySelector('#weight'); w.value = '76.8'; w.dispatchEvent(new Event('input', { bubbles: true })); document.querySelectorAll('details.edit').forEach(d => d.open = true); return true; })()`);
    const r = await ev(PROBE);
    const n = Object.values(r).reduce((a, b) => a + b.length, 0); total += n;
    console.log(`จอ ${width}px ${hd ? 'HD' : 'ไม่ฟอก'}: ${n ? JSON.stringify(r) : 'ไม่เจอ'}`);
  }
}
chrome.kill();
console.log(total ? `เจอ ${total} จุด` : 'ผ่าน ไม่เจอจุดที่ต้องแก้');
process.exit(total ? 1 : 0);
