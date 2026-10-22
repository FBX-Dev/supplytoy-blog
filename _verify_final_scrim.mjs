/**
 * 最终验收：读**构建产物里真实生效的 CSS**（不注入任何样式），
 * 持续采样 4 张轮播 × Ken Burns 全程，确认标题带白字对比度最差值。
 *
 * 同时验证「不该有遮罩」的场景确实没有。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const PW = "C:/Users/dynabook/.workbuddy/binaries/node/workspace/node_modules/playwright/index.js";
const mod = await import(pathToFileURL(PW).href);
const pw = mod.default ?? mod;

const BASE = "http://127.0.0.1:4399";
const OUT = path.resolve("_tmp_verify/final");
fs.mkdirSync(OUT, { recursive: true });

const lin = (v) => {
	v /= 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

async function bandStats(buf) {
	const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
	const ch = info.channels;
	const sum = [0, 0, 0];
	let n = 0;
	for (let i = 0; i < data.length; i += ch) {
		const px = [data[i], data[i + 1], data[i + 2]];
		if (lumOf(px) > 190) continue;
		sum[0] += px[0];
		sum[1] += px[1];
		sum[2] += px[2];
		n++;
	}
	if (!n) return { lum: 255, ratio: 1 };
	const m = sum.map((v) => v / n);
	return { lum: lumOf(m), ratio: 1.05 / (lumOf(m.map(lin)) + 0.05) };
}

let pass = 0;
let fail = 0;
const browser = await pw.chromium.launch();

// ---------- A. 桌面文章页：持续采样取最差 ----------
{
	const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	await page.goto(`${BASE}/post/advent-calendars-for-kids`, { waitUntil: "domcontentloaded", timeout: 30000 });
	await page.waitForTimeout(4000);

	const box = await page.evaluate(() => {
		const overlay = document.getElementById("banner-page-overlay");
		const inner = overlay?.querySelector(":scope > div");
		const banner = document.getElementById("banner-wrapper");
		const r = inner?.getBoundingClientRect();
		const rb = banner?.getBoundingClientRect();
		const cs = getComputedStyle(overlay);
		return {
			top: Math.round(r.top),
			height: Math.round(r.height),
			bannerH: Math.round(rb.height),
			bg: cs.backgroundImage === "none" ? "none" : cs.backgroundImage.slice(0, 60),
		};
	});
	console.log("=== A. 桌面文章页（有标题）===");
	console.log(`  横幅高 ${box.bannerH}  文字块 y${box.top} 高${box.height}`);
	console.log(`  生效背景：${box.bg}`);

	const clip = {
		x: 0,
		y: Math.max(0, box.top - 30),
		width: 1920,
		height: Math.min(1080 - Math.max(0, box.top - 30), box.height + 60),
	};

	let worst = { ratio: 99, lum: 0 };
	let best = { ratio: 0, lum: 0 };
	const t0 = Date.now();
	let n = 0;
	while (Date.now() - t0 < 16000) {
		const buf = await page.screenshot({ clip, type: "png" });
		const s = await bandStats(buf);
		n++;
		if (s.ratio < worst.ratio) worst = s;
		if (s.ratio > best.ratio) best = s;
		if (n === 1) fs.writeFileSync(path.join(OUT, "article-desktop.png"), buf);
		await page.waitForTimeout(250);
	}
	const ok = worst.ratio >= 4.5;
	ok ? pass++ : fail++;
	console.log(
		`  持续采样 ${n} 次（16s，覆盖 4 张 × Ken Burns）→ 最差 ${worst.ratio.toFixed(2)}:1（底亮 ${worst.lum.toFixed(0)}）  最好 ${best.ratio.toFixed(2)}:1  ${ok ? "✓" : "✗"}`,
	);
	await ctx.close();
}

// ---------- B. 不该有遮罩的场景 ----------
console.log("\n=== B. 不该有遮罩的场景 ===");
const NEG = [
	["desktop", { width: 1920, height: 1080 }, "首页", "/"],
	["mobile", { width: 390, height: 844 }, "首页", "/"],
	["mobile", { width: 390, height: 844 }, "文章页", "/post/advent-calendars-for-kids"],
];
for (const [vpName, viewport, label, url] of NEG) {
	const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 30000 });
	await page.waitForTimeout(3000);
	const info = await page.evaluate(() => {
		const o = document.getElementById("banner-page-overlay");
		if (!o) return { exists: false };
		const cs = getComputedStyle(o);
		const r = o.getBoundingClientRect();
		return {
			exists: true,
			display: cs.display,
			height: Math.round(r.height),
			bg: cs.backgroundImage === "none" ? "none" : "has-gradient",
		};
	});
	// 通过条件：元素不存在 / 未渲染 / 背景为 none
	const ok = !info.exists || info.display === "none" || info.height === 0 || info.bg === "none";
	ok ? pass++ : fail++;
	console.log(
		`  ${ok ? "✓" : "✗"} ${vpName}/${label}  display=${info.display} h=${info.height} bg=${info.bg}  → ${ok ? "遮罩正确缺席" : "🔴 不该有遮罩"}`,
	);
	const shot = path.join(OUT, `${vpName}-${label}.png`);
	await page.screenshot({ path: shot });
	await ctx.close();
}

await browser.close();
console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail ? 1 : 0);
