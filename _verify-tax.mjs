// 校验：每个标签页实际列出的文章数 == 源 md 中该标签的出现次数
import fs from "node:fs";
import path from "node:path";

const P = path.resolve("src/content/posts");
const D = path.resolve("dist");

const counts = new Map();
for (const f of fs.readdirSync(P)) {
	if (!f.endsWith(".md")) continue;
	const s = fs.readFileSync(path.join(P, f), "utf8");
	const fm = s.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) continue;
	const tm = fm[1].match(/^tags:\s*\r?\n((?:\s+-\s+.*\r?\n?)*)/m);
	if (!tm) continue;
	for (const l of tm[1].split(/\r?\n/)) {
		const v = l
			.replace(/^\s*-\s*/, "")
			.trim()
			.replace(/^["']|["']$/g, "");
		if (v) counts.set(v, (counts.get(v) || 0) + 1);
	}
}

const slug = (n) =>
	n
		.trim()
		.toLowerCase()
		.replace(/\./g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

const bad = [];
let checked = 0;
// 先按 slug 归并源标签（多个原文可能撞同一 slug，如 `ride-on toys` / `ride on toys`），
// 页面按 slug 唯一，所以校验口径也必须是「同 slug 取文章数最多的原文」。
const bySlug = new Map();
for (const [name, cnt] of counts) {
	const s = slug(name);
	const prev = bySlug.get(s);
	if (!prev || cnt > prev.cnt) bySlug.set(s, { name, cnt });
}
for (const [s, { name, cnt }] of bySlug) {
	const p = path.join(D, "tag", `${s}.html`);
	if (!fs.existsSync(p)) {
		bad.push([name, "缺页"]);
		continue;
	}
	const s2 = fs.readFileSync(p, "utf8");
	const n = new Set(
		[...s2.matchAll(/href="(\/post\/[^"]*)"/g)].map((m) => m[1]),
	).size;
	checked++;
	if (n !== cnt) bad.push([name, `源${cnt} vs 页${n}`]);
}
console.log(
	"校验标签页数:",
	checked,
	`（源中 ${counts.size} 个不同标签 → 归并为 ${bySlug.size} 个 slug）`,
);
console.log("不一致:", bad.length ? bad.slice(0, 10) : "无");

// 分类页同样校验
const catCounts = new Map();
for (const f of fs.readdirSync(P)) {
	if (!f.endsWith(".md")) continue;
	const s = fs.readFileSync(path.join(P, f), "utf8");
	const fm = s.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) continue;
	const m = fm[1].match(/^category:\s*(.+)$/m);
	if (!m) continue;
	const v = m[1].trim().replace(/^["']|["']$/g, "");
	if (v) catCounts.set(v, (catCounts.get(v) || 0) + 1);
}
const badCat = [];
for (const [name, cnt] of catCounts) {
	const p = path.join(D, "category", `${slug(name)}.html`);
	if (!fs.existsSync(p)) {
		badCat.push([name, "缺页"]);
		continue;
	}
	const s = fs.readFileSync(p, "utf8");
	const n = new Set([...s.matchAll(/href="(\/post\/[^"]*)"/g)].map((m) => m[1]))
		.size;
	if (n !== cnt) badCat.push([name, `源${cnt} vs 页${n}`]);
}
console.log("\n分类页校验:", catCounts.size, "个分类");
console.log("不一致:", badCat.length ? badCat : "无");
