// supplytoy-astro 最终验收脚本
// 用法: node _verify.mjs
// 全部检查项必须 PASS，否则不许部署。
import fs from "node:fs";
import path from "node:path";

const DIST = path.resolve("dist");
let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = "") {
	pass++;
	console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function bad(name, detail = "") {
	fail++;
	failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
	console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

const all = walk(DIST);
const html = all.filter((f) => f.endsWith(".html"));
const rel = (f) => "/" + path.relative(DIST, f).replace(/\\/g, "/");
const read = (f) => fs.readFileSync(f, "utf8");

// 🔴 期望值全部从**源内容**动态派生，不写死。
// 理由：本脚本要被每周四的定时任务反复执行，每批会新增 3 篇文章。
// 写死「95 篇 / 152 条」的话，第二周就必然报假失败，定时任务会误判成内容出错。
// 现在改成「源 md 数 = 产物文章页数」「sitemap 条数 = 各组成部分之和」，
// 这样断言仍然严格（数量必须自洽），但不会随批次增长而失效。
const SRC_POSTS = path.resolve("src/content/posts");
const srcPostFiles = fs
	.readdirSync(SRC_POSTS)
	.filter((f) => f.endsWith(".md"));
const EXPECT_POSTS = srcPostFiles.length;

// 分类页固定 6 个（业务规则，不随批次变）
const EXPECT_CATS = 6;

console.log(`\n构建产物: ${all.length} 个文件，其中 ${html.length} 个 HTML\n`);
console.log(`源内容: ${EXPECT_POSTS} 篇文章\n`);

// ── 1. 页面数量与 URL 形态 ──────────────────────────────
console.log("【1】URL 形态与页面数量");
{
	const posts = html.filter((f) => rel(f).startsWith("/post/"));
	posts.length === EXPECT_POSTS
		? ok(`${EXPECT_POSTS} 篇文章页`, `/post/<slug>.html × ${posts.length}`)
		: bad(
				"文章页数量与源不符",
				`源 ${EXPECT_POSTS} 篇，产物 ${posts.length} 页`,
			);

	// 不允许出现 /posts/<slug>（复数文章路径）——那是 npuai 的形态
	// ⚠️ 但 /posts/2、/posts/3 是 /posts 列表的分页，属于正常产物，要排除。
	const wrong = html.filter(
		(f) => rel(f).startsWith("/posts/") && !/^\/posts\/\d+\.html$/.test(rel(f)),
	);
	wrong.length === 0
		? ok("无 /posts/<slug> 复数形态（分页除外）")
		: bad("残留 /posts/<slug>", wrong.slice(0, 3).map(rel).join(", "));

	fs.existsSync(path.join(DIST, "index.html")) ? ok("首页") : bad("首页缺失");

	for (const p of ["posts", "categories", "tags", "friend-links", "404"]) {
		fs.existsSync(path.join(DIST, `${p}.html`))
			? ok(`/${p} 存在`)
			: bad(`/${p} 缺失`);
	}

	const cats = html.filter((f) => rel(f).startsWith("/category/"));
	cats.length === EXPECT_CATS
		? ok(`${EXPECT_CATS} 个分类页`)
		: bad("分类页数量", `期望 ${EXPECT_CATS}，实际 ${cats.length}`);

	const tags = html.filter((f) => rel(f).startsWith("/tag/"));
	ok("标签页数量", `${tags.length} 个（多篇可索引 + 单篇 noindex）`);
}

// ── 2. 不得存在的页面 ──────────────────────────────────
// 线上实测这些 URL 全是 404，静态站里也不该生成真页面。
// ⚠️ atom.xml / rss.xml 是真实 feed，必须存在（这里是 .html 的 atom/rss 路由）。
console.log("\n【2】不应存在的页面");
for (const p of ["about", "archive", "friends", "atom", "rss"]) {
	!fs.existsSync(path.join(DIST, `${p}.html`))
		? ok(`无 /${p}`)
		: bad(`不该存在 /${p}.html`);
}

// ── 3. 第三方代码 ──────────────────────────────────────
console.log("\n【3】第三方代码（GA4 / AdSense / 亚马逊）");
{
	const home = read(path.join(DIST, "index.html"));

	// AdSense 必须在源码里（不能是 useEffect 动态插入）
	home.includes("ca-pub-3948558780581083") && home.includes("adsbygoogle")
		? ok("AdSense 以真实 <script> 出现在首页源码")
		: bad("AdSense 未出现在首页源码");

	// ads.txt 发布商 ID 必须与脚本一致
	const adsTxt = fs.existsSync(path.join(DIST, "ads.txt"))
		? read(path.join(DIST, "ads.txt"))
		: "";
	adsTxt.includes("pub-3948558780581083")
		? ok("ads.txt 发布商 ID 一致")
		: bad("ads.txt 发布商 ID 不一致或缺失");

	// GA4
	home.includes("G-NLZVKSJ9HB")
		? ok("GA4 衡量 ID 存在")
		: bad("GA4 衡量 ID 缺失");

	// /admin 不得含分析代码
	const adminIdx = read(path.join(DIST, "admin/index.html"));
	!adminIdx.includes("ca-pub-") && !adminIdx.includes("G-NLZVKSJ9HB")
		? ok("/admin 不含分析代码（刻意）")
		: bad("/admin 混入了分析代码");
}

// ── 4. 亚马逊联盟链接 rel ──────────────────────────────
console.log("\n【4】亚马逊联盟链接合规");
{
	let total = 0;
	let sponsored = 0;
	let wrongHost = 0;
	let dpForm = 0;

	for (const f of html) {
		const s = read(f);
		const re = /<a\s[^>]*href="([^"]*)"[^>]*>/gi;
		let m;
		while ((m = re.exec(s))) {
			const tag = m[0];
			const href = m[1];
			if (!/amazon\./i.test(href)) continue;
			total++;
			if (/rel="[^"]*sponsored/i.test(tag)) sponsored++;
			// 只允许 www.amazon.com
			if (!/^https?:\/\/www\.amazon\.com\//i.test(href)) wrongHost++;
			if (/\/dp\/|\/gp\/product\//i.test(href)) dpForm++;
		}
	}
	total > 0 ? ok("检出亚马逊链接", `${total} 条`) : bad("未检出亚马逊链接");
	sponsored === total
		? ok("全部带 sponsored", `${sponsored}/${total}`)
		: bad("sponsored 缺失", `${sponsored}/${total}`);
	wrongHost === 0
		? ok("域名全为 www.amazon.com")
		: bad("出现非 www.amazon.com", `${wrongHost} 条`);
	dpForm === 0 ? ok("无 /dp/ 或 /gp/product/ 形态") : bad("出现商品直链形态", `${dpForm} 条`);

	// 站内链接不得带 rel
	let internalRel = 0;
	for (const f of html) {
		const s = read(f);
		const re = /<a\s[^>]*href="(\/[^"]*)"[^>]*rel="[^"]*"[^>]*>/gi;
		let m;
		while ((m = re.exec(s))) internalRel++;
	}
	internalRel === 0
		? ok("站内链接无 rel（保持裸 <a href>）")
		: bad("站内链接带 rel", `${internalRel} 条`);
}

