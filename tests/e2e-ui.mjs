// ทดสอบหน้าเว็บจริงใน Chrome แบบคนกด: กดเพศ การฟอกไต กรอกช่อง เลือกยา กรอกขนาด เลือกตัวเลือก แก้ขนาด
// แล้วอ่านขนาดที่แนะนำ ป้ายเทียบคำสั่ง และข้อความ note บนจอ เทียบกับตัวคำนวณที่โหลดแยกใน Node
// และตรวจว่าไม่มีอะไรล้นจอที่ความกว้าง 300 ถึง 1280 px ถ่ายภาพจอไว้ที่ tmp/shots/
// ใช้: node tests/e2e-ui.mjs [จำนวนโจทย์สุ่ม=300]   (ต้องมี Google Chrome ที่ตำแหน่งปกติของ macOS)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEngine, SAFE, BAD } from './run-engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const url = process.env.E2E_URL || pathToFileURL(join(root, 'index.html')).href;
const shots = join(root, 'tmp', 'shots'); mkdirSync(shots, { recursive: true });
const E = loadEngine();
const N = Number(process.argv[2] || 300);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'renal-e2e-'))}`,
  '--disable-gpu', '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 60; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const p = l.find(t => t.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch { /* starting */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}
const ws = new WebSocket(await target());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0; const waiting = new Map(); const pageErrors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(m.params.args.map(a => a.value).join(' '));
});
const send = (method, params = {}) => new Promise(res => { const id = ++seq; waiting.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
  return r.result.result.value;
};
await send('Runtime.enable');
await send('Page.enable');
async function load(width = 1280, height = 900, query = '') {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  await send('Page.navigate', { url: url + query });
  for (let i = 0; i < 50; i++) { if (await ev('document.readyState') === 'complete') break; await sleep(100); }
  await ev('document.fonts.ready.then(() => true)');
  await ev(H);
}
async function shot(name, width) {
  const h = await ev('Math.ceil(document.documentElement.scrollHeight)');
  await send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 7000), deviceScaleFactor: 1, mobile: width < 700 });
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(shots, name), Buffer.from(r.result.data, 'base64'));
}

// ตัวช่วยที่รันในหน้า: ทำแบบคนกด (คลิกปุ่ม พิมพ์ช่องแล้วยิง input change)
const H = String.raw`
  window.__t = {
    click(sel) { const el = document.querySelector(sel); if (!el) throw new Error('ไม่เจอ ' + sel); el.click(); },
    type(sel, v) { const el = document.querySelector(sel); if (!el) throw new Error('ไม่เจอ ' + sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
    pick(sel, v) { const el = document.querySelector(sel); if (!el) throw new Error('ไม่เจอ ' + sel); el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); },
    radio(card, key, v) { const el = document.querySelector('[data-card="' + card + '"] input[data-choice="' + key + '"][value="' + v + '"]'); if (!el) return false; el.click(); return true; },
    read(card) {
      const c = document.querySelector('[data-card="' + card + '"]');
      const q = s => c.querySelector(s);
      return {
        rec: q('.rmain') ? q('.rmain').dataset.full : null,
        verdict: q('.verdict') ? q('.verdict').className.replace('verdict', '').trim() : null,
        flags: [...c.querySelectorAll('.flag')].map(f => f.className.replace('flag', '').trim()),
        nodata: !!q('.verdict.nodata'),
        choices: [...c.querySelectorAll('[data-choice]:checked')].map(i => i.dataset.choice + '=' + i.value).sort(),
        note: document.querySelector('#noteCard').hidden ? null : document.querySelector('#note').textContent,
        assess: document.querySelector('#assessDate').value, scrDate: document.querySelector('#scrDate').value,
        crclShown: document.querySelector('.kbig b') ? document.querySelector('.kbig b').textContent : null,
      };
    },
  }; true`;

// โจทย์สุ่ม (ค่าที่คำนวณได้ทั้งหมด)
let s = 20261108; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];
const step = (lo, hi, st) => Math.round((lo + Math.floor(rnd() * ((hi - lo) / st + 1)) * st) * 1000) / 1000;
const DR = Object.keys(E.DRUGS);
function makeCase(i) {
  const dial = pick(['none', 'none', 'none', 'HD', 'CAPD', 'APD']);
  const drug = DR[i % DR.length];
  const std = E.DRUGS[drug].std;
  const u = pick(std);
  const ordD = drug === 'acyclovir' ? step(150, 1200, 50) : pick([u[0], u[0], drug.startsWith('amoxclav') ? 875 : 2000, 500]);
  return {
    p: { sex: pick(['M', 'F']), age: step(18, 99, 1), weight: step(30, 180, 0.1), height: step(140, 195, 1), scr: step(0.4, 9, 0.01), dial },
    item: { drug, usual: { d: u[0], q: u[1] }, ordered: { d: ordD, q: pick([u[1], 8, 12, 24]) }, sel: {}, edit: null, severe: null, liver: rnd() < 0.3 },
    choose: rnd() < 0.5, edit: rnd() < 0.15 ? { d: step(100, 1500, 50), q: pick([12, 24]) } : null,
  };
}

let checked = 0, bad = 0;
const stat = { note: 0, rec: 0, nodata: 0, choice: 0, alt: 0, edit: 0, dial: {} };
const fail = (msg, extra) => { bad++; if (bad <= 15) console.log('ไม่ตรง', msg, extra ? JSON.stringify(extra) : ''); };
await load(1280);
for (let i = 0; i < N; i++) {
  const c = makeCase(i);
  await load(1280);
  const card = await ev('Number(document.querySelector("[data-card]").dataset.card)');
  await ev(`__t.click('button[data-sex="${c.p.sex}"]')`);
  await ev(`__t.click('button[data-dial="${c.p.dial}"]')`);
  await ev(`__t.type('#age', '${c.p.age}')`); await ev(`__t.type('#height', '${c.p.height}')`); await ev(`__t.type('#weight', '${c.p.weight}')`);
  if (c.p.dial === 'none') await ev(`__t.type('#scr', '${c.p.scr}')`);
  await ev(`__t.pick('[data-card="${card}"] [data-f="drug"]', '${c.item.drug}')`);
  if (c.item.drug !== 'ceftriaxone') c.item.liver = false; // ช่องตับมีเฉพาะการ์ด ceftriaxone
  if (c.item.liver) await ev(`__t.click('[data-card="${card}"] [data-f="liver"]')`);
  await ev(`__t.type('[data-card="${card}"] [data-f="ud"]', '${c.item.usual.d}')`);
  await ev(`__t.pick('[data-card="${card}"] [data-f="uq"]', '${c.item.usual.q}')`);
  await ev(`__t.type('[data-card="${card}"] [data-f="od"]', '${c.item.ordered.d}')`);
  await ev(`__t.pick('[data-card="${card}"] [data-f="oq"]', '${c.item.ordered.q}')`);
  // ผลจากตัวคำนวณ ตัวเลือกแนะนำก่อน แล้วสลับตัวเลือกที่ไม่แนะนำถ้าสุ่มได้
  const p = Object.assign({}, c.p, { scr: c.p.dial === 'none' ? c.p.scr : NaN });
  const k = E.kidney(p);
  if (!k.ok) { fail('คำนวณค่าไตไม่ได้ทั้งที่ค่าอยู่ในช่วง', c); continue; }
  let res = E.drugRec(c.item, k);
  if (c.choose && res.choices.length) {
    for (const ch of res.choices) {
      const alt = ch.opts.find(o => !o.rec);
      if (alt && await ev(`__t.radio(${card}, '${ch.key}', '${alt.v}')`)) c.item.sel[ch.key] = alt.v;
    }
    res = E.drugRec(c.item, k);
  }
  if (c.edit && res.reg && !res.nodata) {
    await ev(`document.querySelector('[data-card="${card}"] details[data-edit]').open = true`);
    if (res.reg.q !== null) await ev(`__t.pick('[data-card="${card}"] [data-f="eq"]', '${c.edit.q}')`);
    await ev(`__t.type('[data-card="${card}"] [data-f="ed"]', '${c.edit.d}')`);
    c.item.edit = { d: c.edit.d, q: res.reg.q === null ? null : c.edit.q };
    res = E.drugRec(c.item, k);
  }
  const got = await ev(`__t.read(${card})`);
  checked++;
  stat.note += got.note ? 1 : 0; stat.rec += got.rec ? 1 : 0; stat.nodata += got.nodata ? 1 : 0;
  stat.choice += got.choices.length ? 1 : 0; stat.alt += Object.keys(c.item.sel).length ? 1 : 0; stat.edit += c.item.edit ? 1 : 0;
  stat.dial[c.p.dial] = (stat.dial[c.p.dial] || 0) + 1;
  const P2 = Object.assign({}, p, { assessDate: got.assess, scrDate: got.scrDate });
  const wantNote = E.buildNote(P2, k, [{ item: c.item, res }]);
  if (k.dial === 'none' && got.crclShown !== k.crcl.toFixed(1)) fail('CrCl บนจอ', { case: c, got: got.crclShown, want: k.crcl });
  if (res.nodata) { if (!got.nodata) fail('ควรขึ้นยังไม่รองรับ', c); }
  else if (got.rec !== E.regText(c.item.drug, res.reg)) fail('ขนาดที่แนะนำบนจอ', { case: c, got: got.rec, want: E.regText(c.item.drug, res.reg) });
  if (got.note !== wantNote) fail('note', { case: c, got: got.note, want: wantNote });
  if (got.note && (!SAFE.test(got.note) || BAD.test(got.note))) fail('note มีอักษรต้องห้ามหรือคำว่า undefined NaN', got.note);
  const wantVerdict = res.nodata ? 'nodata' : res.status;
  if (got.verdict !== wantVerdict) fail('แถบสรุปผล', { case: c, got: got.verdict, want: wantVerdict });
  const wantFlags = res.flags.map(f => f.color);
  if (JSON.stringify(got.flags) !== JSON.stringify(wantFlags)) fail('ป้ายเตือน', { case: c, got: got.flags, want: wantFlags });
  const wantChoices = res.choices.map(ch => `${ch.key}=${ch.value}`).sort();
  if (JSON.stringify(got.choices) !== JSON.stringify(wantChoices)) fail('ตัวเลือก', { case: c, got: got.choices, want: wantChoices });
}
console.log(`กดหน้าเว็บ ${checked} โจทย์ ไม่ตรง ${bad}`);
console.log(`อ่านได้จริง: note ${stat.note} ขนาดที่แนะนำ ${stat.rec} ยังไม่รองรับ ${stat.nodata} มีตัวเลือก ${stat.choice} กดตัวเลือกที่ไม่แนะนำ ${stat.alt} แก้ขนาด ${stat.edit} การฟอก ${JSON.stringify(stat.dial)}`);
if (stat.note < checked || stat.rec + stat.nodata < checked) { bad++; console.log('มีโจทย์ที่อ่านผลบนจอไม่ได้ ถือว่าล้ม'); }

// ล้นจอ: ทุกความกว้าง ทั้งตัวอย่างไม่ฟอก และ HD ที่มีตัวเลือก
let overflow = 0;
for (const width of [300, 320, 360, 390, 430, 768, 1024, 1280]) {
  for (const q of ['?example=1', '?example=1&hd']) {
    await load(width, 900, q.split('&')[0]);
    if (q.includes('hd')) { await ev(`__t.click('button[data-dial="HD"]')`); await ev(`__t.type('#weight', '76.8')`); }
    const r = await ev(`(() => {
      const W = document.documentElement.clientWidth, out = [];
      if (document.documentElement.scrollWidth > W) out.push('หน้ากว้างเกินจอ ' + document.documentElement.scrollWidth);
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width && (b.right > W + 0.5 || b.left < -0.5)) out.push((el.id || el.className || el.tagName) + ' ล้นขวา ' + Math.round(b.right));
        if ((el.matches('input, select, .rmain, .kbig b, .note') ) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'auto') out.push((el.id || el.className) + ' ตัวหนังสือโดนตัด');
      }
      return out.slice(0, 5);
    })()`);
    if (r.length) { overflow++; console.log(`ล้นจอ ${width}px ${q}`, r); }
    if ([390, 1280].includes(width)) await shot(`${q.includes('hd') ? 'hd' : 'example'}-${width}.png`, width);
  }
}
console.log(`ตรวจล้นจอ 8 ความกว้าง x 2 หน้า เจอ ${overflow}`);
if (pageErrors.length) console.log('error ในหน้า', pageErrors.slice(0, 5));
chrome.kill();
const ok = !bad && !overflow && !pageErrors.length && checked === N;
console.log(ok ? 'ผ่าน' : 'ล้ม');
process.exit(ok ? 0 : 1);
