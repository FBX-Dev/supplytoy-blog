// 线上 sitemap vs 本地产物 —— 逐条比对
import fs from "node:fs";
import path from "node:path";

const D = path.resolve("dist");

// 读线上 sitemap
const liveRes = await fetch("https://supplytoy.com/sitemap.xml");
const liveXml = await liveRes.text();
let liveUrls = [...liveXml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
// 若是 sitemap index，递归抓子 sitemap
if (liveUrls.some((u) => u.endsWith(".xml"))) {
	const sub = [];
	for (const u of liveUrls) {
		const r = await fetch(u);
		const x = await r.text();
		sub.push(...[...x.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
	}
	liveUrls = sub;
}
const norm = (u) =>
	u
		.replace(/^https?:\/\/[^/]+/, "")
		.replace(/\/$/, "")
		.replace(/\/index\.html$/, "")
		.replace(/\.html$/, "") || "/";

const liveSet = new Set(liveUrls.map(norm));
console.log(
	"线上 sitemap:",
	liveUrls.length,
	"条 →",
	liveSet.size,
	"个归一化 URL",
);

// 读本地 sitemap
const localXml = fs.readFileSync(path.join(D, "sitemap-0.xml"), "utf8");
const localUrls = [...localXml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(
	(m) => m[1],
);
const localSet = new Set(localUrls.map(norm));
console.log(
	"本地 sitemap:",
	localUrls.length,
	"条 →",
	localSet.size,
	"个归一化 URL",
);

const missing = [...liveSet].filter((u) => !localSet.has(u));
const extra = [...localSet].filter((u) => !liveSet.has(u));

console.log("\n线上有、本地缺:", missing.length);
missing.slice(0, 20).forEach((u) => {
	console.log("   -", u);
});
console.log("\n本地有、线上无:", extra.length);
extra.slice(0, 20).forEach((u) => {
	console.log("   +", u);
});

// 每个线上 URL 在本地是否真的有对应产物文件
console.log("\n=== 产物文件存在性抽查 ===");
let missingFile = 0;
for (const u of liveSet) {
	const p =
		u === "/"
			? path.join(D, "index.html")
			: path.join(D, `${u.replace(/^\//, "")}.html`);
	if (!fs.existsSync(p)) {
		missingFile++;
		if (missingFile <= 10) console.log("   缺产物:", u, "→", p);
	}
}
console.log(
	missingFile === 0
		? "  全部线上 URL 都有对应产物 ✓"
		: `  共 ${missingFile} 个线上 URL 缺产物`,
);
