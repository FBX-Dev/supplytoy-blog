// 线上全量验收：抓 sitemap → 逐条 HTTP 检查 → 校验关键内容
const BASE = "https://supplytoy.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

async function head(u) {
	for (let i = 0; i < 3; i++) {
		try {
			const r = await fetch(BASE + u, {
				headers: { "user-agent": UA },
				redirect: "manual",
				signal: AbortSignal.timeout(20000),
			});
			return { code: r.status, loc: r.headers.get("location") || "" };
		} catch (e) {
			if (i === 2) return { code: -1, loc: `ERR ${e.cause?.code || e.message}` };
			await new Promise((r) => setTimeout(r, 800));
		}
	}
}
async function body(u) {
	for (let i = 0; i < 3; i++) {
		try {
			const r = await fetch(BASE + u, {
				headers: { "user-agent": UA },
				signal: AbortSignal.timeout(20000),
			});
			return await r.text();
		} catch (e) {
			if (i === 2) throw e;
			await new Promise((r) => setTimeout(r, 800));
		}
	}
}

// 1. sitemap
const idx = await body("/sitemap.xml");
const subs = [...idx.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
let urls = [];
for (const s of subs) {
	const x = await (await fetch(s)).text();
	urls.push(...[...x.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
}
const paths = [...new Set(urls.map((u) => u.replace(BASE, "") || "/"))];
console.log(`sitemap: ${paths.length} 个 URL\n`);

// 2. 逐条检查
let okc = 0;
const bad = [];
for (const p of paths) {
	const { code, loc } = await head(p);
	if (code === 200) okc++;
	else bad.push(`${p} → ${code}${loc ? ` (${loc})` : ""}`);
}
console.log(`sitemap URL 可访问: ${okc}/${paths.length}`);
if (bad.length) bad.slice(0, 15).forEach((b) => console.log("  ✗", b));

// 3. 关键页面内容校验
console.log("\n=== 关键页面内容 ===");
const home = await body("/");
const checks = [
	["首页 title=SupplyToy", /<title>SupplyToy<\/title>/.test(home)],
	["AdSense 脚本在源码", home.includes("ca-pub-3948558780581083")],
	["GA4 ID 在源码", home.includes("G-NLZVKSJ9HB")],
	["首页 canonical", home.includes('rel="canonical" href="https://supplytoy.com/"')],
	["无中文残留（去 script）", !/[\u4e00-\u9fff]/.test(home.replace(/<script[\s\S]*?<\/script>/gi, ""))],
	["HTML 注释已剥离", !home.includes("<!--")],
];
for (const [n, v] of checks) console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`);

// 4. 文章页
const post = await body("/post/advent-calendars-for-kids");
// ⚠️ rel 是**无序集合**，不能按固定 token 顺序断言（主题输出的是
// `nofollow noopener noreferrer sponsored`，与老站一致）。
const amazonTags = [...post.matchAll(/<a\s[^>]*amazon[^>]*>/gi)].map((m) => m[0]);
const allSponsored =
	amazonTags.length > 0 &&
	amazonTags.every((t) => /rel="[^"]*\bsponsored\b/i.test(t));
const pchecks = [
	["文章页 title 无站名后缀", !/<title>[^<]*SupplyToy[^<]*<\/title>/.test(post)],
	["文章页 canonical 无扩展名", /rel="canonical" href="https:\/\/supplytoy\.com\/post\/advent-calendars-for-kids"/.test(post)],
	[`亚马逊链接全部带 sponsored (${amazonTags.length} 条)`, allSponsored],
];
for (const [n, v] of pchecks) console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`);

// 5. 单篇标签页 noindex
const single = await body("/tag/16-cfr-12505");
console.log(
	`  ${/noindex, follow/.test(single) ? "PASS" : "FAIL"}  单篇标签页 noindex`,
);
const multi = await body("/tag/toy-safety");
console.log(
	`  ${!/noindex/.test(multi) ? "PASS" : "FAIL"}  多篇标签页无 noindex`,
);

// 6. 基础设施
console.log("\n=== 基础设施 ===");
for (const [u, want] of [
	["/ads.txt", 200],
	["/robots.txt", 200],
	["/rss.xml", 200],
	["/atom.xml", 200],
	["/admin/", 200],
	["/about", 404],
	["/archive", 404],
	["/friends", 404],
]) {
	const { code } = await head(u);
	console.log(`  ${code === want ? "PASS" : "FAIL"}  ${u} → ${code} (期望 ${want})`);
}

// 7. 跳转
console.log("\n=== 跳转 ===");
for (const u of ["/post/advent-calendars-for-kids/", "/posts/2"]) {
	const { code, loc } = await head(u);
	console.log(`  ${u} → ${code}${loc ? ` → ${loc}` : ""}`);
}

// 8. 全站亚马逊链接 sponsored 覆盖（抽样 12 篇，控制耗时）
console.log("\n=== 全站亚马逊链接合规（抽样） ===");
const postPaths = paths.filter((p) => p.startsWith("/post/"));
const sample = [];
	for (let i = 0; i < postPaths.length; i += Math.ceil(postPaths.length / 12)) {
	sample.push(postPaths[i]);
}
let tot = 0;
let spo = 0;
let wrongHost = 0;
let dp = 0;
for (const p of sample) {
	const s = await body(p);
	for (const m of s.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>/gi)) {
		const tag = m[0];
		const href = m[1].replace(/&#x26;/g, "&");
		if (!/amazon\./i.test(href)) continue;
		tot++;
		if (/rel="[^"]*\bsponsored\b/i.test(tag)) spo++;
		if (!/^https?:\/\/www\.amazon\.com\//i.test(href)) wrongHost++;
		if (/\/dp\/|\/gp\/product\//i.test(href)) dp++;
	}
}
console.log(`  抽样 ${sample.length} 篇，检出亚马逊链接 ${tot} 条`);
console.log(`  ${spo === tot ? "PASS" : "FAIL"}  sponsored 覆盖 ${spo}/${tot}`);
console.log(`  ${wrongHost === 0 ? "PASS" : "FAIL"}  域名全为 www.amazon.com`);
console.log(`  ${dp === 0 ? "PASS" : "FAIL"}  无 /dp/ 或 /gp/product/ 形态`);
