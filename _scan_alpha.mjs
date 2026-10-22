/**
 * 扫描：在真实渲染下，找出「标题带白字对比度」的最坏值，并据此定 CSS 遮罩参数。
 *
 * 🔴 为什么必须持续采样：
 *   轮播 4 张图亮度不同（原图标题带 201~238），且每张带 Ken Burns 缩放
 *   （scale 1.03→1.13），遮罩铺在 overlay 上是**屏幕固定**的，
 *   而底图在缩放 → 标题带背后的内容一直在变。单帧采样必然漏掉最坏情形。
 *   （实测：早采样 4.80:1、晚采样 4.05:1，同一页同一参数。）
 *
 * 🔴 为什么运行时注入 alpha 而不是改 CSS 重建：
 *   一次重建 ~1 分钟；注入只需改 overlay 的 backgroundImage，秒级。
 *   定好参数再改 CSS 重建一次做最终验收。
 *
 * 同时量出文字块真实位置，用来收紧遮罩椭圆（当前 ry=17% 是「半径」，
 * 即 119px，暗带总高 238px，比文字块大不少）。
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
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:4399/post/advent-calendars-for-kids", {
	waitUntil: "domcontentloaded",
	timeout: 30000,
});
await page.waitForTimeout(4000);

// 量文字块（标题 + meta）的真实位置
const box = await page.evaluate(() => {
	const overlay = document.getElementById("banner-page-overlay");
	const inner = overlay?.querySelector(":scope > div");
	const banner = document.getElementById("banner-wrapper");
	const r = inner?.getBoundingClientRect();
	const rb = banner?.getBoundingClientRect();
	return r
		? {
				top: Math.round(r.top),
				height: Math.round(r.height),
				bannerH: Math.round(rb.height),
				cyPct: (((r.top + r.height / 2) / rb.height) * 100).toFixed(1),
				ryPct: (((r.height / 2) / rb.height) * 100).toFixed(1),
			}
		: null;
});
console.log("文字块实测：", JSON.stringify(box));
console.log(
	`  → 圆心应取 cy=${box.cyPct}%，纵向半径至少 ry=${box.ryPct}%（当前 CSS 是 48% / 17%）`,
);

// 采样区域：文字块上下各留 30px
const clip = {
	x: 0,
	y: Math.max(0, box.top - 30),
	width: 1920,
	height: Math.min(1080 - Math.max(0, box.top - 30), box.height + 60),
};
console.log(`  采样区：y ${clip.y} ~ ${clip.y + clip.height}（高 ${clip.height}）\n`);

/** 注入遮罩并持续采样，返回最坏对比度。 */
async function scan(alpha, ryPct, cyPct, seconds = 13) {
	await page.evaluate(
		({ a, ry, cy }) => {
			const el = document.getElementById("banner-page-overlay");
			const g = (v) => (v === 0 ? "0" : v.toFixed(3));
			el.style.backgroundImage = `radial-gradient(ellipse 78% ${ry}% at 50% ${cy}%, rgba(15,23,42,${g(a)}) 0%, rgba(15,23,42,${g(a * 0.945)}) 52%, rgba(15,23,42,${g(a * 0.509)}) 76%, rgba(15,23,42,0) 100%)`;
		},
		{ a: alpha, ry: ryPct, cy: cyPct },
	);
	await page.waitForTimeout(300);

	let min = { ratio: 99, lum: 0 };
	let max = { ratio: 0, lum: 0 };
	const samples = [];
	const t0 = Date.now();
	while (Date.now() - t0 < seconds * 1000) {
		const buf = await page.screenshot({ clip, type: "png" });
		const s = await bandStats(buf);
		samples.push(s.ratio);
		if (s.ratio < min.ratio) min = s;
		if (s.ratio > max.ratio) max = s;
		await page.waitForTimeout(250);
	}
	return { min, max, n: samples.length };
}

const results = [];
console.log("alpha 扫描（每档持续 13s，覆盖 4 张轮播 × Ken Burns 全程）");
for (const a of [0.55, 0.62, 0.70, 0.78]) {
	const r = await scan(a, 17, 48);
	results.push({ a, ...r });
	console.log(
		`  alpha ${a.toFixed(2)}  最差 ${r.min.ratio.toFixed(2)}:1（底亮 ${r.min.lum.toFixed(0)}）  最好 ${r.max.ratio.toFixed(2)}:1  n=${r.n}  ${
			r.min.ratio >= 4.5 ? "✓" : "✗"
		}`,
	);
}

await browser.close();

console.log("\n===== 建议 =====");
const ok = results.filter((r) => r.min.ratio >= 4.6);
if (ok.length) {
	const pick = ok[0];
	console.log(`  最小可用 alpha = ${pick.a.toFixed(2)}（最差 ${pick.min.ratio.toFixed(2)}:1）`);
	console.log(`  建议取 ${pick.a.toFixed(2)}，并在 CSS 里把 ry 收紧到 ~${(Number(box.ryPct) + 6).toFixed(0)}%、cy 调到 ${box.cyPct}%`);
} else {
	console.log("  全部不达标，需继续加大 alpha");
}
