// ชุดทดสอบตัวคำนวณ ตัวเลขคาดหวังมาจากสเปก ข้อ 9 (สร้างด้วย ../01-สเปก-สคริปต์ตัวอย่าง.py) และกติกาในสเปก ข้อ 4 ถึง 7
// ใช้: node tests/test-calc.mjs   ล้ม (exit 1) ถ้าข้อไหนไม่ตรง
import { loadEngine, SAFE, BAD } from './run-engine.mjs';

const E = loadEngine();
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log(`ไม่ตรง ${name}\n  ได้   ${g}\n  ควรได้ ${w}`); }
}
const P = (sex, age, weight, height, scr, dial = 'none') => ({ sex, age, weight, height, scr, dial, assessDate: '2026-11-08', scrDate: '2026-11-08' });
const it = (drug, ud, uq, od, oq, extra = {}) => Object.assign({ drug, usual: { d: ud, q: uq }, ordered: { d: od, q: oq }, sel: {}, edit: null, severe: null }, extra);
const f1 = x => Number(x.toFixed(1));

// 9.1 ค่าไต 6 คน
const people = {
  A: [P('M', 72, 55, 160, 2.1), [56.9, 56.1, 21.5, 'IBW', 25.6, 24.7, 25.6, 25.2, 1.56, 28.3]],
  B: [P('F', 80, 42, 148, 0.6), [41.5, 41.7, 19.2, 'IBW', 49.0, 49.6, 49.0, 49.2, 1.31, 64.5]],
  C: [P('M', 50, 110, 170, 1.8), [65.9, 83.6, 38.1, 'AdjBW', 58.0, 76.4, 45.8, 58.0, 2.28, 44.0]],
  D: [P('F', 45, 48, 155, 0.7), [47.9, 47.9, 20.0, 'IBW', 76.7, 76.9, 76.7, 76.8, 1.44, 92.3]],
  E: [P('M', 65, 44, 168, 1.3), [64.1, 56.1, 15.6, 'TBW', 35.3, 35.3, 51.4, 44.9, 1.43, 42.6]],
  F: [P('M', 65, 44, 168, 1.5), [64.1, 56.1, 15.6, 'TBW', 30.6, 30.6, 44.5, 38.9, 1.43, 36.9]],
};
const K = {};
for (const [n, [p, w]] of Object.entries(people)) {
  const k = E.kidney(p); K[n] = k;
  eq(`9.1 คน ${n}`, [f1(k.ibw), f1(k.adjbw), f1(k.bmi), k.key, k.crcl, k.variants.TBW, k.variants.IBW, k.variants.AdjBW, Number(k.bsa.toFixed(2)), k.crclNorm], w);
}

// 9.2 cefazolin คน A
let r = E.drugRec(it('cefazolin', 1000, 8, 1000, 8), K.A);
eq('9.2 cefazolin A', [r.reg.dose, r.reg.q, r.status, r.chip], [500, 12, 'high', 'yellow']);

// 9.3 ceftazidime คน F ตกช่องว่าง 30.6
r = E.drugRec(it('ceftazidime', 1000, 8, 1000, 8), K.F);
eq('9.3 ceftazidime F แถวแนะนำ', [r.choices.map(c => c.key), r.choices[0].value, r.reg.dose, r.reg.q, r.status], [['row'], 'upper', 1000, 12, 'high']);
r = E.drugRec(it('ceftazidime', 1000, 8, 1000, 8, { sel: { row: 'lower' } }), K.F);
eq('9.3 ceftazidime F เลือกแถวล่าง', [r.reg.dose, r.reg.q], [1000, 24]);

