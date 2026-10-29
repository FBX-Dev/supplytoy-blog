/**
 * 验收：标题遮罩必须**彻底不存在**（2026-10-22 用户决定取消）。
 *
 * 历史：先是把暗带烘焙进图片 → 用户说「整体灰乎乎一片」→ 改成 CSS `:has()` 按需叠加
 * （alpha 0.74，最差 4.99:1）→ 用户仍决定**全部取消**，理由是
 * 「没有遮罩也能基本看清楚文字，而且下面也有正式版的文字标题」。
 *
 * 所以本脚本的断言方向已经**反转**：以前是「该有遮罩的地方要有且达标」，
 * 现在是「任何地方都不许有遮罩」。
 *
 * 仍然保留对比度采样，但**只作报告不作断言** —— 用户已接受原图亮度，
 * 且实测原图标题带亮度 201~238，不是「暗到读不了」的量级。
 * 只有当对比度掉到 3:1 以下（真正不可读）时才打 ⚠️ 提醒。
 *
 * 前置：本地 dist 服务已起在 4399（`node _serve_dist.cjs`）。
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

const BASE = "http://127.0.0.1:4399";
const POST = "/post/advent-calendars-for-kids";
const OUT = path.resolve("_tmp_verify/no-scrim");
fs.mkdirSync(OUT, { recursive: true });

const lin = (v) => {
	const s = v / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** 采样一块区域的平均底色亮度与白字对比度（剔除白字像素本身） */
async function _bandStats(buf) {
	const { data, info } = await sharp(buf)
		.raw()
		.toBuffer({ resolveWithObject: true });
	const ch = info.channels;
	const sum = [0, 0, 0];
	let n = 0;
	for (let i = 0; i < data.length; i += ch) {
		const px = [data[i], data[i + 1], data[i + 2]];
		if (lumOf(px) > 190) continue; // 剔除白字像素，否则均值被抬高 → 假达标
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

// ---------- A. 四种组合都必须没有遮罩 ----------
console.log("=== A. 全场景无遮罩（硬断言）===");
const CASES = [
	["desktop", { width: 1920, height: 1080 }, "首页", "/"],
	["desktop", { width: 1920, height: 1080 }, "文章页", POST],
	["mobile", { width: 390, height: 844 }, "首页", "/"],
	["mobile", { width: 390, height: 844 }, "文章页", POST],
];
let _articleDesktopBox = null;
for (const [vpName, viewport, label, url] of CASES) {
	const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	await page.goto(BASE + url, {
		waitUntil: "domcontentloaded",
		timeout: 30000,
	});
	await page.waitForTimeout(3500);
	const info = await page.evaluate(() => {
		const o = document.getElementById("banner-page-overlay");
		if (!o) return { exists: false };
		const cs = getComputedStyle(o);
		const r = o.getBoundingClientRect();
		const inner = o.querySelector(":scope > div");
		const ri = inner?.getBoundingClientRect();
		return {
			exists: true,
			display: cs.display,
			height: Math.round(r.height),
			// 任何非 none 的背景都算遮罩残留（含内联 style 注入）
			bg: cs.backgroundImage === "none" ? "none" : "has-gradient",
			inlineBg: o.style.backgroundImage || "",
			titleText:
				document.getElementById("page-overlay-title")?.textContent || "",
			innerTop: ri ? Math.round(ri.top) : null,
			innerHeight: ri ? Math.round(ri.height) : null,
		};
	});
	// 🔴 display:none 的元素 getComputedStyle 仍可能返回 background-image，
	//    所以「未渲染」和「无背景」是两条独立的通过路径，不能只看 bg。
	const notRendered =
		!info.exists || info.display === "none" || info.height === 0;
	const noBg = info.bg === "none" && !info.inlineBg;
	const ok = notRendered || noBg;
	ok ? pass++ : fail++;
	console.log(
		`  ${ok ? "✓" : "✗"} ${vpName}/${label}  display=${info.display} h=${info.height} bg=${info.bg}${info.inlineBg ? " 🔴 内联背景残留" : ""}  标题「${info.titleText || "（空）"}」`,
	);
	if (vpName === "desktop" && label === "文章页" && info.innerHeight) {
		_articleDesktopBox = { top: info.innerTop, height: info.innerHeight };
	}
	await page.screenshot({ path: path.join(OUT, `${vpName}-${label}.png`) });
	await ctx.close();
}

// ---------- B. 可读性已移交独立脚本 ----------
// 原先这里用「整条横带均值」估算对比度，口径是错的：
//   ① 横带里大部分像素是文字**两侧**的亮底，会把均值抬高，量不出字压在哪里；
//   ② 剔除白字像素的阈值 190 会把马卡龙底图本身（p50=203）也剔掉，
//      导致 n=0 时返回哨兵值 255 → 打印「最差 1.00:1」这种无意义的结论。
// 正确口径（笔画边界 vs 紧邻最暗像素，且必须等入场动画结束）见：
//   `_verify_readability.mjs` —— 标题 5.79:1 通过；meta 行仅报告。
console.log("\n=== B. 可读性 ===");
console.log("  见 `_verify_readability.mjs`（本脚本只负责断言「遮罩不存在」）");

await browser.close();
console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail ? 1 : 0);
