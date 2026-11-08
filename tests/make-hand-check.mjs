// สร้างตารางตรวจมือ docs/ตารางตรวจมือ-การคำนวณ.md ให้เภสัชกดเครื่องคิดเลขตามได้ทีละขั้น ตัวเลขทุกตัวมาจากตัวคำนวณในหน้าเว็บ
// ใช้: node tests/make-hand-check.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './run-engine.mjs';

const E = loadEngine();
const here = dirname(fileURLToPath(import.meta.url));
const f = (x, n = 2) => Number(x).toFixed(n);
const P = (sex, age, weight, height, scr, dial = 'none') => ({ sex, age, weight, height, scr, dial, assessDate: '2026-11-08', scrDate: '2026-11-08' });
const it = (drug, ud, uq, od, oq, extra = {}) => Object.assign({ drug, usual: { d: ud, q: uq }, ordered: { d: od, q: oq }, sel: {}, edit: null, severe: null, liver: false }, extra);

const L = ['# ตารางตรวจมือ การคำนวณ Renal Dose Calculator', '',
  '> สร้างด้วย `node tests/make-hand-check.mjs` ตัวเลขมาจากตัวคำนวณในหน้าเว็บ ไว้ให้เภสัชกดเครื่องคิดเลขตามทีละขั้น ถ้าได้ไม่ตรงแม้ตัวเดียว แจ้งบรร',
  '> ปัดทศนิยม 1 ตำแหน่งแบบครึ่งขึ้น ค่าที่ปัดแล้วคือค่าที่ใช้จัดแถว ไม่ปัด SCr', ''];

function kidneyBlock(title, p) {
  const k = E.kidney(p);
  const inch = p.height / 2.54;
  L.push(`## ${title}`, '', `ข้อมูล: ${p.sex === 'M' ? 'ชาย' : 'หญิง'} อายุ ${p.age} ปี น้ำหนัก ${p.weight} kg ส่วนสูง ${p.height} cm${p.dial === 'none' ? ` SCr ${p.scr} mg/dL` : ` ${p.dial}`}`, '');
  L.push('| ขั้น | กดเครื่องคิดเลข | ได้ |', '|---|---|---|');
  L.push(`| ส่วนสูงเป็นนิ้ว | ${p.height} / 2.54 | ${f(inch, 4)} |`);
  L.push(`| IBW | ${p.sex === 'M' ? '50' : '45.5'} + 2.3 x (${f(inch, 4)} - 60) | ${f(k.ibw, 4)} |`);
  L.push(`| AdjBW | ${f(k.ibw, 4)} + 0.4 x (${p.weight} - ${f(k.ibw, 4)}) | ${f(k.adjbw, 4)} |`);
  L.push(`| BMI | ${p.weight} / (${f(p.height / 100, 2)} x ${f(p.height / 100, 2)}) ปัด 1 ตำแหน่ง | ${f(k.bmi, 1)} |`);
  L.push(`| น้ำหนักในสูตร | BMI ${f(k.bmi, 1)} ${k.bmi < 18.5 ? 'น้อยกว่า 18.5 ใช้น้ำหนักจริง' : k.bmi < 25 ? '18.5 ถึงน้อยกว่า 25 ใช้ IBW' : '25 ขึ้นไป ใช้ AdjBW'} | ${k.key} ${f(k.cw, 4)} |`);
  if (p.dial === 'none') {
    const raw = (140 - p.age) * k.cw / (72 * p.scr) * (p.sex === 'F' ? 0.85 : 1);
    L.push(`| CrCl | (140 - ${p.age}) x ${f(k.cw, 4)} / (72 x ${p.scr})${p.sex === 'F' ? ' x 0.85' : ''} | ${f(raw, 4)} ปัดเป็น **${f(k.crcl, 1)}** |`);
    const bsa = Math.sqrt(p.height * p.weight / 3600);
    L.push(`| พื้นที่ผิวกาย (Mosteller) | รากที่สองของ (${p.height} x ${p.weight} / 3600) | ${f(bsa, 4)} |`);
    L.push(`| CrCl ต่อ 1.73 ตร.ม. (acyclovir) | ${f(raw, 4)} x 1.73 / ${f(bsa, 4)} | ${f(raw * 1.73 / bsa, 4)} ปัดเป็น **${f(k.crclNorm, 1)}** |`);
  }
  L.push('');
  return k;
}
function drugBlock(k, item, explain) {
  const r = E.drugRec(item, k);
  L.push(`**${E.DRUGS[item.drug].name}** ขนาดปกติ ${item.usual.d}${item.drug === 'acyclovir' ? ' mg/kg' : ' mg'} ทุก ${item.usual.q} ชม. แพทย์สั่ง ${item.ordered.d} mg ทุก ${item.ordered.q} ชม.`, '');
  for (const c of r.choices) L.push(`- ${c.title}: ${c.opts.map(o => `${o.label}${o.rec ? ' (แนะนำ)' : ''}`).join(' / ')} ใช้ "${c.opts.find(o => o.v === c.value).label}"`);
  L.push(`- ${explain}`);
  L.push(`- ผล: ${r.nodata ? r.statusText : E.regText(item.drug, r.reg)} | ${r.statusText}`, '');
}

