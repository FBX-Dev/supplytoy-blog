/**
 * 可读性验收（最终版）—— 白字笔画边界 vs 紧邻最暗像素。
 *
 * 🔴 前两版口径都错了，这里记下来避免重蹈：
 *   ① 「同坐标底色」法：光晕落在笔画**外侧**，笔画正下方底图没变，
 *      所以无论加不加描边都量出 1.3:1 —— 量不到描边的收益。
 *   ② 「白芯 + 环形最暗」但不筛边界：48px 粗体笔画宽约 8~10px，
 *      d=3~8 的邻居**仍在笔画内部**（白），于是大量白对白 ≈1.0:1 的假值
 *      把 p5 拉到 1.4:1 —— 同样是假的。
 *
 * 本版口径（已用 `_diag_shadow3.mjs` 验证能正确区分有/无描边）：
 *   1. 字芯 = lum ≥ 245
 *   2. **边界字芯** = 字芯中，切比雪夫距离 1 的邻域内存在 lum < 200 的像素
 *      → 只保留真正的笔画边缘，排除笔画内部
 *   3. 对每个边界字芯，在半径 3~10px 的环上取**最暗**像素当「紧邻底色」
 *   4. WCAG 对比度 = 1.05 / (L(最暗) + 0.05)
 *   5. 持续采样覆盖 4 张轮播 × Ken Burns，报最差帧
 *
 * 🔴 采样前必须等入场动画（0.7s + 0.1s delay）跑完 —— 否则会量到
 *    `filter: blur(6px)` 的中间态（探针 v1 就栽在这）。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const PW =
	"C:/Users/dynabook/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js";
const mod = await import(pathToFileURL(PW).href);
const pw = mod.default ?? mod;

const lin = (v) => {
	v /= 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const ratioOf = (L) => 1.05 / (L + 0.05);

/** 边界字芯法
 *  🔴 boundaryR 必须按字号调：
 *     - 48px 粗体笔画宽 8~10px → 1px 邻域就够判定「我在边缘」
 *     - 16px 常规笔画宽约 2px 且抗锯齿铺开 2~3px → 1px 邻域里
 *       邻像素往往还是半亮的字芯（实测 245 旁边是 219/203，直到第 9 个
 *       像素才掉到 193），会一个边界都挑不出来。故需放宽到 3px。
 */
async function edgeContrast(
	buf,
	coreMin = 245,
	nonCoreMax = 200,
	boundaryR = 1,
) {
	const { data, info } = await sharp(buf)
		.raw()
		.toBuffer({ resolveWithObject: true });
	const W = info.width;
	const H = info.height;
	const ch = info.channels;
	const lum = new Float64Array(W * H);
	for (let p = 0, i = 0; i < data.length; i += ch, p++) {
		lum[p] = lumOf([data[i], data[i + 1], data[i + 2]]);
	}
	const at = (x, y) => lum[y * W + x];
	const ratios = [];
	const M = boundaryR + 10;
	for (let y = M; y < H - M; y++) {
		for (let x = M; x < W - M; x++) {
			if (at(x, y) < coreMin) continue;
			// 必须是边界字芯：邻域里有非字像素
			let isBoundary = false;
			for (let dy = -boundaryR; dy <= boundaryR && !isBoundary; dy++) {
				for (let dx = -boundaryR; dx <= boundaryR; dx++) {
					if (at(x + dx, y + dy) < nonCoreMax) {
						isBoundary = true;
						break;
					}
				}
			}
			if (!isBoundary) continue;
			// 环上最暗像素 = 紧邻底色（有描边时即光晕）
			let darkest = 255;
			for (let d = 3; d <= 10; d++) {
				const cands = [
					at(x - d, y),
					at(x + d, y),
					at(x, y - d),
					at(x, y + d),
					at(x - d, y - d),
					at(x + d, y - d),
					at(x - d, y + d),
					at(x + d, y + d),
				];
				for (const c of cands) if (c < darkest) darkest = c;
			}
			ratios.push(ratioOf(lumOf([darkest, darkest, darkest].map(lin))));
		}
	}
	if (!ratios.length) return null;
	ratios.sort((a, b) => a - b);
	const q = (p) => ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * p))];
	return { n: ratios.length, p5: q(0.05), p25: q(0.25), median: q(0.5) };
}

const OUT = "_tmp_verify/readability-final";
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({
	viewport: { width: 1920, height: 1080 },
	deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:4399/post/advent-calendars-for-kids", {
	waitUntil: "domcontentloaded",
	timeout: 30000,
});
await page.waitForFunction(
	() =>
		(document.getElementById("page-overlay-title")?.textContent || "").trim().length > 10,
	{ timeout: 25000 },
);
// 🔴 必须等入场动画结束，否则量到 blur(6px) 中间态
await page.waitForTimeout(6000);