// 9.4 acyclovir
r = E.drugRec(it('acyclovir', 10, 8, 400, 8), K.B);
eq('9.4 acyclovir B ต่อ 1.73', [r.choices.map(c => [c.key, c.value]), r.reg.dose, r.reg.q, r.status], [[['ctype', 'norm']], 400, 8, 'ok']);
r = E.drugRec(it('acyclovir', 10, 8, 400, 8, { sel: { ctype: 'raw' } }), K.B);
eq('9.4 acyclovir B ไม่แปลง', [r.reg.dose, r.reg.q, r.status], [400, 12, 'high']);
r = E.drugRec(it('acyclovir', 10, 8, 850, 8), K.C);
eq('9.4 acyclovir C AdjBW ต่อ 1.73', [r.choices.map(c => [c.key, c.value]), r.reg.dose, r.reg.q], [[['wt', 'adj'], ['ctype', 'norm']], 850, 12]);
r = E.drugRec(it('acyclovir', 10, 8, 850, 8, { sel: { wt: 'ibw' } }), K.C);
eq('9.4 acyclovir C IBW', [r.reg.dose, r.reg.q], [650, 12]);
r = E.drugRec(it('acyclovir', 10, 8, 850, 8, { sel: { ctype: 'raw' } }), K.C);
eq('9.4 acyclovir C ไม่แปลง', [r.reg.dose, r.reg.q], [850, 8]);
r = E.drugRec(it('acyclovir', 10, 8, 600, 8), K.D);
eq('acyclovir D ได้แถวเดียวกัน ไม่มีตัวเลือก', [r.choices.length, r.info.length, r.reg.dose, r.reg.q], [0, 1, 500, 8]);
r = E.drugRec(it('acyclovir', 10, 8, 2000, 8), K.D);
eq('acyclovir เกิน 20 mg/kg ป้ายแดง', r.flags.map(f => f.color), ['red']);

// 9.5 และ 9.6 HD cefazolin
const hd = w => E.kidney(P('M', 60, w, 165, NaN, 'HD'));
r = E.drugRec(it('cefazolin', 1000, 8, 1000, 8), hd(58));
eq('9.5 HD cefazolin ทาง ก', [r.reg.dose, r.reg.q, r.reg.hd, r.status, r.choices[0].value], [1000, null, 'after', 'review', 'idsa']);
r = E.drugRec(it('cefazolin', 1000, 8, 1000, 8, { sel: { path: 'fogel' } }), hd(58));
eq('9.5 HD cefazolin ทาง ข', r.reg.dose, 1000);
const table96 = [[37.4, 500, 750], [37.5, 1000, 750], [49.9, 1000, 750], [50, 1000, 1000], [58, 1000, 1000], [62.4, 1000, 1000], [62.5, 1500, 1000], [87.4, 1500, 1000], [87.5, 2000, 1000]];
for (const [w, a, b] of table96) {
  const ra = E.drugRec(it('cefazolin', 1000, 8, 1000, 8), hd(w)).reg.dose;
  const rb = E.drugRec(it('cefazolin', 1000, 8, 1000, 8, { sel: { path: 'fogel' } }), hd(w)).reg.dose;
  eq(`9.6 น้ำหนักหลังฟอก ${w}`, [ra, rb], [a, b]);
}

// 9.7 CAPD
const capd = E.kidney(P('F', 55, 52, 155, NaN, 'CAPD'));
r = E.drugRec(it('ceftazidime', 1000, 8, 1000, 8), capd);
eq('9.7 CAPD ceftazidime', [r.reg.load, r.reg.dose, r.reg.q, r.status], [1000, 500, 24, 'high']);
r = E.drugRec(it('amoxclav_iv', 1000, 8, 1000, 8), capd);
eq('9.7 CAPD amoxicillin-clavulanate ฉีด ไม่มีข้อมูล', [r.nodata, r.reg], [true, null]);
r = E.drugRec(it('cefazolin', 1000, 8, 1000, 8), E.kidney(P('F', 55, 52, 155, NaN, 'APD')));
eq('APD cefazolin มีแหล่งเดียว', [r.reg.dose, r.reg.q, r.reg.single, r.src], [1000, 12, true, ['HAM']]);

