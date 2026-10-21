// 生成 /sitemap.xml 别名（逐字节复制 sitemap-index.xml）
//
// 为什么需要：@astrojs/sitemap 只产出 sitemap-index.xml + sitemap-0.xml。
// 但 supplytoy.com 老站的 /sitemap.xml 是 200（真实存在的单文件 sitemap），
// robots.txt 里也写着 `Sitemap: https://supplytoy.com/sitemap.xml`。
// 迁移后若不管，这个 URL 会变 404 —— 既丢历史收录信号，robots.txt 也指向空处。
//
// 与 npuai 站同一套做法（scripts/make-sitemap-alias.mjs）：**逐字节复制**，
// 不重新生成、不解析 XML，避免两个文件出现内容漂移。
//
// 注意：_redirects 里**不能**再给 /sitemap.xml 写 301 规则 ——
// CF 的 _redirects 优先级高于静态文件，会把真文件遮蔽掉。
import fs from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const src = path.join(dist, "sitemap-index.xml");
const dst = path.join(dist, "sitemap.xml");

if (!fs.existsSync(src)) {
	console.error(`[sitemap-alias] 找不到 ${src}，跳过`);
	process.exit(0);
}

fs.copyFileSync(src, dst);

const a = fs.readFileSync(src);
const b = fs.readFileSync(dst);
if (!a.equals(b)) {
	console.error("[sitemap-alias] 复制后字节不一致");
	process.exit(1);
}
console.log(
	`[sitemap-alias] sitemap.xml 已生成（${b.length} B，与 sitemap-index.xml 逐字节一致）`,
);