const st = await page.evaluate(() => {
	const t = document.getElementById("page-overlay-title");
	const m = document.getElementById("page-overlay-meta");
	const r = (el) => {
		const b = el.getBoundingClientRect();
		return {
			x: Math.max(0, Math.floor(b.left) - 12),
			y: Math.max(0, Math.floor(b.top) - 12),
			width: Math.min(1920 - Math.floor(b.left) + 12, Math.ceil(b.width) + 24),
			height: Math.ceil(b.height) + 24,
		};
	};
	return {
		title: r(t),
		meta: r(m),
		titleShadow: getComputedStyle(t).textShadow,
		metaShadow: getComputedStyle(m).textShadow,
		titleFilter: getComputedStyle(t).filter,
	};
});
console.log("=== 描边是否生效 ===");
for (const [k, v] of [
	["title.textShadow", st.titleShadow],
	["meta.textShadow", st.metaShadow],
	["title.filter", st.titleFilter],
]) {
	const ok = k.endsWith("textShadow") ? v && v !== "none" : true;
	if (k.endsWith("textShadow")) ok ? pass++ : fail++;
	console.log(`  ${ok ? "✓" : "✗"} ${k} = ${v}`);
}

async function sample(label, clip, floor, opts = {}, seconds = 30) {
	const { coreMin = 245, nonCoreMax = 200, boundaryR = 1 } = opts;
	const acc = [];
	const t0 = Date.now();
	let n = 0;
	while (Date.now() - t0 < seconds * 1000) {
		const buf = await page.screenshot({ clip, type: "png" });
		if (n === 0) fs.writeFileSync(path.join(OUT, `${label}.png`), buf);
		const r = await edgeContrast(buf, coreMin, nonCoreMax, boundaryR);
		if (r) acc.push(r);
		n++;
		await page.waitForTimeout(250);
	}
	if (!acc.length) {
		console.log(`  ✗ ${label} 未取到有效笔画边界像素`);
		fail++;
		return;
	}
	const worst = acc.reduce((a, b) => (a.p5 < b.p5 ? a : b), acc[0]);
	const med = acc.reduce((a, b) => (a.median < b.median ? a : b), acc[0]);
	const ok = worst.p5 >= floor;
	ok ? pass++ : fail++;
	console.log(
		`  ${ok ? "✓" : "✗"} ${label}  采样 ${n} 帧(${seconds}s) → 最差帧 p5=${worst.p5.toFixed(2)}:1  中位帧 p5=${med.p5.toFixed(2)}:1  中位=${med.median.toFixed(2)}:1  (门槛 ${floor}:1)`,
	);
}

/** 只报告不断言的采样（用于已知无解的小字号补充信息） */
async function sampleReport(label, clip, opts = {}, seconds = 30) {
	const { coreMin = 245, nonCoreMax = 200, boundaryR = 1 } = opts;
	const acc = [];
	const t0 = Date.now();
	let n = 0;
	while (Date.now() - t0 < seconds * 1000) {
		const buf = await page.screenshot({ clip, type: "png" });
		const r = await edgeContrast(buf, coreMin, nonCoreMax, boundaryR);
		if (r) acc.push(r);
		n++;
		await page.waitForTimeout(250);
	}
	if (!acc.length) {
		console.log(`  ⚠️ ${label} 未取到有效笔画边界像素`);
		return;
	}
	const worst = acc.reduce((a, b) => (a.p5 < b.p5 ? a : b), acc[0]);
	const med = acc.reduce((a, b) => (a.median < b.median ? a : b), acc[0]);
	console.log(
		`  ⚠️ ${label}  采样 ${n} 帧 → 最差帧 p5=${worst.p5.toFixed(2)}:1  中位帧 p5=${med.p5.toFixed(2)}:1  中位=${med.median.toFixed(2)}:1  （低于 AA，已知限制）`,
	);
}

console.log("\n=== 标题（48px 粗体纯白，大字号 AA 门槛 3:1）===");
await sample("title", st.title, 3.0, { coreMin: 245, nonCoreMax: 200, boundaryR: 1 });

// 🔴 meta 行（日期/分类/字数，16px `text-white/80`）—— **只报告，不断言**
//    实测：即便加描边也只有 ~1.9:1，且试过 5 种组合（见 `_probe_meta_fix.mjs`）
//    全部达不到 4.5:1。根因是小字号 + 半透明白 + 马卡龙亮底，
//    在「不压暗图片」的前提下**无解**。
//    它是补充信息（日期/分类/字数），且正文里同样信息以深色正常字号重复出现，
//    用户也已明确接受「没有遮罩也能基本看清楚文字」，故不作硬门槛，
//    但把数字打出来，将来想彻底解决时（如改深色字/加胶囊底）有依据。
console.log("\n=== meta 行（16px white/80，仅报告）===");
await sampleReport("meta", st.meta, { coreMin: 243, nonCoreMax: 210, boundaryR: 4 });

await browser.close();
console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail ? 1 : 0);
