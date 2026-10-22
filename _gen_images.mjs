/**
 * 把 AI 生成的源图转成站点需要的目标尺寸与格式。
 *
 * 🔴 目标尺寸取自 npuai 原图（用 sharp 实测，不是猜的）：
 *   public/assets/desktop-banner/{1..4}.webp   1920×1080
 *   public/assets/mobile-banner/{1..4}.webp    1000×1414
 *   src/assets/images/avatar.webp               640×640
 *   public/assets/home/home.webp               1024×1024  （导航栏 icon，text 模式渲染 28×28）
 *   public/assets/home/default-logo.webp        785×256   （导航栏 logo，text 模式下不渲染）
 *   public/sakura.webp                          328×304   （樱花贴图，特效 enable:false）
 *   public/favicon/favicon.ico                  16/32/48/64 多尺寸
 *
 * 🔴 轮播图**不要**烘焙遮罩（2026-10-22 改）：
 *   早先版本在图片里烤了一层深色暗带，用来保证白字标题可读。实测发现这是错的：
 *   用 Playwright 量了 4 种组合，**只有「桌面端 + 非首页」才真的有文字**——
 *     桌面/首页：.banner-text-overlay display:none（h=0）
 *     桌面/文章：#banner-page-overlay top=306 h=48 → 有文字
 *     移动/首页、移动/文章：#banner-page-overlay display:none（hidden lg:flex）
 *   于是烤进图里的暗化，在首页和全部移动端都是**纯多余的压暗**，
 *   表现为「整体灰乎乎一片」，可见带里 45~47% 的行亮度被压到 79~95。
 *   → 改为**图片保持干净鲜亮的马卡龙原图**，遮罩交给 CSS 按需叠加：
 *     `banner.css` 的 `.banner-page-overlay:has(#page-overlay-title:not(:empty))`
 *     只在「桌面 + 非首页 + 标题真有字」时铺一层 radial-gradient。零 JS 改动。
 *   ⚠️ 因此本脚本现在**校验亮度下限**（标题带不得低于 170），防止遮罩被重新烤回来。
 *
 * 🔴 sharp 写不了 .ico → 手工拼 ICO 容器（ICONDIR + ICONDIRENTRY + PNG 数据）。
 * 🔴 sharp 是 CJS，ESM 下 NODE_PATH 无效 → 用 createRequire 载入。
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = path.resolve(".");
const TMP = path.join(ROOT, "_tmp_images");

const log = (...a) => console.log(...a);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

/** 从目录里挑出唯一的 png。
 * 🔴 必须校验数量：并行出图时时间戳会撞车（实测两次调用返回同一路径，
 * 后一张直接覆盖前一张），导致「以为有 4 张、实际只有 2 张」。
 */
function pickPng(dir) {
	const abs = path.join(TMP, dir);
	const files = fs.readdirSync(abs).filter((f) => f.endsWith(".png"));
	if (files.length !== 1) {
		throw new Error(`${dir} 期望 1 个 png，实际 ${files.length}：${files}`);
	}
	return path.join(abs, files[0]);
}

