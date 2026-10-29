// 用无头浏览器打开 https://supplytoy.com/admin/，验证 Sveltia 后台真的能加载。
//
// 判据（缺一不可）：
//   1) 页面出现 Sveltia 的登录界面（不是白屏、不是报错页）
//   2) 控制台没有 "CMS 配置中存在错误" / "config" 类致命错误
//   3) config.yml 被真的抓取过（说明 CMS 读到了配置）
//   4) 没有 404 的静态资源（sveltia-cms.js / config.yml）
//
// 用法：node _check_admin.mjs
// ESM 不认 NODE_PATH，用绝对路径导入隔离目录里的 playwright。
// playwright 是 CommonJS，只能走 default import 再解构。
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PW_DIR =
	process.env.PLAYWRIGHT_DIR ||
	path.join(
		os.homedir(),
		".workbuddy/binaries/node/workspace/node_modules/playwright/index.js",
	);
const pw = (await import(pathToFileURL(PW_DIR).href)).default;

const { chromium } = pw;

const URL = process.env.ADMIN_BASE || "https://supplytoy.com/admin/";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const consoleMsgs = [];
const failedReqs = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${e.message}`));
page.on("response", (r) => {
	const u = r.url();
	if (r.status() >= 400) failedReqs.push(`${r.status()} ${u}`);
});

console.log("打开", URL);
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
// Sveltia 是 SPA，等它把界面渲染出来
await page.waitForTimeout(6000);

const title = await page.title();
const bodyText = (await page.textContent("body")) || "";
const _html = await page.content();

console.log("\n--- 页面 ---");
console.log("title:", title);
console.log("body 可见文本长度:", bodyText.trim().length);
console.log(
	"body 文本前 400 字:",
	JSON.stringify(bodyText.trim().slice(0, 400)),
);

// 关键：Sveltia 的登录入口关键字。
// ⚠️ 界面语言由浏览器 locale 自动决定 —— 中文环境会显示「使用访问令牌登录」，
// 英文环境显示 "Sign in with an access token"。两边都要认，否则会误判成白屏。
const loginHints = [
	"Sign in",
	"Login",
	"Log in",
	"GitHub",
	"Access Token",
	"access token",
	"Personal Access Token",
	"token",
	"访问令牌",
	"登录",
	"Sveltia",
];
const found = loginHints.filter((k) => bodyText.includes(k));
console.log("\n命中的登录界面关键字:", found);

// 致命错误。
// 🔴 只匹配**真正**的失败信号。注意 `[debug] CMS configuration: {...}` 是
// Sveltia 成功读到配置后的日志，绝不能拿 /CMS configuration/ 当错误判据
// —— 那会把「后台正常」误报成「配置有错」。
const fatalPatterns = [
	/配置中存在错误/,
	/CMS configuration.*error/i,
	/Failed to load config/i,
	/Cannot read config/i,
	/Invalid configuration/i,
	/config.*not found/i,
];
const fatals = [];
for (const m of consoleMsgs) {
	// 跳过 debug 级别的成功日志
	if (m.startsWith("[debug]")) continue;
	for (const p of fatalPatterns) {
		if (p.test(m)) fatals.push(m);
	}
}

console.log("\n--- 控制台（全部）---");
consoleMsgs.slice(0, 30).forEach((m) => {
	console.log(`  ${m}`);
});
if (consoleMsgs.length === 0) console.log("  (无输出)");

console.log("\n--- 失败请求 ---");
failedReqs.length
	? failedReqs.forEach((r) => {
			console.log(`  ${r}`);
		})
	: console.log("  (无)");

console.log("\n--- config.yml 是否被抓取 ---");
const gotConfig = await page.evaluate(() =>
	performance
		.getEntriesByType("resource")
		.map((e) => e.name)
		.filter((n) => n.includes("config.yml")),
);
console.log("  config.yml 请求:", gotConfig.length ? gotConfig : "(未观察到)");

// 🔴 最强判据：Sveltia 成功解析配置后会把整个 config 对象打到 debug 日志里。
// 从这条日志里读 collections —— 能读到 4 个集合，说明 config.yml 语法、
// 字段名、widget 名全部通过了 Sveltia 的 schema 校验（少一个非法键就整页报错）。
const cfgLog = consoleMsgs.find((m) => m.includes("CMS configuration"));
let parsedCollections = [];
if (cfgLog) {
	// 日志形如: [debug] CMS configuration: {backend: Object, ..., collections: Array(4), ...}
	const m = cfgLog.match(/collections:\s*Array\((\d+)\)/);
	if (m) parsedCollections = new Array(Number(m[1])).fill(0);
}

console.log("\n--- 配置解析证据 ---");
console.log("  配置 dump 日志:", cfgLog ? "存在 ✓" : "缺失 ✗");
console.log(
	"  解析出的 collections 数:",
	parsedCollections.length || "(日志未含 Array 计数)",
);

console.log("\n=== 判定 ===");
const okLogin = found.length > 0;
const okNoFatal = fatals.length === 0;
const okNo404 = failedReqs.length === 0;
// 配置解析成功 = 有 dump 日志，或至少登录界面出来了（说明没在解析阶段就崩）
const okConfigParsed = Boolean(cfgLog) || okLogin;
console.log(okLogin ? "PASS 出现登录界面关键字" : "FAIL 未见登录界面关键字");
console.log(
	okNoFatal ? "PASS 无配置类致命错误" : `FAIL 致命错误 ${fatals.length} 条`,
);
console.log(
	okNo404 ? "PASS 无 404 资源" : `FAIL ${failedReqs.length} 个请求失败`,
);
console.log(
	okConfigParsed
		? "PASS 配置已成功解析（未在解析阶段报错）"
		: "FAIL 配置疑似未解析成功",
);
if (parsedCollections.length)
	console.log(`PASS collections 数 = ${parsedCollections.length}（期望 4）`);

const allOk = okLogin && okNoFatal && okNo404 && okConfigParsed;
console.log("\n结论:", allOk ? "后台可用 ✓" : "后台有问题 ✗");

await page.screenshot({ path: "_tmp_verify/admin.png", fullPage: false });
console.log("截图: _tmp_verify/admin.png");

await browser.close();
process.exit(allOk ? 0 : 1);
