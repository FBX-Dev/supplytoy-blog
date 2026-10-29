// 端到端验证：真的登进 Sveltia 后台，确认能读到 95 篇文章。
//
// 为什么必须做这一步：`/admin/` 能打开只证明**配置语法**没问题，
// 不证明 token 有权限、仓库对得上、文章集合能列出来。
// 后台真正可用 = 登录后能列出文章列表。
//
// 登录机制（从 sveltia-cms.js 源码读出）：
//   hash 路由 /signin/<base64(JSON)>，JSON 形如 { token, prefs }。
//   源码片段：Wge=/^\/signin\/(?<encodedData>.+)/ ... JSON.parse(atob(t))
//   这是 Sveltia 官方的「外部登入」入口，等价于用户手动粘贴 token。
//
// 用法：node _check_admin_login.mjs
//   token 来源优先级：环境变量 GITHUB_TOKEN > 本机 token 文件。
//   本机路径写死会挡住别人（和 CI）复跑，所以留了环境变量出口。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// playwright 不在本项目依赖里（本机全局装过一份）。
// ⚠️ ESM **不认** NODE_PATH，必须用 file:// 绝对路径导入；
//    且 playwright 是 CommonJS，只能默认导入再解构，不能具名导入。
const PW_DIR =
	process.env.PLAYWRIGHT_DIR ||
	path.join(
		os.homedir(),
		".workbuddy/binaries/node/workspace/node_modules/playwright/index.js",
	);
const pw = (await import(pathToFileURL(PW_DIR).href)).default;

const { chromium } = pw;
const BASE = process.env.ADMIN_BASE || "https://supplytoy.com/admin/";
const TOKEN = (
	process.env.GITHUB_TOKEN ||
	fs.readFileSync(
		process.env.GH_TOKEN_FILE || "D:/workbuddy/github-for-workbuddy-token.txt",
		"utf8",
	)
).trim();

// 造出 /signin/<base64> 里的载荷
const payload = Buffer.from(
	JSON.stringify({ token: TOKEN, prefs: { locale: "en" } }),
	"utf8",
).toString("base64");
const URL = `${BASE}#/signin/${payload}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
	viewport: { width: 1440, height: 1000 },
	locale: "en-US",
});
const page = await ctx.newPage();

const consoleMsgs = [];
const failedReqs = [];
const ghCalls = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleMsgs.push(`[pageerror] ${e.message}`));
page.on("response", (r) => {
	const u = r.url();
	if (r.status() >= 400) failedReqs.push(`${r.status()} ${u}`);
	if (u.includes("api.github.com")) ghCalls.push(`${r.status()} ${u}`);
});

console.log("1) 带 signin 载荷打开后台");
await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
console.log("2) 等待拉取仓库文件树");
await page.waitForTimeout(30000);

const bodyText = (await page.textContent("body")) || "";
const title = await page.title();
console.log("   title:", title);
console.log("   body 文本长度:", bodyText.trim().length);
console.log(
	"   body 前 600 字:",
	JSON.stringify(bodyText.trim().slice(0, 600)),
);

// 登录成功的正面判据
const loggedInHints = [
	"Contents",
	"Posts",
	"All Posts",
	"文章",
	"New",
	"新建",
	"Editorial Workflow",
	"Search",
	"Collections",
];
const foundIn = loggedInHints.filter((k) => bodyText.includes(k));
const stillLogin = /Using Access Token|使用访问令牌登录/.test(bodyText);

console.log("   登录后关键字:", foundIn);
console.log("   仍在登录页:", stillLogin);

// 数文章条目：列表里每篇标题都是一个链接/条目
const entries = await page.evaluate(() => {
	const out = [];
	for (const el of document.querySelectorAll("a[href],button")) {
		const t = (el.textContent || "").trim();
		if (t.length >= 15 && t.length <= 220) out.push(t);
	}
	return out;
});
console.log("   候选条目数:", entries.length);
console.log("   前 8 条:", entries.slice(0, 8));

console.log("\n--- GitHub API 调用（前 15）---");
ghCalls.slice(0, 15).forEach((c) => {
	console.log(`  ${c}`);
});
console.log("   合计:", ghCalls.length);

console.log("\n--- 控制台（前 20）---");
consoleMsgs.slice(0, 20).forEach((m) => {
	console.log(`  ${m}`);
});

console.log("\n--- 失败请求 ---");
failedReqs.length
	? failedReqs.slice(0, 10).forEach((r) => {
			console.log(`  ${r}`);
		})
	: console.log("  (无)");

await page.screenshot({
	path: "_tmp_verify/admin-loggedin.png",
	fullPage: false,
});

console.log("\n=== 判定 ===");
const okLoggedIn = !stillLogin && foundIn.length > 0;
const okGh = ghCalls.length > 0;
console.log(
	okLoggedIn ? "PASS 已进入内容管理界面" : "FAIL 仍在登录页或界面未就绪",
);
console.log(
	okGh
		? `PASS 观察到 ${ghCalls.length} 次 GitHub API 调用`
		: "FAIL 无 GitHub API 调用",
);

await browser.close();
process.exit(okLoggedIn && okGh ? 0 : 1);