// 9.8 ป้ายเตือน
const sev = E.kidney(P('M', 70, 50, 165, 4.0)); // CrCl ต่ำกว่า 15
r = E.drugRec(it('ceftriaxone', 2000, 12, 2000, 12), sev);
eq('9.8 ceftriaxone 4 g ไตเสื่อมรุนแรง', [r.flags.length, r.cautions.length, r.status], [0, 1, 'ok']);
r = E.drugRec(it('ceftriaxone', 2000, 8, 2000, 8), K.D);
eq('ceftriaxone เกิน 4 g ป้ายแดง', r.flags.map(f => f.color), ['red']);
r = E.drugRec(Object.assign(it('ceftriaxone', 2000, 12, 2000, 12), { liver: true }), K.A);
eq('ceftriaxone ตับผิดปกติ CrCl 25.6', [r.reg.dose, r.reg.q, r.status], [2000, 24, 'high']);
r = E.drugRec(Object.assign(it('ceftriaxone', 2000, 12, 2000, 12), { liver: true }), K.D);
eq('ceftriaxone ตับผิดปกติ CrCl 76.7 ไม่ปรับ', [r.reg.dose, r.reg.q, r.status], [2000, 12, 'ok']);
r = E.drugRec(it('amoxclav_po', 875, 12, 875, 12), K.A);
eq('9.8 amoxicillin-clavulanate กิน 875 CrCl 25.6', [r.reg.dose, r.reg.q, r.flags.map(f => f.color), r.status], [500, 12, ['yellow'], 'high']);

// ขอบช่วงทุกแบบ (ค่าที่จัดแถวคือค่าที่ปัดแล้ว)
const cls = (x, rows) => { const c = E.classify(x, rows); return [c.kind, c.rows.map(z => z.id)]; };
eq('acyclovir 25 อยู่ 2 แถว', cls(25, E.ROWS.acyclovir), ['overlap', ['R2', 'R3']]);
eq('acyclovir 10 อยู่ 2 แถว', cls(10, E.ROWS.acyclovir), ['overlap', ['R3', 'R4']]);
eq('acyclovir 50 แถวเดียว', cls(50, E.ROWS.acyclovir), ['one', ['R2']]);
eq('ceftazidime 5 ช่องว่าง', cls(5, E.ROWS.ceftazidime), ['gap', ['R3', 'R4']]);
eq('ceftazidime 5.9 ช่องว่าง', cls(5.9, E.ROWS.ceftazidime), ['gap', ['R3', 'R4']]);
eq('ceftazidime 4.9 แถวเดียว', cls(4.9, E.ROWS.ceftazidime), ['one', ['R4']]);
eq('ceftazidime 50 แถวเดียว', cls(50, E.ROWS.ceftazidime), ['one', ['R1']]);
eq('ceftazidime 50.1 แถวเดียว', cls(50.1, E.ROWS.ceftazidime), ['one', ['R0']]);
eq('ceftazidime 15.5 ช่องว่าง', cls(15.5, E.ROWS.ceftazidime), ['gap', ['R2', 'R3']]);
eq('cefazolin 54.5 ช่องว่าง', cls(54.5, E.ROWS.cefazolin), ['gap', ['R1', 'R2']]);
eq('cefazolin 10.5 ช่องว่าง', cls(10.5, E.ROWS.cefazolin), ['gap', ['R3', 'R4']]);
eq('cefazolin 55 แถวเดียว', cls(55, E.ROWS.cefazolin), ['one', ['R1']]);
eq('amoxclav 30 แถวเดียว', cls(30, E.ROWS.amoxclav), ['one', ['R2']]);
eq('amoxclav 10 แถวเดียว', cls(10, E.ROWS.amoxclav), ['one', ['R2']]);
eq('amoxclav 9.9 แถวเดียว', cls(9.9, E.ROWS.amoxclav), ['one', ['R3']]);

// ceftazidime ติดเชื้อรุนแรง ติ๊กเองเมื่อขนาดปกติ 6 g ต่อวัน
const mid = E.kidney(P('M', 60, 60, 170, 2.0));
r = E.drugRec(it('ceftazidime', 2000, 8, 2000, 8), mid);
eq('ceftazidime ติดเชื้อรุนแรงอัตโนมัติ', [mid.crcl, r.severe, r.severeAuto, r.reg.dose, r.reg.q], [r.severe ? mid.crcl : mid.crcl, true, true, 1500, 12]);
r = E.drugRec(it('ceftazidime', 2000, 8, 2000, 8, { severe: false }), mid);
eq('ceftazidime เอาติ๊กออก', [r.reg.dose, r.reg.q], [1000, 12]);
r = E.drugRec(it('ceftazidime', 250, 12, 250, 12), mid);
eq('ceftazidime ขนาดตามข้อบ่งใช้ต่ำกว่าตาราง', [r.reg.dose, r.reg.q, r.status], [250, 12, 'ok']);

