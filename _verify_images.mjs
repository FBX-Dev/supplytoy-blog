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

console.log("\n=== E. 轮播图必须是鲜亮原图（不得烘焙遮罩）===");
// 2026-10-22：遮罩改由 CSS 按需叠加（banner.css 的 :has() 门控），
// 图片本身必须是干净的马卡龙原图。若标题带亮度 <170，说明遮罩被重新烤回来了
// → 首页/移动端（根本没文字）会跟着发灰，就是用户反馈的「整体灰乎乎」。
const lin2 = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
for (const [f, w, h] of EXPECT) {
  if (!/banner/.test(f)) continue;
  const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const y0 = Math.round(h * 0.42), y1 = Math.round(h * 0.54);
  const x0 = Math.round(w * 0.2), x1 = Math.round(w * 0.8);
  const sum = [0, 0, 0]; let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * w + x) * ch;
    sum[0] += data[o]; sum[1] += data[o+1]; sum[2] += data[o+2]; n++;
  }
  const m = sum.map((v) => v / n);
  const lum = lumOf(m);
  const ok = lum >= 170;
  ok ? pass++ : fail++;
  console.log(`  ${ok?"✓":"✗"} ${f.padEnd(42)} 标题带亮度 ${lum.toFixed(0)} ${ok ? "（鲜亮）" : "🔴 偏暗，疑似重新烘焙了遮罩"}`);
}

console.log("\n=== F. CSS 按需遮罩是否存在且参数正确 ===");
// 遮罩必须靠 :has(#page-overlay-title:not(:empty)) 门控，
// 否则首页/移动端会白压一层 → 「整体灰乎乎」。
const css = fs.readFileSync("src/styles/banner.css", "utf8");
const hasGate = /\.banner-page-overlay:has\(#page-overlay-title:not\(:empty\)\)/.test(css);
const hasGrad = /radial-gradient\(\s*ellipse 78% 14% at 50% 50%/.test(css);
const gateOk = hasGate && hasGrad;
gateOk ? pass++ : fail++;
console.log(`  ${gateOk?"✓":"✗"} :has() 门控 ${hasGate ? "存在" : "🔴 缺失"}；椭圆 78%×14% @50%50% ${hasGrad ? "正确" : "🔴 不符"}`);

console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail ? 1 : 0);
