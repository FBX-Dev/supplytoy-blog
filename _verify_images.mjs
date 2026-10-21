import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const NPUAI = "D:/workbuddy/netspace/mizuki";
const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(f)).digest("hex");

const EXPECT = [
  ["public/assets/desktop-banner/1.webp", 1920, 1080],
  ["public/assets/desktop-banner/2.webp", 1920, 1080],
  ["public/assets/desktop-banner/3.webp", 1920, 1080],
  ["public/assets/desktop-banner/4.webp", 1920, 1080],
  ["public/assets/mobile-banner/1.webp", 1000, 1414],
  ["public/assets/mobile-banner/2.webp", 1000, 1414],
  ["public/assets/mobile-banner/3.webp", 1000, 1414],
  ["public/assets/mobile-banner/4.webp", 1000, 1414],
  ["src/assets/images/avatar.webp", 640, 640],
  ["public/assets/home/home.webp", 1024, 1024],
  ["public/assets/home/default-logo.webp", 785, 256],
  ["public/sakura.webp", 328, 304],
];

let pass = 0, fail = 0;
console.log("=== A. 尺寸 + 是否仍等于 npuai ===");
for (const [f, w, h] of EXPECT) {
  const m = await sharp(f).metadata();
  const dimOK = m.width === w && m.height === h;
  const twin = path.join(NPUAI, f);
  let same = "npuai无对应";
  if (fs.existsSync(twin)) same = md5(f) === md5(twin) ? "🔴仍与npuai相同" : "✓已不同";
  const ok = dimOK && same !== "🔴仍与npuai相同";
  ok ? pass++ : fail++;
  console.log(`  ${ok?"✓":"✗"} ${f.padEnd(42)} ${m.width}×${m.height} ${dimOK?"":"🔴尺寸错"}  ${same}`);
}

console.log("\n=== B. favicon.ico 结构 ===");
const ico = fs.readFileSync("public/favicon/favicon.ico");
const n = ico.readUInt16LE(4);
console.log(`  类型=${ico.readUInt16LE(2)} 图像数=${n}`);
if (ico.readUInt16LE(2) === 1 && n === 4) { pass++; console.log("  ✓ ICO 头合法（4 个尺寸）"); }
else { fail++; console.log("  ✗ ICO 头异常"); }
for (let i = 0; i < n; i++) {
  const o = 6 + i*16;
  const sz = ico.readUInt8(o) || 256;
  const len = ico.readUInt32LE(o+8), off = ico.readUInt32LE(o+12);
  const isPng = ico.subarray(off, off+8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const inside = off + len <= ico.length;
  const ok = isPng && inside;
  ok ? pass++ : fail++;
  console.log(`    ${ok?"✓":"✗"} ${sz}×${sz}  len=${len} off=${off} png=${isPng} 越界=${!inside}`);
}

console.log("\n=== C. 副本一致性（public vs src/assets/public）===");
for (const kind of ["desktop-banner","mobile-banner"]) for (let i=1;i<=4;i++) {
  const a = `public/assets/${kind}/${i}.webp`, b = `src/assets/public/assets/${kind}/${i}.webp`;
  const ok = md5(a) === md5(b);
  ok ? pass++ : fail++;
  console.log(`  ${ok?"✓":"✗"} ${b}`);
}

console.log("\n=== D. 8 张轮播图互不重复 ===");
const hashes = new Map();
for (const [f] of EXPECT) {
  if (!/banner/.test(f)) continue;
  const h = md5(f);
  if (hashes.has(h)) { fail++; console.log(`  ✗ ${f} 与 ${hashes.get(h)} 重复`); }
  else hashes.set(h, f);
}
if (hashes.size === 8) { pass++; console.log("  ✓ 8 张全部唯一"); }

console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail ? 1 : 0);