// บั๊กที่สุ่มเทียบเจอ 2026-11-08 (ล็อกไว้ไม่ให้กลับมา)
{
  const k30 = E.kidney(P('M', 82, 76.8, 160, NaN, 'HD'));
  eq('BMI 30.0 พอดี (76.8 kg 160 cm) นับว่าอ้วน', [k30.bmi, k30.obese, k30.key], [30, true, 'AdjBW']);
  const k25 = E.kidney(P('M', 50, 64, 160, 1));
  eq('BMI 25.0 พอดี (64 kg 160 cm) ใช้ AdjBW', [k25.bmi, k25.key], [25, 'AdjBW']);
  const kn = E.kidney(P('F', 26, 162.6, 175.4, 2.74));
  eq('CrCl ต่อ 1.73 ค่าจริง 31.64999963 ปัดเป็น 31.6', [kn.crcl, kn.crclNorm], [51.5, 31.6]);
}

// อายุ ช่วงตัวเลข
eq('อายุ 17 ไม่รองรับ', [E.kidney(P('M', 17, 60, 170, 1)).ok, E.kidney(P('M', 17, 60, 170, 1)).unsupported], [false, true]);
eq('SCr 0.1 นอกช่วง', E.kidney(P('M', 40, 60, 170, 0.1)).ok, false);
eq('ส่วนสูง 119 นอกช่วง', E.kidney(P('M', 40, 60, 119, 1)).ok, false);

// note ทุกยา ทุกการฟอก ต้องเป็น ASCII กับไทยเท่านั้น และไม่มีคำว่า undefined NaN
let notes = 0;
for (const dial of ['none', 'HD', 'CAPD', 'APD']) {
  for (const who of [P('M', 72, 55, 160, 2.1, dial), P('F', 50, 110, 160, 0.9, dial), P('F', 80, 42, 148, 0.6, dial)]) {
    const k = E.kidney(who);
    const rows = Object.keys(E.DRUGS).map(d => {
      const std = E.DRUGS[d].std[E.DRUGS[d].std.length - 1];
      const item = it(d, std[0], std[1], d === 'acyclovir' ? 700 : std[0], std[1]);
      return { item, res: E.drugRec(item, k) };
    });
    const note = E.buildNote(who, k, rows);
    notes++;
    if (!SAFE.test(note) || BAD.test(note)) { fail++; console.log(`note ผิด (${dial})\n${note}`); } else pass++;
    for (const line of note.split('\n')) {
      if (!(line === 'Pharmacist note' || /^ {4}- \S/.test(line) || /^ {8}- \S/.test(line))) { fail++; console.log(`บรรทัด note ผิดรูปแบบ: ${line}`); }
    }
  }
}

// ตัวอย่าง note เต็ม เทียบกับสเปก 9.2
{
  const p = P('M', 72, 55, 160, 2.1);
  const item = it('cefazolin', 1000, 8, 1000, 8);
  const note = E.buildNote(p, K.A, [{ item, res: E.drugRec(item, K.A) }]);
  eq('note 9.2', note, [
    'Pharmacist note',
    '    - ประเมินขนาดยาตามการทำงานของไต วันที่ 8 พฤศจิกายน 2569',
    '        - ชาย อายุ 72 ปี น้ำหนัก 55.0 kg ส่วนสูง 160 cm BMI 21.5',
    '        - SCr 2.10 mg/dL วันที่ 8 พฤศจิกายน 2569',
    '        - CrCl 25.6 mL/min (Cockcroft-Gault ใช้ IBW 56.9 kg)',
    '    - Cefazolin 1,000 mg IV q 8 hr ขนาดสูงกว่าที่แนะนำตามการทำงานของไต',
    '        - แนะนำ Cefazolin 500 mg IV q 12 hr (ครึ่งขนาดปกติ ช่วง CrCl 11-34 mL/min หลัง loading dose)',
    '    - อ้างอิง ฉลากยา Cefazolin (DailyMed สหรัฐ), SmPC Cefazolin (emc อังกฤษ)',
  ].join('\n'));
}

console.log(`ผ่าน ${pass} ไม่ตรง ${fail} (note ${notes} ชุด)`);
process.exit(fail ? 1 : 0);