// ── 5. canonical 与 title ──────────────────────────────
console.log("\n【5】canonical 与 title");
{
	const home = read(path.join(DIST, "index.html"));
	const homeTitle = (home.match(/<title>([^<]*)<\/title>/) || [])[1];
	homeTitle === "SupplyToy"
		? ok("首页 title = SupplyToy（无副标题）")
		: bad("首页 title 不符", `实际 "${homeTitle}"`);

	const homeCanon = (home.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
	homeCanon === "https://supplytoy.com/"
		? ok("首页 canonical")
		: bad("首页 canonical 不符", `实际 "${homeCanon}"`);

	// 文章页 title 应为裸标题（无站点后缀），canonical 无 .html
	const sample = html.filter((f) => rel(f).startsWith("/post/"))[0];
	const s = read(sample);
	const t = (s.match(/<title>([^<]*)<\/title>/) || [])[1];
	!t?.includes("SupplyToy")
		? ok("文章页 title 无站点后缀", `"${t}"`)
		: bad("文章页 title 带了站点后缀", `"${t}"`);

	const c = (s.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
	c && !c.endsWith(".html") && !c.endsWith("/")
		? ok("文章页 canonical 无扩展名无尾斜杠", c)
		: bad("文章页 canonical 形态错", `实际 "${c}"`);

	// 抽查枢纽页 title
	const checks = [
		["posts.html", "All Posts"],
		["friend-links.html", "Links"],
		["categories.html", "Categories — SupplyToy"],
		["tags.html", "Tags — SupplyToy"],
	];
	for (const [file, want] of checks) {
		const p = path.join(DIST, file);
		if (!fs.existsSync(p)) {
			bad(`${file} 缺失`);
			continue;
		}
		const got = (read(p).match(/<title>([^<]*)<\/title>/) || [])[1];
		got === want
			? ok(`${file} title`, `"${got}"`)
			: bad(`${file} title 不符`, `期望 "${want}"，实际 "${got}"`);
	}
}

// ── 6. 标签页 noindex 规则 ─────────────────────────────
console.log("\n【6】标签页 noindex 与 sitemap 收录");
{
	// 从源 md 统计标签频次
	const postsDir = path.resolve("src/content/posts");
	const counts = new Map();
	for (const f of fs.readdirSync(postsDir)) {
		if (!f.endsWith(".md")) continue;
		const s = fs.readFileSync(path.join(postsDir, f), "utf8");
		const fm = s.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!fm) continue;
		const tm = fm[1].match(/^tags:\s*\r?\n((?:\s+-\s+.*\r?\n?)*)/m);
		if (!tm) continue;
		for (const line of tm[1].split(/\r?\n/)) {
			const v = line.replace(/^\s*-\s*/, "").trim().replace(/^["']|["']$/g, "");
			if (v) counts.set(v, (counts.get(v) || 0) + 1);
		}
	}
	const slugify = (n) =>
		n.trim().toLowerCase().replace(/\./g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	const indexable = new Set(
		[...counts.entries()].filter(([, c]) => c >= 2).map(([n]) => slugify(n)),
	);
	ok("标签统计", `${counts.size} 个不同标签，${indexable.size} 个 ≥2 篇`);

	let multiOk = 0;
	let singleOk = 0;
	let multiBad = 0;
	let singleBad = 0;
	for (const f of html) {
		const r = rel(f);
		if (!r.startsWith("/tag/")) continue;
		const slug = r.slice(5).replace(/\.html$/, "");
		const s = read(f);
		const hasNoindex = /<meta name="robots" content="noindex, follow"/.test(s);
		if (indexable.has(slug)) {
			if (hasNoindex) multiBad++;
			else multiOk++;
		} else {
			if (hasNoindex) singleOk++;
			else singleBad++;
		}
	}
	multiBad === 0
		? ok("多篇标签页均未 noindex", `${multiOk} 个`)
		: bad("多篇标签页被误加 noindex", `${multiBad} 个`);
	singleBad === 0
		? ok("单篇标签页均 noindex", `${singleOk} 个`)
		: bad("单篇标签页漏加 noindex", `${singleBad} 个`);

	// sitemap 组成
	const sm = read(path.join(DIST, "sitemap-0.xml"));
	const urls = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
	ok("sitemap 条数", `${urls.length} 条`);

	// 🔴 sitemap 条数必须自洽（不写死总数）。
	// 组成：1 首页 + N 文章 + 6 分类 + K 标签(≥2 篇) + 4 个枢纽页(/posts /categories /tags /friend-links)。
	// K 由内容派生（见上 indexable），N 来自源 md 数 —— 两边都对上才算通过。
	// 迁移时线上是 95 篇 / 152 条；每批新增 3 篇会自然涨到 155、158…
	const EXPECT_SITEMAP = 1 + EXPECT_POSTS + EXPECT_CATS + indexable.size + 4;
	urls.length === EXPECT_SITEMAP
		? ok(
				`sitemap = ${EXPECT_SITEMAP} 条（1 首页 + ${EXPECT_POSTS} 文章 + ${EXPECT_CATS} 分类 + ${indexable.size} 标签 + 4 枢纽）`,
			)
		: bad(
				"sitemap 条数与组成不符",
				`期望 ${EXPECT_SITEMAP}，实际 ${urls.length}`,
			);

	const sitemapTags = urls.filter((u) => u.includes("/tag/"));
	sitemapTags.length === indexable.size
		? ok("sitemap 标签数与可索引标签数一致", `${sitemapTags.length}`)
		: bad(
				"sitemap 标签数不符",
				`sitemap ${sitemapTags.length} vs 可索引 ${indexable.size}`,
			);

	const hasPagination = urls.some((u) => /\/posts\/\d+/.test(u));
	!hasPagination ? ok("sitemap 不含分页") : bad("sitemap 混入分页 URL");

	const hasAbout = urls.some((u) => /\/(about|archive|friends)$/.test(u));
	!hasAbout ? ok("sitemap 不含 /about /archive /friends") : bad("sitemap 混入禁用页");
}

// ── 7. 内链完整性 ──────────────────────────────────────
console.log("\n【7】内链完整性");
{
	const set = new Set();
	for (const f of html) {
		const r = rel(f);
		set.add(r);
		set.add(r.replace(/\.html$/, ""));
		if (r.endsWith("/index.html")) {
			const d = r.slice(0, -"index.html".length);
			set.add(d);
			set.add(d.replace(/\/$/, ""));
		}
	}
	set.add("/");

		let checked = 0;
		const broken = new Map();
		for (const f of html) {
			const s = read(f);
			const re = /href="(\/[^"#?]*)"/g;
			let m;
			while ((m = re.exec(s))) {
				let href = m[1];
				// ⚠️ 带扩展名的静态资源：必须按原样解析，且路径可能有多层子目录
				// （如 /_astro/fonts/xxx.woff2）。早先只处理 /x.css 单层形态，
				// 把嵌套路径当成无扩展名页面去拼 .html，误报了 400+ 条死链。
				if (/\.[a-z0-9]{2,5}$/i.test(href)) {
					const p = path.join(DIST, href.replace(/^\//, ""));
					checked++;
					if (!fs.existsSync(p)) broken.set(href, (broken.get(href) || 0) + 1);
					continue;
				}
				href = href.replace(/\/$/, "") || "/";
				checked++;
				if (!set.has(href) && !set.has(`${href}/`)) {
					broken.set(href, (broken.get(href) || 0) + 1);
				}
			}
		}
	broken.size === 0
		? ok("无死链", `${html.length} 页 / ${checked} 个 href`)
		: bad(
				"存在死链",
				[...broken.entries()]
					.slice(0, 8)
					.map(([h, n]) => `${h}×${n}`)
					.join(", "),
			);
}

// ── 8. 残留内容 ────────────────────────────────────────
console.log("\n【8】残留内容扫描");
{
	// npuai 品牌 / 中文正文
	let npuaiHits = [];
	let cjkHits = [];
	for (const f of html) {
		const s = read(f);
		if (/\bnpuai\b|NPU AI|FBX-Dev/i.test(s)) npuaiHits.push(rel(f));
		// 排除 <script> 内的主题注释
		const stripped = s
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<style[\s\S]*?<\/style>/gi, "");
		const cjk = stripped.match(/[\u4e00-\u9fff]/g);
		if (cjk && cjk.length > 0) cjkHits.push(`${rel(f)}(${cjk.length})`);
	}
	npuaiHits.length === 0
		? ok("无 npuai 品牌残留")
		: bad("残留 npuai 品牌", npuaiHits.slice(0, 5).join(", "));
	cjkHits.length === 0
		? ok("可见文本无中文（注释已剥离）")
		: bad("可见文本含中文", cjkHits.slice(0, 8).join(", "));

	// HTML 注释应已剥离
	const sample = read(path.join(DIST, "index.html"));
	!sample.includes("<!--")
		? ok("HTML 注释已剥离")
		: bad("HTML 注释仍在产物中");
}

// ── 9. 站点基础设施 ────────────────────────────────────
console.log("\n【9】站点基础设施");
{
	const robots = fs.existsSync(path.join(DIST, "robots.txt"))
		? read(path.join(DIST, "robots.txt"))
		: "";
	// ⚠️ 必须逐行精确匹配。用 includes("Disallow: /") 会被 "Disallow: /admin" 误命中。
	const disallowAll = robots
		.split(/\r?\n/)
		.some((l) => l.trim().replace(/\s+$/, "") === "Disallow: /");
	!disallowAll ? ok("robots.txt 未全站禁抓") : bad("robots.txt 全站 Disallow");
	robots.includes("sitemap")
		? ok("robots.txt 声明 sitemap")
		: bad("robots.txt 缺 sitemap");

	for (const f of [
		"rss.xml",
		"atom.xml",
		"404.html",
		"_headers",
		"sitemap-index.xml",
		"sitemap.xml",
		"sitemap-0.xml",
	]) {
		fs.existsSync(path.join(DIST, f)) ? ok(`${f} 存在`) : bad(`${f} 缺失`);
	}

	// 🔴 sitemap.xml 必须与 sitemap-index.xml 逐字节一致（老站的 /sitemap.xml 是 200，
	// robots.txt 也指向它；缺了会 404，丢历史收录信号）
	{
		const a = path.join(DIST, "sitemap.xml");
		const b = path.join(DIST, "sitemap-index.xml");
		if (fs.existsSync(a) && fs.existsSync(b)) {
			fs.readFileSync(a).equals(fs.readFileSync(b))
				? ok("sitemap.xml 与 sitemap-index.xml 逐字节一致")
				: bad("sitemap.xml 与 sitemap-index.xml 内容不一致");
		}
	}

	const adminCfg = fs.existsSync(path.join(DIST, "admin/config.yml"))
		? read(path.join(DIST, "admin/config.yml"))
		: "";
	// 🔴 repo 必须是 supplytoy 自己的仓库：占位符（后台不可用）和别的站的仓库名
	// （保存会写进别的站）都是硬失败。
	/admin:\s*\n(?:\s*#.*\n)*\s*repo:\s*FBX-Dev\/supplytoy-blog\b/.test(
		adminCfg,
	) ||
	/^  repo:\s*FBX-Dev\/supplytoy-blog\s*$/m.test(adminCfg)
		? ok("admin config repo 指向 FBX-Dev/supplytoy-blog")
		: adminCfg.includes("REPLACE-WITH-SUPPLYTOY-REPO")
			? bad("admin config repo 仍是占位符，后台不可用")
			: adminCfg.includes("npuai")
				? bad("admin config 仍指向 npuai")
				: bad("admin config repo 不是 FBX-Dev/supplytoy-blog");

	// wrangler.jsonc 指向
	const wr = read(path.resolve("wrangler.jsonc"));
	wr.includes('"name": "supplytoy-blog"')
		? ok("wrangler Worker 名为 supplytoy-blog")
		: bad("wrangler Worker 名不符");
	wr.includes("supplytoy.com") && !wr.includes("npuai")
		? ok("wrangler 路由指向 supplytoy.com")
		: bad("wrangler 路由有问题");
}

// ── 10. tag/category 页必须可达（防孤儿页） ────────────
console.log("\n【10】tag/category 页可达性");
{
	// 🔴 主题原版把标签/分类链接指向 /archive/?tag=X（Mizuki 的归档页筛选）。
	// 本站 /archive 是 404 → 若不改成 /tag/<slug>、/category/<slug>，
	// 这两个页面族会变成「sitemap 里有、但站内零入度」的孤儿页。
	const inbound = new Set();
	for (const f of html) {
		const s = read(f);
		const re = /href="(\/(?:tag|category)\/[^"]*)"/g;
		let m;
		while ((m = re.exec(s))) inbound.add(m[1].replace(/\/$/, ""));
	}
	const taxFiles = html.filter((f) => /^\/(tag|category)\//.test(rel(f)));
	let orphan = [];
	for (const f of taxFiles) {
		const r = rel(f).replace(/\.html$/, "");
		if (!inbound.has(r)) orphan.push(r);
	}
	orphan.length === 0
		? ok(
				"无孤儿 tax 页",
				`${taxFiles.length} 页全部有入度，${inbound.size} 个不同目标`,
			)
		: bad("存在孤儿 tax 页", `${orphan.length} 个：${orphan.slice(0, 5).join(", ")}`);

	// 不得再出现 /archive 形式的筛选链接
	let archiveLinks = 0;
	for (const f of html) {
		const s = read(f);
		const re = /href="\/archive[^"]*"/g;
		let m;
		while ((m = re.exec(s))) archiveLinks++;
	}
	archiveLinks === 0
		? ok("无 /archive 筛选链接残留")
		: bad("残留 /archive 链接", `${archiveLinks} 处`);
}

console.log(`\n${"═".repeat(60)}`);
console.log(`结果: ${pass} 通过 / ${fail} 失败`);
if (fail) {
	console.log("\n失败项:");
	for (const f of failures) console.log(`  ✗ ${f}`);
	process.exit(1);
} else {
	console.log("全部通过 ✓");
}
