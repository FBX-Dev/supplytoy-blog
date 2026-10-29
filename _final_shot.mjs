/**
 * 线上最终验收截图 + 对比度实测。
 * 覆盖：桌面文章页、桌面首页、移动首页、移动文章页。
 * ⚠️ 2026-10-22 起遮罩已全部取消 —— 四张图都应是**无遮罩原图**。
 * 直连线上，不走代理。
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const PW =
	"C:/Users/dynabook/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js";
const mod = await import(pathToFileURL(PW).href);
const pw = mod.default ?? mod;

const OUT = path.resolve("_tmp_verify/live-final");
fs.mkdirSync(OUT, { recursive: true });

const lin = (v) => {
	const s = v / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * 🔴 这里以前用「整条横带均值」估对比度，口径是错的（2026-10-22 修正）：
 *   ① 横带里大部分像素是文字两侧的亮底，均值被抬高，量不出字压在哪里；
 *   ② 剔除白字像素的阈值 190 会把马卡龙底图本身（p50≈203）也剔掉，
 *      n=0 时返回哨兵值 → 打印「最差 1.00:1」这种无意义结论。
 * 正确口径：**白字笔画边界 vs 环上紧邻最暗像素**，且必须先等入场动画结束
 * （否则量到 `filter: blur(6px)` 的中间态）。见 `_verify_readability.mjs`。
 */
async function edgeStats(buf, coreMin = 245, nonCoreMax = 200, boundaryR = 1) {
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
			let isB = false;
			for (let dy = -boundaryR; dy <= boundaryR && !isB; dy++) {
				for (let dx = -boundaryR; dx <= boundaryR; dx++) {
					if (at(x + dx, y + dy) < nonCoreMax) {
						isB = true;
						break;
					}
				}
			}
			if (!isB) continue;
			let dk = 255;
			for (let d = 3; d <= 10; d++) {
				for (const c of [
					at(x - d, y),
					at(x + d, y),
					at(x, y - d),
					at(x, y + d),
				]) {
					if (c < dk) dk = c;
				}
			}
			ratios.push(1.05 / (lumOf([dk, dk, dk].map(lin)) + 0.05));
		}
	}
	if (!ratios.length) return null;
	ratios.sort((a, b) => a - b);
	const q = (p) =>
		ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * p))];
	return { n: ratios.length, p5: q(0.05), median: q(0.5) };
}

const browser = await pw.chromium.launch();

// ---- 桌面文章页：持续采样取最差 ----
{
	const ctx = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
		deviceScaleFactor: 1,
	});
	const page = await ctx.newPage();
	await page.goto("https://supplytoy.com/post/advent-calendars-for-kids", {
		waitUntil: "domcontentloaded",
		timeout: 60000,
	});
	await page.waitForTimeout(5000);
	await page.screenshot({ path: path.join(OUT, "article-desktop.png") });

	const _box = await page.evaluate(() => {
		const overlay = document.getElementById("banner-page-overlay");
		const inner = overlay?.querySelector(":scope > div");
		const r = inner?.getBoundingClientRect();
		return { top: Math.round(r.top), height: Math.round(r.height) };
	});
	// 只量标题自身（48px 粗体纯白），排除 meta 行的干扰
	const clip = await page.evaluate(() => {
		const t = document.getElementById("page-overlay-title");
		const r = t.getBoundingClientRect();
		return {
			x: Math.max(0, Math.floor(r.left) - 12),
			y: Math.max(0, Math.floor(r.top) - 12),
			width: Math.ceil(r.width) + 24,
			height: Math.ceil(r.height) + 24,
		};
	});
	const shadow = await page.evaluate(
		() =>
			getComputedStyle(document.getElementById("page-overlay-title"))
				.textShadow,
	);
	console.log(`  标题描边：${shadow}`);
	let worst = { p5: 99, median: 0 };
	const t0 = Date.now();
	let n = 0;
	while (Date.now() - t0 < 30000) {
		const buf = await page.screenshot({ clip, type: "png" });
		const s = await edgeStats(buf);
		n++;
		if (s && s.p5 < worst.p5) worst = s;
		await page.waitForTimeout(250);
	}
	console.log(
		`线上 桌面文章页：采样 ${n} 次 → 标题最差帧 p5=${worst.p5.toFixed(2)}:1（中位 ${worst.median?.toFixed(2)}:1）  ${worst.p5 >= 3.0 ? "✓ 达大字号 AA" : "✗"}`,
	);
	await ctx.close();
}

// ---- 其余场景截图 ----
for (const [vp, viewport, label, url] of [
	["desktop", { width: 1920, height: 1080 }, "首页", "https://supplytoy.com/"],
	["mobile", { width: 390, height: 844 }, "首页", "https://supplytoy.com/"],
	[
		"mobile",
		{ width: 390, height: 844 },
		"文章页",
		"https://supplytoy.com/post/advent-calendars-for-kids",
	],
]) {
	const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(4000);
	const f = path.join(OUT, `${vp}-${label}.png`);
	await page.screenshot({ path: f });
	console.log(
		`  截图 ${vp}/${label} → ${path.relative(process.cwd(), f).replace(/\\/g, "/")}`,
	);
	await ctx.close();
}

await browser.close();
console.log("\n完成。");