/** sRGB → 线性亮度，用于算 WCAG 对比度。 */
function lin(v) {
	v /= 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * 测「标题带」的亮度，确保轮播图**没有被压暗**。
 *
 * 🔴 两个坑：
 *  ① 不能用 `sharp(f).extract(...).stats()`：实测 sharp 的 stats() **忽略 extract**，
 *    两次调用返回完全相同的整图均值（183.07/185.79/200.56），于是「整图亮度」
 *    被误当成「标题带亮度」。必须自己取 raw() 像素算。
 *  ② 不能测图片正中心：横幅只显示图片中间 65%，标题带实测落在图片内 y 42%~54%
 *    （object-cover 裁中间 → 可见带 y 17.5%~82.5%，标题在页 y 306~354 换算而来）。
 *
 * @param band 标题带在图片内的纵向范围 [from, to]，0~1
 */
async function reportBandLum(outPath, width, height, band = [0.42, 0.54]) {
	const { data, info } = await sharp(outPath)
		.raw()
		.toBuffer({ resolveWithObject: true });
	const ch = info.channels;
	const y0 = Math.round(height * band[0]);
	const y1 = Math.round(height * band[1]);
	const x0 = Math.round(width * 0.2);
	const x1 = Math.round(width * 0.8);
	const sum = [0, 0, 0];
	let n = 0;
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const o = (y * width + x) * ch;
			sum[0] += data[o];
			sum[1] += data[o + 1];
			sum[2] += data[o + 2];
			n++;
		}
	}
	const m = sum.map((v) => v / n);
	const lum = lumOf(m);
	log(
		`      标题带亮度 ${lum.toFixed(0)}  ${lum >= 170 ? "✓ 鲜亮（遮罩已交给 CSS）" : "🔴 偏暗，可能又被烘焙了遮罩"}`,
	);
	return lum;
}

async function toWebp(src, outPath, width, height, opts = {}) {
	const { quality = 82, position = "center", checkBand = null } = opts;
	let pipe = sharp(src).resize(width, height, { fit: "cover", position });
	await pipe.webp({ quality, effort: 6 }).toFile(outPath);

	const meta = await sharp(outPath).metadata();
	if (meta.width !== width || meta.height !== height) {
		throw new Error(
			`尺寸不符 ${rel(outPath)} → ${meta.width}×${meta.height}，期望 ${width}×${height}`,
		);
	}
	log(`  ✓ ${rel(outPath).padEnd(44)} ${meta.width}×${meta.height}  ${fs.statSync(outPath).size} B`);
	if (checkBand) {
		const lum = await reportBandLum(outPath, width, height, checkBand);
		// 硬失败：轮播图必须是干净原图。压暗了说明遮罩被重新烘焙，
		// 那会让首页/移动端（根本没文字）也跟着发灰。
		if (lum < 170) {
			throw new Error(`${rel(outPath)} 标题带亮度仅 ${lum.toFixed(0)}，低于 170，疑似重新烘焙了遮罩`);
		}
	}
}

async function writeIco(srcPng, outPath, sizes) {
	const pngs = [];
	for (const s of sizes) {
		pngs.push({
			size: s,
			buf: await sharp(srcPng)
				.resize(s, s, { fit: "cover", position: "center" })
				.png({ compressionLevel: 9 })
				.toBuffer(),
		});
	}
	const count = pngs.length;
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2); // type 1 = icon
	header.writeUInt16LE(count, 4);

	const entries = [];
	let offset = 6 + count * 16;
	for (const { size, buf } of pngs) {
		const e = Buffer.alloc(16);
		e.writeUInt8(size >= 256 ? 0 : size, 0);
		e.writeUInt8(size >= 256 ? 0 : size, 1);
		e.writeUInt8(0, 2);
		e.writeUInt8(0, 3);
		e.writeUInt16LE(1, 4);
		e.writeUInt16LE(32, 6);
		e.writeUInt32LE(buf.length, 8);
		e.writeUInt32LE(offset, 12);
		entries.push(e);
		offset += buf.length;
	}
	fs.writeFileSync(outPath, Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]));
	log(`  ✓ ${rel(outPath).padEnd(44)} ICO [${sizes.join(",")}]  ${fs.statSync(outPath).size} B`);
}

// ---------- 1. 桌面轮播 1920×1080 ----------
// 四个互不重复的玩具主题：积木套圈 / 形状盒算盘 / 玩具车小火车 / 毛绒玩偶茶具
// 🔴 不烘焙遮罩：保持干净鲜亮的马卡龙原图，压暗交给 CSS 按需叠加（见文件头说明）。
log("【1】桌面轮播 1920×1080（干净原图，不烘焙遮罩）");
const desktopSrc = [pickPng("t-blocks"), pickPng("t-shapes"), pickPng("d5"), pickPng("d4")];
for (let i = 0; i < 4; i++) {
	await toWebp(desktopSrc[i], path.join(ROOT, `public/assets/desktop-banner/${i + 1}.webp`), 1920, 1080, {
		quality: 82,
		checkBand: [0.42, 0.54],
	});
}

