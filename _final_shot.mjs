/**
 * 线上最终验收截图 + 对比度实测。
 * 覆盖：桌面文章页（有遮罩）、桌面首页（无遮罩）、移动首页、移动文章页。
 * 直连线上，不走代理。
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

const OUT = path.resolve("_tmp_verify/live-final");
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

const browser = await pw.chromium.launch();

// ---- 桌面文章页：持续采样取最差 ----
{
	const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	await page.goto("https://supplytoy.com/post/advent-calendars-for-kids", {
		waitUntil: "domcontentloaded",
		timeout: 60000,
	});
	await page.waitForTimeout(5000);
	await page.screenshot({ path: path.join(OUT, "article-desktop.png") });

	const box = await page.evaluate(() => {
		const overlay = document.getElementById("banner-page-overlay");
		const inner = overlay?.querySelector(":scope > div");
		const r = inner?.getBoundingClientRect();
		return { top: Math.round(r.top), height: Math.round(r.height) };
	});
	const clip = {
		x: 0,
		y: Math.max(0, box.top - 30),
		width: 1920,
		height: Math.min(1080 - Math.max(0, box.top - 30), box.height + 60),
	};
	let worst = { ratio: 99 };
	const t0 = Date.now();
	let n = 0;
	while (Date.now() - t0 < 14000) {
		const buf = await page.screenshot({ clip, type: "png" });
		const s = await bandStats(buf);
		n++;
		if (s.ratio < worst.ratio) worst = s;
		await page.waitForTimeout(250);
	}
	console.log(
		`线上 桌面文章页：采样 ${n} 次 → 最差对比度 ${worst.ratio.toFixed(2)}:1（底亮 ${worst.lum?.toFixed(0)}）  ${worst.ratio >= 4.5 ? "✓" : "✗"}`,
	);
	await ctx.close();
}

// ---- 其余场景截图 ----
for (const [vp, viewport, label, url] of [
	["desktop", { width: 1920, height: 1080 }, "首页", "https://supplytoy.com/"],
	["mobile", { width: 390, height: 844 }, "首页", "https://supplytoy.com/"],
	["mobile", { width: 390, height: 844 }, "文章页", "https://supplytoy.com/post/advent-calendars-for-kids"],
]) {
	const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
	await page.waitForTimeout(4000);
	const f = path.join(OUT, `${vp}-${label}.png`);
	await page.screenshot({ path: f });
	console.log(`  截图 ${vp}/${label} → ${path.relative(process.cwd(), f).replace(/\\/g, "/")}`);
	await ctx.close();
}

await browser.close();
console.log("\n完成。");
