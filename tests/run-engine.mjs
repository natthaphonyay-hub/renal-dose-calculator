// โหลดตัวคำนวณจาก index.html (บล็อก DATA กับ CALC) มาใช้ใน Node
// ใช้: import { loadEngine } from './run-engine.mjs'  หรือ  node tests/run-engine.mjs <scenarios.json>  (fuzz.py เรียกแบบนี้)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export function loadEngine() {
  const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
  const block = (a, b) => {
    const i = html.indexOf(a), j = html.indexOf(b);
    if (i < 0 || j < 0) throw new Error(`missing block ${a}`);
    return html.slice(i, j);
  };
  return new Function(`${block('// DATA-START', '// DATA-END')}\n${block('// CALC-START', '// CALC-END')}
return { kidney, classify, drugRec, compare, statusText, regText, buildNote, doseStr, thDate, r1, roundTo, ibw,
  DRUGS, ROWS, INTERVALS, FIVE_DAILY, intervalsOf, qTxt, CEFTAZIDIME_TABLE, ACYCLOVIR_TABLE, ACYCLOVIR_PO_TABLE, EDIT_MARK };`)();
}

export const SAFE = /^[\n\x20-\x7E฀-๿]*$/;
export const BAD = /undefined|NaN|Infinity|null|\[object/;

// สรุปผลยาหนึ่งตัวเป็นข้อมูลล้วน ไว้เทียบกับตัวคำนวณแยก
export function summarize(res) {
  if (!res.ok) return { ok: false };
  const r = res.reg;
  return {
    ok: true, nodata: res.nodata,
    dose: r ? r.dose : null, q: r ? r.q : null, load: r ? r.load : null, hd: r ? r.hd : null,
    status: res.status, choices: res.choices.map(c => [c.key, c.value, c.opts.map(o => o.v)]),
    flags: res.flags.map(f => f.color), cautions: res.cautions.length,
  };
}

// รันชุดโจทย์: [{ p:{sex,age,weight,height,scr,dial}, item:{drug,usual,ordered,sel,severe,liver} }]
export function runScenarios(api, list) {
  return list.map(s => {
    if (s.kind === 'classify') { const c = api.classify(s.x, api.ROWS[s.rows]); return { c: [c.kind, c.rows.map(r => r.id)] }; }
    const k = api.kidney(s.p);
    if (!k.ok) return { k: { ok: false, unsupported: !!k.unsupported } };
    const kk = { ok: true, crcl: k.crcl, crclNorm: k.crclNorm ?? null, key: k.key, obese: k.obese };
    if (!s.item) return { k: kk };
    const res = api.drugRec(s.item, k);
    return { k: kk, r: summarize(res) };
  });
}

if (process.argv[1] && process.argv[1].endsWith('run-engine.mjs') && process.argv[2]) {
  const api = loadEngine();
  const list = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(JSON.stringify(runScenarios(api, list)));
}