// ---------- 2. 移动轮播 1000×1414 ----------
log("【2】移动轮播 1000×1414（干净原图，不烘焙遮罩）");
const mobileSrc = [pickPng("m1"), pickPng("m2"), pickPng("m3"), pickPng("m4")];
for (let i = 0; i < 4; i++) {
	await toWebp(mobileSrc[i], path.join(ROOT, `public/assets/mobile-banner/${i + 1}.webp`), 1000, 1414, {
		quality: 82,
		checkBand: [0.42, 0.54],
	});
}

// ---------- 3. 头像 640×640（不加遮罩） ----------
log("【3】头像 640×640");
await toWebp(pickPng("avatar"), path.join(ROOT, "src/assets/images/avatar.webp"), 640, 640, { quality: 88 });

// ---------- 4. favicon ----------
log("【4】favicon（多尺寸 ICO）");
await writeIco(pickPng("icon"), path.join(ROOT, "public/favicon/favicon.ico"), [16, 32, 48, 64]);

// ---------- 5. 导航栏 icon ----------
log("【5】导航栏 icon（text 模式实际渲染的那个）");
await toWebp(pickPng("icon"), path.join(ROOT, "public/assets/home/home.webp"), 1024, 1024, { quality: 90 });

// ---------- 6. 导航栏 logo（785×256，从横幅左下角裁） ----------
log("【6】导航栏 logo 785×256（当前 text 模式不渲染，仅去除 npuai 残留）");
await toWebp(desktopSrc[0], path.join(ROOT, "public/assets/home/default-logo.webp"), 785, 256, {
	quality: 86,
	position: "southwest",
});

// ---------- 7. 樱花贴图（程序化 SVG，透明底） ----------
log("【7】樱花贴图 328×304（程序化绘制，透明底）");
const petalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="328" height="304" viewBox="0 0 328 304">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0%" stop-color="#FFE3EC"/>
      <stop offset="100%" stop-color="#F7B7CE"/>
    </linearGradient>
  </defs>
  <path d="M164 40 C214 40 244 84 244 138 C244 200 208 254 164 268 C120 254 84 200 84 138 C84 84 114 40 164 40 Z" fill="url(#g)"/>
  <path d="M164 268 C158 240 150 214 138 196" stroke="#EFA8C2" stroke-width="3" fill="none" stroke-linecap="round"/>
  <ellipse cx="140" cy="120" rx="14" ry="22" fill="#FFFFFF" opacity="0.45" transform="rotate(-18 140 120)"/>
</svg>`;
await sharp(Buffer.from(petalSvg))
	.webp({ quality: 90, effort: 6 })
	.toFile(path.join(ROOT, "public/sakura.webp"));
log(
	`  ✓ public/sakura.webp`.padEnd(46) +
		` 328×304  ${fs.statSync(path.join(ROOT, "public/sakura.webp")).size} B`,
);

// ---------- 8. 同步 src/assets/public 镜像副本 ----------
// image-source-utils.ts 的 import.meta.glob("../**/*.{...webp}") 会读这些副本拿元数据，
// 不同步的话 Astro 拿到的还是旧图尺寸/哈希。
log("【8】同步 src/assets/public 镜像副本");
for (const kind of ["desktop-banner", "mobile-banner"]) {
	for (let i = 1; i <= 4; i++) {
		const src = path.join(ROOT, `public/assets/${kind}/${i}.webp`);
		const dst = path.join(ROOT, `src/assets/public/assets/${kind}/${i}.webp`);
		fs.copyFileSync(src, dst);
	}
}
log(`  ✓ 已同步 8 个副本`);

log("\n全部转换完成。");