let k = kidneyBlock('1 ชาย 72 ปี ไม่ฟอก (คน A ในสเปก)', P('M', 72, 55, 160, 2.1));
drugBlock(k, it('cefazolin', 1000, 8, 1000, 8), `CrCl ${f(k.crcl, 1)} อยู่แถว 11-34 ครึ่งขนาดปกติ 1000 / 2 = 500 mg ทุก 12 ชม.`);
k = kidneyBlock('2 หญิง 80 ปี ตัวเล็ก ไม่ฟอก (คน B)', P('F', 80, 42, 148, 0.6));
drugBlock(k, it('acyclovir', 10, 8, 400, 8), `ต่อ 1.73 ตร.ม. ${f(k.crclNorm, 1)} อยู่แถว มากกว่า 50 ขนาดเต็ม 10 x 42 = 420 ปัดทีละ 50 = 400 mg ทุก 8 ชม. (ถ้าเลือก CrCl ไม่แปลง ${f(k.crcl, 1)} อยู่แถว 25-50 เป็นทุก 12 ชม.)`);
k = kidneyBlock('3 ชาย 50 ปี อ้วน ไม่ฟอก (คน C)', P('M', 50, 110, 170, 1.8));
drugBlock(k, it('acyclovir', 10, 8, 850, 8), `น้ำหนักคิดขนาด AdjBW ${f(k.adjbw, 4)} x 10 = ${f(k.adjbw * 10, 1)} ปัดทีละ 50 = 850 mg ต่อ 1.73 ตร.ม. ${f(k.crclNorm, 1)} อยู่แถว 25-50 ทุก 12 ชม.`);
k = kidneyBlock('4 ชาย 65 ปี ผอม ค่าไตตกช่องว่าง (คน F)', P('M', 65, 44, 168, 1.5));
drugBlock(k, it('ceftazidime', 1000, 8, 1000, 8), `CrCl ${f(k.crcl, 1)} มากกว่า 30 แต่น้อยกว่า 31 ไม่อยู่แถวไหน ขึ้น 2 แถว แถวแนะนำคือแถวขนาดสูงกว่า 31-50 = 1 g ทุก 12 ชม.`);
k = kidneyBlock('5 ชาย 60 ปี ฟอกเลือด น้ำหนักหลังฟอก 58 kg', P('M', 60, 58, 165, NaN, 'HD'));
drugBlock(k, it('cefazolin', 1000, 8, 1000, 8), '20 mg/kg x 58 = 1,160 mg ปัดทีละ 500 ตาม IDSA (1,160 / 500 = 2.32 ปัดเป็น 2) = 1,000 mg หลังฟอกเสร็จทุกครั้ง');
k = kidneyBlock('6 หญิง 55 ปี CAPD', P('F', 55, 52, 155, NaN, 'CAPD'));
drugBlock(k, it('ceftazidime', 1000, 8, 1000, 8), 'loading 1 g แล้ว 500 mg ทุก 24 ชม. ตามฉลาก');
k = kidneyBlock('7 ชาย 72 ปี ตับผิดปกติ ไม่ฟอก', P('M', 72, 55, 160, 2.1));
drugBlock(k, it('ceftriaxone', 2000, 12, 2000, 12, { liver: true }), `ตับผิดปกติและ CrCl ${f(k.crcl, 1)} ไม่เกิน 30 แพทย์สั่งวันละ 4 g เกิน 2 g จึงแนะนำ 2 g ทุก 24 ชม.`);

writeFileSync(join(here, '..', 'docs', 'ตารางตรวจมือ-การคำนวณ.md'), L.join('\n') + '\n');
console.log('เขียน docs/ตารางตรวจมือ-การคำนวณ.md แล้ว', L.length, 'บรรทัด');
